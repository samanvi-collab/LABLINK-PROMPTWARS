import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AccessRequest, AiSchedulingExplanationResponse, RequestStatus } from '@shared/types';
import {
  useAiExplainScheduling,
  useCancelRequest,
  useEquipmentList,
  useRequests,
} from '../api/queries';
import { AccessibleDialog } from '../components/AccessibleDialog';
import { AiAdvisoryHeader } from '../components/AiAdvisoryBanner';
import { FairnessBreakdownPanel } from '../components/FairnessBreakdownPanel';
import { useStatusAnnouncer } from '../components/Layout';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../components/StateViews';
import { StatusLabel } from '../components/StatusLabel';
import { formatIstDateTime, formatIstTimeRange } from '../utils/time';

const STATUS_TABS: Array<{ key: 'ALL' | RequestStatus; label: string }> = [
  { key: 'ALL', label: 'All Requests' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export function StudentRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | RequestStatus>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AccessRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { announce } = useStatusAnnouncer();

  const requestsQuery = useRequests({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    sortBy: 'createdAt',
    limit: 50,
  });
  const catalogQuery = useEquipmentList({ limit: 100, includeArchived: true });
  const cancelMutation = useCancelRequest();
  const explainMutation = useAiExplainScheduling();
  const [explanations, setExplanations] = useState<
    Record<string, AiSchedulingExplanationResponse>
  >({});
  const [explainErrorId, setExplainErrorId] = useState<{ id: string; message: string } | null>(
    null,
  );

  const equipmentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const eq of catalogQuery.data?.items ?? []) {
      map.set(eq.id, eq.name);
    }
    return map;
  }, [catalogQuery.data]);

  const items = requestsQuery.data?.items ?? [];

  const handleConfirmCancel = async () => {
    if (!cancelTarget || cancelMutation.isPending) return;
    setCancelError(null);
    const trimmed = cancelReason.trim();
    if (trimmed && trimmed.length < 3) {
      setCancelError('Reason must be at least 3 characters or left blank.');
      return;
    }

    try {
      await cancelMutation.mutateAsync({
        id: cancelTarget.id,
        reason: trimmed || undefined,
      });
      announce(`Access request ${cancelTarget.id} cancelled.`);
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Unable to cancel request.');
    }
  };

  return (
    <section aria-labelledby="my-requests-heading" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
            Access Request Tracker
          </p>
          <h1 id="my-requests-heading" className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            My Access Requests
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect fairness scores, faculty review decisions, and cancel pending requests before
            approval.
          </p>
        </div>
        <Link
          to="/equipment"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          New Equipment Request
        </Link>
      </header>

      {/* Filter Tabs */}
      <div role="group" aria-label="Filter requests by status" className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={statusFilter === tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
              statusFilter === tab.key
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {requestsQuery.isLoading ? (
        <LoadingSkeleton label="Loading access requests" />
      ) : requestsQuery.error ? (
        <ErrorBanner
          error={requestsQuery.error}
          onRetry={() => void requestsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No access requests match this status"
          description="Browse the equipment catalog to submit a new laboratory access request."
          action={
            <Link
              to="/equipment"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Browse Equipment
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {items.map((req) => {
            const isExpanded = expandedId === req.id;
            const eqName = equipmentNameMap.get(req.equipmentId) ?? req.equipmentId;

            return (
              <article
                key={req.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusLabel status={req.status} />
                      <span className="font-mono text-xs text-slate-500">
                        {req.projectType} · ID: {req.id}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      <Link
                        to={`/equipment/${req.equipmentId}`}
                        className="hover:text-blue-700 hover:underline"
                      >
                        {eqName}
                      </Link>
                    </h2>
                    <p className="font-mono text-xs text-slate-700 tabular-nums">
                      Slot: {formatIstTimeRange(req.startTime, req.endTime)}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Fairness Score
                    </span>
                    <p className="font-mono text-xl font-bold text-blue-700 tabular-nums">
                      {req.priorityScore.toFixed(1)}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700">{req.purpose}</p>

                <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:grid-cols-3">
                  <div>
                    <dt className="text-slate-500">Submitted</dt>
                    <dd className="font-mono text-slate-900 tabular-nums">
                      {formatIstDateTime(req.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Deadline</dt>
                    <dd className="font-mono text-slate-900 tabular-nums">
                      {req.deadline ? formatIstDateTime(req.deadline) : 'No hard deadline'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Linked Booking</dt>
                    <dd className="font-mono text-slate-900">
                      {req.bookingId ? (
                        <Link to="/reservations" className="text-blue-700 hover:underline">
                          {req.bookingId}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                </dl>

                {(req.decisionReason || req.overrideReason) && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-800">
                    {req.decisionReason && (
                      <p>
                        <strong className="font-semibold">Decision Note:</strong>{' '}
                        {req.decisionReason}
                      </p>
                    )}
                    {req.overrideReason && (
                      <p className="mt-1">
                        <strong className="font-semibold">Priority Override Note:</strong>{' '}
                        {req.overrideReason}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          <span>Hide Fairness Breakdown</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          <span>Inspect Fairness Breakdown</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={explainMutation.isPending}
                      onClick={async () => {
                        setExplainErrorId(null);
                        try {
                          const data = await explainMutation.mutateAsync({ requestId: req.id });
                          setExplanations((prev) => ({ ...prev, [req.id]: data }));
                        } catch (err) {
                          setExplainErrorId({
                            id: req.id,
                            message:
                              err instanceof Error
                                ? err.message
                                : 'Unable to generate explanation.',
                          });
                        }
                      }}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-950 hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
                    >
                      <Cpu className="h-4 w-4 text-indigo-700" aria-hidden="true" />
                      <span>
                        {explainMutation.isPending && explainMutation.variables?.requestId === req.id
                          ? 'Explaining…'
                          : 'Explain Scheduling & Fairness'}
                      </span>
                    </button>
                  </div>

                  {req.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelTarget(req);
                        setCancelReason('');
                        setCancelError(null);
                      }}
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                    >
                      Cancel Request
                    </button>
                  )}
                </div>

                {explainErrorId?.id === req.id && (
                  <p role="alert" className="mt-3 text-xs font-medium text-red-700">
                    {explainErrorId.message}
                  </p>
                )}

                {explanations[req.id] && (
                  <div className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-slate-50 p-4">
                    <AiAdvisoryHeader
                      disclaimer={explanations[req.id].disclaimer}
                      source={explanations[req.id].source}
                      model={explanations[req.id].model}
                      cached={explanations[req.id].cached}
                      fallbackReason={explanations[req.id].fallbackReason}
                      authorityNote={explanations[req.id].authorityNote}
                    />
                    <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-slate-500">Official Score:</span>{' '}
                        <strong className="font-mono text-blue-700 tabular-nums">
                          {explanations[req.id].officialContext.priorityScore.toFixed(1)}/100
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Official Queue Rank:</span>{' '}
                        <strong className="font-mono text-slate-950 tabular-nums">
                          {explanations[req.id].officialContext.officialRank !== null
                            ? `#${explanations[req.id].officialContext.officialRank} of ${explanations[req.id].officialContext.totalCompeting}`
                            : explanations[req.id].officialContext.status}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Hard Constraints:</span>{' '}
                        <strong
                          className={
                            explanations[req.id].officialContext.feasible
                              ? 'text-emerald-700'
                              : 'text-red-700'
                          }
                        >
                          {explanations[req.id].officialContext.feasible ? 'Feasible' : 'Blocked'}
                        </strong>
                      </div>
                    </div>
                    <p className="text-xs text-slate-800">
                      {explanations[req.id].explanation.summary}
                    </p>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                      {explanations[req.id].explanation.fairnessHighlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                      {explanations[req.id].explanation.nextSteps.map((n, i) => (
                        <li key={`n-${i}`}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-4">
                    <FairnessBreakdownPanel breakdown={req.fairnessBreakdown} compact />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <AccessibleDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel Access Request"
        description={
          cancelTarget
            ? `Cancel request ${cancelTarget.id} for ${formatIstTimeRange(cancelTarget.startTime, cancelTarget.endTime)}? This action cannot be undone.`
            : undefined
        }
      >
        <div className="space-y-4">
          {cancelError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {cancelError}
            </p>
          )}
          <div>
            <label htmlFor="cancel-req-reason" className="block text-sm font-medium text-slate-800">
              Cancellation Reason (optional)
            </label>
            <input
              id="cancel-req-reason"
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g., Experiment rescheduled to next week"
              className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Keep Request
            </button>
            <button
              type="button"
              disabled={cancelMutation.isPending}
              onClick={() => void handleConfirmCancel()}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </AccessibleDialog>
    </section>
  );
}
