import { DEFAULT_TIMEZONE } from '../../../shared/constants';
import {
  Booking,
  ConstraintViolation,
  Equipment,
  MaintenanceWindow,
  SchedulingEvaluation,
  User,
} from '../../../shared/types';
import { intervalsOverlap, isWithinOperatingHours } from '../utils/time';

export interface EvaluateConstraintsInput {
  equipment: Equipment;
  user: User;
  startTime: string;
  endTime: string;
  existingBookings: readonly Booking[];
  maintenanceWindows: readonly MaintenanceWindow[];
  nowMs?: number;
  timeZone?: string;
  skipPastCheck?: boolean;
}

/**
 * Computes peak concurrent occupancy inside [windowStartMs, windowEndMs) using a sweep-line
 * over half-open booking intervals [start, end).
 */
export function computePeakConcurrentOccupancy(
  windowStartMs: number,
  windowEndMs: number,
  overlappingBookings: readonly Booking[],
): number {
  if (overlappingBookings.length === 0) {
    return 0;
  }

  interface SweepEvent {
    time: number;
    delta: number;
  }

  const events: SweepEvent[] = [];
  for (const booking of overlappingBookings) {
    const bStart = Math.max(windowStartMs, Date.parse(booking.startTime));
    const bEnd = Math.min(windowEndMs, Date.parse(booking.endTime));
    if (bStart < bEnd) {
      events.push({ time: bStart, delta: 1 });
      events.push({ time: bEnd, delta: -1 });
    }
  }

  // Process end (-1) events before start (+1) events at the exact same timestamp
  // so [a, b) followed immediately by [b, c) never double-counts at timestamp b.
  events.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.delta - b.delta));

  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    if (current > peak) {
      peak = current;
    }
  }
  return peak;
}

export function evaluateSchedulingConstraints(
  input: EvaluateConstraintsInput,
): SchedulingEvaluation {
  const {
    equipment,
    user,
    startTime,
    endTime,
    existingBookings,
    maintenanceWindows,
    nowMs = Date.now(),
    timeZone = DEFAULT_TIMEZONE,
    skipPastCheck = false,
  } = input;

  const violations: ConstraintViolation[] = [];
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
    violations.push({
      code: 'INVALID_TIME_RANGE',
      message: 'Start time must be a valid timestamp strictly earlier than end time',
    });
    return {
      feasible: false,
      violations,
      conflictingBookingIds: [],
      conflictingMaintenanceIds: [],
      activeBookingsInWindow: 0,
      remainingCapacity: 0,
    };
  }

  if (!skipPastCheck && startMs < nowMs) {
    violations.push({
      code: 'PAST_DATE',
      message: 'Cannot schedule equipment in the past',
    });
  }

  if (equipment.archived) {
    violations.push({
      code: 'EQUIPMENT_ARCHIVED',
      message: `Equipment "${equipment.name}" is archived and cannot be booked`,
    });
  }

  const durationMinutes = (endMs - startMs) / 60000;
  if (durationMinutes > equipment.maxBookingDurationMinutes) {
    violations.push({
      code: 'EXCEEDS_MAX_DURATION',
      message: `Requested duration (${Math.round(durationMinutes)} min) exceeds maximum allowed (${equipment.maxBookingDurationMinutes} min)`,
      details: {
        requestedMinutes: Math.round(durationMinutes),
        maxMinutes: equipment.maxBookingDurationMinutes,
      },
    });
  }

  const opCheck = isWithinOperatingHours(startMs, endMs, equipment.operatingHours, timeZone);
  if (!opCheck.valid) {
    violations.push({
      code: 'OUTSIDE_OPERATING_HOURS',
      message: opCheck.reason ?? 'Requested slot is outside equipment operating hours',
    });
  }

  const completedSet = new Set(user.completedTrainings);
  const missingTrainings = equipment.requiredTrainings.filter((t) => !completedSet.has(t));
  if (missingTrainings.length > 0) {
    violations.push({
      code: 'MISSING_TRAINING',
      message: `User is missing required training(s): ${missingTrainings.join(', ')}`,
      details: { missingTrainings },
    });
  }

  if (equipment.safetyRequirements.length > 0 && !user.safetyCleared) {
    violations.push({
      code: 'SAFETY_CLEARANCE_REQUIRED',
      message: `Lab safety clearance is required for "${equipment.name}" (${equipment.safetyRequirements.join(', ')})`,
      details: { safetyRequirements: equipment.safetyRequirements },
    });
  }

  const conflictingMaintenanceIds: string[] = [];
  for (const mw of maintenanceWindows) {
    if (!mw.active || mw.equipmentId !== equipment.id) {
      continue;
    }
    const mwStart = Date.parse(mw.startTime);
    const mwEnd = Date.parse(mw.endTime);
    if (!Number.isNaN(mwStart) && !Number.isNaN(mwEnd) && intervalsOverlap(startMs, endMs, mwStart, mwEnd)) {
      conflictingMaintenanceIds.push(mw.id);
    }
  }

  if (conflictingMaintenanceIds.length > 0) {
    violations.push({
      code: 'MAINTENANCE_CONFLICT',
      message: 'Requested time overlaps with a scheduled maintenance window',
      details: { maintenanceWindowIds: conflictingMaintenanceIds },
    });
  }

  const overlappingConfirmedBookings = existingBookings.filter((b) => {
    if (b.equipmentId !== equipment.id || b.status !== 'CONFIRMED') {
      return false;
    }
    const bStart = Date.parse(b.startTime);
    const bEnd = Date.parse(b.endTime);
    return !Number.isNaN(bStart) && !Number.isNaN(bEnd) && intervalsOverlap(startMs, endMs, bStart, bEnd);
  });

  const peakOccupancy = computePeakConcurrentOccupancy(startMs, endMs, overlappingConfirmedBookings);
  const remainingCapacity = Math.max(0, equipment.capacity - peakOccupancy);
  const conflictingBookingIds =
    peakOccupancy >= equipment.capacity ? overlappingConfirmedBookings.map((b) => b.id) : [];

  if (peakOccupancy >= equipment.capacity) {
    violations.push({
      code: 'CAPACITY_EXCEEDED',
      message: `Equipment "${equipment.name}" has reached full capacity (${equipment.capacity}) during the requested window`,
      details: {
        capacity: equipment.capacity,
        peakOccupancy,
        conflictingBookingIds,
      },
    });
  }

  return {
    feasible: violations.length === 0,
    violations,
    conflictingBookingIds,
    conflictingMaintenanceIds,
    activeBookingsInWindow: peakOccupancy,
    remainingCapacity,
  };
}
