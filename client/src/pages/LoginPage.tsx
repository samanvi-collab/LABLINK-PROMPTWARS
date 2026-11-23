import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useDemoUsers } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { useStatusAnnouncer } from '../components/Layout';
import { ErrorBanner, LoadingSkeleton } from '../components/StateViews';

const emailLoginSchema = z.object({
  email: z.string().trim().email('Enter a valid institutional email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type EmailLoginValues = z.infer<typeof emailLoginSchema>;

export function LoginPage() {
  const {
    publicConfig,
    configLoading,
    configError,
    user,
    authError,
    demoUserId,
    selectDemoUser,
    loginWithGoogle,
    loginWithEmail,
    clearAuthError,
  } = useAuth();
  const { announce } = useStatusAnnouncer();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== '/login'
      ? (location.state as { from?: string }).from!
      : '/equipment';

  const isDemoMode = publicConfig?.authMode === 'demo';
  const demoUsersQuery = useDemoUsers(Boolean(isDemoMode));
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailLoginValues>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (configLoading) {
    return <LoadingSkeleton label="Loading runtime authentication configuration" />;
  }

  if (configError || !publicConfig) {
    return (
      <ErrorBanner
        error={configError ?? 'Unable to load runtime configuration from /api/public-config.'}
        title="Authentication Configuration Unavailable"
      />
    );
  }

  const handleDemoSelect = async (userId: string, displayName: string) => {
    setLocalError(null);
    clearAuthError();
    setSubmittingId(userId);
    try {
      await selectDemoUser(userId);
      announce(`Signed in as ${displayName}`);
      navigate(fromPath, { replace: true });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to switch demo account.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError(null);
    clearAuthError();
    setSubmittingId('google');
    try {
      await loginWithGoogle();
      announce('Signed in with Google.');
      navigate(fromPath, { replace: true });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmittingId(null);
    }
  };

  const onEmailSubmit = async (values: EmailLoginValues) => {
    setLocalError(null);
    clearAuthError();
    try {
      await loginWithEmail(values.email, values.password);
      announce('Signed in successfully.');
      navigate(fromPath, { replace: true });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Email/password sign-in failed.');
    }
  };

  const combinedError = localError || authError;

  return (
    <section aria-labelledby="login-heading" className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
          {isDemoMode ? 'Demo Workspace Access' : 'Campus Identity Authentication'}
        </p>
        <h1 id="login-heading" className="text-2xl font-bold text-slate-950 sm:text-3xl">
          {isDemoMode ? 'Select a Demo Persona' : 'Sign in to LABLINK'}
        </h1>
        <p className="text-sm text-slate-600">
          {isDemoMode
            ? 'Demo authentication is enabled for evaluation. Choose a seeded Student, Faculty, or Admin account to test end-to-end workflows.'
            : 'Sign in with your university Google account or provisioned campus email credentials.'}
        </p>
      </header>

      {combinedError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">Authentication Error</p>
            <p className="mt-0.5 text-red-800">{combinedError}</p>
          </div>
        </div>
      )}

      {isDemoMode ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
            <strong>Demo User Switcher Active:</strong> Roles and permissions are verified by the
            backend from seeded repository records. Demo accounts are hidden automatically in
            Firebase production mode.
          </div>

          {demoUsersQuery.isLoading ? (
            <LoadingSkeleton label="Loading seeded demo accounts" />
          ) : demoUsersQuery.error ? (
            <ErrorBanner
              error={demoUsersQuery.error}
              onRetry={() => void demoUsersQuery.refetch()}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(demoUsersQuery.data?.users ?? []).map((demoUser) => {
                const isActive = demoUserId === demoUser.id && user?.id === demoUser.id;
                const isBusy = submittingId === demoUser.id;

                return (
                  <article
                    key={demoUser.id}
                    className={`flex flex-col justify-between rounded-xl border bg-white p-5 transition ${
                      isActive ? 'border-blue-700 ring-1 ring-blue-700' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="text-base font-semibold text-slate-950">
                            {demoUser.displayName}
                          </h2>
                          <p className="text-xs text-slate-600">{demoUser.email}</p>
                        </div>
                        <span className="font-mono text-xs font-semibold text-blue-700">
                          {demoUser.role}
                        </span>
                      </div>

                      <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-700">
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Department</dt>
                          <dd className="font-medium text-slate-900">{demoUser.department}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Safety Clearance</dt>
                          <dd
                            className={`font-semibold ${
                              demoUser.safetyCleared ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {demoUser.safetyCleared ? 'Cleared' : 'Pending Clearance'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Completed Trainings</dt>
                          <dd className="mt-0.5 font-mono text-[11px] text-slate-800">
                            {demoUser.completedTrainings.length > 0
                              ? demoUser.completedTrainings.join(', ')
                              : 'None'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleDemoSelect(demoUser.id, demoUser.displayName)}
                      className={`mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                        isActive
                          ? 'bg-blue-700 text-white hover:bg-blue-800'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      } disabled:opacity-60`}
                    >
                      <UserCheck className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {isBusy
                          ? 'Signing in…'
                          : isActive
                            ? `Active (${demoUser.role})`
                            : `Sign in as ${demoUser.displayName}`}
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="space-y-6">
            <div>
              <button
                type="button"
                disabled={submittingId === 'google' || isSubmitting}
                onClick={() => void handleGoogleLogin()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>
                  {submittingId === 'google' ? 'Signing in with Google…' : 'Continue with Google'}
                </span>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-white px-3 text-slate-500">Or email &amp; password</span>
              </div>
            </div>

            <form onSubmit={handleSubmit(onEmailSubmit)} noValidate className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-800">
                  Institutional Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                  {...register('email')}
                  className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                />
                {errors.email && (
                  <p id="login-email-error" className="mt-1 text-xs text-red-700">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-800">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  {...register('password')}
                  className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                />
                {errors.password && (
                  <p id="login-password-error" className="mt-1 text-xs text-red-700">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || submittingId === 'google'}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>{isSubmitting ? 'Signing in…' : 'Sign in with Email'}</span>
              </button>
            </form>

            <p className="border-t border-slate-100 pt-4 text-xs text-slate-600">
              Account provisioning and role assignments are managed by campus administration. Public
              self-registration is disabled.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
