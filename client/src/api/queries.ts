import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccessRequest,
  AiProjectMatchingResponse,
  AiRecommendationsResponse,
  AiSchedulingExplanationResponse,
  AnalyticsOverview,
  AuditLog,
  AvailabilitySummary,
  Booking,
  DepartmentUsage,
  Equipment,
  EquipmentUtilization,
  HealthStatus,
  MaintenanceWindow,
  PaginatedResponse,
  ProjectType,
  PublicConfig,
  RequestRankingResponse,
  User,
} from '@shared/types';
import { apiRequest } from './client';

export const queryKeys = {
  health: ['health'] as const,
  publicConfig: ['public-config'] as const,
  me: ['me'] as const,
  demoUsers: ['demo-users'] as const,
  equipmentList: (filters?: Record<string, unknown>) => ['equipment', 'list', filters ?? {}] as const,
  equipmentDetail: (id: string) => ['equipment', 'detail', id] as const,
  equipmentAvailability: (id: string, startTime: string, endTime: string) =>
    ['equipment', 'availability', id, startTime, endTime] as const,
  bookings: (filters?: Record<string, unknown>) => ['bookings', 'list', filters ?? {}] as const,
  requests: (filters?: Record<string, unknown>) => ['requests', 'list', filters ?? {}] as const,
  requestRanking: (id: string) => ['requests', 'ranking', id] as const,
  maintenance: (filters?: Record<string, unknown>) => ['maintenance', 'list', filters ?? {}] as const,
  analyticsOverview: (filters?: Record<string, unknown>) => ['analytics', 'overview', filters ?? {}] as const,
  analyticsUtilization: (filters?: Record<string, unknown>) => ['analytics', 'utilization', filters ?? {}] as const,
  analyticsDepartments: (filters?: Record<string, unknown>) => ['analytics', 'departments', filters ?? {}] as const,
  auditLogs: (filters?: Record<string, unknown>) => ['audit-logs', filters ?? {}] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiRequest<HealthStatus>('/api/health', { skipAuth: true }),
    staleTime: 15_000,
  });
}

export function usePublicConfig() {
  return useQuery({
    queryKey: queryKeys.publicConfig,
    queryFn: () => apiRequest<PublicConfig>('/api/public-config', { skipAuth: true }),
    staleTime: 60_000,
  });
}

export function useDemoUsers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.demoUsers,
    queryFn: () => apiRequest<{ users: User[] }>('/api/demo/users', { skipAuth: true }),
    enabled,
    staleTime: 60_000,
  });
}

export function useEquipmentList(
  filters: {
    page?: number;
    limit?: number;
    department?: string;
    category?: string;
    search?: string;
    includeArchived?: boolean;
  },
  enabled = true,
) {
  const queryParams = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    department: filters.department,
    category: filters.category,
    search: filters.search,
    includeArchived: filters.includeArchived ? 'true' : undefined,
  };
  return useQuery({
    queryKey: queryKeys.equipmentList(queryParams),
    queryFn: () =>
      apiRequest<PaginatedResponse<Equipment>>('/api/equipment', {
        query: queryParams,
      }),
    enabled,
  });
}

export function useEquipmentDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.equipmentDetail(id),
    queryFn: () => apiRequest<{ equipment: Equipment }>(`/api/equipment/${id}`),
    enabled: Boolean(id) && enabled,
  });
}

export function useEquipmentAvailability(
  id: string,
  startTime: string,
  endTime: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.equipmentAvailability(id, startTime, endTime),
    queryFn: () =>
      apiRequest<{ availability: AvailabilitySummary }>(`/api/equipment/${id}/availability`, {
        query: { startTime, endTime },
      }),
    enabled: Boolean(id && startTime && endTime && Date.parse(startTime) < Date.parse(endTime) && enabled),
  });
}

export function useBookings(
  filters: {
    page?: number;
    limit?: number;
    equipmentId?: string;
    status?: string;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.bookings(filters),
    queryFn: () =>
      apiRequest<PaginatedResponse<Booking>>('/api/bookings', {
        query: filters,
      }),
    enabled,
  });
}

export function useRequests(
  filters: {
    page?: number;
    limit?: number;
    equipmentId?: string;
    status?: string;
    sortBy?: 'fairness' | 'createdAt';
  },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.requests(filters),
    queryFn: () =>
      apiRequest<PaginatedResponse<AccessRequest>>('/api/requests', {
        query: filters,
      }),
    enabled,
  });
}

export function useRequestRanking(requestId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.requestRanking(requestId ?? ''),
    queryFn: () => apiRequest<RequestRankingResponse>(`/api/requests/${requestId}/ranking`),
    enabled: Boolean(requestId) && enabled,
  });
}

export function useMaintenance(
  filters: { page?: number; limit?: number; equipmentId?: string; activeOnly?: boolean },
  enabled = true,
) {
  const queryParams = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    equipmentId: filters.equipmentId,
    activeOnly: filters.activeOnly ? 'true' : undefined,
  };
  return useQuery({
    queryKey: queryKeys.maintenance(queryParams),
    queryFn: () =>
      apiRequest<PaginatedResponse<MaintenanceWindow>>('/api/maintenance', {
        query: queryParams,
      }),
    enabled,
  });
}

