import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, BarChart3, History, Plus, RotateCcw, Wrench } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AUDIT_ACTIONS } from '@shared/constants';
import type { Equipment } from '@shared/types';
import {
  useAnalyticsOverview,
  useArchiveEquipment,
  useAuditLogs,
  useCreateEquipment,
  useCreateMaintenance,
  useDepartmentUsage,
  useEquipmentList,
  useEquipmentUtilization,
  useMaintenance,
  useRestoreDemoData,
  useUpdateEquipment,
  useUpdateMaintenance,
} from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { AccessibleDialog } from '../components/AccessibleDialog';
import { useStatusAnnouncer } from '../components/Layout';
import { ErrorBanner, LoadingSkeleton } from '../components/StateViews';
import { StatusLabel } from '../components/StatusLabel';
import { UtilizationChart } from '../components/UtilizationChart';
import { formatIstDateTime, formatIstTimeRange, getNextWeekdayDateString, toIstIsoTimestamp } from '../utils/time';

type AdminTab = 'analytics' | 'equipment' | 'maintenance' | 'audit';

const equipmentFormSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(1500),
  category: z.string().trim().min(2, 'Category is required').max(80),
  department: z.string().trim().min(2, 'Department is required').max(80),
  location: z.string().trim().min(2, 'Location is required').max(150),
  capacity: z.coerce.number().int().min(1).max(100),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:mm format'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:mm format'),
  maxBookingDurationMinutes: z.coerce.number().int().min(15).max(1440),
  requiredTrainingsCsv: z.string().optional(),
  safetyRequirementsCsv: z.string().optional(),
  tagsCsv: z.string().optional(),
});

type EquipmentFormInput = z.input<typeof equipmentFormSchema>;
type EquipmentFormOutput = z.output<typeof equipmentFormSchema>;

