import type { EquipmentUtilization } from '@shared/types';

function safePercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(100, Math.round(value * 10) / 10);
}

function safeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

export function UtilizationChart({ items }: { items: EquipmentUtilization[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        No equipment utilization data is available for the selected filters.
      </div>
    );
  }

  const topItems = [...items]
    .sort((a, b) => safePercent(b.utilizationPercent) - safePercent(a.utilizationPercent))
    .slice(0, 12);

  const rowHeight = 38;
  const labelWidth = 220;
  const barMaxWidth = 340;
  const valueWidth = 64;
  const svgWidth = labelWidth + barMaxWidth + valueWidth + 24;
  const svgHeight = topItems.length * rowHeight + 24;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-950">
              Equipment Utilization Chart
            </h3>
            <p className="text-xs text-slate-600">
              Booked capacity divided by operating capacity across the reporting window (0–100%).
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">Top {topItems.length} instruments</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <svg
            role="img"
            aria-labelledby="utilization-chart-title utilization-chart-desc"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="h-auto w-full min-w-[540px]"
          >
            <title id="utilization-chart-title">Equipment Utilization Percentages</title>
            <desc id="utilization-chart-desc">
              Horizontal bar chart showing utilization percentages for up to {topItems.length}{' '}
              laboratory instruments. Full numeric details appear in the accompanying table below.
            </desc>

            {topItems.map((item, idx) => {
              const pct = safePercent(item.utilizationPercent);
              const barWidth = Math.max(0, (pct / 100) * barMaxWidth);
              const y = 12 + idx * rowHeight;
              const shortName =
                item.equipmentName.length > 28
                  ? `${item.equipmentName.slice(0, 27)}…`
                  : item.equipmentName;

              return (
                <g key={item.equipmentId} transform={`translate(0, ${y})`}>
                  <text
                    x={0}
                    y={20}
                    fill="#0f172a"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {shortName}
                  </text>
                  <rect
                    x={labelWidth}
                    y={6}
                    width={barMaxWidth}
                    height={20}
                    rx={4}
                    fill="#f1f5f9"
                  />
                  {barWidth > 0 && (
                    <rect
                      x={labelWidth}
                      y={6}
                      width={barWidth}
                      height={20}
                      rx={4}
                      fill={pct >= 75 ? '#0f172a' : '#1d4ed8'}
                    />
                  )}
                  <text
                    x={labelWidth + barMaxWidth + 12}
                    y={20}
                    fill="#0f172a"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                  >
                    {pct.toFixed(1)}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-950">
            Accompanying Utilization Data Table
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Detailed equipment utilization metrics including booked minutes, capacity minutes, and
              request outcomes
            </caption>
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Equipment
                </th>
                <th scope="col" className="px-4 py-3">
                  Department
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Bookings
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Booked Min
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Capacity Min
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Utilization
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Pending / Approved / Rejected
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const pct = safePercent(item.utilizationPercent);
                return (
                  <tr key={item.equipmentId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {item.equipmentName}
                      {item.archived ? (
                        <span className="ml-2 text-xs font-normal text-slate-500">(Archived)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.department}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800 tabular-nums">
                      {safeInt(item.totalBookings)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800 tabular-nums">
                      {safeInt(item.bookedCapacityMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800 tabular-nums">
                      {safeInt(item.availableOperatingCapacityMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-blue-700 tabular-nums">
                      {pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {safeInt(item.pendingRequests)} / {safeInt(item.approvedRequests)} /{' '}
                      {safeInt(item.rejectedRequests)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
