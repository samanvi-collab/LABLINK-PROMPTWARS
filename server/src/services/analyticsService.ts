import {
  AnalyticsOverview,
  DepartmentUsage,
  EquipmentUtilization,
  User,
} from '../../../shared/types';
import {
  computeAnalyticsOverview,
  computeDepartmentUsage,
  computeEquipmentUtilization,
} from '../analytics';
import { AppConfig } from '../config/env';
import { IRepository } from '../repositories/IRepository';
import { ForbiddenError } from '../utils/errors';

export class AnalyticsService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IRepository,
  ) {}

  private resolveWindow(startTime?: string, endTime?: string): { startIso: string; endIso: string } {
    const now = Date.now();
    const startIso = startTime ?? new Date(now - 7 * 86_400_000).toISOString();
    const endIso = endTime ?? new Date(now + 7 * 86_400_000).toISOString();
    return { startIso, endIso };
  }

  private assertAuthorized(actor: User): void {
    if (actor.role !== 'Faculty' && actor.role !== 'Admin') {
      throw new ForbiddenError('Only Faculty or Admin users can access analytics');
    }
  }

  async getOverview(
    query: { startTime?: string; endTime?: string; department?: string },
    actor: User,
  ): Promise<AnalyticsOverview> {
    this.assertAuthorized(actor);
    const { startIso, endIso } = this.resolveWindow(query.startTime, query.endTime);
    const [equipment, bookings, requests] = await Promise.all([
      this.repository.listEquipment({ includeArchived: true }),
      this.repository.listBookings(),
      this.repository.listAccessRequests(),
    ]);

    return computeAnalyticsOverview({
      equipment,
      bookings,
      requests,
      windowStartIso: startIso,
      windowEndIso: endIso,
      timeZone: this.config.timezone,
      departmentFilter: query.department,
    });
  }

  async getEquipmentUtilization(
    query: { startTime?: string; endTime?: string; department?: string },
    actor: User,
  ): Promise<EquipmentUtilization[]> {
    this.assertAuthorized(actor);
    const { startIso, endIso } = this.resolveWindow(query.startTime, query.endTime);
    const [equipment, bookings, requests] = await Promise.all([
      this.repository.listEquipment({ includeArchived: true }),
      this.repository.listBookings(),
      this.repository.listAccessRequests(),
    ]);

    return computeEquipmentUtilization({
      equipment,
      bookings,
      requests,
      windowStartIso: startIso,
      windowEndIso: endIso,
      timeZone: this.config.timezone,
      departmentFilter: query.department,
    });
  }

  async getDepartmentUsage(
    query: { startTime?: string; endTime?: string; department?: string },
    actor: User,
  ): Promise<DepartmentUsage[]> {
    this.assertAuthorized(actor);
    const { startIso, endIso } = this.resolveWindow(query.startTime, query.endTime);
    const [equipment, bookings, requests] = await Promise.all([
      this.repository.listEquipment({ includeArchived: true }),
      this.repository.listBookings(),
      this.repository.listAccessRequests(),
    ]);

    return computeDepartmentUsage({
      equipment,
      bookings,
      requests,
      windowStartIso: startIso,
      windowEndIso: endIso,
      timeZone: this.config.timezone,
      departmentFilter: query.department,
    });
  }
}
