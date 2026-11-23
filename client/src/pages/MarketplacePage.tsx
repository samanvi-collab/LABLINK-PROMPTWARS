import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Cpu, Search, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AI_MAX_USER_INPUT_CHARS } from '@shared/constants';
import type { AvailabilitySummary, Equipment } from '@shared/types';
import { apiRequest } from '../api/client';
import { queryKeys, useAiProjectMatching, useEquipmentList } from '../api/queries';
import { AiAdvisoryHeader } from '../components/AiAdvisoryBanner';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../components/StateViews';
import {
  formatDaysOfWeek,
  getNextWeekdayDateString,
  toIstIsoTimestamp,
} from '../utils/time';

const DEPARTMENTS = ['All', 'CSE', 'ECE', 'Mechanical', 'EEE'];
const CATEGORIES = [
  'All',
  'Computing',
  'Fabrication',
  'Robotics',
  'Electronics',
  'Testing',
  'RF & Comms',
  'Manufacturing',
  'Metrology',
  'Power Systems',
  'Control Systems',
];

export function MarketplacePage() {
  const [searchInput, setSearchInput] = useState('');
  const [department, setDepartment] = useState('All');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(1);

  const [checkAvailability, setCheckAvailability] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [windowDate, setWindowDate] = useState(() => getNextWeekdayDateString());
  const [windowStart, setWindowStart] = useState('10:00');
  const [windowEnd, setWindowEnd] = useState('12:00');

  const [matcherOpen, setMatcherOpen] = useState(false);
  const [projectGoal, setProjectGoal] = useState('');
  const [matcherError, setMatcherError] = useState<string | null>(null);
  const projectMatchingMutation = useAiProjectMatching();

  const queryFilters = useMemo(
    () => ({
      page,
      limit: 12,
      search: searchInput.trim() || undefined,
      department: department !== 'All' ? department : undefined,
      category: category !== 'All' ? category : undefined,
      includeArchived: false,
    }),
    [page, searchInput, department, category],
  );

  const equipmentQuery = useEquipmentList(queryFilters);
  const items: Equipment[] = equipmentQuery.data?.items ?? [];
  const pagination = equipmentQuery.data?.pagination;

  const startIso = checkAvailability ? toIstIsoTimestamp(windowDate, windowStart) : '';
  const endIso = checkAvailability ? toIstIsoTimestamp(windowDate, windowEnd) : '';
  const isWindowValid =
    Boolean(startIso && endIso) && Date.parse(startIso) < Date.parse(endIso);

  const availabilityQueries = useQueries({
    queries: items.map((eq) => ({
      queryKey: queryKeys.equipmentAvailability(eq.id, startIso, endIso),
      queryFn: () =>
        apiRequest<{ availability: AvailabilitySummary }>(`/api/equipment/${eq.id}/availability`, {
          query: { startTime: startIso, endTime: endIso },
        }),
      enabled: checkAvailability && isWindowValid,
      staleTime: 15_000,
    })),
  });

  const availabilityMap = useMemo(() => {
    const map = new Map<string, AvailabilitySummary>();
    items.forEach((eq, idx) => {
      const data = availabilityQueries[idx]?.data;
      if (data?.availability) {
        map.set(eq.id, data.availability);
      }
    });
    return map;
  }, [items, availabilityQueries]);

  const visibleItems = useMemo(() => {
    if (!checkAvailability || !isWindowValid || !availableOnly) {
      return items;
    }
    return items.filter((eq) => {
      const summary = availabilityMap.get(eq.id);
      return summary ? summary.evaluation.feasible : true;
    });
  }, [items, checkAvailability, isWindowValid, availableOnly, availabilityMap]);

  const resetFilters = () => {
    setSearchInput('');
    setDepartment('All');
    setCategory('All');
    setCheckAvailability(false);
    setAvailableOnly(false);
    setPage(1);
  };

  return (
    <section aria-labelledby="catalog-heading" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
            Campus Equipment Marketplace
          </p>
          <h1 id="catalog-heading" className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            Shared Laboratory Instruments
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Filter by department, discipline, or target IST time window to inspect live capacity
            and training rules.
          </p>
        </div>
        {pagination && (
          <p className="font-mono text-xs text-slate-600 tabular-nums">
            Showing {visibleItems.length} of {pagination.total} instruments
          </p>
        )}
      </header>

      {/* Filter Toolbar */}
      <form
        aria-label="Equipment search and filters"
        onSubmit={(e) => e.preventDefault()}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-5">
            <label htmlFor="catalog-search" className="block text-xs font-semibold text-slate-700">
              Search equipment, tags, or location
            </label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="catalog-search"
                type="search"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g., GPU, cleanroom, oscilloscope, CNC..."
                className="block min-h-[44px] w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="catalog-department"
              className="block text-xs font-semibold text-slate-700"
            >
              Department
            </label>
            <select
              id="catalog-department"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept === 'All' ? 'All Departments' : dept}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label htmlFor="catalog-category" className="block text-xs font-semibold text-slate-700">
              Category
            </label>
            <select
              id="catalog-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Availability Window Filter */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-slate-900">
              <input
                type="checkbox"
                checked={checkAvailability}
                onChange={(e) => setCheckAvailability(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
              />
              <span>Check live availability for an IST time window</span>
            </label>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              Reset filters
            </button>
          </div>

          {checkAvailability && (
            <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
              <div>
                <label htmlFor="avail-date" className="block text-xs font-semibold text-slate-700">
                  Date (IST)
                </label>
                <input
                  id="avail-date"
                  type="date"
                  value={windowDate}
                  onChange={(e) => setWindowDate(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="avail-start" className="block text-xs font-semibold text-slate-700">
                  Start Time
                </label>
                <input
                  id="avail-start"
                  type="time"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="avail-end" className="block text-xs font-semibold text-slate-700">
                  End Time
                </label>
                <input
                  id="avail-end"
                  type="time"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 tabular-nums"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={availableOnly}
                    onChange={(e) => setAvailableOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>Hide infeasible / full instruments</span>
                </label>
              </div>
              {!isWindowValid && (
                <p className="text-xs font-medium text-red-700 sm:col-span-4">
                  End time must be strictly after start time.
                </p>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Advisory Project Equipment Matcher (AI + Deterministic Rule-Based Fallback) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-indigo-800">
              Advisory Assistant
            </p>
            <h2 className="text-base font-semibold text-slate-950">
              Match Equipment to Project Goals
            </h2>
            <p className="text-xs text-slate-600">
              Describe your experiment or build goals to receive advisory equipment matches checked
              against active catalog records and your training status.
            </p>
          </div>
          <button
            type="button"
            aria-expanded={matcherOpen}
            onClick={() => setMatcherOpen((prev) => !prev)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50/70 px-4 py-2 text-xs font-semibold text-indigo-950 transition hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            <Cpu className="h-4 w-4 text-indigo-700" aria-hidden="true" />
            <span>{matcherOpen ? 'Hide Project Matcher' : 'Open Project Matcher'}</span>
          </button>
        </div>

        {matcherOpen && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ai-project-goal"
                  className="block text-xs font-semibold text-slate-800"
                >
                  Project or Experiment Description
                </label>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {projectGoal.length} / {AI_MAX_USER_INPUT_CHARS}
                </span>
              </div>
              <textarea
                id="ai-project-goal"
                rows={3}
                maxLength={AI_MAX_USER_INPUT_CHARS}
                value={projectGoal}
                onChange={(e) => {
                  setProjectGoal(e.target.value);
                  setMatcherError(null);
                }}
                placeholder="e.g., Training a computer vision transformer on surgical robotics frames and evaluating 6-axis kinematics..."
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
              {matcherError && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {matcherError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={projectMatchingMutation.isPending}
                  onClick={() => {
                    const trimmed = projectGoal.trim();
                    if (trimmed.length < 5) {
                      setMatcherError('Enter at least 5 characters to match equipment.');
                      return;
                    }
                    setMatcherError(null);
                    projectMatchingMutation.mutate({
                      projectDescription: trimmed,
                      department: department !== 'All' ? department : undefined,
                      category: category !== 'All' ? category : undefined,
                    });
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <Cpu className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {projectMatchingMutation.isPending
                      ? 'Matching Equipment…'
                      : 'Suggest Matching Equipment'}
                  </span>
                </button>
              </div>
            </div>

            {projectMatchingMutation.error && (
              <ErrorBanner error={projectMatchingMutation.error} />
            )}

            {projectMatchingMutation.data && (
              <div
                aria-label="Advisory project equipment matches"
                className="space-y-4 rounded-xl border border-indigo-200 bg-slate-50 p-4"
              >
                <AiAdvisoryHeader
                  disclaimer={projectMatchingMutation.data.disclaimer}
                  source={projectMatchingMutation.data.source}
                  model={projectMatchingMutation.data.model}
                  cached={projectMatchingMutation.data.cached}
                  fallbackReason={projectMatchingMutation.data.fallbackReason}
                  authorityNote={projectMatchingMutation.data.authorityNote}
                />

                {projectMatchingMutation.data.matches.length === 0 ? (
                  <p className="text-xs text-slate-700">
                    No active catalog instruments matched the current filters.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {projectMatchingMutation.data.matches.map((match) => (
                      <div
                        key={match.equipmentId}
                        className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-blue-700">
                              {match.department} · {match.category}
                            </p>
                            <span className="font-mono text-[11px] font-semibold text-indigo-800">
                              {match.suitabilityLabel}
                            </span>
                          </div>
                          <h3 className="mt-1 text-sm font-semibold text-slate-950">
                            {match.equipmentName}
                          </h3>
                          <p className="mt-1 text-xs text-slate-700">{match.fitSummary}</p>
                          <p
                            className={`mt-2 text-xs font-medium ${
                              match.eligibleForUser ? 'text-emerald-700' : 'text-amber-800'
                            }`}
                          >
                            {match.eligibleForUser
                              ? 'Training & safety prerequisites satisfied for your profile'
                              : match.missingTrainings.length > 0
                                ? `Missing training: ${match.missingTrainings.join(', ')}`
                                : 'Lab safety clearance required before booking'}
                          </p>
                        </div>

                        <Link
                          to={`/equipment/${match.equipmentId}`}
                          className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                        >
                          <span>Inspect &amp; Check Availability</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Catalog Grid */}
      {equipmentQuery.isLoading ? (
        <LoadingSkeleton label="Loading equipment catalog" />
      ) : equipmentQuery.error ? (
        <ErrorBanner
          error={equipmentQuery.error}
          onRetry={() => void equipmentQuery.refetch()}
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title="No matching equipment found"
          description="Try broadening your search keywords, switching departments, or disabling the availability filter."
          action={
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Clear all filters
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((eq) => {
            const avail = availabilityMap.get(eq.id);
            const detailLink =
              checkAvailability && isWindowValid
                ? `/equipment/${eq.id}?startTime=${encodeURIComponent(startIso)}&endTime=${encodeURIComponent(endIso)}`
                : `/equipment/${eq.id}`;

            return (
              <article
                key={eq.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300"
              >
                <div>
                  <p className="text-xs font-semibold text-blue-700">
                    {eq.department} · {eq.category}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">{eq.name}</h2>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{eq.description}</p>

                  <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-700">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Location</dt>
                      <dd className="text-right font-medium text-slate-900">{eq.location}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Hours &amp; Capacity</dt>
                      <dd className="text-right font-mono text-slate-900 tabular-nums">
                        {eq.operatingHours.startTime}–{eq.operatingHours.endTime} (
                        {formatDaysOfWeek(eq.operatingHours.daysOfWeek)}) · Cap {eq.capacity}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Max Session</dt>
                      <dd className="font-mono text-slate-900 tabular-nums">
                        {eq.maxBookingDurationMinutes} min
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Required Trainings</dt>
                      <dd className="mt-0.5 font-mono text-[11px] text-slate-800">
                        {eq.requiredTrainings.length > 0
                          ? eq.requiredTrainings.join(' · ')
                          : 'No special certification'}
                      </dd>
                    </div>
                  </dl>

                  {checkAvailability && isWindowValid && avail && (
                    <div
                      className={`mt-4 border-t border-slate-100 pt-3 text-xs font-medium ${
                        avail.evaluation.feasible ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {avail.evaluation.feasible ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            Available ({avail.evaluation.remainingCapacity} of {eq.capacity} free)
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1.5">
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            Unavailable:{' '}
                            {avail.evaluation.violations[0]?.message ?? 'Constraint conflict'}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <Link
                  to={detailLink}
                  className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  <span>Inspect &amp; Reserve</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <nav
          aria-label="Catalog pagination"
          className="flex items-center justify-between border-t border-slate-200 pt-4"
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="font-mono text-xs text-slate-700 tabular-nums">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
