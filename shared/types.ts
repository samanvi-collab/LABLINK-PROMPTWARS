import {
  AUDIT_ACTIONS,
  AUTH_MODES,
  BOOKING_STATUSES,
  PROJECT_TYPES,
  REQUEST_STATUSES,
  STORAGE_MODES,
  USER_ROLES,
} from './constants';

export type UserRole = (typeof USER_ROLES)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];
export type StorageMode = (typeof STORAGE_MODES)[number];
export type AuthMode = (typeof AUTH_MODES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface OperatingHours {
  /** 24-hour HH:mm format in application timezone (Asia/Kolkata), e.g., "08:00" */
  startTime: string;
  /** 24-hour HH:mm format in application timezone (Asia/Kolkata), e.g., "20:00" */
  endTime: string;
  /** Days of week 0 (Sunday) through 6 (Saturday) */
  daysOfWeek: number[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  department: string;
  completedTrainings: string[];
  safetyCleared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Equipment {
  id: string;
  name: string;
  description: string;
  category: string;
  department: string;
  location: string;
  capacity: number;
  operatingHours: OperatingHours;
  maxBookingDurationMinutes: number;
  requiredTrainings: string[];
  safetyRequirements: string[];
  tags: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FairnessFactorScores {
  waitTime: number;
  historicalUsage: number;
  deadlineUrgency: number;
  trainingCompliance: number;
  academicPriority: number;
  durationEfficiency: number;
  departmentAlignment: number;
}

export interface FairnessBreakdown {
  factors: FairnessFactorScores;
  weights: {
    waitTime: 25;
    historicalUsage: 20;
    deadlineUrgency: 15;
    trainingCompliance: 10;
    academicPriority: 10;
    durationEfficiency: 10;
    departmentAlignment: 10;
  };
  weightedTotal: number;
}

export interface AccessRequest {
  id: string;
  equipmentId: string;
  requesterId: string;
  requesterName: string;
  requesterDepartment: string;
  startTime: string;
  endTime: string;
  purpose: string;
  projectType: ProjectType;
  deadline: string | null;
  status: RequestStatus;
  priorityScore: number;
  fairnessBreakdown: FairnessBreakdown;
  decisionReason?: string;
  overrideReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  bookingId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestRankingResponse {
  targetRequest: AccessRequest;
  competingRequests: AccessRequest[];
  topRankedRequestId: string | null;
  isTopRanked: boolean;
  requiresOverrideReason: boolean;
  schedulingEvaluation: SchedulingEvaluation;
}

export interface Booking {
  id: string;
  equipmentId: string;
  userId: string;
  userName: string;
  userDepartment: string;
  accessRequestId?: string;
  startTime: string;
  endTime: string;
  purpose: string;
  status: BookingStatus;
  cancelledBy?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceWindow {
  id: string;
  equipmentId: string;
  title: string;
  reason: string;
  startTime: string;
  endTime: string;
  createdBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole | 'System';
  action: AuditAction;
  targetType: 'Equipment' | 'Booking' | 'AccessRequest' | 'MaintenanceWindow' | 'System' | 'User';
  targetId: string;
  requestId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export type ConstraintViolationCode =
  | 'INVALID_TIME_RANGE'
  | 'PAST_DATE'
  | 'EXCEEDS_MAX_DURATION'
  | 'EQUIPMENT_ARCHIVED'
  | 'OUTSIDE_OPERATING_HOURS'
  | 'MISSING_TRAINING'
  | 'SAFETY_CLEARANCE_REQUIRED'
  | 'MAINTENANCE_CONFLICT'
  | 'CAPACITY_EXCEEDED';

export interface ConstraintViolation {
  code: ConstraintViolationCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface AlternativeTimeSlot {
  equipmentId: string;
  equipmentName: string;
  startTime: string;
  endTime: string;
  availableCapacity: number;
}

export interface AlternativeEquipmentOption {
  equipmentId: string;
  equipmentName: string;
  department: string;
  category: string;
  location: string;
  matchingTags: string[];
  startTime: string;
  endTime: string;
  availableCapacity: number;
}

export interface AlternativeSuggestions {
  timeSlots: AlternativeTimeSlot[];
  equivalentEquipment: AlternativeEquipmentOption[];
}

export interface SchedulingEvaluation {
  feasible: boolean;
  violations: ConstraintViolation[];
  conflictingBookingIds: string[];
  conflictingMaintenanceIds: string[];
  activeBookingsInWindow: number;
  remainingCapacity: number;
}

export interface AvailabilitySummary {
  equipmentId: string;
  equipmentName: string;
  capacity: number;
  archived: boolean;
  queryWindow: {
    startTime: string;
    endTime: string;
  };
  evaluation: SchedulingEvaluation;
  overlappingBookings: Array<{
    id: string;
    startTime: string;
    endTime: string;
    status: BookingStatus;
  }>;
  overlappingMaintenance: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
  }>;
  alternatives: AlternativeSuggestions;
}

export interface EquipmentUtilization {
  equipmentId: string;
  equipmentName: string;
  department: string;
  category: string;
  capacity: number;
  archived: boolean;
  totalBookings: number;
  bookedCapacityMinutes: number;
  availableOperatingCapacityMinutes: number;
  utilizationPercent: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
}

export interface DepartmentUsage {
  department: string;
  equipmentCount: number;
  totalBookings: number;
  bookedMinutes: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  averageUtilizationPercent: number;
}

export interface AnalyticsOverview {
  window: {
    startTime: string;
    endTime: string;
  };
  totals: {
    equipmentCount: number;
    activeEquipmentCount: number;
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    cancelledRequests: number;
    averageUtilizationPercent: number;
  };
  topDemandedEquipment: Array<{
    equipmentId: string;
    equipmentName: string;
    department: string;
    demandCount: number;
  }>;
}

export interface HealthStatus {
  status: 'ok';
  service: 'lablink-api';
  version: string;
  storageMode: StorageMode;
  authMode: AuthMode;
  demoMode: boolean;
  timezone: string;
  uptimeSeconds: number;
  timestamp: string;
  firebaseConfigured: boolean;
  geminiConfigured: boolean;
}

export interface PublicConfig {
  appName: 'LABLINK';
  version: string;
  storageMode: StorageMode;
  authMode: AuthMode;
  demoMode: boolean;
  timezone: string;
  firebaseConfigured: boolean;
  geminiConfigured: boolean;
  firebaseWebConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    storageBucket?: string;
    messagingSenderId?: string;
  } | null;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
    alternatives?: AlternativeSuggestions;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type AiResponseSource = 'ai' | 'rule-based';

export interface AiRecommendationItem {
  equipmentId: string;
  equipmentName: string;
  department: string;
  category: string;
  location: string;
  startTime: string;
  endTime: string;
  availableCapacity: number;
  suitabilityReason: string;
  deterministicVerified: true;
}

export interface AiRecommendationsResponse {
  source: AiResponseSource;
  model: string | null;
  cached: boolean;
  fallbackReason?: string;
  disclaimer: 'AI SUGGESTION — NOT OFFICIAL RANKING';
  authorityNote: string;
  targetWindow: {
    startTime: string;
    endTime: string;
  };
  recommendations: AiRecommendationItem[];
  blockerSummary?: string;
}

export interface AiProjectMatchItem {
  equipmentId: string;
  equipmentName: string;
  department: string;
  category: string;
  location: string;
  eligibleForUser: boolean;
  missingTrainings: string[];
  safetyClearanceRequired: boolean;
  fitSummary: string;
  suitabilityLabel: 'High Match' | 'Moderate Match' | 'Alternative Option';
}

export interface AiProjectMatchingResponse {
  source: AiResponseSource;
  model: string | null;
  cached: boolean;
  fallbackReason?: string;
  disclaimer: 'AI SUGGESTION — NOT OFFICIAL RANKING';
  authorityNote: string;
  matches: AiProjectMatchItem[];
}

export interface AiSchedulingExplanationResponse {
  source: AiResponseSource;
  model: string | null;
  cached: boolean;
  fallbackReason?: string;
  disclaimer: 'AI SUGGESTION — NOT OFFICIAL RANKING';
  authorityNote: string;
  officialContext: {
    requestId: string;
    equipmentId: string;
    equipmentName: string;
    status: RequestStatus;
    priorityScore: number;
    officialRank: number | null;
    totalCompeting: number;
    feasible: boolean;
    violations: ConstraintViolation[];
  };
  explanation: {
    summary: string;
    fairnessHighlights: string[];
    constraintNotes: string[];
    nextSteps: string[];
  };
}
