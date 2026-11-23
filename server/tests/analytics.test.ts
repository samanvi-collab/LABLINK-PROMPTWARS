import { describe, expect, it } from 'vitest';
import { Booking, Equipment } from '@shared/types';
import {
  computeAnalyticsOverview,
  computeDepartmentUsage,
  computeEquipmentUtilization,
} from '../src/analytics';

const sampleEquipment: Equipment = {
  id: 'eq-test',
  name: 'Test Oscilloscope',
  description: 'Bench oscilloscope',
  category: 'Signal Analysis',
  department: 'ECE',
  location: 'Lab 1',
  capacity: 2,
  operatingHours: { startTime: '08:00', endTime: '18:00', daysOfWeek: [1, 2, 3, 4, 5] },
  maxBookingDurationMinutes: 180,
  requiredTrainings: [],
  safetyRequirements: [],
  tags: ['oscilloscope'],
  archived: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('Analytics Engine', () => {
  it('computes exact utilization percentage without NaN or Infinity', () => {
    // 1 single weekday (Wednesday 2026-11-25): 10 hours * 60 = 600 min * capacity 2 = 1200 capacity-min
    const windowStartIso = '2026-11-25T00:00:00+05:30';
    const windowEndIso = '2026-11-26T00:00:00+05:30';

    const bookings: Booking[] = [
      {
        id: 'b-1',
        equipmentId: 'eq-test',
        userId: 'u-1',
        userName: 'Meera',
        userDepartment: 'ECE',
        startTime: '2026-11-25T09:00:00+05:30',
        endTime: '2026-11-25T12:00:00+05:30', // 180 minutes
        purpose: 'Scope test',
        status: 'CONFIRMED',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'b-2',
        equipmentId: 'eq-test',
        userId: 'u-2',
        userName: 'Arjun',
        userDepartment: 'CSE',
        startTime: '2026-11-25T13:00:00+05:30',
        endTime: '2026-11-25T15:00:00+05:30', // cancelled -> excluded
        purpose: 'Cancelled test',
        status: 'CANCELLED',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const util = computeEquipmentUtilization({
      equipment: [sampleEquipment],
      bookings,
      requests: [],
      windowStartIso,
      windowEndIso,
    });

    expect(util).toHaveLength(1);
    expect(util[0]?.availableOperatingCapacityMinutes).toBe(1200);
    expect(util[0]?.bookedCapacityMinutes).toBe(180);
    expect(util[0]?.utilizationPercent).toBe(15);
  });

  it('safely returns 0 utilization when available operating minutes are zero', () => {
    // Sunday only — equipment operates Mon-Fri -> 0 available operating minutes
    const sundayStart = '2026-11-29T00:00:00+05:30';
    const sundayEnd = '2026-11-30T00:00:00+05:30';

    const util = computeEquipmentUtilization({
      equipment: [sampleEquipment],
      bookings: [],
      requests: [],
      windowStartIso: sundayStart,
      windowEndIso: sundayEnd,
    });

    expect(util[0]?.availableOperatingCapacityMinutes).toBe(0);
    expect(util[0]?.utilizationPercent).toBe(0);
    expect(Number.isNaN(util[0]?.utilizationPercent)).toBe(false);

    const overview = computeAnalyticsOverview({
      equipment: [],
      bookings: [],
      requests: [],
      windowStartIso: sundayStart,
      windowEndIso: sundayEnd,
    });
    expect(overview.totals.averageUtilizationPercent).toBe(0);

    const deptUsage = computeDepartmentUsage({
      equipment: [sampleEquipment],
      bookings: [],
      requests: [],
      windowStartIso: sundayStart,
      windowEndIso: sundayEnd,
    });
    expect(deptUsage[0]?.averageUtilizationPercent).toBe(0);
  });
});
