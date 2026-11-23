import { DEFAULT_TIMEZONE } from '../../../shared/constants';
import { OperatingHours } from '../../../shared/types';

export interface ZonedDateParts {
  dateKey: string;
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  minutesFromMidnight: number;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function getZonedParts(dateMs: number, timeZone = DEFAULT_TIMEZONE): ZonedDateParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(dateMs));
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const rawHour = Number(lookup.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(lookup.minute);
  const weekdayStr = lookup.weekday ?? 'Sun';
  const dayOfWeek = WEEKDAY_MAP[weekdayStr] ?? 0;
  const dateKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    dateKey,
    year,
    month,
    day,
    dayOfWeek,
    hour,
    minute,
    minutesFromMidnight: hour * 60 + minute,
  };
}

export function parseHHMMToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  return Number(hStr) * 60 + Number(mStr);
}

/**
 * Half-open interval overlap check: [aStart, aEnd) overlaps [bStart, bEnd)
 * iff aStart < bEnd && bStart < aEnd.
 * Exact boundary touch (aEnd === bStart) returns false.
 */
export function intervalsOverlap(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number,
): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

export function isWithinOperatingHours(
  startMs: number,
  endMs: number,
  operatingHours: OperatingHours,
  timeZone = DEFAULT_TIMEZONE,
): { valid: boolean; reason?: string } {
  if (endMs <= startMs) {
    return { valid: false, reason: 'End time must be after start time' };
  }

  const startParts = getZonedParts(startMs, timeZone);
  const endInclusiveParts = getZonedParts(endMs - 1, timeZone);

  if (startParts.dateKey !== endInclusiveParts.dateKey) {
    return {
      valid: false,
      reason: `Bookings must remain within a single calendar day in ${timeZone}`,
    };
  }

  if (!operatingHours.daysOfWeek.includes(startParts.dayOfWeek)) {
    return {
      valid: false,
      reason: `Equipment does not operate on day ${startParts.dayOfWeek} in ${timeZone}`,
    };
  }

  const opStart = parseHHMMToMinutes(operatingHours.startTime);
  const opEnd = parseHHMMToMinutes(operatingHours.endTime);

  const endPartsExact = getZonedParts(endMs, timeZone);
  // If endMs lands exactly on midnight 00:00 of the next day, its effective end minute on startDay is 1440.
  const effectiveEndMinutes =
    endPartsExact.dateKey !== startParts.dateKey && endPartsExact.minutesFromMidnight === 0
      ? 1440
      : endPartsExact.minutesFromMidnight;

  if (startParts.minutesFromMidnight < opStart || effectiveEndMinutes > opEnd) {
    return {
      valid: false,
      reason: `Requested window falls outside operating hours (${operatingHours.startTime}–${operatingHours.endTime} ${timeZone})`,
    };
  }

  return { valid: true };
}

/**
 * Counts how many operating minutes exist in [windowStartMs, windowEndMs) in the given timezone.
 * Iterates day-by-day cleanly without assuming fixed UTC offset (safe across any timezone).
 */
export function calculateOperatingMinutesInWindow(
  windowStartMs: number,
  windowEndMs: number,
  operatingHours: OperatingHours,
  timeZone = DEFAULT_TIMEZONE,
): number {
  if (windowEndMs <= windowStartMs) {
    return 0;
  }

  const opStart = parseHHMMToMinutes(operatingHours.startTime);
  const opEnd = parseHHMMToMinutes(operatingHours.endTime);
  if (opEnd <= opStart) {
    return 0;
  }

  // Step through in 15-minute or day-aligned chunks; for analytics windows (typically 7-90 days)
  // stepping by 15 minutes over 30 days is 2880 iterations (<1ms), or day-exact using zoned parts.
  // We find the start of each calendar day in the target timezone cleanly.
  let totalMinutes = 0;
  let cursor = windowStartMs;
  const maxIterations = 3660;
  let steps = 0;

  while (cursor < windowEndMs && steps < maxIterations) {
    steps += 1;
    const parts = getZonedParts(cursor, timeZone);
    const minutesUntilNextMidnight = 1440 - parts.minutesFromMidnight;
    const remainderInMs = cursor % 60000;
    const dayEndMs = Math.min(
      windowEndMs,
      cursor + minutesUntilNextMidnight * 60000 - remainderInMs,
    );

    if (operatingHours.daysOfWeek.includes(parts.dayOfWeek)) {
      const sliceStartMin = parts.minutesFromMidnight;
      const sliceEndMin = sliceStartMin + (dayEndMs - cursor) / 60000;
      const overlapStart = Math.max(sliceStartMin, opStart);
      const overlapEnd = Math.min(sliceEndMin, opEnd);
      if (overlapEnd > overlapStart) {
        totalMinutes += overlapEnd - overlapStart;
      }
    }

    cursor = dayEndMs;
  }

  return Math.round(totalMinutes);
}
