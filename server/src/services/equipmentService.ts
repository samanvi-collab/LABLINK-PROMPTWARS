import crypto from 'node:crypto';
import {
  AvailabilitySummary,
  Equipment,
  PaginatedResponse,
  User,
} from '../../../shared/types';
import { buildAuditLogEntry } from '../audit/auditService';
import { AppConfig } from '../config/env';
import { EquipmentFilter, IRepository } from '../repositories/IRepository';
import { evaluateSchedulingConstraints, findAlternativeSuggestions } from '../scheduler';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { paginate } from '../validation/pagination';

export class EquipmentService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IRepository,
  ) {}

  async list(
    filter: EquipmentFilter,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Equipment>> {
    const items = await this.repository.listEquipment(filter);
    return paginate(items, page, limit);
  }

  async getById(id: string): Promise<Equipment> {
    const equipment = await this.repository.getEquipmentById(id);
    if (!equipment) {
      throw new NotFoundError(`Equipment "${id}" not found`);
    }
    return equipment;
  }

  async create(
    input: Omit<Equipment, 'id' | 'archived' | 'createdAt' | 'updatedAt'>,
    actor: User,
    requestId: string,
  ): Promise<Equipment> {
    if (actor.role !== 'Admin') {
      throw new ForbiddenError('Only Admin users can create equipment');
    }

    const nowIso = new Date().toISOString();
    const id = `eq-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const equipment: Equipment = {
      ...input,
      id,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_CREATED',
      targetType: 'Equipment',
      targetId: id,
      requestId,
      metadata: {
        name: equipment.name,
        department: equipment.department,
        capacity: equipment.capacity,
      },
    });

    return this.repository.createEquipment(equipment, auditEntry);
  }

  async update(
    id: string,
    updates: Partial<Omit<Equipment, 'id' | 'archived' | 'createdAt' | 'updatedAt'>>,
    actor: User,
    requestId: string,
  ): Promise<Equipment> {
    if (actor.role !== 'Admin' && actor.role !== 'Faculty') {
      throw new ForbiddenError('Only Faculty or Admin users can update equipment');
    }

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_UPDATED',
      targetType: 'Equipment',
      targetId: id,
      requestId,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return this.repository.updateEquipment(id, updates, auditEntry);
  }

  async setArchived(
    id: string,
    archived: boolean,
    reason: string | undefined,
    actor: User,
    requestId: string,
  ): Promise<Equipment> {
    if (actor.role !== 'Admin') {
      throw new ForbiddenError('Only Admin users can archive or restore equipment');
    }

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'EQUIPMENT_ARCHIVED',
      targetType: 'Equipment',
      targetId: id,
      requestId,
      metadata: { archived, ...(reason ? { reason } : {}) },
    });

    return this.repository.updateEquipment(id, { archived }, auditEntry);
  }

  async getAvailability(
    equipmentId: string,
    startTime: string,
    endTime: string,
    user: User,
  ): Promise<AvailabilitySummary> {
    const equipment = await this.getById(equipmentId);
    const overlappingBookings = await this.repository.getBookingsForEquipmentInRange(
      equipmentId,
      startTime,
      endTime,
    );
    const overlappingMaintenance = await this.repository.getMaintenanceForEquipmentInRange(
      equipmentId,
      startTime,
      endTime,
    );

    const evaluation = evaluateSchedulingConstraints({
      equipment,
      user,
      startTime,
      endTime,
      existingBookings: overlappingBookings,
      maintenanceWindows: overlappingMaintenance,
      timeZone: this.config.timezone,
    });

    let alternatives = { timeSlots: [], equivalentEquipment: [] } as AvailabilitySummary['alternatives'];
    if (!evaluation.feasible) {
      const catalog = await this.repository.listEquipment({ includeArchived: false });
      const horizonEnd = new Date(Date.parse(endTime) + 72 * 3_600_000).toISOString();
      const rangeBookings = await this.repository.listBookings({
        status: 'CONFIRMED',
        startTime,
        endTime: horizonEnd,
      });
      const activeMaintenance = await this.repository.listMaintenanceWindows({ activeOnly: true });
      alternatives = findAlternativeSuggestions({
        targetEquipment: equipment,
        catalog,
        user,
        requestedStartTime: startTime,
        requestedEndTime: endTime,
        bookings: rangeBookings,
        maintenanceWindows: activeMaintenance,
        timeZone: this.config.timezone,
      });
    }

    return {
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      capacity: equipment.capacity,
      archived: equipment.archived,
      queryWindow: { startTime, endTime },
      evaluation,
      overlappingBookings: overlappingBookings.map((b) => ({
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
      })),
      overlappingMaintenance: overlappingMaintenance.map((m) => ({
        id: m.id,
        title: m.title,
        startTime: m.startTime,
        endTime: m.endTime,
      })),
      alternatives,
    };
  }
}
