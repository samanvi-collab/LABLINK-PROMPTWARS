export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const USER_ROLES = ['Student', 'Faculty', 'Admin'] as const;
export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const BOOKING_STATUSES = ['CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;
export const PROJECT_TYPES = ['CAPSTONE', 'RESEARCH', 'COURSEWORK', 'CLUB', 'PERSONAL'] as const;

export const STORAGE_MODES = ['demo', 'firestore'] as const;
export const AUTH_MODES = ['demo', 'firebase'] as const;

export const FAIRNESS_WEIGHTS = {
  waitTime: 25,
  historicalUsage: 20,
  deadlineUrgency: 15,
  trainingCompliance: 10,
  academicPriority: 10,
  durationEfficiency: 10,
  departmentAlignment: 10,
} as const;

export const FAIRNESS_TOTAL_WEIGHT =
  FAIRNESS_WEIGHTS.waitTime +
  FAIRNESS_WEIGHTS.historicalUsage +
  FAIRNESS_WEIGHTS.deadlineUrgency +
  FAIRNESS_WEIGHTS.trainingCompliance +
  FAIRNESS_WEIGHTS.academicPriority +
  FAIRNESS_WEIGHTS.durationEfficiency +
  FAIRNESS_WEIGHTS.departmentAlignment;

export const DEFAULT_MAX_BOOKING_DURATION_MINUTES = 240;

export const ALLOWED_REQUEST_TRANSITIONS: Record<
  (typeof REQUEST_STATUSES)[number],
  readonly (typeof REQUEST_STATUSES)[number][]
> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const AI_DISCLAIMER = 'AI SUGGESTION — NOT OFFICIAL RANKING' as const;
export const AI_MAX_USER_INPUT_CHARS = 2000;

export const AUDIT_ACTIONS = [
  'EQUIPMENT_CREATED',
  'EQUIPMENT_UPDATED',
  'EQUIPMENT_ARCHIVED',
  'BOOKING_CREATED',
  'BOOKING_CANCELLED',
  'ACCESS_REQUEST_CREATED',
  'ACCESS_REQUEST_APPROVED',
  'ACCESS_REQUEST_REJECTED',
  'ACCESS_REQUEST_CANCELLED',
  'MAINTENANCE_CREATED',
  'MAINTENANCE_UPDATED',
  'DEMO_DATA_RESTORED',
  'USER_PROFILE_SYNCED',
  'AI_RECOMMENDATION_REQUESTED',
  'AI_PROJECT_MATCH_REQUESTED',
  'AI_EXPLANATION_REQUESTED',
] as const;
