import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Cpu,
  ShieldAlert,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AI_MAX_USER_INPUT_CHARS, PROJECT_TYPES } from '@shared/constants';
import type { AlternativeTimeSlot } from '@shared/types';
import { ApiClientError } from '../api/client';
import {
  useAiRecommendations,
  useCreateAccessRequest,
  useCreateBooking,
  useEquipmentAvailability,
  useEquipmentDetail,
} from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { AiAdvisoryHeader } from '../components/AiAdvisoryBanner';
import { ConflictPanel } from '../components/ConflictPanel';
import { useStatusAnnouncer } from '../components/Layout';
import { ErrorBanner, LoadingSkeleton } from '../components/StateViews';
import { StatusLabel } from '../components/StatusLabel';
import {
  STANDARD_TWO_HOUR_SLOTS,
  formatDaysOfWeek,
  formatIstTimeRange,
  getIstDateString,
  getNextWeekdayDateString,
  toIstIsoTimestamp,
} from '../utils/time';

const reservationFormSchema = z.object({
  purpose: z
    .string()
    .trim()
    .min(5, 'Purpose must be at least 5 characters')
    .max(600, 'Purpose must be at most 600 characters'),
  projectType: z.enum(PROJECT_TYPES),
  deadlineDate: z.string().optional(),
});

type ReservationFormValues = z.infer<typeof reservationFormSchema>;

function extractIstDateAndHHMM(iso: string | null): { date: string; hhmm: string } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const date = getIstDateString(new Date(ms));
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '10';
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  return { date, hhmm: `${hour}:${minute}` };
}

