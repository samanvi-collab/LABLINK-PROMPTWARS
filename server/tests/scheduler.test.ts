import { describe, expect, it } from 'vitest';
import { FAIRNESS_TOTAL_WEIGHT, FAIRNESS_WEIGHTS } from '@shared/constants';
import { Booking, Equipment, MaintenanceWindow, User } from '@shared/types';
import {
  calculateFairnessScore,
  compareRequestsDeterministic,
  evaluateSchedulingConstraints,
  findAlternativeSuggestions,
} from '../src/scheduler';

const baseUser: User = {
  id: 'u-1',
  email: 'u1@campus.edu',
  displayName: 'Test Student',
  role: 'Student',
  department: 'CSE',
  completedTrainings: ['gpu-safety', 'laser-class-2'],
  safetyCleared: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const baseEquipment: Equipment = {
  id: 'eq-1',
  name: 'GPU Node Alpha',
  description: 'High performance GPU node',
  category: 'GPU Compute',
  department: 'CSE',
  location: 'Room 101',
  capacity: 1,
  operatingHours: { startTime: '08:00', endTime: '20:00', daysOfWeek: [1, 2, 3, 4, 5] },
  maxBookingDurationMinutes: 180,
  requiredTrainings: ['gpu-safety'],
  safetyRequirements: ['lab-badge'],
  tags: ['gpu', 'cuda'],
  archived: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

// Wednesday 2026-11-25 in IST (+05:30): 10:00 IST = 04:30 UTC
const nowMs = Date.parse('2026-11-24T00:00:00.000Z');
const slot10to12 = {
  start: '2026-11-25T10:00:00+05:30',
  end: '2026-11-25T12:00:00+05:30',
};

describe('Scheduling Engine — Constraints & Half-Open Intervals', () => {
  it('allows back-to-back bookings at exact half-open boundary [start, end)', () => {
    const existing: Booking[] = [
      {
        id: 'b-1',
        equipmentId: 'eq-1',
        userId: 'u-2',
        userName: 'Other',
        userDepartment: 'CSE',
        startTime: '2026-11-25T08:00:00+05:30',
        endTime: '2026-11-25T10:00:00+05:30',
        purpose: 'Morning run',
        status: 'CONFIRMED',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'b-2',
        equipmentId: 'eq-1',
        userId: 'u-3',
        userName: 'Third',
        userDepartment: 'CSE',
        startTime: '2026-11-25T12:00:00+05:30',
        endTime: '2026-11-25T14:00:00+05:30',
        purpose: 'Afternoon run',
        status: 'CONFIRMED',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const result = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: baseUser,
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      existingBookings: existing,
      maintenanceWindows: [],
      nowMs,
    });

    expect(result.feasible).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.remainingCapacity).toBe(1);
  });

  it('detects overlapping confirmed bookings and handles multi-capacity sweep-line', () => {
    const cap2Eq: Equipment = { ...baseEquipment, capacity: 2 };
    const bookings: Booking[] = [
      {
        id: 'b-a',
        equipmentId: 'eq-1',
        userId: 'u-2',
        userName: 'U2',
        userDepartment: 'CSE',
        startTime: '2026-11-25T10:00:00+05:30',
        endTime: '2026-11-25T11:00:00+05:30',
        purpose: 'First hour',
        status: 'CONFIRMED',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'b-b',
        equipmentId: 'eq-1',
        userId: 'u-3',
        userName: 'U3',
        userDepartment: 'CSE',
        startTime: '2026-11-25T11:00:00+05:30',
        endTime: '2026-11-25T12:00:00+05:30',
        purpose: 'Second hour',
        status: 'CONFIRMED',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    // Peak concurrent bookings in [10:00, 12:00) is 1, so capacity=2 still has 1 seat free!
    const okResult = evaluateSchedulingConstraints({
      equipment: cap2Eq,
      user: baseUser,
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      existingBookings: bookings,
      maintenanceWindows: [],
      nowMs,
    });
    expect(okResult.feasible).toBe(true);
    expect(okResult.activeBookingsInWindow).toBe(1);
    expect(okResult.remainingCapacity).toBe(1);

    // Adding a simultaneous overlap pushes peak occupancy to 2 -> 3rd concurrent request fails
    const fullBookings: Booking[] = [
      ...bookings,
      {
        ...bookings[0]!,
        id: 'b-c',
        startTime: '2026-11-25T10:30:00+05:30',
        endTime: '2026-11-25T11:30:00+05:30',
      },
    ];
    const blocked = evaluateSchedulingConstraints({
      equipment: cap2Eq,
      user: baseUser,
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      existingBookings: fullBookings,
      maintenanceWindows: [],
      nowMs,
    });
    expect(blocked.feasible).toBe(false);
    expect(blocked.violations.some((v) => v.code === 'CAPACITY_EXCEEDED')).toBe(true);
  });

  it('rejects active maintenance conflicts and ignores inactive maintenance', () => {
    const activeMw: MaintenanceWindow = {
      id: 'mw-1',
      equipmentId: 'eq-1',
      title: 'Calibration',
      reason: 'Scheduled calibration',
      startTime: '2026-11-25T11:30:00+05:30',
      endTime: '2026-11-25T13:00:00+05:30',
      createdBy: 'adm-1',
      active: true,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };

    const conflict = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: baseUser,
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      existingBookings: [],
      maintenanceWindows: [activeMw],
      nowMs,
    });
    expect(conflict.feasible).toBe(false);
    expect(conflict.violations[0]?.code).toBe('MAINTENANCE_CONFLICT');

    const inactive = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: baseUser,
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      existingBookings: [],
      maintenanceWindows: [{ ...activeMw, active: false }],
      nowMs,
    });
    expect(inactive.feasible).toBe(true);
  });

  it('enforces operating hours (IST), past dates, max duration, training, and safety', () => {
    // Outside operating hours (Sunday 2026-11-29)
    const sunday = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: baseUser,
      startTime: '2026-11-29T10:00:00+05:30',
      endTime: '2026-11-29T12:00:00+05:30',
      existingBookings: [],
      maintenanceWindows: [],
      nowMs,
    });
    expect(sunday.feasible).toBe(false);
    expect(sunday.violations.some((v) => v.code === 'OUTSIDE_OPERATING_HOURS')).toBe(true);

    // Before 08:00 IST
    const early = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: baseUser,
      startTime: '2026-11-25T07:00:00+05:30',
      endTime: '2026-11-25T09:00:00+05:30',
      existingBookings: [],
      maintenanceWindows: [],
      nowMs,
    });
    expect(early.feasible).toBe(false);
    expect(early.violations.some((v) => v.code === 'OUTSIDE_OPERATING_HOURS')).toBe(true);

    // Past date
    const past = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: baseUser,
      startTime: '2026-11-23T10:00:00+05:30',
      endTime: '2026-11-23T12:00:00+05:30',
      existingBookings: [],
      maintenanceWindows: [],
      nowMs,
    });
    expect(past.feasible).toBe(false);
    expect(past.violations.some((v) => v.code === 'PAST_DATE')).toBe(true);

    // Exceeds max duration (240 > 180)
    const tooLong = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: baseUser,
      startTime: '2026-11-25T10:00:00+05:30',
      endTime: '2026-11-25T14:00:00+05:30',
      existingBookings: [],
      maintenanceWindows: [],
      nowMs,
    });
    expect(tooLong.feasible).toBe(false);
    expect(tooLong.violations.some((v) => v.code === 'EXCEEDS_MAX_DURATION')).toBe(true);

    // Missing training & missing safety clearance
    const unqualifiedUser: User = { ...baseUser, completedTrainings: [], safetyCleared: false };
    const unqualified = evaluateSchedulingConstraints({
      equipment: baseEquipment,
      user: unqualifiedUser,
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      existingBookings: [],
      maintenanceWindows: [],
      nowMs,
    });
    expect(unqualified.feasible).toBe(false);
    expect(unqualified.violations.some((v) => v.code === 'MISSING_TRAINING')).toBe(true);
    expect(unqualified.violations.some((v) => v.code === 'SAFETY_CLEARANCE_REQUIRED')).toBe(true);
  });
});

