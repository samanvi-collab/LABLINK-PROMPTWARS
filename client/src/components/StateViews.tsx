import type { ReactNode } from 'react';
import { AlertCircle, Lock, RefreshCw } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@shared/types';
import { ApiClientError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function LoadingSkeleton({ label = 'Loading content' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4 py-6">
      <span className="sr-only">{label}</span>
      <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  error,
  title = 'Unable to complete request',
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred.';
  const code = error instanceof ApiClientError ? error.code : undefined;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-red-950">{title}</h2>
            <p className="mt-1 text-sm text-red-800">{message}</p>
            {(code || requestId) && (
              <p className="mt-2 font-mono text-xs text-red-700">
                {code ? `Code: ${code}` : ''}
                {code && requestId ? ' · ' : ''}
                {requestId ? `Request ID: ${requestId}` : ''}
              </p>
            )}
          </div>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-900 transition hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function AccessDeniedPage({
  requiredRoles,
  currentRole,
}: {
  requiredRoles: UserRole[];
  currentRole?: UserRole;
}) {
  return (
    <section
      aria-labelledby="access-denied-heading"
      className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <div className="flex items-center gap-3 text-red-700">
        <Lock className="h-6 w-6" aria-hidden="true" />
        <p className="font-mono text-xs font-semibold uppercase tracking-wider">HTTP 403 Forbidden</p>
      </div>
      <h1 id="access-denied-heading" className="mt-3 text-2xl font-bold text-slate-950">
        Access restricted for your role
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        This workspace requires{' '}
        <span className="font-semibold text-slate-900">{requiredRoles.join(' or ')}</span>{' '}
        permissions.
        {currentRole ? (
          <>
            {' '}
            Your active account has role{' '}
            <span className="font-semibold text-slate-900">{currentRole}</span>.
          </>
        ) : null}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/equipment"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          Browse Equipment Catalog
        </Link>
        <Link
          to="/requests"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          View My Requests
        </Link>
      </div>
    </section>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authLoading, configLoading } = useAuth();
  const location = useLocation();

  if (configLoading || authLoading) {
    return <LoadingSkeleton label="Verifying authentication" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <>{children}</>;
}

export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[];
  children: ReactNode;
}) {
  const { user, isAuthenticated, authLoading, configLoading } = useAuth();
  const location = useLocation();

  if (configLoading || authLoading) {
    return <LoadingSkeleton label="Checking role permissions" />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  if (!roles.includes(user.role)) {
    return <AccessDeniedPage requiredRoles={roles} currentRole={user.role} />;
  }

  return <>{children}</>;
}
