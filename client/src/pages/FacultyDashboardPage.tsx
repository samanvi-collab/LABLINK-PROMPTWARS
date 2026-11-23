import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Scale, ShieldAlert, XCircle } from 'lucide-react';
import type { AccessRequest, AiSchedulingExplanationResponse, RequestStatus } from '@shared/types';
import { ApiClientError } from '../api/client';
import {
  useAiExplainScheduling,
  useApproveRequest,
  useEquipmentList,
  useRejectRequest,
  useRequestRanking,
  useRequests,
} from '../api/queries';
import { AccessibleDialog } from '../components/AccessibleDialog';
import { AiAdvisoryHeader } from '../components/AiAdvisoryBanner';
import { ConflictPanel } from '../components/ConflictPanel';
import { FairnessBreakdownPanel } from '../components/FairnessBreakdownPanel';
import { useStatusAnnouncer } from '../components/Layout';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../components/StateViews';
import { StatusLabel } from '../components/StatusLabel';
import { formatIstDateTime, formatIstTimeRange } from '../utils/time';

export function FacultyDashboardPage() {
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'ALL' | RequestStatus>('PENDING');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<ApiClientError | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectValidationError, setRejectValidationError] = useState<string | null>(null);

  const { announce } = useStatusAnnouncer();

  const requestsQuery = useRequests({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    sortBy: 'fairness',
    limit: 50,
  });
  const catalogQuery = useEquipmentList({ limit: 100, includeArchived: true });
  const rankingQuery = useRequestRanking(selectedId, Boolean(selectedId));

  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();
  const explainMutation = useAiExplainScheduling();
  const [explanations, setExplanations] = useState<
    Record<string, AiSchedulingExplanationResponse>
  >({});
  const [explainError, setExplainError] = useState<string | null>(null);

  const equipmentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const eq of catalogQuery.data?.items ?? []) {
      map.set(eq.id, eq.name);
    }
    return map;
  }, [catalogQuery.data]);

  const queueItems: AccessRequest[] = requestsQuery.data?.items ?? [];

  // Auto-select first item when queue updates and nothing valid is selected
  useEffect(() => {
    if (queueItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !queueItems.some((r) => r.id === selectedId)) {
      setSelectedId(queueItems[0].id);
    }
  }, [queueItems, selectedId]);

  const ranking = rankingQuery.data;
  const activeRequest =
    ranking?.targetRequest ?? queueItems.find((r) => r.id === selectedId) ?? null;

  const handleSelectRequest = (id: string) => {
    setSelectedId(id);
    setDecisionReason('');
    setOverrideReason('');
    setActionError(null);
    setConflictError(null);
    setActionSuccess(null);
    setExplainError(null);
  };

  const handleApprove = async () => {
    if (!activeRequest || approveMutation.isPending) return;
    setActionError(null);
    setConflictError(null);
    setActionSuccess(null);

    const requiresOverride = Boolean(ranking?.requiresOverrideReason);
    const trimmedOverride = overrideReason.trim();
    const trimmedDecision = decisionReason.trim();

    if (requiresOverride && trimmedOverride.length < 3) {
      setActionError(
        'This request is not top-ranked for its overlapping window. Enter an override reason (at least 3 characters) before approving.',
      );
      return;
    }
    if (trimmedDecision && trimmedDecision.length < 2) {
      setActionError('Decision note must be at least 2 characters or left blank.');
      return;
    }

    try {
      const res = await approveMutation.mutateAsync({
        id: activeRequest.id,
        decisionReason: trimmedDecision || undefined,
        overrideReason: requiresOverride || trimmedOverride ? trimmedOverride : undefined,
      });
      setActionSuccess(
        `Approved request ${res.request.id} and created confirmed booking ${res.booking.id}.`,
      );
      announce(`Approved request ${res.request.id}.`);
      setDecisionReason('');
      setOverrideReason('');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setConflictError(err);
      } else {
        setActionError(err instanceof Error ? err.message : 'Unable to approve request.');
      }
    }
  };

  const handleConfirmReject = async () => {
    if (!activeRequest || rejectMutation.isPending) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 3) {
      setRejectValidationError('Rejection reason must be at least 3 characters.');
      return;
    }
    setRejectValidationError(null);
    setActionError(null);
    setConflictError(null);

    try {
      const res = await rejectMutation.mutateAsync({
        id: activeRequest.id,
        decisionReason: trimmed,
      });
      setRejectDialogOpen(false);
      setRejectReason('');
      setActionSuccess(`Rejected request ${res.request.id}.`);
      announce(`Rejected request ${res.request.id}.`);
    } catch (err) {
      setRejectValidationError(err instanceof Error ? err.message : 'Unable to reject request.');
    }
  };

  return (
    <section aria-labelledby="faculty-heading" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
            Faculty &amp; Supervisor Workbench
          </p>
          <h1 id="faculty-heading" className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            Fairness-Ranked Review Queue
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Compare overlapping access requests, inspect constraint checks, and document override
            reasons whenever approving outside top fairness rank.
          </p>
        </div>

        <div role="group" aria-label="Queue status filter" className="flex flex-wrap gap-2">
          {(['PENDING', 'ALL', 'APPROVED', 'REJECTED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
              className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                statusFilter === status
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              {status === 'ALL' ? 'All' : status}
            </button>
          ))}
        </div>
      </header>

      {requestsQuery.isLoading ? (
        <LoadingSkeleton label="Loading faculty review queue" />
      ) : requestsQuery.error ? (
        <ErrorBanner
          error={requestsQuery.error}
          onRetry={() => void requestsQuery.refetch()}
        />
      ) : queueItems.length === 0 ? (
        <EmptyState
          title="No requests in this queue view"
          description="Switch status filters above or check back when new student equipment requests arrive."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Queue List */}
          <div className="space-y-3 lg:col-span-5" role="region" aria-label="Sorted request queue">
            {queueItems.map((req, idx) => {
              const isSelected = req.id === selectedId;
              const eqName = equipmentNameMap.get(req.equipmentId) ?? req.equipmentId;
              return (
                <button
                  key={req.id}
                  type="button"
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => handleSelectRequest(req.id)}
                  className={`w-full rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    isSelected
                      ? 'border-blue-700 bg-blue-50/40 ring-1 ring-blue-700'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-500">
                        Queue #{idx + 1} · {req.projectType}
                      </p>
                      <h2 className="truncate text-sm font-semibold text-slate-950">{eqName}</h2>
                      <p className="text-xs text-slate-700">
                        {req.requesterName} ({req.requesterDepartment})
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-base font-bold text-blue-700 tabular-nums">
                        {req.priorityScore.toFixed(1)}
                      </span>
                      <div className="mt-0.5">
                        <StatusLabel status={req.status} />
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-xs text-slate-600 tabular-nums">
                    {formatIstTimeRange(req.startTime, req.endTime)}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Inspection & Decision Workbench */}
          <div className="space-y-5 lg:col-span-7">
            {!activeRequest ? (
              <EmptyState
                title="Select a request to inspect"
                description="Choose any request from the queue to inspect fairness scoring, competing overlaps, and approval controls."
              />
            ) : (
              <div className="space-y-5">
                {actionSuccess && (
                  <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                      aria-hidden="true"
                    />
                    <p>{actionSuccess}</p>
                  </div>
                )}

                {conflictError && (
                  <ConflictPanel
                    title="Approval Conflict — Request Remains Pending"
                    message={conflictError.message}
                    code={conflictError.code}
                    requestId={conflictError.requestId}
                    alternatives={conflictError.alternatives}
                  />
                )}

                {actionError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
                  >
                    {actionError}
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <p className="font-mono text-xs text-slate-500">
                        Request ID: {activeRequest.id} · {activeRequest.projectType}
                      </p>
                      <h2 className="mt-1 text-xl font-bold text-slate-950">
                        {equipmentNameMap.get(activeRequest.equipmentId) ??
                          activeRequest.equipmentId}
                      </h2>
                      <p className="mt-1 text-sm text-slate-700">
                        Requested by <strong>{activeRequest.requesterName}</strong> (
                        {activeRequest.requesterDepartment})
                      </p>
                    </div>
                    <StatusLabel status={activeRequest.status} />
                  </div>

                  <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Requested Window</dt>
                      <dd className="mt-0.5 font-mono font-semibold text-slate-950 tabular-nums">
                        {formatIstTimeRange(activeRequest.startTime, activeRequest.endTime)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Deadline</dt>
                      <dd className="mt-0.5 font-mono text-slate-900 tabular-nums">
                        {activeRequest.deadline
                          ? formatIstDateTime(activeRequest.deadline)
                          : 'None specified'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Purpose Statement
                    </h3>
                    <p className="mt-1 text-sm text-slate-800">{activeRequest.purpose}</p>
                  </div>

                  {/* Scheduling Evaluation from /ranking */}
                  {rankingQuery.isLoading ? (
                    <div className="mt-4">
                      <LoadingSkeleton label="Evaluating competing requests and constraints" />
                    </div>
                  ) : rankingQuery.error ? (
                    <div className="mt-4">
                      <ErrorBanner
                        error={rankingQuery.error}
                        onRetry={() => void rankingQuery.refetch()}
                      />
                    </div>
                  ) : ranking ? (
                    <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
                      {/* Feasibility Check */}
                      <div
                        className={`rounded-lg border p-4 text-xs ${
                          ranking.schedulingEvaluation.feasible
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                            : 'border-red-200 bg-red-50 text-red-950'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {ranking.schedulingEvaluation.feasible ? (
                            <CheckCircle2
                              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                              aria-hidden="true"
                            />
                          ) : (
                            <ShieldAlert
                              className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
                              aria-hidden="true"
                            />
                          )}
                          <div>
                            <p className="font-semibold">
                              {ranking.schedulingEvaluation.feasible
                                ? `Feasible to Approve (${ranking.schedulingEvaluation.remainingCapacity} unit capacity free)`
                                : 'Currently Infeasible Under Hard Constraints'}
                            </p>
                            {ranking.schedulingEvaluation.violations.length > 0 && (
                              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                {ranking.schedulingEvaluation.violations.map((v, i) => (
                                  <li key={`${v.code}-${i}`}>{v.message}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Competing Requests Ranking Comparison */}
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <Scale className="h-4 w-4 text-blue-700" aria-hidden="true" />
                          <span>
                            Competing Overlapping Pending Requests (
                            {ranking.competingRequests.length})
                          </span>
                        </h3>
                        {ranking.competingRequests.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-600">
                            No pending overlapping competition for this slot.
                          </p>
                        ) : (
                          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full border-collapse text-left text-xs">
                              <caption className="sr-only">
                                Competing pending requests ranked by deterministic fairness
                              </caption>
                              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                <tr>
                                  <th scope="col" className="px-3 py-2">
                                    Rank
                                  </th>
                                  <th scope="col" className="px-3 py-2">
                                    Requester
                                  </th>
                                  <th scope="col" className="px-3 py-2">
                                    Tier
                                  </th>
                                  <th scope="col" className="px-3 py-2 text-right">
                                    Score
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {ranking.competingRequests.map((comp, idx) => {
                                  const isTarget = comp.id === activeRequest.id;
                                  return (
                                    <tr
                                      key={comp.id}
                                      className={isTarget ? 'bg-blue-50/70 font-semibold' : ''}
                                    >
                                      <td className="px-3 py-2 font-mono tabular-nums">
                                        #{idx + 1}
                                        {idx === 0 ? ' (Top)' : ''}
                                      </td>
                                      <td className="px-3 py-2">
                                        {comp.requesterName} ({comp.requesterDepartment})
                                        {isTarget ? ' — Selected' : ''}
                                      </td>
                                      <td className="px-3 py-2 font-mono">{comp.projectType}</td>
                                      <td className="px-3 py-2 text-right font-mono text-blue-700 tabular-nums">
                                        {comp.priorityScore.toFixed(1)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Approve / Reject Controls for PENDING */}
                      {activeRequest.status === 'PENDING' && (
                        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          {ranking.requiresOverrideReason && (
                            <div
                              role="alert"
                              className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
                            >
                              <AlertTriangle
                                className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                                aria-hidden="true"
                              />
                              <div>
                                <p className="font-semibold">
                                  Priority Override Justification Required
                                </p>
                                <p className="mt-0.5">
                                  Request {activeRequest.id} is not the #1 fairness-ranked
                                  candidate for this overlapping window. You must enter an override
                                  reason to approve it ahead of higher-ranked requests.
                                </p>
                              </div>
                            </div>
                          )}

                          {ranking.requiresOverrideReason && (
                            <div>
                              <label
                                htmlFor="faculty-override-reason"
                                className="block text-xs font-semibold text-slate-900"
                              >
                                Override Reason (Required)
                              </label>
                              <textarea
                                id="faculty-override-reason"
                                rows={2}
                                required
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                placeholder="Document academic or safety rationale for overriding fairness rank (min 3 characters)..."
                                className="mt-1 block w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                              />
                            </div>
                          )}

                          <div>
                            <label
                              htmlFor="faculty-decision-note"
                              className="block text-xs font-semibold text-slate-800"
                            >
                              Approval Note (optional)
                            </label>
                            <input
                              id="faculty-decision-note"
                              type="text"
                              value={decisionReason}
                              onChange={(e) => setDecisionReason(e.target.value)}
                              placeholder="Optional guidance or lab supervisor instructions"
                              className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                            />
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={approveMutation.isPending}
                              onClick={() => void handleApprove()}
                              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              <span>
                                {approveMutation.isPending ? 'Approving…' : 'Approve & Book'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setRejectReason('');
                                setRejectValidationError(null);
                                setRejectDialogOpen(true);
                              }}
                              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                            >
                              <XCircle className="h-4 w-4" aria-hidden="true" />
                              <span>Reject Request</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Advisory AI Scheduling Explanation (Distinct from Official Fairness Ranking) */}
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-600">
                        Need a plain-language summary of the official fairness factors and
                        constraints above?
                      </p>
                      <button
                        type="button"
                        disabled={explainMutation.isPending}
                        onClick={async () => {
                          setExplainError(null);
                          try {
                            const data = await explainMutation.mutateAsync({
                              requestId: activeRequest.id,
                            });
                            setExplanations((prev) => ({
                              ...prev,
                              [activeRequest.id]: data,
                            }));
                          } catch (err) {
                            setExplainError(
                              err instanceof Error
                                ? err.message
                                : 'Unable to explain scheduling decision.',
                            );
                          }
                        }}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-950 hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
                      >
                        <Cpu className="h-4 w-4 text-indigo-700" aria-hidden="true" />
                        <span>
                          {explainMutation.isPending
                            ? 'Generating Explanation…'
                            : 'Explain Scheduling Decision'}
                        </span>
                      </button>
                    </div>

                    {explainError && (
                      <p role="alert" className="mt-2 text-xs font-medium text-red-700">
                        {explainError}
                      </p>
                    )}

                    {explanations[activeRequest.id] && (
                      <div className="mt-3 space-y-3 rounded-xl border border-indigo-200 bg-slate-50 p-4">
                        <AiAdvisoryHeader
                          disclaimer={explanations[activeRequest.id].disclaimer}
                          source={explanations[activeRequest.id].source}
                          model={explanations[activeRequest.id].model}
                          cached={explanations[activeRequest.id].cached}
                          fallbackReason={explanations[activeRequest.id].fallbackReason}
                          authorityNote={explanations[activeRequest.id].authorityNote}
                        />
                        <p className="text-xs text-slate-800">
                          {explanations[activeRequest.id].explanation.summary}
                        </p>
                        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                          {explanations[activeRequest.id].explanation.fairnessHighlights.map(
                            (h, i) => (
                              <li key={i}>{h}</li>
                            ),
                          )}
                          {explanations[activeRequest.id].explanation.constraintNotes.map(
                            (c, i) => (
                              <li key={`c-${i}`}>{c}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <FairnessBreakdownPanel breakdown={activeRequest.fairnessBreakdown} />
              </div>
            )}
          </div>
        </div>
      )}

      <AccessibleDialog
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        title="Reject Access Request"
        description={
          activeRequest
            ? `Provide a clear academic or operational rejection reason for ${activeRequest.requesterName}'s request (${activeRequest.id}).`
            : undefined
        }
      >
        <div className="space-y-4">
          {rejectValidationError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {rejectValidationError}
            </p>
          )}
          <div>
            <label htmlFor="reject-reason-input" className="block text-sm font-medium text-slate-800">
              Rejection Reason (Required)
            </label>
            <textarea
              id="reject-reason-input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Conflicting senior capstone defense priority or incomplete laser safety briefing"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setRejectDialogOpen(false)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={rejectMutation.isPending}
              onClick={() => void handleConfirmReject()}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </AccessibleDialog>
    </section>
  );
}
