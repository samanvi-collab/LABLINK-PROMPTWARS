import {
  Archive,
  Ban,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Wrench,
  XCircle,
} from 'lucide-react';

export type SemanticStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ARCHIVED'
  | 'MAINTENANCE';

const STATUS_STYLES: Record<
  SemanticStatus,
  { label: string; textClass: string; Icon: typeof Clock }
> = {
  PENDING: { label: 'Pending Review', textClass: 'text-amber-700', Icon: Clock },
  APPROVED: { label: 'Approved', textClass: 'text-emerald-700', Icon: CheckCircle2 },
  CONFIRMED: { label: 'Confirmed', textClass: 'text-emerald-700', Icon: CheckCircle2 },
  COMPLETED: { label: 'Completed', textClass: 'text-blue-700', Icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', textClass: 'text-red-700', Icon: XCircle },
  CANCELLED: { label: 'Cancelled', textClass: 'text-slate-600', Icon: Ban },
  ACTIVE: { label: 'Active', textClass: 'text-emerald-700', Icon: CheckCircle2 },
  INACTIVE: { label: 'Inactive', textClass: 'text-slate-600', Icon: Ban },
  ARCHIVED: { label: 'Archived', textClass: 'text-slate-600', Icon: Archive },
  MAINTENANCE: { label: 'Maintenance', textClass: 'text-amber-700', Icon: Wrench },
};

export function StatusLabel({
  status,
  customLabel,
}: {
  status: SemanticStatus;
  customLabel?: string;
}) {
  const entry = STATUS_STYLES[status] ?? {
    label: status,
    textClass: 'text-slate-700',
    Icon: ShieldAlert,
  };
  const Icon = entry.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${entry.textClass}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{customLabel ?? entry.label}</span>
    </span>
  );
}
