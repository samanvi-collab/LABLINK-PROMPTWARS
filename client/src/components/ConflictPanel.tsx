import { AlertTriangle, ArrowRight, CalendarClock, Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  AlternativeEquipmentOption,
  AlternativeSuggestions,
  AlternativeTimeSlot,
  ConstraintViolation,
} from '@shared/types';
import { formatIstTimeRange } from '../utils/time';

export interface ConflictPanelProps {
  title?: string;
  message: string;
  code?: string;
  requestId?: string;
  violations?: ConstraintViolation[];
  alternatives?: AlternativeSuggestions;
  onSelectTimeSlot?: (slot: AlternativeTimeSlot) => void;
  onSelectEquipment?: (option: AlternativeEquipmentOption) => void;
}

export function ConflictPanel({
  title = 'Scheduling Conflict Detected',
  message,
  code,
  requestId,
  violations = [],
  alternatives,
  onSelectTimeSlot,
  onSelectEquipment,
}: ConflictPanelProps) {
  const timeSlots = alternatives?.timeSlots ?? [];
  const equivalentEquipment = alternatives?.equivalentEquipment ?? [];

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-slate-900"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-800">{message}</p>

          {(code || requestId) && (
            <p className="mt-1.5 font-mono text-xs text-slate-600">
              {code ? `Code: ${code}` : ''}
              {code && requestId ? ' · ' : ''}
              {requestId ? `Request ID: ${requestId}` : ''}
            </p>
          )}

          {violations.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
              {violations.map((v, idx) => (
                <li key={`${v.code}-${idx}`}>
                  <span className="font-mono text-xs font-semibold text-amber-900">{v.code}:</span>{' '}
                  {v.message}
                </li>
              ))}
            </ul>
          )}

          {(timeSlots.length > 0 || equivalentEquipment.length > 0) && (
            <div className="mt-4 space-y-4 border-t border-amber-200 pt-4">
              {timeSlots.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                    <CalendarClock className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span>Verified Alternative Time Slots (Same Equipment)</span>
                  </h4>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {timeSlots.map((slot) => (
                      <div
                        key={`${slot.equipmentId}-${slot.startTime}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 tabular-nums">
                            {formatIstTimeRange(slot.startTime, slot.endTime)}
                          </p>
                          <p className="text-xs text-slate-600 tabular-nums">
                            {slot.availableCapacity} unit{slot.availableCapacity === 1 ? '' : 's'} free
                          </p>
                        </div>
                        {onSelectTimeSlot && (
                          <button
                            type="button"
                            onClick={() => onSelectTimeSlot(slot)}
                            className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                          >
                            Use Slot
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {equivalentEquipment.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                    <Cpu className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span>Equivalent Available Equipment (Same Window)</span>
                  </h4>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {equivalentEquipment.map((eq) => (
                      <div
                        key={eq.equipmentId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {eq.equipmentName}
                          </p>
                          <p className="text-xs text-slate-600">
                            {eq.department} · {eq.location} ·{' '}
                            <span className="tabular-nums">{eq.availableCapacity} free</span>
                          </p>
                        </div>
                        {onSelectEquipment ? (
                          <button
                            type="button"
                            onClick={() => onSelectEquipment(eq)}
                            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                          >
                            <span>Switch</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : (
                          <Link
                            to={`/equipment/${eq.equipmentId}?startTime=${encodeURIComponent(eq.startTime)}&endTime=${encodeURIComponent(eq.endTime)}`}
                            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                          >
                            <span>Open</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
