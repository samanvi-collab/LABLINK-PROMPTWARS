import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { AccessRequest, EquipmentUtilization, PublicConfig, RequestRankingResponse, User } from '@shared/types';
import { AuthProvider } from '../auth/AuthContext';
import { Layout } from '../components/Layout';
import { UtilizationChart } from '../components/UtilizationChart';
import { FacultyDashboardPage } from '../pages/FacultyDashboardPage';

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

const facultyUser: User = {
  id: 'fac-sharma',
  email: 'dr.sharma@campus.edu',
  displayName: 'Dr. Kavita Sharma',
  role: 'Faculty',
  department: 'CSE',
  completedTrainings: ['gpu-safety'],
  safetyCleared: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const sampleBreakdown = {
  factors: {
    waitTime: 40,
    historicalUsage: 80,
    deadlineUrgency: 50,
    trainingCompliance: 100,
    academicPriority: 50,
    durationEfficiency: 90,
    departmentAlignment: 100,
  },
  weights: {
    waitTime: 25 as const,
    historicalUsage: 20 as const,
    deadlineUrgency: 15 as const,
    trainingCompliance: 10 as const,
    academicPriority: 10 as const,
    durationEfficiency: 10 as const,
    departmentAlignment: 10 as const,
  },
  weightedTotal: 67.5,
};

const reqTop: AccessRequest = {
  id: 'req-top-1',
  equipmentId: 'eq-cse-a100-node',
  requesterId: 'stu-arjun',
  requesterName: 'Arjun Mehta',
  requesterDepartment: 'CSE',
  startTime: '2026-12-01T10:00:00+05:30',
  endTime: '2026-12-01T12:00:00+05:30',
  purpose: 'Capstone run',
  projectType: 'CAPSTONE',
  deadline: null,
  status: 'PENDING',
  priorityScore: 88.0,
  fairnessBreakdown: { ...sampleBreakdown, weightedTotal: 88.0 },
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
};

const reqLower: AccessRequest = {
  ...reqTop,
  id: 'req-low-2',
  requesterId: 'stu-meera',
  requesterName: 'Meera Nair',
  requesterDepartment: 'ECE',
  projectType: 'PERSONAL',
  priorityScore: 67.5,
  fairnessBreakdown: sampleBreakdown,
};

const rankingForLower: RequestRankingResponse = {
  targetRequest: reqLower,
  competingRequests: [reqTop, reqLower],
  topRankedRequestId: reqTop.id,
  isTopRanked: false,
  requiresOverrideReason: true,
  schedulingEvaluation: {
    feasible: true,
    violations: [],
    conflictingBookingIds: [],
    conflictingMaintenanceIds: [],
    activeBookingsInWindow: 0,
    remainingCapacity: 1,
  },
};

describe('Faculty Override Validation & Zero-Utilization Chart Rendering', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('requires overrideReason when approving non-top-ranked request and supports rejection', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'fac-sharma');
    let approvedPayload: Record<string, unknown> | null = null;
    let rejectedPayload: Record<string, unknown> | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/public-config')) {
          return new Response(JSON.stringify(demoConfig), { status: 200 });
        }
        if (url.endsWith('/api/me')) {
          return new Response(JSON.stringify({ user: facultyUser }), { status: 200 });
        }
        if (url.includes('/api/equipment')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'eq-cse-a100-node',
                  name: 'NVIDIA A100 Compute Node',
                },
              ],
              pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/requests/req-low-2/ranking')) {
          return new Response(JSON.stringify(rankingForLower), { status: 200 });
        }
        if (url.includes('/api/requests/req-low-2/approve') && init?.method === 'POST') {
          approvedPayload = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              request: { ...reqLower, status: 'APPROVED', overrideReason: approvedPayload.overrideReason },
              booking: { id: 'bkg-new-1' },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/requests/req-low-2/reject') && init?.method === 'POST') {
          rejectedPayload = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              request: { ...reqLower, status: 'REJECTED', decisionReason: rejectedPayload.decisionReason },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/requests')) {
          return new Response(
            JSON.stringify({
              items: [reqLower],
              pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/faculty']}>
          <AuthProvider>
            <Layout>
              <Routes>
                <Route path="/faculty" element={<FacultyDashboardPage />} />
              </Routes>
            </Layout>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(/Priority Override Justification Required/i),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    const approveBtn = screen.getByRole('button', { name: /Approve & Book/i });

    // Attempting approval without overrideReason must trigger validation error
    await user.click(approveBtn);
    expect(
      await screen.findByText(/Enter an override reason \(at least 3 characters\)/i),
    ).toBeInTheDocument();
    expect(approvedPayload).toBeNull();

    // Filling overrideReason allows approval
    await user.type(
      screen.getByLabelText(/Override Reason/i),
      'Capstone demo moved forward by committee',
    );
    await user.click(approveBtn);

    await waitFor(() => {
      expect(approvedPayload).toEqual({
        overrideReason: 'Capstone demo moved forward by committee',
      });
    });

    // Test reject dialog validation
    await user.click(screen.getByRole('button', { name: /Reject Request/i }));
    const confirmRejectBtn = await screen.findByRole('button', { name: /Confirm Rejection/i });
    await user.click(confirmRejectBtn);
    expect(await screen.findByText(/Rejection reason must be at least 3 characters/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Rejection Reason/i), 'Reschedule to tomorrow afternoon');
    await user.click(confirmRejectBtn);
    await waitFor(() => {
      expect(rejectedPayload).toEqual({ decisionReason: 'Reschedule to tomorrow afternoon' });
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders zero-utilization and empty datasets without NaN or Infinity and passes axe checks', async () => {
    const zeroItems: EquipmentUtilization[] = [
      {
        equipmentId: 'eq-zero-1',
        equipmentName: 'Idle Laser Cutter',
        department: 'Mechanical',
        category: 'Fabrication',
        capacity: 1,
        archived: false,
        totalBookings: 0,
        bookedCapacityMinutes: 0,
        availableOperatingCapacityMinutes: 0,
        utilizationPercent: 0,
        pendingRequests: 0,
        approvedRequests: 0,
        rejectedRequests: 0,
      },
    ];

    const { container, rerender } = render(<UtilizationChart items={zeroItems} />);
    expect(screen.getAllByText('0.0%').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);

    const axeRes = await axe(container);
    expect(axeRes).toHaveNoViolations();

    rerender(<UtilizationChart items={[]} />);
    expect(
      screen.getByText(/No equipment utilization data is available/i),
    ).toBeInTheDocument();
  });
});
