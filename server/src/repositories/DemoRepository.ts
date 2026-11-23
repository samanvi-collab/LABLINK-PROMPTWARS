import { DEFAULT_TIMEZONE } from '../../../shared/constants';
import {
  AccessRequest,
  AuditLog,
  Booking,
  Equipment,
  MaintenanceWindow,
  User,
} from '../../../shared/types';
import { buildAuditLogEntry } from '../audit/auditService';
import { evaluateSchedulingConstraints, findAlternativeSuggestions } from '../scheduler';
import { ConflictError, NotFoundError } from '../utils/errors';
import { intervalsOverlap } from '../utils/time';
import {
  AccessRequestsFilter,
  ApproveRequestAtomicInput,
  AuditFilter,
  BookingsFilter,
  CancelBookingAtomicInput,
  CancelRequestAtomicInput,
  CreateBookingAtomicInput,
  EquipmentFilter,
  IRepository,
  MaintenanceFilter,
  RejectRequestAtomicInput,
} from './IRepository';
import { createDeterministicSeedState } from './seedData';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class DemoRepository implements IRepository {
  private users = new Map<string, User>();
  private equipment = new Map<string, Equipment>();
  private bookings = new Map<string, Booking>();
  private accessRequests = new Map<string, AccessRequest>();
  private maintenanceWindows = new Map<string, MaintenanceWindow>();
  private auditLogs: AuditLog[] = [];

  /** Per-equipment asynchronous promise mutex to serialize concurrent critical sections */
  private readonly equipmentLocks = new Map<string, Promise<void>>();
  private readonly referenceMs?: number;

  constructor(options?: { referenceMs?: number }) {
    this.referenceMs = options?.referenceMs;
    this.loadSeed();
  }

  private loadSeed(): void {
    const seed = createDeterministicSeedState(this.referenceMs);
    this.users = new Map(seed.users.map((u) => [u.id, clone(u)]));
    this.equipment = new Map(seed.equipment.map((e) => [e.id, clone(e)]));
    this.bookings = new Map(seed.bookings.map((b) => [b.id, clone(b)]));
    this.accessRequests = new Map(seed.accessRequests.map((r) => [r.id, clone(r)]));
    this.maintenanceWindows = new Map(seed.maintenanceWindows.map((m) => [m.id, clone(m)]));
    this.auditLogs = clone(seed.auditLogs);
  }

  private async withEquipmentLock<T>(equipmentId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.equipmentLocks.get(equipmentId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.then(() => current);
    this.equipmentLocks.set(equipmentId, tail);

    await previous;
    try {
      return await fn();
    } finally {
      releaseCurrent();
      if (this.equipmentLocks.get(equipmentId) === tail) {
        this.equipmentLocks.delete(equipmentId);
      }
    }
  }

  async restoreDemoData(actor: User, requestId: string): Promise<void> {
    this.loadSeed();
    this.auditLogs.unshift(
      buildAuditLogEntry({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'DEMO_DATA_RESTORED',
        targetType: 'System',
        targetId: 'demo-store',
        requestId,
        metadata: { restoredBy: actor.id },
      }),
    );
  }

  async getUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? clone(user) : null;
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values()).map(clone);
  }

  async upsertUser(user: User): Promise<User> {
    this.users.set(user.id, clone(user));
    return clone(user);
  }

  async listEquipment(filter?: EquipmentFilter): Promise<Equipment[]> {
    let items = Array.from(this.equipment.values());
    if (!filter?.includeArchived) {
      items = items.filter((e) => !e.archived);
    }
    if (filter?.department) {
      const dept = filter.department.toLowerCase();
      items = items.filter((e) => e.department.toLowerCase() === dept);
    }
    if (filter?.category) {
      const cat = filter.category.toLowerCase();
      items = items.filter((e) => e.category.toLowerCase() === cat);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return items.sort((a, b) => a.name.localeCompare(b.name)).map(clone);
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    const item = this.equipment.get(id);
    return item ? clone(item) : null;
  }

  async createEquipment(equipment: Equipment, auditEntry: AuditLog): Promise<Equipment> {
    if (this.equipment.has(equipment.id)) {
      throw new ConflictError(`Equipment with id "${equipment.id}" already exists`);
    }
    this.equipment.set(equipment.id, clone(equipment));
    this.auditLogs.unshift(clone(auditEntry));
    return clone(equipment);
  }

  async updateEquipment(
    id: string,
    updates: Partial<Equipment>,
    auditEntry: AuditLog,
  ): Promise<Equipment> {
    return this.withEquipmentLock(id, async () => {
      const existing = this.equipment.get(id);
      if (!existing) {
        throw new NotFoundError(`Equipment "${id}" not found`);
      }
      const updated: Equipment = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      this.equipment.set(id, clone(updated));
      this.auditLogs.unshift(clone(auditEntry));
      return clone(updated);
    });
  }

  async listBookings(filter?: BookingsFilter): Promise<Booking[]> {
    let items = Array.from(this.bookings.values());
    if (filter?.equipmentId) {
      items = items.filter((b) => b.equipmentId === filter.equipmentId);
    }
    if (filter?.userId) {
      items = items.filter((b) => b.userId === filter.userId);
    }
    if (filter?.status) {
      items = items.filter((b) => b.status === filter.status);
    }
    if (filter?.startTime && filter?.endTime) {
      const qStart = Date.parse(filter.startTime);
      const qEnd = Date.parse(filter.endTime);
      items = items.filter((b) => intervalsOverlap(Date.parse(b.startTime), Date.parse(b.endTime), qStart, qEnd));
    }
    return items
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(clone);
  }

  async getBookingsForEquipmentInRange(
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<Booking[]> {
    const qStart = Date.parse(startTime);
    const qEnd = Date.parse(endTime);
    return Array.from(this.bookings.values())
      .filter(
        (b) =>
          b.equipmentId === equipmentId &&
          b.status === 'CONFIRMED' &&
          intervalsOverlap(Date.parse(b.startTime), Date.parse(b.endTime), qStart, qEnd),
      )
      .map(clone);
  }

  async getBookingById(id: string): Promise<Booking | null> {
    const item = this.bookings.get(id);
    return item ? clone(item) : null;
  }

  async createBookingAtomic(input: CreateBookingAtomicInput): Promise<Booking> {
    return this.withEquipmentLock(input.booking.equipmentId, async () => {
      const eq = this.equipment.get(input.booking.equipmentId);
      if (!eq) {
        throw new NotFoundError(`Equipment "${input.booking.equipmentId}" not found`);
      }

      const overlappingBookings = await this.getBookingsForEquipmentInRange(
        eq.id,
        input.booking.startTime,
        input.booking.endTime,
      );
      const maintenanceWindows = await this.getMaintenanceForEquipmentInRange(
        eq.id,
        input.booking.startTime,
        input.booking.endTime,
      );

      const evaluation = evaluateSchedulingConstraints({
        equipment: eq,
        user: input.user,
        startTime: input.booking.startTime,
        endTime: input.booking.endTime,
        existingBookings: overlappingBookings,
        maintenanceWindows,
        nowMs: input.nowMs,
        timeZone: input.timeZone,
      });

      if (!evaluation.feasible) {
        const catalog = Array.from(this.equipment.values());
        const allBookings = Array.from(this.bookings.values());
        const allMaintenance = Array.from(this.maintenanceWindows.values());
        const alternatives = findAlternativeSuggestions({
          targetEquipment: eq,
          catalog,
          user: input.user,
          requestedStartTime: input.booking.startTime,
          requestedEndTime: input.booking.endTime,
          bookings: allBookings,
          maintenanceWindows: allMaintenance,
          nowMs: input.nowMs,
          timeZone: input.timeZone,
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

      this.bookings.set(input.booking.id, clone(input.booking));
      this.auditLogs.unshift(clone(input.auditEntry));
      return clone(input.booking);
    });
  }

  async cancelBookingAtomic(input: CancelBookingAtomicInput): Promise<Booking> {
    const existing = this.bookings.get(input.bookingId);
    if (!existing) {
      throw new NotFoundError(`Booking "${input.bookingId}" not found`);
    }

    return this.withEquipmentLock(existing.equipmentId, async () => {
      const current = this.bookings.get(input.bookingId);
      if (!current) {
        throw new NotFoundError(`Booking "${input.bookingId}" not found`);
      }
      if (current.status === 'CANCELLED') {
        throw new ConflictError('Booking is already cancelled', {
          code: 'INVALID_STATE_TRANSITION',
        });
      }
      if (current.status === 'COMPLETED') {
        throw new ConflictError('Completed bookings cannot be cancelled', {
          code: 'INVALID_STATE_TRANSITION',
        });
      }

      const updated: Booking = {
        ...current,
        status: 'CANCELLED',
        cancelledBy: input.cancelledBy,
        ...(input.reason ? { cancelReason: input.reason } : {}),
        updatedAt: new Date().toISOString(),
      };
      this.bookings.set(updated.id, clone(updated));
      this.auditLogs.unshift(clone(input.auditEntry));
      return clone(updated);
    });
  }

  async countUserHistoricalBookings(userId: string): Promise<number> {
    let count = 0;
    for (const booking of this.bookings.values()) {
      if (
        booking.userId === userId &&
        (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED')
      ) {
        count += 1;
      }
    }
    return count;
  }

  async listAccessRequests(filter?: AccessRequestsFilter): Promise<AccessRequest[]> {
    let items = Array.from(this.accessRequests.values());
    if (filter?.equipmentId) {
      items = items.filter((r) => r.equipmentId === filter.equipmentId);
    }
    if (filter?.requesterId) {
      items = items.filter((r) => r.requesterId === filter.requesterId);
    }
    if (filter?.status) {
      items = items.filter((r) => r.status === filter.status);
    }
    return items.map(clone);
  }

  async getAccessRequestById(id: string): Promise<AccessRequest | null> {
    const item = this.accessRequests.get(id);
    return item ? clone(item) : null;
  }

  async createAccessRequest(request: AccessRequest, auditEntry: AuditLog): Promise<AccessRequest> {
    this.accessRequests.set(request.id, clone(request));
    this.auditLogs.unshift(clone(auditEntry));
    return clone(request);
  }

  async approveAccessRequestAtomic(
    input: ApproveRequestAtomicInput,
  ): Promise<{ request: AccessRequest; booking: Booking }> {
    const initial = this.accessRequests.get(input.requestId);
    if (!initial) {
      throw new NotFoundError(`Access request "${input.requestId}" not found`);
    }

    return this.withEquipmentLock(initial.equipmentId, async () => {
      const req = this.accessRequests.get(input.requestId);
      if (!req) {
        throw new NotFoundError(`Access request "${input.requestId}" not found`);
      }

      if (req.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot approve access request in "${req.status}" status; only PENDING requests can be approved`,
          { code: 'INVALID_STATE_TRANSITION' },
        );
      }

      const eq = this.equipment.get(req.equipmentId);
      if (!eq) {
        throw new NotFoundError(`Equipment "${req.equipmentId}" not found`);
      }

      const requester = this.users.get(req.requesterId);
      if (!requester) {
        throw new NotFoundError(`Requester "${req.requesterId}" not found`);
      }

      const overlappingBookings = await this.getBookingsForEquipmentInRange(
        eq.id,
        req.startTime,
        req.endTime,
      );
      const maintenanceWindows = await this.getMaintenanceForEquipmentInRange(
        eq.id,
        req.startTime,
        req.endTime,
      );

      const evaluation = evaluateSchedulingConstraints({
        equipment: eq,
        user: requester,
        startTime: req.startTime,
        endTime: req.endTime,
        existingBookings: overlappingBookings,
        maintenanceWindows,
        nowMs: input.nowMs,
        timeZone: input.timeZone || DEFAULT_TIMEZONE,
      });

      if (!evaluation.feasible) {
        const alternatives = findAlternativeSuggestions({
          targetEquipment: eq,
          catalog: Array.from(this.equipment.values()),
          user: requester,
          requestedStartTime: req.startTime,
          requestedEndTime: req.endTime,
          bookings: Array.from(this.bookings.values()),
          maintenanceWindows: Array.from(this.maintenanceWindows.values()),
          nowMs: input.nowMs,
          timeZone: input.timeZone || DEFAULT_TIMEZONE,
        });

        throw new ConflictError(
          `Approval blocked: ${evaluation.violations.map((v) => v.message).join('; ')}`,
          {
            code: 'APPROVAL_CONFLICT',
            details: { violations: evaluation.violations },
            alternatives,
          },
        );
      }

      const nowIso = new Date().toISOString();
      const booking: Booking = {
        id: input.bookingId,
        equipmentId: req.equipmentId,
        userId: req.requesterId,
        userName: req.requesterName,
        userDepartment: req.requesterDepartment,
        accessRequestId: req.id,
        startTime: req.startTime,
        endTime: req.endTime,
        purpose: req.purpose,
        status: 'CONFIRMED',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const updatedReq: AccessRequest = {
        ...req,
        status: 'APPROVED',
        ...(input.decisionReason ? { decisionReason: input.decisionReason } : {}),
        ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
        reviewedBy: input.reviewer.id,
        reviewedAt: nowIso,
        bookingId: booking.id,
        updatedAt: nowIso,
      };

      const auditEntry = buildAuditLogEntry({
        id: input.auditId,
        actorId: input.reviewer.id,
        actorRole: input.reviewer.role,
        action: 'ACCESS_REQUEST_APPROVED',
        targetType: 'AccessRequest',
        targetId: updatedReq.id,
        requestId: input.httpRequestId,
        metadata: {
          equipmentId: updatedReq.equipmentId,
          bookingId: booking.id,
          requesterId: updatedReq.requesterId,
          startTime: updatedReq.startTime,
          endTime: updatedReq.endTime,
          ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
        },
      });

      this.bookings.set(booking.id, clone(booking));
      this.accessRequests.set(updatedReq.id, clone(updatedReq));
      this.auditLogs.unshift(clone(auditEntry));

      return { request: clone(updatedReq), booking: clone(booking) };
    });
  }

  async rejectAccessRequestAtomic(input: RejectRequestAtomicInput): Promise<AccessRequest> {
    const initial = this.accessRequests.get(input.requestId);
    if (!initial) {
      throw new NotFoundError(`Access request "${input.requestId}" not found`);
    }

    return this.withEquipmentLock(initial.equipmentId, async () => {
      const req = this.accessRequests.get(input.requestId);
      if (!req) {
        throw new NotFoundError(`Access request "${input.requestId}" not found`);
      }
      if (req.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot reject access request in "${req.status}" status; only PENDING requests can be rejected`,
          { code: 'INVALID_STATE_TRANSITION' },
        );
      }

      const nowIso = new Date().toISOString();
      const updatedReq: AccessRequest = {
        ...req,
        status: 'REJECTED',
        decisionReason: input.decisionReason,
        reviewedBy: input.reviewer.id,
        reviewedAt: nowIso,
        updatedAt: nowIso,
      };

      const auditEntry = buildAuditLogEntry({
        id: input.auditId,
        actorId: input.reviewer.id,
        actorRole: input.reviewer.role,
        action: 'ACCESS_REQUEST_REJECTED',
        targetType: 'AccessRequest',
        targetId: updatedReq.id,
        requestId: input.httpRequestId,
        metadata: {
          equipmentId: updatedReq.equipmentId,
          requesterId: updatedReq.requesterId,
          reason: input.decisionReason,
        },
      });

      this.accessRequests.set(updatedReq.id, clone(updatedReq));
      this.auditLogs.unshift(clone(auditEntry));
      return clone(updatedReq);
    });
  }

  async cancelAccessRequestAtomic(input: CancelRequestAtomicInput): Promise<AccessRequest> {
    const initial = this.accessRequests.get(input.requestId);
    if (!initial) {
      throw new NotFoundError(`Access request "${input.requestId}" not found`);
    }

    return this.withEquipmentLock(initial.equipmentId, async () => {
      const req = this.accessRequests.get(input.requestId);
      if (!req) {
        throw new NotFoundError(`Access request "${input.requestId}" not found`);
      }
      if (req.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot cancel access request in "${req.status}" status; only PENDING requests can be cancelled`,
          { code: 'INVALID_STATE_TRANSITION' },
        );
      }

      const nowIso = new Date().toISOString();
      const updatedReq: AccessRequest = {
        ...req,
        status: 'CANCELLED',
        ...(input.reason ? { decisionReason: input.reason } : {}),
        updatedAt: nowIso,
      };

      const auditEntry = buildAuditLogEntry({
        id: input.auditId,
        actorId: input.actor.id,
        actorRole: input.actor.role,
        action: 'ACCESS_REQUEST_CANCELLED',
        targetType: 'AccessRequest',
        targetId: updatedReq.id,
        requestId: input.httpRequestId,
        metadata: {
          equipmentId: updatedReq.equipmentId,
          reason: input.reason ?? 'Cancelled by requester',
        },
      });

      this.accessRequests.set(updatedReq.id, clone(updatedReq));
      this.auditLogs.unshift(clone(auditEntry));
      return clone(updatedReq);
    });
  }

  async listMaintenanceWindows(filter?: MaintenanceFilter): Promise<MaintenanceWindow[]> {
    let items = Array.from(this.maintenanceWindows.values());
    if (filter?.equipmentId) {
      items = items.filter((m) => m.equipmentId === filter.equipmentId);
    }
    if (filter?.activeOnly) {
      items = items.filter((m) => m.active);
    }
    return items
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
      .map(clone);
  }

  async getMaintenanceForEquipmentInRange(
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<MaintenanceWindow[]> {
    const qStart = Date.parse(startTime);
    const qEnd = Date.parse(endTime);
    return Array.from(this.maintenanceWindows.values())
      .filter(
        (m) =>
          m.equipmentId === equipmentId &&
          m.active &&
          intervalsOverlap(Date.parse(m.startTime), Date.parse(m.endTime), qStart, qEnd),
      )
      .map(clone);
  }

  async getMaintenanceById(id: string): Promise<MaintenanceWindow | null> {
    const item = this.maintenanceWindows.get(id);
    return item ? clone(item) : null;
  }

  async createMaintenanceWindow(
    mw: MaintenanceWindow,
    auditEntry: AuditLog,
  ): Promise<MaintenanceWindow> {
    return this.withEquipmentLock(mw.equipmentId, async () => {
      if (!this.equipment.has(mw.equipmentId)) {
        throw new NotFoundError(`Equipment "${mw.equipmentId}" not found`);
      }
      this.maintenanceWindows.set(mw.id, clone(mw));
      this.auditLogs.unshift(clone(auditEntry));
      return clone(mw);
    });
  }

  async updateMaintenanceWindow(
    id: string,
    updates: Partial<MaintenanceWindow>,
    auditEntry: AuditLog,
  ): Promise<MaintenanceWindow> {
    const initial = this.maintenanceWindows.get(id);
    if (!initial) {
      throw new NotFoundError(`Maintenance window "${id}" not found`);
    }

    return this.withEquipmentLock(initial.equipmentId, async () => {
      const current = this.maintenanceWindows.get(id);
      if (!current) {
        throw new NotFoundError(`Maintenance window "${id}" not found`);
      }
      const updated: MaintenanceWindow = {
        ...current,
        ...updates,
        id: current.id,
        equipmentId: current.equipmentId,
        createdBy: current.createdBy,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      this.maintenanceWindows.set(id, clone(updated));
      this.auditLogs.unshift(clone(auditEntry));
      return clone(updated);
    });
  }

  async createAuditLog(entry: AuditLog): Promise<AuditLog> {
    if (!this.auditLogs.some((a) => a.id === entry.id)) {
      this.auditLogs.unshift(clone(entry));
    }
    return clone(entry);
  }

  async listAuditLogs(filter?: AuditFilter): Promise<AuditLog[]> {
    let items = this.auditLogs;
    if (filter?.actorId) {
      items = items.filter((a) => a.actorId === filter.actorId);
    }
    if (filter?.targetId) {
      items = items.filter((a) => a.targetId === filter.targetId);
    }
    if (filter?.action) {
      items = items.filter((a) => a.action === filter.action);
    }
    return items
      .slice()
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .map(clone);
  }
}
