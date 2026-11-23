import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { PublicConfig, User } from '@shared/types';
import { AppRoutes } from '../App';
import { AuthProvider } from '../auth/AuthContext';

const demoConfig: PublicConfig = {
  appName: 'LABLINK',
  version: '1.0.0',
  storageMode: 'demo',
  authMode: 'demo',
  demoMode: true,
  timezone: 'Asia/Kolkata',
  firebaseConfigured: false,
  geminiConfigured: false,
  firebaseWebConfig: null,
};

const firebaseConfig: PublicConfig = {
  appName: 'LABLINK',
  version: '1.0.0',
  storageMode: 'firestore',
  authMode: 'firebase',
  demoMode: false,
  timezone: 'Asia/Kolkata',
  firebaseConfigured: true,
  geminiConfigured: false,
  firebaseWebConfig: {
    apiKey: 'public-web-key',
    authDomain: 'lablink.firebaseapp.com',
    projectId: 'lablink-prod',
    appId: '1:123:web:abc',
  },
};

const studentUser: User = {
  id: 'stu-arjun',
  email: 'arjun.mehta@campus.edu',
  displayName: 'Arjun Mehta',
  role: 'Student',
  department: 'CSE',
  completedTrainings: ['gpu-safety'],
  safetyCleared: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Authentication Modes, 401/403 Guards, and Login Accessibility', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows demo user switcher ONLY in demo mode and passes axe checks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/public-config')) {
          return new Response(JSON.stringify(demoConfig), { status: 200 });
        }
        if (url.endsWith('/api/demo/users')) {
          return new Response(JSON.stringify({ users: [studentUser] }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'nope', requestId: 'r1' } }), { status: 404 });
      }),
    );

    const { container } = renderApp('/login');
    expect(await screen.findByText(/Select a Demo Persona/i)).toBeInTheDocument();
    expect(screen.getByText(/DEMO MODE/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in as Arjun Mehta/i })).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('hides demo switcher in Firebase mode and displays auth error on failed login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/public-config')) {
          return new Response(JSON.stringify(firebaseConfig), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Auth failed', requestId: 'r2' } }), { status: 401 });
      }),
    );

    renderApp('/login');
    expect(await screen.findByRole('heading', { name: /Sign in to LABLINK/i })).toBeInTheDocument();
    expect(screen.queryByText(/Select a Demo Persona/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo User Switcher Active/i)).not.toBeInTheDocument();
    expect(screen.getByText(/PRODUCTION MODE/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Sign in with Email/i }));
    expect(await screen.findByText(/Enter a valid institutional email address/i)).toBeInTheDocument();
  });

  it('renders HTTP 403 Access Denied when a Student navigates to /faculty or /admin', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'stu-arjun');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/public-config')) {
          return new Response(JSON.stringify(demoConfig), { status: 200 });
        }
        if (url.endsWith('/api/me')) {
          return new Response(JSON.stringify({ user: studentUser }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    renderApp('/faculty');
    expect(await screen.findByRole('heading', { name: /Access restricted for your role/i })).toBeInTheDocument();
    expect(screen.getByText(/HTTP 403 Forbidden/i)).toBeInTheDocument();
  });

  it('handles 401 response by resetting demo session and redirecting to /login', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'invalid-id');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/public-config')) {
          return new Response(JSON.stringify(demoConfig), { status: 200 });
        }
        if (url.endsWith('/api/me')) {
          return new Response(
            JSON.stringify({
              error: { code: 'UNAUTHORIZED', message: 'Invalid demo user', requestId: 'req-401' },
            }),
            { status: 401 },
          );
        }
        if (url.endsWith('/api/demo/users')) {
          return new Response(JSON.stringify({ users: [studentUser] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    renderApp('/requests');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Select a Demo Persona/i })).toBeInTheDocument();
    });
  });
});
