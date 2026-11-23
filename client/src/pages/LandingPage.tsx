import { useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <section aria-labelledby="hero-heading" className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-blue-700">
            Campus Laboratory Infrastructure · Asia/Kolkata (IST)
          </p>
          <h1
            id="hero-heading"
            className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl sm:leading-[1.1]"
          >
            Fair, conflict-free access to shared campus research equipment.
          </h1>
          <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
            LABLINK replaces fragmented lab spreadsheets and ad-hoc email threads with deterministic
            constraint scheduling, transparent 7-factor fairness prioritization, and auditable
            faculty approvals.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isAuthenticated ? (
              <>
                <Link
                  to="/equipment"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  <span>Open Equipment Catalog</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {user && (user.role === 'Faculty' || user.role === 'Admin') ? (
                  <Link
                    to="/faculty"
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    Open Faculty Review Queue
                  </Link>
                ) : (
                  <Link
                    to="/requests"
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    View My Requests
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/diagnostics"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  Inspect System Diagnostics
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-5">
          {!imgFailed ? (
            <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img
                src="/src/assets/images/campus_research_lab_1795427620695.jpg"
                alt="University engineering laboratory with shared instrumentation workstations and clean benches"
                onError={() => setImgFailed(true)}
                className="aspect-[16/10] w-full object-cover"
              />
              <figcaption className="border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                Centralized cross-department instrumentation across CSE, ECE, Mechanical, and EEE
                facilities.
              </figcaption>
            </figure>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-8 text-white">
              <p className="font-mono text-xs uppercase tracking-wider text-blue-300">
                Scheduling Architecture
              </p>
              <p className="mt-3 text-lg font-semibold">
                Zero double-bookings through half-open interval checks and atomic approval locks.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Problem & Solution Comparison */}
      <section aria-labelledby="problem-solution-heading" className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 id="problem-solution-heading" className="text-lg font-bold text-slate-950">
            The Campus Resource Bottleneck
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            High-demand instruments like GPU nodes, cleanroom fabrication benches, CNC mills, and
            oscilloscopes sit idle or overbooked when departments rely on isolated sign-up sheets.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>• Overlapping reservations and unverified safety/training prerequisites</li>
            <li>• Priority awarded on who emails fastest instead of academic urgency or equity</li>
            <li>• No central maintenance blocking or utilization audit trail for deans and admins</li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-900 p-6 text-slate-100">
          <h2 className="text-lg font-bold text-white">How LABLINK Solves It</h2>
          <p className="mt-2 text-sm text-slate-300">
            Every availability query, booking, and faculty decision passes through one deterministic
            scheduling engine backed by transactional persistence and immutable audit records.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-200">
            <li>• Sweep-line concurrency enforcement over exact [start, end) IST intervals</li>
            <li>• Automated 7-factor fairness ranking with documented faculty override reasons</li>
            <li>• Conflict responses immediately surface verified alternative slots and instruments</li>
          </ul>
        </div>
      </section>

      {/* How Scheduling Works */}
      <section aria-labelledby="workflow-heading" className="space-y-6">
        <div>
          <h2 id="workflow-heading" className="text-2xl font-bold text-slate-950">
            Deterministic Scheduling Pipeline
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Every request moves through three verifiable stages with zero client-side guesswork.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <SlidersHorizontal className="h-6 w-6 text-blue-700" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-slate-950">
              1. Hard Constraint Verification
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Checks IST operating hours, max duration, required trainings, safety clearance,
              active maintenance blocks, and multi-unit capacity before accepting a booking or
              request.
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <Scale className="h-6 w-6 text-blue-700" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-slate-950">
              2. Transparent Fairness Scoring
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Scores competing access requests from 0 to 100 across wait time, historical usage,
              deadline proximity, training compliance, academic tier, duration, and department.
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <CalendarCheck className="h-6 w-6 text-blue-700" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-slate-950">
              3. Atomic Approval &amp; Audit
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Faculty approvals re-verify capacity inside a transaction lock, create a confirmed
              booking, record non-top-ranked override justifications, and append an audit log.
            </p>
          </article>
        </div>
      </section>

      {/* Role Benefits */}
      <section aria-labelledby="benefits-heading" className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2 text-blue-700">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider">
            Role-Scoped Collaboration
          </span>
        </div>
        <h2 id="benefits-heading" className="mt-2 text-xl font-bold text-slate-950">
          Built for Students, Faculty Supervisors, and Lab Administrators
        </h2>
        <dl className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <dt className="text-sm font-semibold text-slate-950">Students &amp; Researchers</dt>
            <dd className="mt-1 text-sm text-slate-600">
              Discover equipment across departments, check live slot feasibility, see exact
              conflict alternatives, and track fairness scores on pending requests.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-950">Faculty Reviewers</dt>
            <dd className="mt-1 text-sm text-slate-600">
              Review queues ordered by deterministic fairness, inspect competing requests side by
              side, schedule maintenance blocks, and approve or reject with rationale.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-950">Lab Administrators</dt>
            <dd className="mt-1 text-sm text-slate-600">
              Maintain equipment catalogs and operating constraints, track utilization across
              departments, and inspect complete audit logs for compliance.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
