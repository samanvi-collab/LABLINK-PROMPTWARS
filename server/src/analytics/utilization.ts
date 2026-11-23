import { DEFAULT_TIMEZONE } from '../../../shared/constants';
import {
  AccessRequest,
  AnalyticsOverview,
  Booking,
  DepartmentUsage,
  Equipment,
  EquipmentUtilization,
} from '../../../shared/types';
import { calculateOperatingMinutesInWindow } from '../utils/time';

export interface AnalyticsInput {
  equipment: readonly Equipment[];
  bookings: readonly Booking[];
  requests: readonly AccessRequest[];
  windowStartIso: string;
  windowEndIso: string;
  timeZone?: string;
  departmentFilter?: string;
}

function safePercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const raw = (numerator / denominator) * 100;
  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  return Math.min(100, Math.round(raw * 100) / 100);
}

function calculateClampedBookedMinutes(
  booking: Booking,
  windowStartMs: number,
  windowEndMs: number,
): number {
  if (booking.status !== 'CONFIRMED' && booking.status !== 'COMPLETED') {
    return 0;
  }
  const bStart = Date.parse(booking.startTime);
  const bEnd = Date.parse(booking.endTime);
  if (!Number.isFinite(bStart) || !Number.isFinite(bEnd) || bEnd <= bStart) {
    return 0;
  }
  const overlapStart = Math.max(windowStartMs, bStart);
  const overlapEnd = Math.min(windowEndMs, bEnd);
  if (overlapEnd <= overlapStart) {
    return 0;
  }
  return Math.round((overlapEnd - overlapStart) / 60000);
}

export function computeEquipmentUtilization(input: AnalyticsInput): EquipmentUtilization[] {
  const timeZone = input.timeZone ?? DEFAULT_TIMEZONE;
  const windowStartMs = Date.parse(input.windowStartIso);
  const windowEndMs = Date.parse(input.windowEndIso);
  const validWindow = Number.isFinite(windowStartMs) && Number.isFinite(windowEndMs) && windowEndMs > windowStartMs;

  const filteredEquipment = input.departmentFilter
    ? input.equipment.filter(
        (e) => e.department.toLowerCase() === input.departmentFilter!.toLowerCase(),
      )
    : input.equipment;

  return filteredEquipment.map((eq) => {
    const eqBookings = input.bookings.filter((b) => b.equipmentId === eq.id);
    const eqRequests = input.requests.filter((r) => r.equipmentId === eq.id);

    let bookedCapacityMinutes = 0;
    let activeBookingCount = 0;

    if (validWindow) {
      for (const booking of eqBookings) {
        const mins = calculateClampedBookedMinutes(booking, windowStartMs, windowEndMs);
        if (mins > 0) {
          bookedCapacityMinutes += mins;
          activeBookingCount += 1;
        }
      }
    }

    const perUnitOperatingMinutes = validWindow
      ? calculateOperatingMinutesInWindow(windowStartMs, windowEndMs, eq.operatingHours, timeZone)
      : 0;
    const availableOperatingCapacityMinutes = Math.max(0, perUnitOperatingMinutes * eq.capacity);

    return {
      equipmentId: eq.id,
      equipmentName: eq.name,
      department: eq.department,
      category: eq.category,
      capacity: eq.capacity,
      archived: eq.archived,
      totalBookings: activeBookingCount,
      bookedCapacityMinutes,
      availableOperatingCapacityMinutes,
      utilizationPercent: safePercent(bookedCapacityMinutes, availableOperatingCapacityMinutes),
      pendingRequests: eqRequests.filter((r) => r.status === 'PENDING').length,
      approvedRequests: eqRequests.filter((r) => r.status === 'APPROVED').length,
      rejectedRequests: eqRequests.filter((r) => r.status === 'REJECTED').length,
    };
  });
}

export function computeDepartmentUsage(input: AnalyticsInput): DepartmentUsage[] {
  const utilList = computeEquipmentUtilization(input);
  const deptMap = new Map<
    string,
    {
      equipmentCount: number;
      totalBookings: number;
      bookedMinutes: number;
      pendingRequests: number;
      approvedRequests: number;
      rejectedRequests: number;
      utilSum: number;
    }
  >();

  for (const item of utilList) {
    const current = deptMap.get(item.department) ?? {
      equipmentCount: 0,
      totalBookings: 0,
      bookedMinutes: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
      utilSum: 0,
    };

    current.equipmentCount += 1;
    current.totalBookings += item.totalBookings;
    current.bookedMinutes += item.bookedCapacityMinutes;
    current.pendingRequests += item.pendingRequests;
    current.approvedRequests += item.approvedRequests;
    current.rejectedRequests += item.rejectedRequests;
    current.utilSum += item.utilizationPercent;
    deptMap.set(item.department, current);
  }

  return Array.from(deptMap.entries())
    .map(([department, agg]) => ({
      department,
      equipmentCount: agg.equipmentCount,
      totalBookings: agg.totalBookings,
      bookedMinutes: agg.bookedMinutes,
      pendingRequests: agg.pendingRequests,
      approvedRequests: agg.approvedRequests,
      rejectedRequests: agg.rejectedRequests,
      averageUtilizationPercent:
        agg.equipmentCount > 0
          ? Math.round((agg.utilSum / agg.equipmentCount) * 100) / 100
          : 0,
    }))
    .sort((a, b) => a.department.localeCompare(b.department));
}

export function computeAnalyticsOverview(input: AnalyticsInput): AnalyticsOverview {
  const utilList = computeEquipmentUtilization(input);
  const filteredIds = new Set(utilList.map((u) => u.equipmentId));
  const scopedBookings = input.bookings.filter((b) => filteredIds.has(b.equipmentId));
  const scopedRequests = input.requests.filter((r) => filteredIds.has(r.equipmentId));

  const utilSum = utilList.reduce((acc, item) => acc + item.utilizationPercent, 0);
  const averageUtilizationPercent =
    utilList.length > 0 ? Math.round((utilSum / utilList.length) * 100) / 100 : 0;

  const demandByEquipment = utilList
    .map((u) => ({
      equipmentId: u.equipmentId,
      equipmentName: u.equipmentName,
      department: u.department,
      demandCount: u.totalBookings + u.pendingRequests,
    }))
    .sort((a, b) =>
      b.demandCount !== a.demandCount
        ? b.demandCount - a.demandCount
        : a.equipmentId.localeCompare(b.equipmentId),
    )
    .slice(0, 5);

  return {
    window: {
      startTime: input.windowStartIso,
      endTime: input.windowEndIso,
    },
    totals: {
      equipmentCount: utilList.length,
      activeEquipmentCount: utilList.filter((u) => !u.archived).length,
      totalBookings: scopedBookings.length,
      confirmedBookings: scopedBookings.filter((b) => b.status === 'CONFIRMED').length,
      cancelledBookings: scopedBookings.filter((b) => b.status === 'CANCELLED').length,
      pendingRequests: scopedRequests.filter((r) => r.status === 'PENDING').length,
      approvedRequests: scopedRequests.filter((r) => r.status === 'APPROVED').length,
      rejectedRequests: scopedRequests.filter((r) => r.status === 'REJECTED').length,
      cancelledRequests: scopedRequests.filter((r) => r.status === 'CANCELLED').length,
      averageUtilizationPercent,
    },
    topDemandedEquipment: demandByEquipment,
  };
}