describe('Scheduling Engine — Fairness & Deterministic Tie-Breakers', () => {
  it('computes deterministic weighted fairness scores summing to 100 weights', () => {
    expect(FAIRNESS_TOTAL_WEIGHT).toBe(100);
    expect(Object.values(FAIRNESS_WEIGHTS)).toEqual([25, 20, 15, 10, 10, 10, 10]);

    const breakdown = calculateFairnessScore({
      user: baseUser,
      equipment: baseEquipment,
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      projectType: 'CAPSTONE',
      deadline: '2026-11-24T20:00:00.000Z',
      requestCreatedAt: '2026-11-22T00:00:00.000Z',
      previousBookingsCount: 2,
      evaluationTimeMs: nowMs,
    });

    // waitTime: 48h/72h -> 67, historical: 80, deadline: <=24h -> 100, training: 100, academic: 100, duration: 120/180 (0.667) -> 80, dept: 100
    expect(breakdown.factors.waitTime).toBe(67);
    expect(breakdown.factors.historicalUsage).toBe(80);
    expect(breakdown.factors.deadlineUrgency).toBe(100);
    expect(breakdown.factors.trainingCompliance).toBe(100);
    expect(breakdown.factors.academicPriority).toBe(100);
    expect(breakdown.factors.departmentAlignment).toBe(100);
    expect(breakdown.weightedTotal).toBeGreaterThan(80);
    expect(breakdown.weightedTotal).toBeLessThanOrEqual(100);
  });

  it('orders competing requests deterministically across all 4 tie-breaker levels', () => {
    const prevBookings = { 'u-low': 1, 'u-high': 4 };
    const requests = [
      { id: 'req-b', priorityScore: 70, deadline: '2026-11-28T10:00:00Z', requesterId: 'u-high' },
      { id: 'req-a', priorityScore: 70, deadline: '2026-11-28T10:00:00Z', requesterId: 'u-high' },
      { id: 'req-c', priorityScore: 70, deadline: '2026-11-28T10:00:00Z', requesterId: 'u-low' },
      { id: 'req-d', priorityScore: 70, deadline: '2026-11-26T10:00:00Z', requesterId: 'u-high' },
      { id: 'req-e', priorityScore: 85, deadline: null, requesterId: 'u-high' },
      { id: 'req-f', priorityScore: 70, deadline: null, requesterId: 'u-low' },
    ];

    const sorted = [...requests].sort((a, b) => compareRequestsDeterministic(a, b, prevBookings));
    expect(sorted.map((r) => r.id)).toEqual([
      'req-e', // 1. highest score
      'req-d', // 2. earlier deadline
      'req-c', // 3. fewer previous bookings
      'req-a', // 4. lexicographical ID tie-breaker
      'req-b',
      'req-f', // null deadline sorts after explicit deadline at same score
    ]);
  });
});

