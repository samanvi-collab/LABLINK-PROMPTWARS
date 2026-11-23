import { Firestore, Transaction } from 'firebase-admin/firestore';
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
import { ConflictError, NotFoundError, ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';
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

const MAX_TRANSACTION_RETRIES = 5;
const BOUNDED_QUERY_LIMIT = 200;

function isContentionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as { code?: unknown; message?: string };
  // gRPC ABORTED (10) or DEADLINE_EXCEEDED (4) or string code
  if (err.code === 10 || err.code === 'aborted' || err.code === 'ABORTED') {
    return true;
  }
  if (typeof err.message === 'string' && /ABORTED|cross-transaction contention|Too much contention/i.test(err.message)) {
    return true;
  }
  return false;
}

export async function runTransactionWithRetry<T>(
  runTx: () => Promise<T>,
  maxAttempts = MAX_TRANSACTION_RETRIES,
  baseDelayMs = 25,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runTx();
    } catch (error) {
      lastError = error;
      if (!isContentionError(error) || attempt === maxAttempts) {
        throw error;
      }
      const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn('Firestore transaction contention detected; retrying', {
        attempt,
        maxAttempts,
        backoffMs,
      });
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ServiceUnavailableError('Transaction failed after retries');
}

export class FirestoreRepository implements IRepository {
  constructor(private readonly db: Firestore) {}

  private usersCol() {
    return this.db.collection('users');
  }

  private equipmentCol() {
    return this.db.collection('equipment');
  }

  private bookingsCol() {
    return this.db.collection('bookings');
  }

  private requestsCol() {
    return this.db.collection('accessRequests');
  }

  private maintenanceCol() {
    return this.db.collection('maintenanceWindows');
  }

  private auditCol() {
    return this.db.collection('auditLogs');
  }

