import crypto from 'node:crypto';
import { MaintenanceWindow, PaginatedResponse, User } from '../../../shared/types';
import { buildAuditLogEntry } from '../audit/auditService';
import { IRepository, MaintenanceFilter } from '../repositories/IRepository';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { paginate } from '../validation/pagination';

export class MaintenanceService {
  constructor(private readonly repository: IRepository) {}

  async list(
    filter: MaintenanceFilter,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<MaintenanceWindow>> {
    const items = await this.repository.listMaintenanceWindows(filter);
    return paginate(items, page, limit);
  }

  async create(
    input: {
      equipmentId: string;
      title: string;
      reason: string;
      startTime: string;
      endTime: string;
    },
    actor: User,
    requestId: string,
  ): Promise<MaintenanceWindow> {
    if (actor.role !== 'Faculty' && actor.role !== 'Admin') {
      throw new ForbiddenError('Only Faculty or Admin users can schedule maintenance windows');
    }

    const eq = await this.repository.getEquipmentById(input.equipmentId);
    if (!eq) {
      throw new NotFoundError(`Equipment "${input.equipmentId}" not found`);
    }

    const nowIso = new Date().toISOString();
    const id = `mnt_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const mw: MaintenanceWindow = {
      id,
      equipmentId: input.equipmentId,
      title: input.title,
      reason: input.reason,
      startTime: input.startTime,
      endTime: input.endTime,
      createdBy: actor.id,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'MAINTENANCE_CREATED',
      targetType: 'MaintenanceWindow',
      targetId: id,
      requestId,
      metadata: {
        equipmentId: mw.equipmentId,
        startTime: mw.startTime,
        endTime: mw.endTime,
      },
    });

    return this.repository.createMaintenanceWindow(mw, auditEntry);
  }

  async update(
    id: string,
    updates: Partial<Pick<MaintenanceWindow, 'title' | 'reason' | 'startTime' | 'endTime' | 'active'>>,
    actor: User,
    requestId: string,
  ): Promise<MaintenanceWindow> {
    if (actor.role !== 'Faculty' && actor.role !== 'Admin') {
      throw new ForbiddenError('Only Faculty or Admin users can update maintenance windows');
    }

    const existing = await this.repository.getMaintenanceById(id);
    if (!existing) {
      throw new NotFoundError(`Maintenance window "${id}" not found`);
    }

    const nextStart = updates.startTime ?? existing.startTime;
    const nextEnd = updates.endTime ?? existing.endTime;
    if (Date.parse(nextStart) >= Date.parse(nextEnd)) {
      throw new ValidationError('Maintenance window startTime must be earlier than endTime');
    }

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'MAINTENANCE_UPDATED',
      targetType: 'MaintenanceWindow',
      targetId: id,
      requestId,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return this.repository.updateMaintenanceWindow(id, updates, auditEntry);
  }
}