describe('Scheduling Engine — Alternative Suggestions', () => {
  it('generates only hard-constraint-valid alternative slots and equivalent equipment', () => {
    const equivEquipment: Equipment = {
      ...baseEquipment,
      id: 'eq-2',
      name: 'GPU Node Beta',
      location: 'Room 102',
    };
    const unqualifiedEquipment: Equipment = {
      ...baseEquipment,
      id: 'eq-3',
      name: 'Restricted GPU Rig',
      requiredTrainings: ['unobtained-cert'],
    };

    const blockingBooking: Booking = {
      id: 'b-block',
      equipmentId: 'eq-1',
      userId: 'u-other',
      userName: 'Other',
      userDepartment: 'CSE',
      startTime: slot10to12.start,
      endTime: slot10to12.end,
      purpose: 'Blocking',
      status: 'CONFIRMED',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };

    const suggestions = findAlternativeSuggestions({
      targetEquipment: baseEquipment,
      catalog: [baseEquipment, equivEquipment, unqualifiedEquipment],
      user: baseUser,
      requestedStartTime: slot10to12.start,
      requestedEndTime: slot10to12.end,
      bookings: [blockingBooking],
      maintenanceWindows: [],
      nowMs,
    });

    expect(suggestions.timeSlots.length).toBeGreaterThan(0);
    expect(suggestions.equivalentEquipment.map((e) => e.equipmentId)).toEqual(['eq-2']);

    for (const slot of suggestions.timeSlots) {
      const check = evaluateSchedulingConstraints({
        equipment: baseEquipment,
        user: baseUser,
        startTime: slot.startTime,
        endTime: slot.endTime,
        existingBookings: [blockingBooking],
        maintenanceWindows: [],
        nowMs,
      });
      expect(check.feasible).toBe(true);
    }
  });
});
