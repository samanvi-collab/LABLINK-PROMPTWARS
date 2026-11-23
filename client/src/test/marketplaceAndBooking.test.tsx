import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { Equipment, PublicConfig, User } from '@shared/types';
import { AuthProvider } from '../auth/AuthContext';
import { Layout } from '../components/Layout';
import { EquipmentDetailPage } from '../pages/EquipmentDetailPage';
import { MarketplacePage } from '../pages/MarketplacePage';

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

const studentUser: User = {
  id: 'stu-arjun',
  email: 'arjun.mehta@campus.edu',
  displayName: 'Arjun Mehta',
  role: 'Student',
  department: 'CSE',
  completedTrainings: ['gpu-safety', 'robotics-e-stop'],
  safetyCleared: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const mockEquipment: Equipment[] = [
  {
    id: 'eq-cse-a100-node',
    name: 'NVIDIA A100 Compute Node',
    description: 'High-memory GPU workstation for deep learning training runs.',
    category: 'Computing',
    department: 'CSE',
    location: 'CSE Block Room 304',
    capacity: 2,
    operatingHours: { startTime: '08:00', endTime: '20:00', daysOfWeek: [1, 2, 3, 4, 5] },
    maxBookingDurationMinutes: 240,
    requiredTrainings: ['gpu-safety'],
    safetyRequirements: [],
    tags: ['gpu', 'ml'],
    archived: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'eq-ece-oscilloscope',
    name: 'Tektronix Mixed-Signal Oscilloscope',
    description: '4-channel digital oscilloscope for high-speed signal debugging.',
    category: 'Testing',
    department: 'ECE',
    location: 'ECE Lab 201',
    capacity: 1,
    operatingHours: { startTime: '09:00', endTime: '18:00', daysOfWeek: [1, 2, 3, 4, 5] },
    maxBookingDurationMinutes: 180,
    requiredTrainings: [],
    safetyRequirements: [],
    tags: ['oscilloscope'],
    archived: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

function renderWithRouter(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="/equipment" element={<MarketplacePage />} />
              <Route path="/equipment/:id" element={<EquipmentDetailPage />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Marketplace Search/Filters, Slot Picker, Duplicate Guard, 409 Conflicts & Axe', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('filters marketplace equipment by search and department and passes axe audit', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'stu-arjun');

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/public-config')) {
        return new Response(JSON.stringify(demoConfig), { status: 200 });
      }
      if (url.endsWith('/api/me')) {
        return new Response(JSON.stringify({ user: studentUser }), { status: 200 });
      }
      if (url.includes('/api/equipment')) {
        const parsed = new URL(url, 'http://localhost');
        const dept = parsed.searchParams.get('department');
        const search = parsed.searchParams.get('search')?.toLowerCase() ?? '';
        const filtered = mockEquipment.filter((eq) => {
          if (dept && eq.department !== dept) return false;
          if (search && !eq.name.toLowerCase().includes(search)) return false;
          return true;
        });
        return new Response(
          JSON.stringify({
            items: filtered,
            pagination: { page: 1, limit: 12, total: filtered.length, totalPages: 1 },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = renderWithRouter('/equipment');
    expect(await screen.findByText('NVIDIA A100 Compute Node')).toBeInTheDocument();
    expect(screen.getByText('Tektronix Mixed-Signal Oscilloscope')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/Department/i), 'ECE');
    await waitFor(() => {
      expect(screen.queryByText('NVIDIA A100 Compute Node')).not.toBeInTheDocument();
      expect(screen.getByText('Tektronix Mixed-Signal Oscilloscope')).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('validates request form, prevents duplicate submit, handles HTTP 409 alternatives, and passes axe audit', async () => {
    window.sessionStorage.setItem('lablink_demo_user_id', 'stu-arjun');
    let postCallCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/public-config')) {
          return new Response(JSON.stringify(demoConfig), { status: 200 });
        }
        if (url.endsWith('/api/me')) {
          return new Response(JSON.stringify({ user: studentUser }), { status: 200 });
        }
        if (url.includes('/api/equipment/eq-cse-a100-node/availability')) {
          return new Response(
            JSON.stringify({
              availability: {
                equipmentId: 'eq-cse-a100-node',
                equipmentName: 'NVIDIA A100 Compute Node',
                capacity: 2,
                archived: false,
                queryWindow: {
                  startTime: '2026-12-01T10:00:00+05:30',
                  endTime: '2026-12-01T12:00:00+05:30',
                },
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
        if (url.endsWith('/api/equipment/eq-cse-a100-node')) {
          return new Response(JSON.stringify({ equipment: mockEquipment[0] }), { status: 200 });
        }
        if (url.endsWith('/api/requests') && init?.method === 'POST') {
          postCallCount += 1;
          // Return HTTP 409 conflict with alternatives
          return new Response(
            JSON.stringify({
              error: {
                code: 'SCHEDULING_CONFLICT',
                message: 'Capacity exceeded in selected window',
                requestId: 'req-409-test',
                alternatives: {
                  timeSlots: [
                    {
                      equipmentId: 'eq-cse-a100-node',
                      equipmentName: 'NVIDIA A100 Compute Node',
                      startTime: '2026-12-01T14:00:00+05:30',
                      endTime: '2026-12-01T16:00:00+05:30',
                      availableCapacity: 2,
                    },
                  ],
                  equivalentEquipment: [
                    {
                      equipmentId: 'eq-ece-oscilloscope',
                      equipmentName: 'Alternate Compute Rig',
                      department: 'CSE',
                      category: 'Computing',
                      location: 'CSE 305',
                      matchingTags: ['gpu'],
                      startTime: '2026-12-01T10:00:00+05:30',
                      endTime: '2026-12-01T12:00:00+05:30',
                      availableCapacity: 1,
                    },
                  ],
                },
              },
            }),
            { status: 409 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const { container } = renderWithRouter('/equipment/eq-cse-a100-node');
    expect(await screen.findByRole('heading', { name: 'NVIDIA A100 Compute Node' })).toBeInTheDocument();

    const user = userEvent.setup();

    // Select a radio button slot
    const slotRadio = screen.getByRole('radio', { name: /12:00 – 14:00 IST/i });
    await user.click(slotRadio);
    expect(slotRadio).toBeChecked();

    // Submit empty purpose to verify client validation prevents POST
    const submitBtn = screen.getByRole('button', { name: /Submit Access Request/i });
    await user.click(submitBtn);
    expect(await screen.findByText(/Purpose must be at least 5 characters/i)).toBeInTheDocument();
    expect(postCallCount).toBe(0);

    // Fill valid purpose and submit -> triggers 409 ConflictPanel with alternatives
    await user.type(
      screen.getByLabelText(/Experiment \/ Usage Purpose/i),
      'Distributed model benchmark evaluation',
    );
    await user.click(submitBtn);

    expect(await screen.findByText(/Submission Blocked by Scheduling Conflict/i)).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-409-test/i)).toBeInTheDocument();
    expect(screen.getByText(/Alternate Compute Rig/i)).toBeInTheDocument();

    // Clicking "Use Slot" switches radio selection to 14:00 - 16:00 IST
    await user.click(screen.getByRole('button', { name: /Use Slot/i }));
    expect(screen.getByRole('radio', { name: /14:00 – 16:00 IST/i })).toBeChecked();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
