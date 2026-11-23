import { RefreshCw } from 'lucide-react';
import { useHealth, usePublicConfig } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner, LoadingSkeleton } from '../components/StateViews';
import { formatIstDateTime } from '../utils/time';

export function DiagnosticsPage() {
  const healthQuery = useHealth();
  const configQuery = usePublicConfig();
  const { user, isAuthenticated, refreshProfile } = useAuth();

  const handleRefreshAll = () => {
    void healthQuery.refetch();
    void configQuery.refetch();
    if (isAuthenticated) {
      void refreshProfile();
    }
  };

  return (
    <section aria-labelledby="diagnostics-heading" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
            Live Runtime Environment
          </p>
          <h1 id="diagnostics-heading" className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            System Diagnostics
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Verifies live API health, runtime configuration flags, and current authentication
            identity. Automated unit/integration tests run separately via Vitest.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshAll}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Re-run Runtime Checks</span>
        </button>
      </header>

      {(healthQuery.isLoading || configQuery.isLoading) && (
        <LoadingSkeleton label="Running live diagnostics" />
      )}

      {healthQuery.error && <ErrorBanner error={healthQuery.error} />}
      {configQuery.error && <ErrorBanner error={configQuery.error} />}

      {healthQuery.data && configQuery.data && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-950">API &amp; Storage Runtime</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Service Health (/api/health)</dt>
                <dd className="font-mono font-semibold text-emerald-700">
                  {healthQuery.data.status.toUpperCase()} ({healthQuery.data.service})
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Storage Mode</dt>
                <dd className="font-mono font-semibold text-slate-950">
                  {configQuery.data.storageMode}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Auth Mode</dt>
                <dd className="font-mono font-semibold text-slate-950">
                  {configQuery.data.authMode}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Application Timezone</dt>
                <dd className="font-mono text-slate-900">{healthQuery.data.timezone}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Server Uptime</dt>
                <dd className="font-mono text-slate-900 tabular-nums">
                  {healthQuery.data.uptimeSeconds}s
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Checked At</dt>
                <dd className="font-mono text-xs text-slate-800 tabular-nums">
                  {formatIstDateTime(healthQuery.data.timestamp)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-950">
              Integration Flags &amp; Session
            </h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Firebase Configured</dt>
                <dd
                  className={`font-mono font-semibold ${
                    configQuery.data.firebaseConfigured ? 'text-emerald-700' : 'text-slate-600'
                  }`}
                >
                  {configQuery.data.firebaseConfigured ? 'Configured' : 'Not Configured'}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Gemini API Configured</dt>
                <dd
                  className={`font-mono font-semibold ${
                    configQuery.data.geminiConfigured ? 'text-emerald-700' : 'text-slate-600'
                  }`}
                >
                  {configQuery.data.geminiConfigured ? 'Configured' : 'Not Configured'}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Current Session (/api/me)</dt>
                <dd className="font-mono font-semibold text-slate-950">
                  {isAuthenticated && user ? `${user.displayName} (${user.role})` : 'Signed out'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">API Version</dt>
                <dd className="font-mono text-slate-900">{configQuery.data.version}</dd>
              </div>
            </dl>

            <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              Note: This diagnostics panel checks live runtime endpoints only. Offline unit,
              concurrency, security, and axe accessibility suites are verified by running{' '}
              <code className="font-mono font-semibold">npm test</code>.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
