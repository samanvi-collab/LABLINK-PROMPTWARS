import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section
      aria-labelledby="not-found-heading"
      className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center"
    >
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
        HTTP 404
      </p>
      <h1 id="not-found-heading" className="mt-2 text-2xl font-bold text-slate-950">
        Page Not Found
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        The requested LABLINK route does not exist or has moved.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Return Home
        </Link>
        <Link
          to="/equipment"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          Browse Catalog
        </Link>
      </div>
    </section>
  );
}
