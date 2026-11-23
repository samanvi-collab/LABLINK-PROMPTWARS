import type { FairnessBreakdown } from '@shared/types';

const FACTOR_LABELS: Array<{
  key: keyof FairnessBreakdown['factors'];
  label: string;
  description: string;
}> = [
  { key: 'waitTime', label: 'Wait Time', description: 'Hours elapsed since request creation (max 72h)' },
  {
    key: 'historicalUsage',
    label: 'Historical Usage Equity',
    description: 'Favors requesters with fewer prior bookings',
  },
  {
    key: 'deadlineUrgency',
    label: 'Deadline Urgency',
    description: 'Proximity of academic or project deadline',
  },
  {
    key: 'trainingCompliance',
    label: 'Training & Safety',
    description: 'Completion of required certifications and clearance',
  },
  {
    key: 'academicPriority',
    label: 'Academic Priority',
    description: 'Capstone, Research, Coursework, Club, or Personal tier',
  },
  {
    key: 'durationEfficiency',
    label: 'Duration Efficiency',
    description: 'Compact slots score higher than full-max requests',
  },
  {
    key: 'departmentAlignment',
    label: 'Department Alignment',
    description: 'Home department alignment vs cross-department sharing',
  },
];

export function FairnessBreakdownPanel({
  breakdown,
  compact = false,
}: {
  breakdown: FairnessBreakdown;
  compact?: boolean;
}) {
  const total = Number.isFinite(breakdown.weightedTotal) ? breakdown.weightedTotal : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Deterministic Fairness Breakdown</h3>
          {!compact && (
            <p className="text-xs text-slate-600">
              7-factor weighted priority score (0–100) computed by the scheduling engine.
            </p>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Total Score
          </span>
          <p className="font-mono text-xl font-bold text-blue-700 tabular-nums">
            {total.toFixed(1)} <span className="text-xs font-normal text-slate-500">/ 100</span>
          </p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Fairness score factors, weights, and contributions</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-2 pr-3">
                Factor
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Weight
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Raw Score
              </th>
              <th scope="col" className="pl-3 py-2 text-right">
                Weighted
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {FACTOR_LABELS.map(({ key, label, description }) => {
              const raw = Number.isFinite(breakdown.factors[key]) ? breakdown.factors[key] : 0;
              const weight = breakdown.weights[key];
              const contribution = (raw * weight) / 100;

              return (
                <tr key={key}>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-slate-900">{label}</div>
                    {!compact && <div className="text-xs text-slate-500">{description}</div>}
                    <div
                      role="progressbar"
                      aria-label={`${label} score`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(raw)}
                      className="mt-1.5 h-1.5 w-full max-w-[180px] overflow-hidden rounded bg-slate-100"
                    >
                      <div
                        className="h-full bg-blue-700"
                        style={{ width: `${Math.max(0, Math.min(100, raw))}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-slate-600 tabular-nums">
                    {weight}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-slate-800 tabular-nums">
                    {raw}
                  </td>
                  <td className="pl-3 py-2 text-right font-mono text-xs font-semibold text-slate-950 tabular-nums">
                    {contribution.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