  private async runTx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return runTransactionWithRetry(() => this.db.runTransaction(fn));
  }

  /**
   * Indexed, bounded query for confirmed bookings of a specific equipment overlapping [startTime, endTime).
   * Uses composite index (equipmentId ASC, status ASC, startTime ASC) and caps document reads.
   */
  private async queryOverlappingBookingsInTx(
    tx: Transaction,
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<Booking[]> {
    const q = this.bookingsCol()
      .where('equipmentId', '==', equipmentId)
      .where('status', '==', 'CONFIRMED')
      .where('startTime', '<', endTime)
      .orderBy('startTime', 'asc')
      .limit(BOUNDED_QUERY_LIMIT);

    const snap = await tx.get(q);
    const reqStartMs = Date.parse(startTime);
    const reqEndMs = Date.parse(endTime);

    return snap.docs
      .map((d) => d.data() as Booking)
      .filter((b) => intervalsOverlap(Date.parse(b.startTime), Date.parse(b.endTime), reqStartMs, reqEndMs));
  }

  /**
   * Indexed, bounded query for active maintenance windows of a specific equipment overlapping [startTime, endTime).
   * Uses composite index (equipmentId ASC, active ASC, startTime ASC).
   */
  private async queryOverlappingMaintenanceInTx(
    tx: Transaction,
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<MaintenanceWindow[]> {
    const q = this.maintenanceCol()
      .where('equipmentId', '==', equipmentId)
      .where('active', '==', true)
      .where('startTime', '<', endTime)
      .orderBy('startTime', 'asc')
      .limit(100);

    const snap = await tx.get(q);
    const reqStartMs = Date.parse(startTime);
    const reqEndMs = Date.parse(endTime);

    return snap.docs
      .map((d) => d.data() as MaintenanceWindow)
      .filter((m) => intervalsOverlap(Date.parse(m.startTime), Date.parse(m.endTime), reqStartMs, reqEndMs));
  }

  async getUserById(id: string): Promise<User | null> {
    const snap = await this.usersCol().doc(id).get();
    return snap.exists ? (snap.data() as User) : null;
  }

  async listUsers(): Promise<User[]> {
    const snap = await this.usersCol().limit(500).get();
    return snap.docs.map((d) => d.data() as User);
  }

  async upsertUser(user: User): Promise<User> {
    await this.usersCol().doc(user.id).set(user, { merge: true });
    return user;
  }

  async listEquipment(filter?: EquipmentFilter): Promise<Equipment[]> {
    let q: FirebaseFirestore.Query = this.equipmentCol();
    if (!filter?.includeArchived) {
      q = q.where('archived', '==', false);
    }
    if (filter?.department) {
      q = q.where('department', '==', filter.department);
    }
    if (filter?.category) {
      q = q.where('category', '==', filter.category);
    }
    const snap = await q.limit(500).get();
    let items = snap.docs.map((d) => d.data() as Equipment);
    if (filter?.search) {
      const term = filter.search.toLowerCase();
      items = items.filter(
        (e) =>
          e.name.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term) ||
          e.tags.some((t) => t.toLowerCase().includes(term)),
      );
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    const snap = await this.equipmentCol().doc(id).get();
    return snap.exists ? (snap.data() as Equipment) : null;
  }

  async createEquipment(equipment: Equipment, auditEntry: AuditLog): Promise<Equipment> {
    await this.runTx(async (tx) => {
      const ref = this.equipmentCol().doc(equipment.id);
      const existing = await tx.get(ref);
      if (existing.exists) {
        throw new ConflictError(`Equipment "${equipment.id}" already exists`);
      }
      tx.set(ref, equipment);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);
    });
    return equipment;
  }

  async updateEquipment(
    id: string,
    updates: Partial<Equipment>,
    auditEntry: AuditLog,
  ): Promise<Equipment> {
    return this.runTx(async (tx) => {
      const ref = this.equipmentCol().doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new NotFoundError(`Equipment "${id}" not found`);
      }
      const existing = snap.data() as Equipment;
      const updated: Equipment = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      tx.set(ref, updated);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);
      return updated;
    });
  }

  async listBookings(filter?: BookingsFilter): Promise<Booking[]> {
    let q: FirebaseFirestore.Query = this.bookingsCol();
    const hasEq = Boolean(filter?.equipmentId);
    const hasUser = Boolean(filter?.userId);
    const hasStatus = Boolean(filter?.status);

    if (filter?.equipmentId) {
      q = q.where('equipmentId', '==', filter.equipmentId);
    }
    if (filter?.userId) {
      q = q.where('userId', '==', filter.userId);
    }
    if (filter?.status) {
      q = q.where('status', '==', filter.status);
    }

    // Apply indexed deterministic ordering when supported by firestore.indexes.json
    if (!hasEq && !hasStatus && hasUser) {
      q = q.orderBy('createdAt', 'desc');
    } else if (!hasEq && !hasUser && !hasStatus) {
      q = q.orderBy('createdAt', 'desc');
    }

    const snap = await q.limit(500).get();
    let items = snap.docs.map((d) => d.data() as Booking);
    if (filter?.startTime && filter?.endTime) {
      const qStart = Date.parse(filter.startTime);
      const qEnd = Date.parse(filter.endTime);
      items = items.filter((b) =>
        intervalsOverlap(Date.parse(b.startTime), Date.parse(b.endTime), qStart, qEnd),
      );
    }
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async getBookingsForEquipmentInRange(
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<Booking[]> {
    const snap = await this.bookingsCol()
      .where('equipmentId', '==', equipmentId)
      .where('status', '==', 'CONFIRMED')
      .where('startTime', '<', endTime)
      .orderBy('startTime', 'asc')
      .limit(BOUNDED_QUERY_LIMIT)
      .get();

    const qStart = Date.parse(startTime);
    const qEnd = Date.parse(endTime);
    return snap.docs
      .map((d) => d.data() as Booking)
      .filter((b) => intervalsOverlap(Date.parse(b.startTime), Date.parse(b.endTime), qStart, qEnd));
  }

  async getBookingById(id: string): Promise<Booking | null> {
    const snap = await this.bookingsCol().doc(id).get();
    return snap.exists ? (snap.data() as Booking) : null;
  }

  async createBookingAtomic(input: CreateBookingAtomicInput): Promise<Booking> {
    let conflictErrorToThrow: ConflictError | null = null;

    await this.runTx(async (tx) => {
      const eqRef = this.equipmentCol().doc(input.booking.equipmentId);
      const eqSnap = await tx.get(eqRef);
      if (!eqSnap.exists) {
        throw new NotFoundError(`Equipment "${input.booking.equipmentId}" not found`);
      }
      const eq = eqSnap.data() as Equipment;

      const overlappingBookings = await this.queryOverlappingBookingsInTx(
        tx,
        eq.id,
        input.booking.startTime,
        input.booking.endTime,
      );
      const overlappingMaintenance = await this.queryOverlappingMaintenanceInTx(
        tx,
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
        maintenanceWindows: overlappingMaintenance,
        nowMs: input.nowMs,
        timeZone: input.timeZone,
      });

      if (!evaluation.feasible) {
        conflictErrorToThrow = new ConflictError(
          evaluation.violations.map((v) => v.message).join('; '),
          {
            code: 'SCHEDULING_CONFLICT',
            details: { violations: evaluation.violations },
          },
        );
        return;
      }

      tx.set(this.bookingsCol().doc(input.booking.id), input.booking);
      tx.set(this.auditCol().doc(input.auditEntry.id), input.auditEntry);
    });

    if (conflictErrorToThrow) {
      // Compute alternatives outside the write transaction using bounded reads
      const eq = await this.getEquipmentById(input.booking.equipmentId);
      if (eq) {
        const catalog = await this.listEquipment({ includeArchived: false });
        const horizonEnd = new Date(Date.parse(input.booking.endTime) + 72 * 3_600_000).toISOString();
        const bookings = await this.listBookings({
          status: 'CONFIRMED',
          startTime: input.booking.startTime,
          endTime: horizonEnd,
        });
        const maintenanceWindows = await this.listMaintenanceWindows({ activeOnly: true });
        const alternatives = findAlternativeSuggestions({
          targetEquipment: eq,
          catalog,
          user: input.user,
          requestedStartTime: input.booking.startTime,
          requestedEndTime: input.booking.endTime,
          bookings,
          maintenanceWindows,
          nowMs: input.nowMs,
          timeZone: input.timeZone,
        });
        throw new ConflictError((conflictErrorToThrow as ConflictError).message, {
          code: 'SCHEDULING_CONFLICT',
          details: (conflictErrorToThrow as ConflictError).details,
          alternatives,
        });
      }
      throw conflictErrorToThrow;
    }

    return input.booking;
  }

  async cancelBookingAtomic(input: CancelBookingAtomicInput): Promise<Booking> {
    return this.runTx(async (tx) => {
      const ref = this.bookingsCol().doc(input.bookingId);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new NotFoundError(`Booking "${input.bookingId}" not found`);
      }
      const current = snap.data() as Booking;
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
      tx.set(ref, updated);
      tx.set(this.auditCol().doc(input.auditEntry.id), input.auditEntry);
      return updated;
    });
  }

  async countUserHistoricalBookings(userId: string): Promise<number> {
    const snap = await this.bookingsCol()
      .where('userId', '==', userId)
      .limit(100)
      .get();
    return snap.docs
      .map((d) => d.data() as Booking)
      .filter((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED').length;
  }

  async listAccessRequests(filter?: AccessRequestsFilter): Promise<AccessRequest[]> {
    let q: FirebaseFirestore.Query = this.requestsCol();
    const hasEq = Boolean(filter?.equipmentId);
    const hasRequester = Boolean(filter?.requesterId);
    const hasStatus = Boolean(filter?.status);

    if (filter?.equipmentId) {
      q = q.where('equipmentId', '==', filter.equipmentId);
    }
    if (filter?.requesterId) {
      q = q.where('requesterId', '==', filter.requesterId);
    }
    if (filter?.status) {
      q = q.where('status', '==', filter.status);
    }

    if (!hasEq && ((hasRequester && !hasStatus) || (!hasRequester && hasStatus) || (!hasRequester && !hasStatus))) {
      q = q.orderBy('createdAt', 'desc');
    }

    const snap = await q.limit(500).get();
    return snap.docs.map((d) => d.data() as AccessRequest);
  }

  async getAccessRequestById(id: string): Promise<AccessRequest | null> {
    const snap = await this.requestsCol().doc(id).get();
    return snap.exists ? (snap.data() as AccessRequest) : null;
  }

  async createAccessRequest(request: AccessRequest, auditEntry: AuditLog): Promise<AccessRequest> {
    await this.runTx(async (tx) => {
      tx.set(this.requestsCol().doc(request.id), request);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);
    });
    return request;
  }

  async approveAccessRequestAtomic(
    input: ApproveRequestAtomicInput,
  ): Promise<{ request: AccessRequest; booking: Booking }> {
    let conflictContext: {
      message: string;
      details: unknown;
      req: AccessRequest;
      eq: Equipment;
      requester: User;
    } | null = null;

    const txResult = await this.runTx(async (tx) => {
      const reqRef = this.requestsCol().doc(input.requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) {
        throw new NotFoundError(`Access request "${input.requestId}" not found`);
      }
      const req = reqSnap.data() as AccessRequest;
      if (req.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot approve access request in "${req.status}" status; only PENDING requests can be approved`,
          { code: 'INVALID_STATE_TRANSITION' },
        );
      }

      const eqSnap = await tx.get(this.equipmentCol().doc(req.equipmentId));
      if (!eqSnap.exists) {
        throw new NotFoundError(`Equipment "${req.equipmentId}" not found`);
      }
      const eq = eqSnap.data() as Equipment;

      const userSnap = await tx.get(this.usersCol().doc(req.requesterId));
      if (!userSnap.exists) {
        throw new NotFoundError(`Requester "${req.requesterId}" not found`);
      }
      const requester = userSnap.data() as User;

      const overlappingBookings = await this.queryOverlappingBookingsInTx(
        tx,
        eq.id,
        req.startTime,
        req.endTime,
      );
      const overlappingMaintenance = await this.queryOverlappingMaintenanceInTx(
        tx,
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
        maintenanceWindows: overlappingMaintenance,
        nowMs: input.nowMs,
        timeZone: input.timeZone || DEFAULT_TIMEZONE,
      });

      if (!evaluation.feasible) {
        conflictContext = {
          message: `Approval blocked: ${evaluation.violations.map((v) => v.message).join('; ')}`,
          details: { violations: evaluation.violations },
          req,
          eq,
          requester,
        };
        return null;
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

      tx.set(this.bookingsCol().doc(booking.id), booking);
      tx.set(reqRef, updatedReq);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);

      return { request: updatedReq, booking };
    });

    if (conflictContext !== null) {
      const ctx = conflictContext as {
        message: string;
        details: unknown;
        req: AccessRequest;
        eq: Equipment;
        requester: User;
      };
      const catalog = await this.listEquipment({ includeArchived: false });
      const horizonEnd = new Date(Date.parse(ctx.req.endTime) + 72 * 3_600_000).toISOString();
      const bookings = await this.listBookings({
        status: 'CONFIRMED',
        startTime: ctx.req.startTime,
        endTime: horizonEnd,
      });
      const maintenanceWindows = await this.listMaintenanceWindows({ activeOnly: true });
      const alternatives = findAlternativeSuggestions({
        targetEquipment: ctx.eq,
        catalog,
        user: ctx.requester,
        requestedStartTime: ctx.req.startTime,
        requestedEndTime: ctx.req.endTime,
        bookings,
        maintenanceWindows,
        nowMs: input.nowMs,
        timeZone: input.timeZone || DEFAULT_TIMEZONE,
      });

      throw new ConflictError(ctx.message, {
        code: 'APPROVAL_CONFLICT',
        details: ctx.details,
        alternatives,
      });
    }

    if (!txResult) {
      throw new ServiceUnavailableError('Approval transaction produced empty result');
    }

    return txResult;
  }

  async rejectAccessRequestAtomic(input: RejectRequestAtomicInput): Promise<AccessRequest> {
    return this.runTx(async (tx) => {
      const ref = this.requestsCol().doc(input.requestId);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new NotFoundError(`Access request "${input.requestId}" not found`);
      }
      const req = snap.data() as AccessRequest;
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

      tx.set(ref, updatedReq);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);
      return updatedReq;
    });
  }

  async cancelAccessRequestAtomic(input: CancelRequestAtomicInput): Promise<AccessRequest> {
    return this.runTx(async (tx) => {
      const ref = this.requestsCol().doc(input.requestId);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new NotFoundError(`Access request "${input.requestId}" not found`);
      }
      const req = snap.data() as AccessRequest;
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

      tx.set(ref, updatedReq);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);
      return updatedReq;
    });
  }

  async listMaintenanceWindows(filter?: MaintenanceFilter): Promise<MaintenanceWindow[]> {
    let q: FirebaseFirestore.Query = this.maintenanceCol();
    if (filter?.equipmentId) {
      q = q.where('equipmentId', '==', filter.equipmentId);
    }
    if (filter?.activeOnly) {
      q = q.where('active', '==', true);
    }
    const snap = await q.limit(500).get();
    return snap.docs
      .map((d) => d.data() as MaintenanceWindow)
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  }

  async getMaintenanceForEquipmentInRange(
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<MaintenanceWindow[]> {
    const snap = await this.maintenanceCol()
      .where('equipmentId', '==', equipmentId)
      .where('active', '==', true)
      .where('startTime', '<', endTime)
      .orderBy('startTime', 'asc')
      .limit(100)
      .get();

    const qStart = Date.parse(startTime);
    const qEnd = Date.parse(endTime);
    return snap.docs
      .map((d) => d.data() as MaintenanceWindow)
      .filter((m) => intervalsOverlap(Date.parse(m.startTime), Date.parse(m.endTime), qStart, qEnd));
  }

  async getMaintenanceById(id: string): Promise<MaintenanceWindow | null> {
    const snap = await this.maintenanceCol().doc(id).get();
    return snap.exists ? (snap.data() as MaintenanceWindow) : null;
  }

  async createMaintenanceWindow(
    mw: MaintenanceWindow,
    auditEntry: AuditLog,
  ): Promise<MaintenanceWindow> {
    await this.runTx(async (tx) => {
      const eqSnap = await tx.get(this.equipmentCol().doc(mw.equipmentId));
      if (!eqSnap.exists) {
        throw new NotFoundError(`Equipment "${mw.equipmentId}" not found`);
      }
      tx.set(this.maintenanceCol().doc(mw.id), mw);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);
    });
    return mw;
  }

  async updateMaintenanceWindow(
    id: string,
    updates: Partial<MaintenanceWindow>,
    auditEntry: AuditLog,
  ): Promise<MaintenanceWindow> {
    return this.runTx(async (tx) => {
      const ref = this.maintenanceCol().doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new NotFoundError(`Maintenance window "${id}" not found`);
      }
      const existing = snap.data() as MaintenanceWindow;
      const updated: MaintenanceWindow = {
        ...existing,
        ...updates,
        id: existing.id,
        equipmentId: existing.equipmentId,
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      tx.set(ref, updated);
      tx.set(this.auditCol().doc(auditEntry.id), auditEntry);
      return updated;
    });
  }

  async createAuditLog(entry: AuditLog): Promise<AuditLog> {
    await this.auditCol().doc(entry.id).set(entry, { merge: false });
    return entry;
  }

  async listAuditLogs(filter?: AuditFilter): Promise<AuditLog[]> {
    // Apply at most one equality filter with timestamp DESC to stay strictly within defined composite indexes,
    // then refine any additional predicates over the bounded result slice.
    let q: FirebaseFirestore.Query = this.auditCol();
    let appliedPrimary: 'actorId' | 'targetId' | 'action' | null = null;

    if (filter?.actorId) {
      q = q.where('actorId', '==', filter.actorId);
      appliedPrimary = 'actorId';
    } else if (filter?.targetId) {
      q = q.where('targetId', '==', filter.targetId);
      appliedPrimary = 'targetId';
    } else if (filter?.action) {
      q = q.where('action', '==', filter.action);
      appliedPrimary = 'action';
    }

    const snap = await q.orderBy('timestamp', 'desc').limit(300).get();
    let items = snap.docs.map((d) => d.data() as AuditLog);

    if (filter?.actorId && appliedPrimary !== 'actorId') {
      items = items.filter((entry) => entry.actorId === filter.actorId);
    }
    if (filter?.targetId && appliedPrimary !== 'targetId') {
      items = items.filter((entry) => entry.targetId === filter.targetId);
    }
    if (filter?.action && appliedPrimary !== 'action') {
      items = items.filter((entry) => entry.action === filter.action);
    }
    return items;
  }
}
