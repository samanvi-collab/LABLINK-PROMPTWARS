import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  ChevronDown,
  LogOut,
  Menu,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface StatusAnnouncerContextValue {
  announce: (message: string) => void;
}

const StatusAnnouncerContext = createContext<StatusAnnouncerContextValue>({
  announce: () => {},
});

export function useStatusAnnouncer(): StatusAnnouncerContextValue {
  return useContext(StatusAnnouncerContext);
}

const ROUTE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/equipment/', title: 'Equipment Details — LABLINK' },
  { prefix: '/equipment', title: 'Equipment Catalog — LABLINK' },
  { prefix: '/requests', title: 'My Requests — LABLINK' },
  { prefix: '/reservations', title: 'Reservations — LABLINK' },
  { prefix: '/faculty', title: 'Faculty Review Queue — LABLINK' },
  { prefix: '/admin', title: 'Admin & Analytics — LABLINK' },
  { prefix: '/diagnostics', title: 'System Diagnostics — LABLINK' },
  { prefix: '/login', title: 'Sign In — LABLINK' },
  { prefix: '/', title: 'LABLINK — Intelligent Campus Resource Sharing Platform' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { publicConfig, user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const mainRef = useRef<HTMLElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const isFirstRenderRef = useRef(true);

  const announce = useCallback((msg: string) => {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(msg), 25);
  }, []);

  // Route document title sync + keyboard focus management
  useEffect(() => {
    const matched =
      ROUTE_TITLES.find((r) =>
        r.prefix === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(r.prefix),
      ) ?? ROUTE_TITLES[ROUTE_TITLES.length - 1];
    document.title = matched.title;
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const heading = mainRef.current?.querySelector('h1');
    if (heading instanceof HTMLElement) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: false });
    } else {
      mainRef.current?.focus();
    }
  }, [location.pathname]);

  // Close account dropdown on outside click or Escape
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [accountMenuOpen]);

  const isFacultyOrAdmin = user?.role === 'Faculty' || user?.role === 'Admin';
  const isDemoMode = publicConfig?.authMode === 'demo' || publicConfig?.demoMode;

  const navItems: Array<{ to: string; label: string }> = isAuthenticated
    ? [
        { to: '/equipment', label: 'Catalog' },
        { to: '/requests', label: 'My Requests' },
        { to: '/reservations', label: 'Reservations' },
        ...(isFacultyOrAdmin
          ? [
              { to: '/faculty', label: 'Review Queue' },
              { to: '/admin', label: 'Admin & Analytics' },
            ]
          : []),
      ]
    : [
        { to: '/', label: 'Overview' },
        { to: '/diagnostics', label: 'System Health' },
      ];

  const handleLogout = async () => {
    await logout();
    announce('Signed out of LABLINK.');
    navigate('/login');
  };

  return (
    <StatusAnnouncerContext.Provider value={{ announce }}>
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-700 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>

        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {publicConfig && (
          <div
            role="region"
            aria-label="Runtime environment mode"
            className={
              isDemoMode
                ? 'border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-950'
                : 'border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-950'
            }
          >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isDemoMode ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                )}
                <span>
                  {isDemoMode ? (
                    <>
                      <strong className="font-semibold">DEMO MODE</strong> — Seeded non-persistent
                      in-memory dataset. Changes reset on server restart or Demo Restore.
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold">PRODUCTION MODE</strong> — Connected to
                      persistent Cloud Firestore &amp; Firebase Authentication.
                    </>
                  )}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-700">
                TZ: {publicConfig.timezone} · Storage: {publicConfig.storageMode}
              </span>
            </div>
          </div>
        )}

        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
            {/* Zone 1: Brand Wordmark */}
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-2 text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect width="28" height="28" rx="6" fill="#0F172A" />
                <path
                  d="M7 9.5H15M7 14H21M7 18.5H13"
                  stroke="#FFFFFF"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <circle cx="19.5" cy="9.5" r="2.2" fill="#3B82F6" />
                <circle cx="18.5" cy="18.5" r="2.2" fill="#3B82F6" />
              </svg>
              <span className="font-['Plus_Jakarta_Sans'] text-lg font-bold tracking-tight whitespace-nowrap">
                LABLINK
              </span>
            </Link>

            {/* Zone 2: Single-Row Navigation */}
            <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Zone 3: Single Primary Account / Sign-in Control + Mobile Menu Trigger */}
            <div className="flex items-center gap-2">
              {isAuthenticated && user ? (
                <div className="relative" ref={accountMenuRef}>
                  <button
                    type="button"
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setAccountMenuOpen((prev) => !prev)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 whitespace-nowrap shrink-0 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    <UserCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span className="hidden sm:inline">{user.displayName}</span>
                    <span className="font-mono text-xs text-slate-600">{user.role}</span>
                    <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  </button>

                  {accountMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Account actions"
                      className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
                    >
                      <div className="border-b border-slate-100 pb-2.5">
                        <p className="text-sm font-semibold text-slate-950">{user.displayName}</p>
                        <p className="truncate text-xs text-slate-600">{user.email}</p>
                        <p className="mt-1 font-mono text-xs text-slate-700">
                          {user.role} · {user.department}
                        </p>
                      </div>
                      <div className="mt-2 space-y-1">
                        {isDemoMode && (
                          <Link
                            to="/login"
                            role="menuitem"
                            className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                          >
                            Switch Demo Account
                          </Link>
                        )}
                        <Link
                          to="/diagnostics"
                          role="menuitem"
                          className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                        >
                          System Diagnostics
                        </Link>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogout}
                          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                        >
                          <LogOut className="h-4 w-4" aria-hidden="true" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white whitespace-nowrap shrink-0 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  Sign In
                </Link>
              )}

              <button
                type="button"
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav-drawer"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <nav
              id="mobile-nav-drawer"
              aria-label="Mobile navigation"
              className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
            >
              <div className="flex flex-col gap-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium ${
                        isActive ? 'bg-slate-900 text-white' : 'text-slate-800 hover:bg-slate-100'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
                <NavLink
                  to="/diagnostics"
                  className={({ isActive }) =>
                    `flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-slate-900 text-white' : 'text-slate-800 hover:bg-slate-100'
                    }`
                  }
                >
                  System Diagnostics
                </NavLink>
              </div>
            </nav>
          )}
        </header>

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8"
        >
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-slate-600 sm:px-6">
            <p>
              LABLINK — Deterministic Campus Laboratory Resource Sharing · Timezone:{' '}
              <span className="font-mono">{publicConfig?.timezone ?? 'Asia/Kolkata'}</span>
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/equipment"
                className="inline-flex min-h-[44px] items-center text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                Catalog
              </Link>
              <Link
                to="/diagnostics"
                className="inline-flex min-h-[44px] items-center text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                System Diagnostics
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </StatusAnnouncerContext.Provider>
  );
}