const maintenanceFormSchema = z.object({
  equipmentId: z.string().trim().min(1, 'Select equipment'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid IST date required'),
  startHHMM: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start HH:mm required'),
  endHHMM: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End HH:mm required'),
});

type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

function parseCsvList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AdminDashboardPage() {
  const { user, publicConfig } = useAuth();
  const { announce } = useStatusAnnouncer();
  const isAdmin = user?.role === 'Admin';
  const showDemoRestore = Boolean(publicConfig?.demoMode && isAdmin);

  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [analyticsDept, setAnalyticsDept] = useState<string>('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState('');

  const [createEqOpen, setCreateEqOpen] = useState(false);
  const [editingEq, setEditingEq] = useState<Equipment | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Equipment | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const analyticsFilter = { department: analyticsDept || undefined };
  const overviewQuery = useAnalyticsOverview(analyticsFilter, activeTab === 'analytics');
  const utilizationQuery = useEquipmentUtilization(analyticsFilter, activeTab === 'analytics');
  const departmentsQuery = useDepartmentUsage(analyticsFilter, activeTab === 'analytics');

  const catalogQuery = useEquipmentList({ limit: 100, includeArchived: true });
  const maintenanceQuery = useMaintenance({ limit: 50 }, activeTab === 'maintenance');
  const auditQuery = useAuditLogs(
    {
      page: auditPage,
      limit: 20,
      action: auditActionFilter || undefined,
    },
    activeTab === 'audit',
  );

  const createEqMutation = useCreateEquipment();
  const updateEqMutation = useUpdateEquipment();
  const archiveEqMutation = useArchiveEquipment();
  const createMaintMutation = useCreateMaintenance();
  const updateMaintMutation = useUpdateMaintenance();
  const restoreDemoMutation = useRestoreDemoData();

  const eqForm = useForm<EquipmentFormInput, unknown, EquipmentFormOutput>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'Computing',
      department: 'CSE',
      location: '',
      capacity: 1,
      startTime: '08:00',
      endTime: '20:00',
      maxBookingDurationMinutes: 240,
      requiredTrainingsCsv: '',
      safetyRequirementsCsv: '',
      tagsCsv: '',
    },
  });

  const maintForm = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: {
      equipmentId: '',
      title: '',
      reason: '',
      date: getNextWeekdayDateString(),
      startHHMM: '14:00',
      endHHMM: '16:00',
    },
  });

  const openCreateModal = () => {
    eqForm.reset({
      name: '',
      description: '',
      category: 'Computing',
      department: 'CSE',
      location: '',
      capacity: 1,
      startTime: '08:00',
      endTime: '20:00',
      maxBookingDurationMinutes: 240,
      requiredTrainingsCsv: '',
      safetyRequirementsCsv: '',
      tagsCsv: '',
    });
    setEditingEq(null);
    setCreateEqOpen(true);
    setFeedbackError(null);
  };

  const openEditModal = (eq: Equipment) => {
    eqForm.reset({
      name: eq.name,
      description: eq.description,
      category: eq.category,
      department: eq.department,
      location: eq.location,
      capacity: eq.capacity,
      startTime: eq.operatingHours.startTime,
      endTime: eq.operatingHours.endTime,
      maxBookingDurationMinutes: eq.maxBookingDurationMinutes,
      requiredTrainingsCsv: eq.requiredTrainings.join(', '),
      safetyRequirementsCsv: eq.safetyRequirements.join(', '),
      tagsCsv: eq.tags.join(', '),
    });
    setEditingEq(eq);
    setCreateEqOpen(true);
    setFeedbackError(null);
  };

  const onEquipmentSubmit = async (values: EquipmentFormOutput) => {
    setFeedbackMsg(null);
    setFeedbackError(null);
    const payload = {
      name: values.name,
      description: values.description,
      category: values.category,
      department: values.department,
      location: values.location,
      capacity: values.capacity,
      operatingHours: {
        startTime: values.startTime,
        endTime: values.endTime,
        daysOfWeek: editingEq?.operatingHours.daysOfWeek ?? [1, 2, 3, 4, 5],
      },
      maxBookingDurationMinutes: values.maxBookingDurationMinutes,
      requiredTrainings: parseCsvList(values.requiredTrainingsCsv),
      safetyRequirements: parseCsvList(values.safetyRequirementsCsv),
      tags: parseCsvList(values.tagsCsv),
    };

    try {
      if (editingEq) {
        await updateEqMutation.mutateAsync({ id: editingEq.id, updates: payload });
        setFeedbackMsg(`Updated equipment "${values.name}".`);
        announce(`Updated equipment ${values.name}.`);
      } else {
        const res = await createEqMutation.mutateAsync(payload);
        setFeedbackMsg(`Created equipment "${res.equipment.name}" (${res.equipment.id}).`);
        announce(`Created equipment ${res.equipment.name}.`);
      }
      setCreateEqOpen(false);
      setEditingEq(null);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to save equipment.');
    }
  };

  const handleToggleArchive = async () => {
    if (!archiveTarget || archiveEqMutation.isPending) return;
    setFeedbackMsg(null);
    setFeedbackError(null);
    try {
      const nextArchived = !archiveTarget.archived;
      await archiveEqMutation.mutateAsync({
        id: archiveTarget.id,
        archived: nextArchived,
        reason: nextArchived ? 'Archived via Admin console' : 'Restored via Admin console',
      });
      setFeedbackMsg(
        `${nextArchived ? 'Archived' : 'Restored'} "${archiveTarget.name}".`,
      );
      announce(`${archiveTarget.name} ${nextArchived ? 'archived' : 'restored'}.`);
      setArchiveTarget(null);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to update archive status.');
    }
  };

  const onMaintenanceSubmit = async (values: MaintenanceFormValues) => {
    setFeedbackMsg(null);
    setFeedbackError(null);
    const startIso = toIstIsoTimestamp(values.date, values.startHHMM);
    const endIso = toIstIsoTimestamp(values.date, values.endHHMM);
    if (!startIso || !endIso || Date.parse(startIso) >= Date.parse(endIso)) {
      setFeedbackError('Maintenance end time must be strictly after start time.');
      return;
    }

    try {
      const res = await createMaintMutation.mutateAsync({
        equipmentId: values.equipmentId,
        title: values.title,
        reason: values.reason,
        startTime: startIso,
        endTime: endIso,
      });
      setFeedbackMsg(`Scheduled maintenance window "${res.maintenanceWindow.title}".`);
      announce(`Scheduled maintenance window ${res.maintenanceWindow.title}.`);
      maintForm.reset({
        equipmentId: '',
        title: '',
        reason: '',
        date: getNextWeekdayDateString(),
        startHHMM: '14:00',
        endHHMM: '16:00',
      });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to schedule maintenance.');
    }
  };

  const handleConfirmRestoreDemo = async () => {
    if (restoreDemoMutation.isPending) return;
    setFeedbackMsg(null);
    setFeedbackError(null);
    try {
      const res = await restoreDemoMutation.mutateAsync();
      setFeedbackMsg(res.message);
      announce('Demo dataset restored.');
      setRestoreDialogOpen(false);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to restore demo data.');
    }
  };

  const catalogItems = catalogQuery.data?.items ?? [];

  return (
    <section aria-labelledby="admin-heading" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
            Operations, Analytics &amp; Governance
          </p>
          <h1 id="admin-heading" className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            Admin &amp; Analytics Console
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect utilization metrics, manage equipment constraints and maintenance blocks, and
            audit platform decisions.
          </p>
        </div>

        {showDemoRestore && (
          <button
            type="button"
            onClick={() => setRestoreDialogOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Restore Demo Dataset</span>
          </button>
        )}
      </header>

      {/* Section Tabs */}
      <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
        {[
          { key: 'analytics', label: 'Analytics & Utilization', Icon: BarChart3 },
          { key: 'equipment', label: 'Equipment Catalog', Icon: Archive },
          { key: 'maintenance', label: 'Maintenance Windows', Icon: Wrench },
          { key: 'audit', label: 'Audit Logs', Icon: History },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={activeTab === key}
            onClick={() => {
              setActiveTab(key as AdminTab);
              setFeedbackMsg(null);
              setFeedbackError(null);
            }}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
              activeTab === key
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {feedbackMsg && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        >
          {feedbackMsg}
        </div>
      )}

      {feedbackError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {feedbackError}
        </div>
      )}

      {/* TAB 1: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <label htmlFor="analytics-dept" className="text-sm font-medium text-slate-800">
                Filter Department
              </label>
              <select
                id="analytics-dept"
                value={analyticsDept}
                onChange={(e) => setAnalyticsDept(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                <option value="">All Departments</option>
                <option value="CSE">CSE</option>
                <option value="ECE">ECE</option>
                <option value="Mechanical">Mechanical</option>
                <option value="EEE">EEE</option>
              </select>
            </div>
            {overviewQuery.data?.overview.window && (
              <p className="font-mono text-xs text-slate-600 tabular-nums">
                Window:{' '}
                {formatIstTimeRange(
                  overviewQuery.data.overview.window.startTime,
                  overviewQuery.data.overview.window.endTime,
                )}
              </p>
            )}
          </div>

          {overviewQuery.isLoading || utilizationQuery.isLoading ? (
            <LoadingSkeleton label="Loading analytics metrics" />
          ) : overviewQuery.error ? (
            <ErrorBanner
              error={overviewQuery.error}
              onRetry={() => void overviewQuery.refetch()}
            />
          ) : overviewQuery.data ? (
            <>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Active Equipment
                  </dt>
                  <dd className="mt-1 font-mono text-2xl font-bold text-slate-950 tabular-nums">
                    {overviewQuery.data.overview.totals.activeEquipmentCount} /{' '}
                    {overviewQuery.data.overview.totals.equipmentCount}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Confirmed Bookings
                  </dt>
                  <dd className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                    {overviewQuery.data.overview.totals.confirmedBookings}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pending Requests
                  </dt>
                  <dd className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
                    {overviewQuery.data.overview.totals.pendingRequests}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Average Utilization
                  </dt>
                  <dd className="mt-1 font-mono text-2xl font-bold text-blue-700 tabular-nums">
                    {overviewQuery.data.overview.totals.averageUtilizationPercent.toFixed(1)}%
                  </dd>
                </div>
              </dl>

              <UtilizationChart items={utilizationQuery.data?.equipment ?? []} />

              {departmentsQuery.data && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-5 py-3">
                    <h2 className="text-sm font-semibold text-slate-950">
                      Department Usage Breakdown
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <caption className="sr-only">Usage metrics aggregated by department</caption>
                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                        <tr>
                          <th scope="col" className="px-4 py-3">
                            Department
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Equipment
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Bookings
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Booked Min
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Avg Utilization
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {departmentsQuery.data.departments.map((d) => (
                          <tr key={d.department}>
                            <td className="px-4 py-3 font-semibold text-slate-950">
                              {d.department}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {d.equipmentCount}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {d.totalBookings}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {d.bookedMinutes}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-blue-700 tabular-nums">
                              {d.averageUtilizationPercent.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* TAB 2: EQUIPMENT MANAGEMENT */}
      {activeTab === 'equipment' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {isAdmin
                ? 'Admins can create, edit, archive, and restore instruments. Faculty can edit specs.'
                : 'Faculty can update equipment metadata; creating or archiving instruments requires Admin role.'}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add Equipment</span>
              </button>
            )}
          </div>

          {catalogQuery.isLoading ? (
            <LoadingSkeleton label="Loading equipment inventory" />
          ) : catalogQuery.error ? (
            <ErrorBanner error={catalogQuery.error} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Equipment inventory management</caption>
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Name
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Dept / Category
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Capacity
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
                    {catalogItems.map((eq) => (
                      <tr key={eq.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-950">{eq.name}</div>
                          <div className="font-mono text-xs text-slate-500">{eq.location}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          {eq.department} · {eq.category}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {eq.capacity}
                        </td>
                        <td className="px-4 py-3">
                          <StatusLabel status={eq.archived ? 'ARCHIVED' : 'ACTIVE'} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(eq)}
                              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setArchiveTarget(eq)}
                                className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                              >
                                {eq.archived ? 'Restore' : 'Archive'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MAINTENANCE WINDOWS */}
      {activeTab === 'maintenance' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={maintForm.handleSubmit(onMaintenanceSubmit)}
            noValidate
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5"
          >
            <h2 className="text-base font-semibold text-slate-950">Schedule Maintenance Block</h2>
            <div>
              <label htmlFor="maint-eq" className="block text-xs font-semibold text-slate-700">
                Equipment
              </label>
              <select
                id="maint-eq"
                {...maintForm.register('equipmentId')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select equipment…</option>
                {catalogItems
                  .filter((e) => !e.archived)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.department})
                    </option>
                  ))}
              </select>
              {maintForm.formState.errors.equipmentId && (
                <p className="mt-1 text-xs text-red-700">
                  {maintForm.formState.errors.equipmentId.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="maint-title" className="block text-xs font-semibold text-slate-700">
                Maintenance Title
              </label>
              <input
                id="maint-title"
                type="text"
                {...maintForm.register('title')}
                placeholder="e.g., Laser Optics Recalibration"
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {maintForm.formState.errors.title && (
                <p className="mt-1 text-xs text-red-700">
                  {maintForm.formState.errors.title.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="maint-reason" className="block text-xs font-semibold text-slate-700">
                Technical Reason
              </label>
              <textarea
                id="maint-reason"
                rows={2}
                {...maintForm.register('reason')}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {maintForm.formState.errors.reason && (
                <p className="mt-1 text-xs text-red-700">
                  {maintForm.formState.errors.reason.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="maint-date" className="block text-xs font-semibold text-slate-700">
                  Date (IST)
                </label>
                <input
                  id="maint-date"
                  type="date"
                  {...maintForm.register('date')}
                  className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="maint-start" className="block text-xs font-semibold text-slate-700">
                  Start
                </label>
                <input
                  id="maint-start"
                  type="time"
                  {...maintForm.register('startHHMM')}
                  className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="maint-end" className="block text-xs font-semibold text-slate-700">
                  End
                </label>
                <input
                  id="maint-end"
                  type="time"
                  {...maintForm.register('endHHMM')}
                  className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={createMaintMutation.isPending}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {createMaintMutation.isPending ? 'Scheduling…' : 'Create Maintenance Window'}
            </button>
          </form>

          <div className="space-y-3 lg:col-span-7">
            {maintenanceQuery.isLoading ? (
              <LoadingSkeleton label="Loading maintenance windows" />
            ) : maintenanceQuery.error ? (
              <ErrorBanner error={maintenanceQuery.error} />
            ) : (
              (maintenanceQuery.data?.items ?? []).map((mw) => {
                const eqName =
                  catalogItems.find((e) => e.id === mw.equipmentId)?.name ?? mw.equipmentId;
                return (
                  <article
                    key={mw.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <StatusLabel status={mw.active ? 'ACTIVE' : 'INACTIVE'} />
                        <span className="font-mono text-xs text-slate-500">{eqName}</span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-950">{mw.title}</h3>
                      <p className="text-xs text-slate-600">{mw.reason}</p>
                      <p className="mt-1 font-mono text-xs text-slate-700 tabular-nums">
                        {formatIstTimeRange(mw.startTime, mw.endTime)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={updateMaintMutation.isPending}
                      onClick={() =>
                        void updateMaintMutation.mutateAsync({
                          id: mw.id,
                          updates: { active: !mw.active },
                        })
                      }
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {mw.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <label htmlFor="audit-action-filter" className="text-sm font-medium text-slate-800">
              Action Filter
            </label>
            <select
              id="audit-action-filter"
              value={auditActionFilter}
              onChange={(e) => {
                setAuditActionFilter(e.target.value);
                setAuditPage(1);
              }}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Actions</option>
              {AUDIT_ACTIONS.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          {auditQuery.isLoading ? (
            <LoadingSkeleton label="Loading audit log entries" />
          ) : auditQuery.error ? (
            <ErrorBanner error={auditQuery.error} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <caption className="sr-only">Immutable platform audit logs</caption>
                  <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Timestamp (IST)
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Action
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Actor
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Target
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Request ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(auditQuery.data?.items ?? []).map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 font-mono text-slate-700 tabular-nums">
                          {formatIstDateTime(log.timestamp)}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-950">
                          {log.action}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {log.actorId} ({log.actorRole})
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {log.targetType}:{log.targetId}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500">{log.requestId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {auditQuery.data && auditQuery.data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                  <button
                    type="button"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-xs text-slate-600 tabular-nums">
                    Page {auditQuery.data.pagination.page} of {auditQuery.data.pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={auditPage >= auditQuery.data.pagination.totalPages}
                    onClick={() =>
                      setAuditPage((p) => Math.min(auditQuery.data!.pagination.totalPages, p + 1))
                    }
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Equipment Create/Edit Dialog */}
      <AccessibleDialog
        open={createEqOpen}
        onClose={() => setCreateEqOpen(false)}
        title={editingEq ? `Edit ${editingEq.name}` : 'Add Laboratory Equipment'}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={eqForm.handleSubmit(onEquipmentSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="eq-name" className="block text-xs font-semibold text-slate-700">
                Equipment Name
              </label>
              <input
                id="eq-name"
                type="text"
                {...eqForm.register('name')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {eqForm.formState.errors.name && (
                <p className="mt-1 text-xs text-red-700">{eqForm.formState.errors.name.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="eq-location" className="block text-xs font-semibold text-slate-700">
                Lab Location
              </label>
              <input
                id="eq-location"
                type="text"
                {...eqForm.register('location')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="eq-dept" className="block text-xs font-semibold text-slate-700">
                Department
              </label>
              <input
                id="eq-dept"
                type="text"
                {...eqForm.register('department')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="eq-cat" className="block text-xs font-semibold text-slate-700">
                Category
              </label>
              <input
                id="eq-cat"
                type="text"
                {...eqForm.register('category')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="eq-desc" className="block text-xs font-semibold text-slate-700">
              Technical Description
            </label>
            <textarea
              id="eq-desc"
              rows={2}
              {...eqForm.register('description')}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="eq-cap" className="block text-xs font-semibold text-slate-700">
                Capacity
              </label>
              <input
                id="eq-cap"
                type="number"
                {...eqForm.register('capacity')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="eq-dur" className="block text-xs font-semibold text-slate-700">
                Max Min
              </label>
              <input
                id="eq-dur"
                type="number"
                {...eqForm.register('maxBookingDurationMinutes')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="eq-start" className="block text-xs font-semibold text-slate-700">
                Open (IST)
              </label>
              <input
                id="eq-start"
                type="time"
                {...eqForm.register('startTime')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="eq-end" className="block text-xs font-semibold text-slate-700">
                Close (IST)
              </label>
              <input
                id="eq-end"
                type="time"
                {...eqForm.register('endTime')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="eq-trainings" className="block text-xs font-semibold text-slate-700">
                Trainings (comma-separated)
              </label>
              <input
                id="eq-trainings"
                type="text"
                {...eqForm.register('requiredTrainingsCsv')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="eq-safety" className="block text-xs font-semibold text-slate-700">
                Safety Reqs (comma-separated)
              </label>
              <input
                id="eq-safety"
                type="text"
                {...eqForm.register('safetyRequirementsCsv')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="eq-tags" className="block text-xs font-semibold text-slate-700">
                Tags (comma-separated)
              </label>
              <input
                id="eq-tags"
                type="text"
                {...eqForm.register('tagsCsv')}
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateEqOpen(false)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createEqMutation.isPending || updateEqMutation.isPending}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {editingEq ? 'Save Changes' : 'Create Equipment'}
            </button>
          </div>
        </form>
      </AccessibleDialog>

      {/* Archive / Restore Dialog */}
      <AccessibleDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title={archiveTarget?.archived ? 'Restore Equipment' : 'Archive Equipment'}
        description={
          archiveTarget
            ? `${archiveTarget.archived ? 'Restore' : 'Archive'} "${archiveTarget.name}" (${archiveTarget.id})? Archived equipment rejects new bookings and requests.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setArchiveTarget(null)}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={archiveEqMutation.isPending}
            onClick={() => void handleToggleArchive()}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {archiveTarget?.archived ? 'Confirm Restore' : 'Confirm Archive'}
          </button>
        </div>
      </AccessibleDialog>

      {/* Demo Data Restore Dialog (Demo + Admin only) */}
      <AccessibleDialog
        open={restoreDialogOpen && showDemoRestore}
        onClose={() => setRestoreDialogOpen(false)}
        title="Restore Deterministic Demo Dataset"
        description="Reset all in-memory equipment, bookings, requests, maintenance windows, and audit logs to the clean seeded demo snapshot?"
      >
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setRestoreDialogOpen(false)}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={restoreDemoMutation.isPending}
            onClick={() => void handleConfirmRestoreDemo()}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {restoreDemoMutation.isPending ? 'Restoring…' : 'Confirm Demo Restore'}
          </button>
        </div>
      </AccessibleDialog>
    </section>
  );
}
