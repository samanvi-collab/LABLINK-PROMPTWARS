import crypto from 'node:crypto';
import { Booking, PaginatedResponse, User } from '../../../shared/types';
import { buildAuditLogEntry } from '../audit/auditService';
import { AppConfig } from '../config/env';
import { BookingsFilter, IRepository } from '../repositories/IRepository';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { paginate } from '../validation/pagination';

export class BookingService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IRepository,
  ) {}

  async list(
    filter: BookingsFilter,
    page: number,
    limit: number,
    actor: User,
  ): Promise<PaginatedResponse<Booking>> {
    // Resource-level authorization: Students may only list their own bookings
    const scopedFilter: BookingsFilter =
      actor.role === 'Student' ? { ...filter, userId: actor.id } : filter;

    const items = await this.repository.listBookings(scopedFilter);
    return paginate(items, page, limit);
  }

  async getById(id: string, actor: User): Promise<Booking> {
    const booking = await this.repository.getBookingById(id);
    if (!booking) {
      throw new NotFoundError(`Booking "${id}" not found`);
    }
    if (actor.role === 'Student' && booking.userId !== actor.id) {
      throw new ForbiddenError('Students can only access their own bookings');
    }
    return booking;
  }

  async create(
    input: {
      equipmentId: string;
      startTime: string;
      endTime: string;
      purpose: string;
    },
    actor: User,
    requestId: string,
  ): Promise<Booking> {
    const nowIso = new Date().toISOString();
    const bookingId = `bkg_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

    const booking: Booking = {
      id: bookingId,
      equipmentId: input.equipmentId,
      userId: actor.id,
      userName: actor.displayName,
      userDepartment: actor.department,
      startTime: input.startTime,
      endTime: input.endTime,
      purpose: input.purpose,
      status: 'CONFIRMED',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'BOOKING_CREATED',
      targetType: 'Booking',
      targetId: bookingId,
      requestId,
      metadata: {
        equipmentId: booking.equipmentId,
        startTime: booking.startTime,
        endTime: booking.endTime,
      },
    });

    return this.repository.createBookingAtomic({
      booking,
      user: actor,
      auditEntry,
      timeZone: this.config.timezone,
    });
  }

  async cancel(
    bookingId: string,
    reason: string | undefined,
    actor: User,
    requestId: string,
  ): Promise<Booking> {
    const existing = await this.repository.getBookingById(bookingId);
    if (!existing) {
      throw new NotFoundError(`Booking "${bookingId}" not found`);
    }

    if (actor.role === 'Student' && existing.userId !== actor.id) {
      throw new ForbiddenError('You can only cancel your own bookings');
    }

    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'BOOKING_CANCELLED',
      targetType: 'Booking',
      targetId: bookingId,
      requestId,
      metadata: {
        equipmentId: existing.equipmentId,
        ownerId: existing.userId,
        ...(reason ? { reason } : {}),
      },
    });

    return this.repository.cancelBookingAtomic({
      bookingId,
      cancelledBy: actor.id,
      reason,
      auditEntry,
    });
  }
}
