import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type {
  AiProjectMatchingResponse,
  AiRecommendationsResponse,
  AiSchedulingExplanationResponse,
  PublicConfig,
  User,
} from '@shared/types';
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
  geminiConfigured: true,
  firebaseWebConfig: null,
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

const sampleEquipment = {
  id: 'eq-cse-a100-node',
  name: 'NVIDIA A100 Compute Node',
  description: 'Multi-GPU cluster for deep learning workloads.',
  category: 'Computing',
  department: 'CSE',
  location: 'Block A Lab 204',
  capacity: 2,
  operatingHours: { startTime: '08:00', endTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5, 6] },
  maxBookingDurationMinutes: 240,
  requiredTrainings: ['gpu-safety'],
  safetyRequirements: ['Thermal monitoring'],
  tags: ['gpu', 'cuda', 'ml'],
  archived: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Phase 3 Advisory AI UI Separation & Accessibility', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('displays project-matching fallback source and AI SUGGESTION disclaimer in MarketplacePage without axe violations', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'stu-arjun');

    const mockMatchResponse: AiProjectMatchingResponse = {
      source: 'rule-based',
      model: null,
      cached: false,
      fallbackReason: 'Gemini timed out within the 8-second SLA; deterministic recommendations shown.',
      disclaimer: 'AI SUGGESTION — NOT OFFICIAL RANKING',
      authorityNote:
        'Deterministic scheduling constraints, fairness scores, official rankings, and booking approvals remain the sole system authority.',
      matches: [
        {
          equipmentId: 'eq-cse-a100-node',
          equipmentName: 'NVIDIA A100 Compute Node',
          department: 'CSE',
          category: 'Computing',
          location: 'Block A Lab 204',
          eligibleForUser: true,
          missingTrainings: [],
          safetyClearanceRequired: true,
          fitSummary: 'Matches GPU deep learning training needs.',
          suitabilityLabel: 'High Match',
        },
      ],
    };

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
        if (url.includes('/api/equipment?')) {
          return new Response(
            JSON.stringify({
              items: [sampleEquipment],
              pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
            }),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/ai/project-matching')) {
          return new Response(JSON.stringify(mockMatchResponse), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const { container } = renderAt('/equipment');
    const user = userEvent.setup();

    const toggleBtn = await screen.findByRole('button', { name: /Open Project Matcher/i });
    await user.click(toggleBtn);

    const textarea = await screen.findByLabelText(/Project or Experiment Description/i);
    await user.type(textarea, 'Computer vision model training');
    await user.click(screen.getByRole('button', { name: /Suggest Matching Equipment/i }));

    expect(await screen.findByText(/AI SUGGESTION — NOT OFFICIAL RANKING/i)).toBeInTheDocument();
    expect(screen.getByText(/Source: Rule-Based Fallback/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini timed out within the 8-second SLA/i)).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('displays scheduling recommendations separately from deterministic availability and lets users apply a slot without auto-booking', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'stu-arjun');
    const futureSlotStart = '2027-02-15T04:30:00.000Z';
    const futureSlotEnd = '2027-02-15T06:30:00.000Z';

    const mockRecResponse: AiRecommendationsResponse = {
      source: 'ai',
      model: 'gemini-4-hydrogen',
      cached: false,
      disclaimer: 'AI SUGGESTION — NOT OFFICIAL RANKING',
      authorityNote:
        'Deterministic scheduling constraints, fairness scores, official rankings, and booking approvals remain the sole system authority.',
      targetWindow: { startTime: futureSlotStart, endTime: futureSlotEnd },
      recommendations: [
        {
          equipmentId: 'eq-cse-a100-node',
          equipmentName: 'NVIDIA A100 Compute Node',
          department: 'CSE',
          category: 'Computing',
          location: 'Block A Lab 204',
          startTime: futureSlotStart,
          endTime: futureSlotEnd,
          availableCapacity: 2,
          suitabilityReason: 'Verified morning slot with full GPU capacity.',
          deterministicVerified: true,
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/public-config')) {
        return new Response(JSON.stringify(demoConfig), { status: 200 });
      }
      if (url.endsWith('/api/me')) {
        return new Response(JSON.stringify({ user: studentUser }), { status: 200 });
      }
      if (url.endsWith('/api/equipment/eq-cse-a100-node')) {
        return new Response(JSON.stringify({ equipment: sampleEquipment }), { status: 200 });
      }
      if (url.includes('/availability')) {
        return new Response(
          JSON.stringify({
            availability: {
              equipmentId: 'eq-cse-a100-node',
              equipmentName: sampleEquipment.name,
              capacity: 2,
              archived: false,
              queryWindow: { startTime: futureSlotStart, endTime: futureSlotEnd },
              evaluation: {
                feasible: true,
                violations: [],
                conflictingBookingIds: [],
                conflictingMaintenanceIds: [],
                activeBookingsInWindow: 0,
                remainingCapacity: 2,
              },
              overlappingBookings: [],
              overlappingMaintenance: [],
              alternatives: { timeSlots: [], equivalentEquipment: [] },
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/ai/recommendations')) {
        return new Response(JSON.stringify(mockRecResponse), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderAt('/equipment/eq-cse-a100-node');
    const user = userEvent.setup();

    const goalBox = await screen.findByLabelText(/Experiment Context for Recommendations/i);
    await user.type(goalBox, 'Deep learning model ablation');
    await user.click(screen.getByRole('button', { name: /Get Scheduling Recommendations/i }));

    expect(await screen.findByText(/AI SUGGESTION — NOT OFFICIAL RANKING/i)).toBeInTheDocument();
    expect(screen.getByText(/Source: Gemini AI \(gemini-4-hydrogen\)/i)).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: /Apply Suggested Slot/i });
    await user.click(applyBtn);

    // Ensure no booking/request POST was triggered automatically
    const bookingCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).endsWith('/api/bookings') || String(u).endsWith('/api/requests'),
    );
    expect(bookingCalls).toHaveLength(0);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('displays official rank and AI explanation clearly separated on StudentRequestsPage', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'stu-arjun');

    const mockExplain: AiSchedulingExplanationResponse = {
      source: 'ai',
      model: 'gemini-4-hydrogen',
      cached: false,
      disclaimer: 'AI SUGGESTION — NOT OFFICIAL RANKING',
      authorityNote:
        'Deterministic scheduling constraints, fairness scores, official rankings, and booking approvals remain the sole system authority.',
      officialContext: {
        requestId: 'req-1',
        equipmentId: 'eq-cse-a100-node',
        equipmentName: 'NVIDIA A100 Compute Node',
        status: 'PENDING',
        priorityScore: 84.5,
        officialRank: 1,
        totalCompeting: 2,
        feasible: true,
        violations: [],
      },
      explanation: {
        summary: 'Your request ranks #1 due to capstone urgency and clean usage history.',
        fairnessHighlights: ['Academic Priority (CAPSTONE) scored 100/100'],
        constraintNotes: ['All training and safety checks pass'],
        nextSteps: ['Await Faculty review; no action required'],
      },
    };

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
        if (url.includes('/api/requests')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'req-1',
                  equipmentId: 'eq-cse-a100-node',
                  requesterId: 'stu-arjun',
                  requesterName: 'Arjun Mehta',
                  requesterDepartment: 'CSE',
                  startTime: '2027-02-15T04:30:00.000Z',
                  endTime: '2027-02-15T06:30:00.000Z',
                  purpose: 'Capstone neural benchmark',
                  projectType: 'CAPSTONE',
                  deadline: null,
                  status: 'PENDING',
                  priorityScore: 84.5,
                  fairnessBreakdown: {
                    factors: {
                      waitTime: 40,
                      historicalUsage: 90,
                      deadlineUrgency: 25,
                      trainingCompliance: 100,
                      academicPriority: 100,
                      durationEfficiency: 100,
                      departmentAlignment: 100,
                    },
                    weights: {
                      waitTime: 25,
                      historicalUsage: 20,
                      deadlineUrgency: 15,
                      trainingCompliance: 10,
                      academicPriority: 10,
                      durationEfficiency: 10,
                      departmentAlignment: 10,
                    },
                    weightedTotal: 84.5,
                  },
                  createdAt: '2026-11-01T00:00:00.000Z',
                  updatedAt: '2026-11-01T00:00:00.000Z',
                },
              ],
              pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/equipment')) {
          return new Response(
            JSON.stringify({
              items: [sampleEquipment],
              pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
            }),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/ai/explain-scheduling')) {
          return new Response(JSON.stringify(mockExplain), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const { container } = renderAt('/requests');
    const user = userEvent.setup();

    const explainBtn = await screen.findByRole('button', {
      name: /Explain Scheduling & Fairness/i,
    });
    await user.click(explainBtn);

    expect(await screen.findByText(/AI SUGGESTION — NOT OFFICIAL RANKING/i)).toBeInTheDocument();
    expect(screen.getByText(/#1 of 2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Your request ranks #1 due to capstone urgency/i),
    ).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
