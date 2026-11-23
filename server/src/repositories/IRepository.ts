import {
  AccessRequest,
  AuditAction,
  AuditLog,
  Booking,
  BookingStatus,
  Equipment,
  MaintenanceWindow,
  RequestStatus,
  User,
} from '../../../shared/types';

export interface EquipmentFilter {
  department?: string;
  category?: string;
  search?: string;
  includeArchived?: boolean;
}

export interface BookingsFilter {
  equipmentId?: string;
  userId?: string;
  status?: BookingStatus;
  startTime?: string;
  endTime?: string;
}

export interface AccessRequestsFilter {
  equipmentId?: string;
  requesterId?: string;
  status?: RequestStatus;
}

export interface MaintenanceFilter {
  equipmentId?: string;
  activeOnly?: boolean;
}

export interface AuditFilter {
  actorId?: string;
  targetId?: string;
  action?: AuditAction;
}

export interface CreateBookingAtomicInput {
  booking: Booking;
  user: User;
  auditEntry: AuditLog;
  timeZone: string;
  nowMs?: number;
}

export interface CancelBookingAtomicInput {
  bookingId: string;
  cancelledBy: string;
  reason?: string;
  auditEntry: AuditLog;
}

export interface ApproveRequestAtomicInput {
  requestId: string;
  reviewer: User;
  decisionReason?: string;
  overrideReason?: string;
  bookingId: string;
  auditId: string;
  httpRequestId: string;
  timeZone: string;
  nowMs?: number;
}

export interface RejectRequestAtomicInput {
  requestId: string;
  reviewer: User;
  decisionReason: string;
  auditId: string;
  httpRequestId: string;
}

export interface CancelRequestAtomicInput {
  requestId: string;
  actor: User;
  reason?: string;
  auditId: string;
  httpRequestId: string;
}

export interface IRepository {
  // Users
  getUserById(id: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  upsertUser(user: User): Promise<User>;

  // Equipment
  listEquipment(filter?: EquipmentFilter): Promise<Equipment[]>;
  getEquipmentById(id: string): Promise<Equipment | null>;
  createEquipment(equipment: Equipment, auditEntry: AuditLog): Promise<Equipment>;
  updateEquipment(
    id: string,
    updates: Partial<Equipment>,
    auditEntry: AuditLog,
  ): Promise<Equipment>;

  // Bookings
  listBookings(filter?: BookingsFilter): Promise<Booking[]>;
  getBookingsForEquipmentInRange(
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<Booking[]>;
  getBookingById(id: string): Promise<Booking | null>;
  createBookingAtomic(input: CreateBookingAtomicInput): Promise<Booking>;
  cancelBookingAtomic(input: CancelBookingAtomicInput): Promise<Booking>;
  countUserHistoricalBookings(userId: string): Promise<number>;

  // Access Requests
  listAccessRequests(filter?: AccessRequestsFilter): Promise<AccessRequest[]>;
  getAccessRequestById(id: string): Promise<AccessRequest | null>;
  createAccessRequest(request: AccessRequest, auditEntry: AuditLog): Promise<AccessRequest>;
  approveAccessRequestAtomic(
    input: ApproveRequestAtomicInput,
  ): Promise<{ request: AccessRequest; booking: Booking }>;
  rejectAccessRequestAtomic(input: RejectRequestAtomicInput): Promise<AccessRequest>;
  cancelAccessRequestAtomic(input: CancelRequestAtomicInput): Promise<AccessRequest>;

  // Maintenance Windows
  listMaintenanceWindows(filter?: MaintenanceFilter): Promise<MaintenanceWindow[]>;
  getMaintenanceForEquipmentInRange(
    equipmentId: string,
    startTime: string,
    endTime: string,
  ): Promise<MaintenanceWindow[]>;
  getMaintenanceById(id: string): Promise<MaintenanceWindow | null>;
  createMaintenanceWindow(
    mw: MaintenanceWindow,
    auditEntry: AuditLog,
  ): Promise<MaintenanceWindow>;
  updateMaintenanceWindow(
    id: string,
    updates: Partial<MaintenanceWindow>,
    auditEntry: AuditLog,
  ): Promise<MaintenanceWindow>;

  // Audit Logs
  createAuditLog(entry: AuditLog): Promise<AuditLog>;
  listAuditLogs(filter?: AuditFilter): Promise<AuditLog[]>;

  // Demo Support
  restoreDemoData?(actor: User, requestId: string): Promise<void>;
}
