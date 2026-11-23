import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Booking, BookingStatus } from '@shared/types';
import {
  useBookings,
  useCancelBooking,
  useEquipmentList,
  useRequests,
} from '../api/queries';
import { AccessibleDialog } from '../components/AccessibleDialog';
import { useStatusAnnouncer } from '../components/Layout';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../components/StateViews';
import { StatusLabel } from '../components/StatusLabel';
import { formatIstDateTime, formatIstTimeRange } from '../utils/time';

const BOOKING_TABS: Array<{ key: 'ALL' | BookingStatus; label: string }> = [
  { key: 'ALL', label: 'All Reservations' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export function ReservationsPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | BookingStatus>('ALL');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { announce } = useStatusAnnouncer();

  const bookingsQuery = useBookings({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    limit: 50,
  });
  const pendingRequestsQuery = useRequests({ status: 'PENDING', limit: 20 });
  const catalogQuery = useEquipmentList({ limit: 100, includeArchived: true });
  const cancelMutation = useCancelBooking();

  const equipmentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const eq of catalogQuery.data?.items ?? []) {
      map.set(eq.id, eq.name);
    }
    return map;
  }, [catalogQuery.data]);

  const bookings = bookingsQuery.data?.items ?? [];
  const pendingRequests = pendingRequestsQuery.data?.items ?? [];

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
      announce(`Reservation ${cancelTarget.id} cancelled.`);
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Unable to cancel reservation.');
    }
  };

  return (
    <section aria-labelledby="reservations-heading" className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
            Confirmed Lab Schedule
          </p>
          <h1 id="reservations-heading" className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            Reservations &amp; Upcoming Sessions
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Confirmed bookings hold active capacity on campus instruments. Pending requests await
            review separately.
          </p>
        </div>
        <Link
          to="/equipment"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Book Equipment
        </Link>
      </header>

      {/* Pending Requests Summary (Clearly Separated) */}
      {pendingRequests.length > 0 && (
        <aside
          aria-labelledby="pending-summary-heading"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="pending-summary-heading" className="text-sm font-semibold text-amber-950">
                Pending Access Requests ({pendingRequests.length}) — Not Yet Confirmed Bookings
              </h2>
              <p className="mt-0.5 text-xs text-amber-900">
                These requests are queued for faculty approval and do not guarantee capacity yet.
              </p>
            </div>
            <Link
              to="/requests"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
            >
              Manage Pending Requests
            </Link>
          </div>
        </aside>
      )}

      {/* Filter Tabs */}
      <div role="group" aria-label="Filter reservations by status" className="flex flex-wrap gap-2">
        {BOOKING_TABS.map((tab) => (
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

      {bookingsQuery.isLoading ? (
        <LoadingSkeleton label="Loading reservations" />
      ) : bookingsQuery.error ? (
        <ErrorBanner
          error={bookingsQuery.error}
          onRetry={() => void bookingsQuery.refetch()}
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          title="No reservations found"
          description="Reserve an available instrument slot directly or wait for an approved access request."
          action={
            <Link
              to="/equipment"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Explore Equipment
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Laboratory reservations and status</caption>
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Equipment
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Scheduled IST Window
                  </th>
                  <th scope="col" className="px-4 py-3">
                    User &amp; Purpose
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((b) => {
                  const eqName = equipmentNameMap.get(b.equipmentId) ?? b.equipmentId;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <Link
                          to={`/equipment/${b.equipmentId}`}
                          className="font-semibold text-slate-950 hover:text-blue-700 hover:underline"
                        >
                          {eqName}
                        </Link>
                        <div className="font-mono text-xs text-slate-500">ID: {b.id}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-800 tabular-nums">
                        {formatIstTimeRange(b.startTime, b.endTime)}
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Booked {formatIstDateTime(b.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-900">
                          {b.userName} ({b.userDepartment})
                        </p>
                        <p className="mt-0.5 max-w-xs text-xs text-slate-600">{b.purpose}</p>
                        {b.cancelReason && (
                          <p className="mt-1 text-xs text-slate-500">
                            Cancel note: {b.cancelReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={b.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {b.status === 'CONFIRMED' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelTarget(b);
                              setCancelReason('');
                              setCancelError(null);
                            }}
                            className="inline-flex min-h-[44px] items-center rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                          >
                            Cancel Booking
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AccessibleDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel Confirmed Reservation"
        description={
          cancelTarget
            ? `Release reservation ${cancelTarget.id} (${formatIstTimeRange(cancelTarget.startTime, cancelTarget.endTime)})? Capacity will immediately reopen.`
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
            <label htmlFor="cancel-bkg-reason" className="block text-sm font-medium text-slate-800">
              Cancellation Reason (optional)
            </label>
            <input
              id="cancel-bkg-reason"
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g., Run completed early"
              className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Keep Reservation
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