export function useAnalyticsOverview(
  filters: { startTime?: string; endTime?: string; department?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.analyticsOverview(filters),
    queryFn: () =>
      apiRequest<{ overview: AnalyticsOverview }>('/api/analytics/overview', {
        query: filters,
      }),
    enabled,
  });
}

export function useEquipmentUtilization(
  filters: { startTime?: string; endTime?: string; department?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.analyticsUtilization(filters),
    queryFn: () =>
      apiRequest<{ equipment: EquipmentUtilization[] }>('/api/analytics/utilization', {
        query: filters,
      }),
    enabled,
  });
}

export function useDepartmentUsage(
  filters: { startTime?: string; endTime?: string; department?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.analyticsDepartments(filters),
    queryFn: () =>
      apiRequest<{ departments: DepartmentUsage[] }>('/api/analytics/departments', {
        query: filters,
      }),
    enabled,
  });
}

export function useAuditLogs(
  filters: { page?: number; limit?: number; action?: string; actorId?: string; targetId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.auditLogs(filters),
    queryFn: () =>
      apiRequest<PaginatedResponse<AuditLog>>('/api/audit-logs', {
        query: filters,
      }),
    enabled,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      equipmentId: string;
      startTime: string;
      endTime: string;
      purpose: string;
    }) => apiRequest<{ booking: Booking }>('/api/bookings', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['equipment', 'availability'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest<{ booking: Booking }>(`/api/bookings/${id}/cancel`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['equipment', 'availability'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useCreateAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      equipmentId: string;
      startTime: string;
      endTime: string;
      purpose: string;
      projectType: ProjectType;
      deadline?: string | null;
    }) =>
      apiRequest<{ request: AccessRequest }>('/api/requests', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decisionReason,
      overrideReason,
    }: {
      id: string;
      decisionReason?: string;
      overrideReason?: string;
    }) =>
      apiRequest<{ request: AccessRequest; booking: Booking }>(`/api/requests/${id}/approve`, {
        method: 'POST',
        body: {
          ...(decisionReason ? { decisionReason } : {}),
          ...(overrideReason ? { overrideReason } : {}),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['equipment', 'availability'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decisionReason }: { id: string; decisionReason: string }) =>
      apiRequest<{ request: AccessRequest }>(`/api/requests/${id}/reject`, {
        method: 'POST',
        body: { decisionReason },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest<{ request: AccessRequest }>(`/api/requests/${id}/cancel`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      description: string;
      category: string;
      department: string;
      location: string;
      capacity: number;
      operatingHours: { startTime: string; endTime: string; daysOfWeek: number[] };
      maxBookingDurationMinutes: number;
      requiredTrainings: string[];
      safetyRequirements: string[];
      tags: string[];
    }) => apiRequest<{ equipment: Equipment }>('/api/equipment', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useUpdateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      apiRequest<{ equipment: Equipment }>(`/api/equipment/${id}`, {
        method: 'PATCH',
        body: updates,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useArchiveEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived, reason }: { id: string; archived: boolean; reason?: string }) =>
      apiRequest<{ equipment: Equipment }>(`/api/equipment/${id}/archive`, {
        method: 'POST',
        body: { archived, ...(reason ? { reason } : {}) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      equipmentId: string;
      title: string;
      reason: string;
      startTime: string;
      endTime: string;
    }) =>
      apiRequest<{ maintenanceWindow: MaintenanceWindow }>('/api/maintenance', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maintenance'] });
      void qc.invalidateQueries({ queryKey: ['equipment', 'availability'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { active?: boolean; title?: string; reason?: string } }) =>
      apiRequest<{ maintenanceWindow: MaintenanceWindow }>(`/api/maintenance/${id}`, {
        method: 'PATCH',
        body: updates,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maintenance'] });
      void qc.invalidateQueries({ queryKey: ['equipment', 'availability'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useRestoreDemoData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ restored: boolean; message: string }>('/api/demo/restore', {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useAiRecommendations() {
  return useMutation({
    mutationFn: (payload: {
      equipmentId?: string;
      projectDescription: string;
      preferredStartTime?: string;
      preferredEndTime?: string;
    }) =>
      apiRequest<AiRecommendationsResponse>('/api/ai/recommendations', {
        method: 'POST',
        body: payload,
      }),
  });
}

export function useAiProjectMatching() {
  return useMutation({
    mutationFn: (payload: {
      projectDescription: string;
      department?: string;
      category?: string;
    }) =>
      apiRequest<AiProjectMatchingResponse>('/api/ai/project-matching', {
        method: 'POST',
        body: payload,
      }),
  });
}

export function useAiExplainScheduling() {
  return useMutation({
    mutationFn: (payload: { requestId: string }) =>
      apiRequest<AiSchedulingExplanationResponse>('/api/ai/explain-scheduling', {
        method: 'POST',
        body: payload,
      }),
  });
}

