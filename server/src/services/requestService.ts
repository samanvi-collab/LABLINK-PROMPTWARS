import crypto from 'node:crypto';
import {
  AccessRequest,
  Booking,
  PaginatedResponse,
  ProjectType,
  RequestRankingResponse,
  User,
} from '../../../shared/types';
import { buildAuditLogEntry } from '../audit/auditService';
import { AppConfig } from '../config/env';
import { AccessRequestsFilter, IRepository } from '../repositories/IRepository';
import {
  calculateFairnessScore,
  compareRequestsDeterministic,
  evaluateSchedulingConstraints,
  findAlternativeSuggestions,
} from '../scheduler';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { intervalsOverlap } from '../utils/time';
import { paginate } from '../validation/pagination';

export class AccessRequestService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IRepository,
  ) {}

  async list(
    filter: AccessRequestsFilter,
    sortBy: 'fairness' | 'createdAt',
    page: number,
    limit: number,
    actor: User,
  ): Promise<PaginatedResponse<AccessRequest>> {
    const scopedFilter: AccessRequestsFilter =
      actor.role === 'Student' ? { ...filter, requesterId: actor.id } : filter;

    const items = await this.repository.listAccessRequests(scopedFilter);

    if (sortBy === 'fairness') {
      const bookings = await this.repository.listBookings();
      const countsByUser: Record<string, number> = {};
      for (const b of bookings) {
        if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') {
          countsByUser[b.userId] = (countsByUser[b.userId] ?? 0) + 1;
        }
      }
      items.sort((a, b) => compareRequestsDeterministic(a, b, countsByUser));
    } else {
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    return paginate(items, page, limit);
  }

  async getById(id: string, actor: User): Promise<AccessRequest> {
    const req = await this.repository.getAccessRequestById(id);
    if (!req) {
      throw new NotFoundError(`Access request "${id}" not found`);
    }
    if (actor.role === 'Student' && req.requesterId !== actor.id) {
      throw new ForbiddenError('Students can only view their own access requests');
    }
    return req;
  }

  async create(
    input: {
      equipmentId: string;
      startTime: string;
      endTime: string;
      purpose: string;
      projectType: ProjectType;
      deadline?: string | null;
    },
    actor: User,
    requestId: string,
  ): Promise<AccessRequest> {
    const equipment = await this.repository.getEquipmentById(input.equipmentId);
    if (!equipment) {
      throw new NotFoundError(`Equipment "${input.equipmentId}" not found`);
    }

    const overlappingBookings = await this.repository.getBookingsForEquipmentInRange(
      equipment.id,
      input.startTime,
      input.endTime,
    );
    const overlappingMaintenance = await this.repository.getMaintenanceForEquipmentInRange(
      equipment.id,
      input.startTime,
      input.endTime,
    );

    const evaluation = evaluateSchedulingConstraints({
      equipment,
      user: actor,
      startTime: input.startTime,
      endTime: input.endTime,
      existingBookings: overlappingBookings,
      maintenanceWindows: overlappingMaintenance,
      timeZone: this.config.timezone,
    });

    if (!evaluation.feasible) {
      const catalog = await this.repository.listEquipment({ includeArchived: false });
      const horizonEnd = new Date(Date.parse(input.endTime) + 72 * 3_600_000).toISOString();
      const rangeBookings = await this.repository.listBookings({
        status: 'CONFIRMED',
        startTime: input.startTime,
        endTime: horizonEnd,
      });
      const activeMaintenance = await this.repository.listMaintenanceWindows({ activeOnly: true });

      const alternatives = findAlternativeSuggestions({
        targetEquipment: equipment,
        catalog,
        user: actor,
        requestedStartTime: input.startTime,
        requestedEndTime: input.endTime,
        bookings: rangeBookings,
        maintenanceWindows: activeMaintenance,
        timeZone: this.config.timezone,
      });

      throw new ConflictError(
        evaluation.violations.map((v) => v.message).join('; '),
        {
          code: 'SCHEDULING_CONFLICT',
          details: { violations: evaluation.violations },
          alternatives,
        },
      );
    }

    const nowIso = new Date().toISOString();
    const previousBookingsCount = await this.repository.countUserHistoricalBookings(actor.id);
    const fairnessBreakdown = calculateFairnessScore({
      user: actor,
      equipment,
      startTime: input.startTime,
      endTime: input.endTime,
      projectType: input.projectType,
      deadline: input.deadline ?? null,
      requestCreatedAt: nowIso,
      previousBookingsCount,
    });

    const id = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const accessRequest: AccessRequest = {
      id,
      equipmentId: equipment.id,
      requesterId: actor.id,
      requesterName: actor.displayName,
      requesterDepartment: actor.department,
      startTime: input.startTime,
      endTime: input.endTime,
      purpose: input.purpose,
      projectType: input.projectType,
      deadline: input.deadline ?? null,
      status: 'PENDING',
      priorityScore: fairnessBreakdown.weightedTotal,
      fairnessBreakdown,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ACCESS_REQUEST_CREATED',
      targetType: 'AccessRequest',
      targetId: id,
      requestId,
      metadata: {
        equipmentId: equipment.id,
        priorityScore: accessRequest.priorityScore,
        startTime: accessRequest.startTime,
        endTime: accessRequest.endTime,
      },
    });

    return this.repository.createAccessRequest(accessRequest, auditEntry);
  }

  async getRanking(
    accessRequestId: string,
    actor: User,
  ): Promise<RequestRankingResponse> {
    if (actor.role !== 'Faculty' && actor.role !== 'Admin') {
      throw new ForbiddenError('Only Faculty or Admin users can inspect request rankings');
    }

    const targetRequest = await this.repository.getAccessRequestById(accessRequestId);
    if (!targetRequest) {
      throw new NotFoundError(`Access request "${accessRequestId}" not found`);
    }

    const [equipment, requester, pendingForEquipment, allBookings, overlappingMaintenance] =
      await Promise.all([
        this.repository.getEquipmentById(targetRequest.equipmentId),
        this.repository.getUserById(targetRequest.requesterId),
        this.repository.listAccessRequests({
          equipmentId: targetRequest.equipmentId,
          status: 'PENDING',
        }),
        this.repository.listBookings(),
        this.repository.getMaintenanceForEquipmentInRange(
          targetRequest.equipmentId,
          targetRequest.startTime,
          targetRequest.endTime,
        ),
      ]);

    if (!equipment) {
      throw new NotFoundError(`Equipment "${targetRequest.equipmentId}" not found`);
    }
    if (!requester) {
      throw new NotFoundError(`Requester "${targetRequest.requesterId}" not found`);
    }

    const targetStartMs = Date.parse(targetRequest.startTime);
    const targetEndMs = Date.parse(targetRequest.endTime);

    const competingRequests = pendingForEquipment.filter((req) =>
      intervalsOverlap(
        Date.parse(req.startTime),
        Date.parse(req.endTime),
        targetStartMs,
        targetEndMs,
      ),
    );

    const countsByUser: Record<string, number> = {};
    for (const b of allBookings) {
      if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') {
        countsByUser[b.userId] = (countsByUser[b.userId] ?? 0) + 1;
      }
    }

    competingRequests.sort((a, b) => compareRequestsDeterministic(a, b, countsByUser));

    const topRankedRequestId = competingRequests[0]?.id ?? null;
    const isTopRanked =
      topRankedRequestId === null || topRankedRequestId === targetRequest.id;

    const overlappingConfirmed = allBookings.filter(
      (b) =>
        b.equipmentId === targetRequest.equipmentId &&
        b.status === 'CONFIRMED' &&
        intervalsOverlap(
          Date.parse(b.startTime),
          Date.parse(b.endTime),
          targetStartMs,
          targetEndMs,
        ),
    );

    const schedulingEvaluation = evaluateSchedulingConstraints({
      equipment,
      user: requester,
      startTime: targetRequest.startTime,
      endTime: targetRequest.endTime,
      existingBookings: overlappingConfirmed,
      maintenanceWindows: overlappingMaintenance,
      timeZone: this.config.timezone,
    });

    return {
      targetRequest,
      competingRequests,
      topRankedRequestId,
      isTopRanked,
      requiresOverrideReason: targetRequest.status === 'PENDING' && !isTopRanked,
      schedulingEvaluation,
    };
  }

  async approve(
    accessRequestId: string,
    decisionReason: string | undefined,
    overrideReason: string | undefined,
    reviewer: User,
    httpRequestId: string,
  ): Promise<{ request: AccessRequest; booking: Booking }> {
    if (reviewer.role !== 'Faculty' && reviewer.role !== 'Admin') {
      throw new ForbiddenError('Only Faculty or Admin users can approve access requests');
    }

    const bookingId = `bkg_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const auditId = `aud_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    return this.repository.approveAccessRequestAtomic({
      requestId: accessRequestId,
      reviewer,
      decisionReason,
      overrideReason,
      bookingId,
      auditId,
      httpRequestId,
      timeZone: this.config.timezone,
    });
  }

  async reject(
    accessRequestId: string,
    decisionReason: string,
    reviewer: User,
    httpRequestId: string,
  ): Promise<AccessRequest> {
    if (reviewer.role !== 'Faculty' && reviewer.role !== 'Admin') {
      throw new ForbiddenError('Only Faculty or Admin users can reject access requests');
    }

    const auditId = `aud_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    return this.repository.rejectAccessRequestAtomic({
      requestId: accessRequestId,
      reviewer,
      decisionReason,
      auditId,
      httpRequestId,
    });
  }

  async cancel(
    accessRequestId: string,
    reason: string | undefined,
    actor: User,
    httpRequestId: string,
  ): Promise<AccessRequest> {
    const existing = await this.repository.getAccessRequestById(accessRequestId);
    if (!existing) {
      throw new NotFoundError(`Access request "${accessRequestId}" not found`);
    }

    if (actor.role === 'Student' && existing.requesterId !== actor.id) {
      throw new ForbiddenError('You can only cancel your own access requests');
    }

    const auditId = `aud_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    return this.repository.cancelAccessRequestAtomic({
      requestId: accessRequestId,
      actor,
      reason,
      auditId,
      httpRequestId,
    });
  }
}