export function EquipmentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { announce } = useStatusAnnouncer();

  const detailQuery = useEquipmentDetail(id);
  const equipment = detailQuery.data?.equipment;

  const initialStart = extractIstDateAndHHMM(searchParams.get('startTime'));
  const initialEnd = extractIstDateAndHHMM(searchParams.get('endTime'));

  const [selectedDate, setSelectedDate] = useState<string>(
    () => initialStart?.date ?? getNextWeekdayDateString(),
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string>(() => {
    if (initialStart && initialEnd) {
      const preset = STANDARD_TWO_HOUR_SLOTS.find(
        (s) => s.startHHMM === initialStart.hhmm && s.endHHMM === initialEnd.hhmm,
      );
      return preset ? preset.id : 'custom';
    }
    return STANDARD_TWO_HOUR_SLOTS[1].id; // 10:00 - 12:00 IST
  });
  const [customStartHHMM, setCustomStartHHMM] = useState<string>(
    () => initialStart?.hhmm ?? '10:00',
  );
  const [customEndHHMM, setCustomEndHHMM] = useState<string>(() => initialEnd?.hhmm ?? '12:00');
  const [submissionMode, setSubmissionMode] = useState<'request' | 'booking'>('request');
  const [conflictError, setConflictError] = useState<ApiClientError | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<{
    type: 'request' | 'booking';
    id: string;
    score?: number;
  } | null>(null);
  const [aiGoalInput, setAiGoalInput] = useState('');
  const [aiInputError, setAiInputError] = useState<string | null>(null);
  const aiRecMutation = useAiRecommendations();

  useEffect(() => {
    const s = extractIstDateAndHHMM(searchParams.get('startTime'));
    const e = extractIstDateAndHHMM(searchParams.get('endTime'));
    if (s && e) {
      setSelectedDate(s.date);
      const preset = STANDARD_TWO_HOUR_SLOTS.find(
        (opt) => opt.startHHMM === s.hhmm && opt.endHHMM === e.hhmm,
      );
      if (preset) {
        setSelectedSlotId(preset.id);
      } else {
        setSelectedSlotId('custom');
        setCustomStartHHMM(s.hhmm);
        setCustomEndHHMM(e.hhmm);
      }
    }
  }, [searchParams]);

  const { startIso, endIso, isTimeRangeValid } = useMemo(() => {
    const preset = STANDARD_TWO_HOUR_SLOTS.find((s) => s.id === selectedSlotId);
    const startH = preset ? preset.startHHMM : customStartHHMM;
    const endH = preset ? preset.endHHMM : customEndHHMM;
    const sIso = toIstIsoTimestamp(selectedDate, startH);
    const eIso = toIstIsoTimestamp(selectedDate, endH);
    return {
      startIso: sIso,
      endIso: eIso,
      isTimeRangeValid: Boolean(sIso && eIso) && Date.parse(sIso) < Date.parse(eIso),
    };
  }, [selectedDate, selectedSlotId, customStartHHMM, customEndHHMM]);

  const availabilityQuery = useEquipmentAvailability(
    id,
    startIso,
    endIso,
    Boolean(equipment && isTimeRangeValid),
  );
  const availability = availabilityQuery.data?.availability;

  const createRequestMutation = useCreateAccessRequest();
  const createBookingMutation = useCreateBooking();
  const isSubmitting = createRequestMutation.isPending || createBookingMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationFormSchema),
    defaultValues: {
      purpose: '',
      projectType: 'COURSEWORK',
      deadlineDate: '',
    },
  });

  const handleSelectAlternativeSlot = (slot: AlternativeTimeSlot) => {
    const startParts = extractIstDateAndHHMM(slot.startTime);
    const endParts = extractIstDateAndHHMM(slot.endTime);
    if (!startParts || !endParts) return;

    setSelectedDate(startParts.date);
    const preset = STANDARD_TWO_HOUR_SLOTS.find(
      (opt) => opt.startHHMM === startParts.hhmm && opt.endHHMM === endParts.hhmm,
    );
    if (preset) {
      setSelectedSlotId(preset.id);
    } else {
      setSelectedSlotId('custom');
      setCustomStartHHMM(startParts.hhmm);
      setCustomEndHHMM(endParts.hhmm);
    }
    setConflictError(null);
    setSubmitError(null);
    announce(`Selected alternative slot ${formatIstTimeRange(slot.startTime, slot.endTime)}`);
  };

  const onSubmit = async (values: ReservationFormValues) => {
    if (!equipment || !isTimeRangeValid || isSubmitting) {
      return;
    }

    setConflictError(null);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      if (submissionMode === 'request') {
        const deadlineIso = values.deadlineDate
          ? `${values.deadlineDate}T23:59:00+05:30`
          : null;
        const res = await createRequestMutation.mutateAsync({
          equipmentId: equipment.id,
          startTime: startIso,
          endTime: endIso,
          purpose: values.purpose,
          projectType: values.projectType,
          deadline: deadlineIso,
        });
        setSuccessMessage({
          type: 'request',
          id: res.request.id,
          score: res.request.priorityScore,
        });
        announce(`Access request ${res.request.id} submitted for review.`);
        reset({ purpose: '', projectType: values.projectType, deadlineDate: '' });
      } else {
        const res = await createBookingMutation.mutateAsync({
          equipmentId: equipment.id,
          startTime: startIso,
          endTime: endIso,
          purpose: values.purpose,
        });
        setSuccessMessage({
          type: 'booking',
          id: res.booking.id,
        });
        announce(`Reservation ${res.booking.id} confirmed.`);
        reset({ purpose: '', projectType: values.projectType, deadlineDate: '' });
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setConflictError(err);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Unable to complete submission.');
      }
    }
  };

  if (detailQuery.isLoading) {
    return <LoadingSkeleton label="Loading equipment details" />;
  }

  if (detailQuery.error || !equipment) {
    return (
      <div className="space-y-4">
        <Link
          to="/equipment"
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Catalog</span>
        </Link>
        <ErrorBanner
          error={detailQuery.error ?? 'Equipment record not found.'}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  const missingTrainings = equipment.requiredTrainings.filter(
    (t) => !(user?.completedTrainings ?? []).includes(t),
  );
  const safetyBlocked = equipment.safetyRequirements.length > 0 && !user?.safetyCleared;

  return (
    <section aria-labelledby="equipment-detail-heading" className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/equipment"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Equipment Catalog</span>
        </Link>
        <span className="font-mono text-xs text-slate-500">ID: {equipment.id}</span>
      </div>

      {/* Equipment Summary Header */}
      <header className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold text-blue-700">
              {equipment.department} · {equipment.category} · {equipment.location}
            </p>
            <h1 id="equipment-detail-heading" className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
              {equipment.name}
            </h1>
            <p className="mt-2 text-sm text-slate-700">{equipment.description}</p>
          </div>
          <StatusLabel status={equipment.archived ? 'ARCHIVED' : 'ACTIVE'} />
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Unit Capacity
            </dt>
            <dd className="mt-1 font-mono font-semibold text-slate-950 tabular-nums">
              {equipment.capacity} concurrent unit{equipment.capacity === 1 ? '' : 's'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Operating Hours (IST)
            </dt>
            <dd className="mt-1 font-mono font-semibold text-slate-950 tabular-nums">
              {equipment.operatingHours.startTime}–{equipment.operatingHours.endTime} (
              {formatDaysOfWeek(equipment.operatingHours.daysOfWeek)})
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Max Session Length
            </dt>
            <dd className="mt-1 font-mono font-semibold text-slate-950 tabular-nums">
              {equipment.maxBookingDurationMinutes} minutes
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Tags
            </dt>
            <dd className="mt-1 font-mono text-xs text-slate-800">
              {equipment.tags.length > 0 ? equipment.tags.join(' · ') : 'Standard'}
            </dd>
          </div>
        </dl>

        {/* Compliance Check Banner */}
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Required Trainings
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-900">
              {equipment.requiredTrainings.length > 0
                ? equipment.requiredTrainings.join(', ')
                : 'None required'}
            </p>
            {missingTrainings.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Missing from your profile: {missingTrainings.join(', ')}</span>
              </p>
            )}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Safety Requirements
            </h2>
            <p className="mt-1 text-xs text-slate-900">
              {equipment.safetyRequirements.length > 0
                ? equipment.safetyRequirements.join(', ')
                : 'Standard laboratory conduct'}
            </p>
            {safetyBlocked && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Your account currently lacks lab safety clearance.</span>
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Main Split: Slot Selection + Form */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Accessible Slot Picker & Live Availability */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-950">1. Choose IST Time Slot</h2>
            <p className="mt-1 text-xs text-slate-600">
              All reservations use half-open intervals [start, end) in Asia/Kolkata.
            </p>

            <div className="mt-4">
              <label htmlFor="slot-date" className="block text-sm font-medium text-slate-800">
                Reservation Date (IST)
              </label>
              <input
                id="slot-date"
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setConflictError(null);
                }}
                className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 tabular-nums focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-slate-800">
                Select a 2-hour session or custom window
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STANDARD_TWO_HOUR_SLOTS.map((slot) => (
                  <label
                    key={slot.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                      selectedSlotId === slot.id
                        ? 'border-blue-700 bg-blue-50/70 font-semibold text-blue-950'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ist-slot-option"
                      value={slot.id}
                      checked={selectedSlotId === slot.id}
                      onChange={() => {
                        setSelectedSlotId(slot.id);
                        setConflictError(null);
                      }}
                      className="h-4 w-4 border-slate-300 text-blue-700 focus:ring-blue-700"
                    />
                    <span className="font-mono text-xs tabular-nums">{slot.label}</span>
                  </label>
                ))}

                <label
                  className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm sm:col-span-2 ${
                    selectedSlotId === 'custom'
                      ? 'border-blue-700 bg-blue-50/70 font-semibold text-blue-950'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="ist-slot-option"
                    value="custom"
                    checked={selectedSlotId === 'custom'}
                    onChange={() => {
                      setSelectedSlotId('custom');
                      setConflictError(null);
                    }}
                    className="h-4 w-4 border-slate-300 text-blue-700 focus:ring-blue-700"
                  />
                  <span>Custom IST Time Window</span>
                </label>
              </div>
            </fieldset>

            {selectedSlotId === 'custom' && (
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div>
                  <label
                    htmlFor="custom-start-time"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Start Time (HH:mm)
                  </label>
                  <input
                    id="custom-start-time"
                    type="time"
                    value={customStartHHMM}
                    onChange={(e) => {
                      setCustomStartHHMM(e.target.value);
                      setConflictError(null);
                    }}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="custom-end-time"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    End Time (HH:mm)
                  </label>
                  <input
                    id="custom-end-time"
                    type="time"
                    value={customEndHHMM}
                    onChange={(e) => {
                      setCustomEndHHMM(e.target.value);
                      setConflictError(null);
                    }}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>
            )}

            {!isTimeRangeValid && (
              <p role="alert" className="mt-3 text-xs font-semibold text-red-700">
                End time must be strictly after start time.
              </p>
            )}
          </div>

          {/* Live Availability Check Output */}
          {isTimeRangeValid && (
            <div className="space-y-4">
              {availabilityQuery.isLoading ? (
                <LoadingSkeleton label="Checking slot feasibility" />
              ) : availabilityQuery.error ? (
                <ErrorBanner
                  error={availabilityQuery.error}
                  onRetry={() => void availabilityQuery.refetch()}
                />
              ) : availability ? (
                availability.evaluation.feasible ? (
                  <div
                    role="status"
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                        aria-hidden="true"
                      />
                      <div>
                        <h3 className="text-sm font-semibold">Slot Eligible &amp; Available</h3>
                        <p className="mt-1 text-xs text-emerald-900">
                          {formatIstTimeRange(startIso, endIso)} ·{' '}
                          <span className="font-mono font-semibold tabular-nums">
                            {availability.evaluation.remainingCapacity} of {equipment.capacity}
                          </span>{' '}
                          unit{equipment.capacity === 1 ? '' : 's'} free.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ConflictPanel
                    title="Selected Slot Is Unavailable"
                    message="This time window cannot be booked directly due to scheduling constraints."
                    violations={availability.evaluation.violations}
                    alternatives={availability.alternatives}
                    onSelectTimeSlot={handleSelectAlternativeSlot}
                    onSelectEquipment={(alt) =>
                      navigate(
                        `/equipment/${alt.equipmentId}?startTime=${encodeURIComponent(alt.startTime)}&endTime=${encodeURIComponent(alt.endTime)}`,
                      )
                    }
                  />
                )
              ) : null}
            </div>
          )}

          {/* Advisory Scheduling Recommendations (Never creates bookings or alters official ranking) */}
          <div className="rounded-xl border border-indigo-200 bg-white p-5">
            <div className="space-y-3">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-indigo-800">
                  Advisory Scheduling Assistant
                </p>
                <h2 className="text-base font-semibold text-slate-950">
                  Get Scheduling Recommendations
                </h2>
                <p className="text-xs text-slate-600">
                  Evaluates deterministic verified slots and eligible equivalent instruments around
                  your chosen IST window. Selecting a suggestion only pre-fills the form.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="ai-rec-goal" className="block text-xs font-semibold text-slate-800">
                    Experiment Context for Recommendations
                  </label>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {aiGoalInput.length} / {AI_MAX_USER_INPUT_CHARS}
                  </span>
                </div>
                <textarea
                  id="ai-rec-goal"
                  rows={2}
                  maxLength={AI_MAX_USER_INPUT_CHARS}
                  value={aiGoalInput}
                  onChange={(e) => {
                    setAiGoalInput(e.target.value);
                    setAiInputError(null);
                  }}
                  placeholder={`e.g., Running ${equipment.category.toLowerCase()} validation tests for capstone milestone`}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                />
                {aiInputError && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-700">
                    {aiInputError}
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={aiRecMutation.isPending}
                onClick={() => {
                  const trimmed = aiGoalInput.trim();
                  if (trimmed.length < 5) {
                    setAiInputError('Enter at least 5 characters describing your goal.');
                    return;
                  }
                  setAiInputError(null);
                  aiRecMutation.mutate({
                    equipmentId: equipment.id,
                    projectDescription: trimmed,
                    ...(isTimeRangeValid
                      ? { preferredStartTime: startIso, preferredEndTime: endIso }
                      : {}),
                  });
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50/70 px-4 py-2 text-xs font-semibold text-indigo-950 hover:bg-indigo-100 disabled:opacity-60"
              >
                <Cpu className="h-4 w-4 text-indigo-700" aria-hidden="true" />
                <span>
                  {aiRecMutation.isPending
                    ? 'Evaluating Verified Slots…'
                    : 'Get Scheduling Recommendations'}
                </span>
              </button>

              {aiRecMutation.error && <ErrorBanner error={aiRecMutation.error} />}

              {aiRecMutation.data && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <AiAdvisoryHeader
                    disclaimer={aiRecMutation.data.disclaimer}
                    source={aiRecMutation.data.source}
                    model={aiRecMutation.data.model}
                    cached={aiRecMutation.data.cached}
                    fallbackReason={aiRecMutation.data.fallbackReason}
                    authorityNote={aiRecMutation.data.authorityNote}
                  />

                  {aiRecMutation.data.blockerSummary && (
                    <p className="text-xs font-medium text-amber-900">
                      Current slot blocker: {aiRecMutation.data.blockerSummary}
                    </p>
                  )}

                  {aiRecMutation.data.recommendations.length === 0 ? (
                    <p className="text-xs text-slate-700">
                      No feasible alternative slots met all hard constraints.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {aiRecMutation.data.recommendations.map((rec) => (
                        <li
                          key={`${rec.equipmentId}-${rec.startTime}`}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-950">
                                {rec.equipmentName} ({rec.department})
                              </p>
                              <p className="font-mono text-[11px] text-slate-700 tabular-nums">
                                {formatIstTimeRange(rec.startTime, rec.endTime)} ·{' '}
                                {rec.availableCapacity} unit free
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (rec.equipmentId === equipment.id) {
                                  handleSelectAlternativeSlot({
                                    equipmentId: rec.equipmentId,
                                    equipmentName: rec.equipmentName,
                                    startTime: rec.startTime,
                                    endTime: rec.endTime,
                                    availableCapacity: rec.availableCapacity,
                                  });
                                } else {
                                  navigate(
                                    `/equipment/${rec.equipmentId}?startTime=${encodeURIComponent(rec.startTime)}&endTime=${encodeURIComponent(rec.endTime)}`,
                                  );
                                }
                              }}
                              className="inline-flex min-h-[44px] items-center rounded-lg border border-blue-700 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              {rec.equipmentId === equipment.id
                                ? 'Apply Suggested Slot'
                                : 'Open Suggested Equipment'}
                            </button>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-700">{rec.suitabilityReason}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Access Request / Direct Booking Form */}
        <div className="space-y-5 lg:col-span-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-950">
              2. Submit Access Request or Direct Booking
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Access Requests enter the fairness-ranked faculty queue; Direct Bookings reserve an
              eligible open slot immediately.
            </p>

            {/* Mode Toggle */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                aria-pressed={submissionMode === 'request'}
                onClick={() => {
                  setSubmissionMode('request');
                  setConflictError(null);
                  setSubmitError(null);
                }}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                  submissionMode === 'request'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                <span>Access Request</span>
              </button>
              <button
                type="button"
                aria-pressed={submissionMode === 'booking'}
                onClick={() => {
                  setSubmissionMode('booking');
                  setConflictError(null);
                  setSubmitError(null);
                }}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                  submissionMode === 'booking'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                <span>Direct Booking</span>
              </button>
            </div>

            {successMessage && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
              >
                <p className="font-semibold">
                  {successMessage.type === 'request'
                    ? 'Access Request Submitted'
                    : 'Reservation Confirmed'}
                </p>
                <p className="mt-1 text-xs">
                  Reference ID: <span className="font-mono font-semibold">{successMessage.id}</span>
                  {typeof successMessage.score === 'number'
                    ? ` · Computed Fairness Score: ${successMessage.score.toFixed(1)}/100`
                    : ''}
                </p>
                <div className="mt-3">
                  <Link
                    to={successMessage.type === 'request' ? '/requests' : '/reservations'}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
                  >
                    {successMessage.type === 'request'
                      ? 'Track in My Requests'
                      : 'View in Reservations'}
                  </Link>
                </div>
              </div>
            )}

            {conflictError && (
              <div className="mt-4">
                <ConflictPanel
                  title="Submission Blocked by Scheduling Conflict"
                  message={conflictError.message}
                  code={conflictError.code}
                  requestId={conflictError.requestId}
                  alternatives={conflictError.alternatives}
                  onSelectTimeSlot={handleSelectAlternativeSlot}
                  onSelectEquipment={(alt) =>
                    navigate(
                      `/equipment/${alt.equipmentId}?startTime=${encodeURIComponent(alt.startTime)}&endTime=${encodeURIComponent(alt.endTime)}`,
                    )
                  }
                />
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Selected Window:</span>{' '}
                <span className="font-mono tabular-nums">
                  {isTimeRangeValid ? formatIstTimeRange(startIso, endIso) : 'Invalid range'}
                </span>
              </div>

              {submissionMode === 'request' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="req-project-type"
                      className="block text-sm font-medium text-slate-800"
                    >
                      Project Tier
                    </label>
                    <select
                      id="req-project-type"
                      {...register('projectType')}
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                    >
                      {PROJECT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="req-deadline"
                      className="block text-sm font-medium text-slate-800"
                    >
                      Academic Deadline (optional)
                    </label>
                    <input
                      id="req-deadline"
                      type="date"
                      {...register('deadlineDate')}
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 tabular-nums focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="req-purpose" className="block text-sm font-medium text-slate-800">
                  Experiment / Usage Purpose
                </label>
                <textarea
                  id="req-purpose"
                  rows={4}
                  aria-invalid={Boolean(errors.purpose)}
                  aria-describedby={errors.purpose ? 'req-purpose-error' : undefined}
                  placeholder="Describe your experiment scope, deliverables, or coursework milestone (min 5 characters)..."
                  {...register('purpose')}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                />
                {errors.purpose && (
                  <p id="req-purpose-error" className="mt-1 text-xs font-medium text-red-700">
                    {errors.purpose.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !isTimeRangeValid}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Submitting…'
                  : submissionMode === 'request'
                    ? 'Submit Access Request'
                    : 'Confirm Direct Booking'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
