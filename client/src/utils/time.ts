import { DEFAULT_TIMEZONE } from '@shared/constants';

const IST_OFFSET_MINUTES = 330; // +05:30

export function getIstDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(ms)) {
    return getIstDateString();
  }
  return getIstDateString(new Date(ms + days * 86_400_000));
}

export function getNextWeekdayDateString(fromDate: Date = new Date()): string {
  let candidate = addDaysToDateString(getIstDateString(fromDate), 1);
  for (let i = 0; i < 7; i += 1) {
    const ms = Date.parse(`${candidate}T12:00:00+05:30`);
    const day = new Date(ms + IST_OFFSET_MINUTES * 60_000).getUTCDay();
    if (day >= 1 && day <= 5) {
      return candidate;
    }
    candidate = addDaysToDateString(candidate, 1);
  }
  return candidate;
}

export function toIstIsoTimestamp(dateStr: string, hhmm: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(hhmm)) {
    return '';
  }
  return `${dateStr}T${hhmm}:00+05:30`;
}

export function formatIstDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(ms));
}

export function formatIstTimeRange(startIso: string, endIso: string): string {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return `${startIso} – ${endIso}`;
  }
  const datePart = new Intl.DateTimeFormat('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(startMs));

  const startTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(startMs));

  const endTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(endMs));

  return `${datePart}, ${startTime}–${endTime} IST`;
}

export function formatDaysOfWeek(days: number[]): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sorted = [...days].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 7) return 'Daily';
  if (sorted.join(',') === '1,2,3,4,5') return 'Mon–Fri';
  if (sorted.join(',') === '1,2,3,4,5,6') return 'Mon–Sat';
  return sorted.map((d) => names[d]).join(', ');
}

export interface StandardSlotOption {
  id: string;
  label: string;
  startHHMM: string;
  endHHMM: string;
}

export const STANDARD_TWO_HOUR_SLOTS: StandardSlotOption[] = [
  { id: 'slot-08-10', label: '08:00 – 10:00 IST', startHHMM: '08:00', endHHMM: '10:00' },
  { id: 'slot-10-12', label: '10:00 – 12:00 IST', startHHMM: '10:00', endHHMM: '12:00' },
  { id: 'slot-12-14', label: '12:00 – 14:00 IST', startHHMM: '12:00', endHHMM: '14:00' },
  { id: 'slot-14-16', label: '14:00 – 16:00 IST', startHHMM: '14:00', endHHMM: '16:00' },
  { id: 'slot-16-18', label: '16:00 – 18:00 IST', startHHMM: '16:00', endHHMM: '18:00' },
  { id: 'slot-18-20', label: '18:00 – 20:00 IST', startHHMM: '18:00', endHHMM: '20:00' },
];
