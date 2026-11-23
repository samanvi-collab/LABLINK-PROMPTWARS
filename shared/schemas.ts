import { z } from 'zod';
import {
  AI_MAX_USER_INPUT_CHARS,
  AUDIT_ACTIONS,
  BOOKING_STATUSES,
  PROJECT_TYPES,
  REQUEST_STATUSES,
} from './constants';

export const safeIdSchema = z
  .string()
  .trim()
  .min(1, 'ID is required')
  .max(128, 'ID must be at most 128 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'ID must contain only alphanumeric characters, underscores, or hyphens');

export const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((value) => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
    if (!isoRegex.test(value)) {
      return false;
    }
    return !Number.isNaN(Date.parse(value));
  }, 'Must be a valid ISO-8601 timestamp with timezone offset or Z');

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const operatingHoursSchema = z
  .object({
    startTime: z.string().regex(hhmmRegex, 'startTime must be HH:mm (00:00–23:59)'),
    endTime: z.string().regex(hhmmRegex, 'endTime must be HH:mm (00:00–23:59)'),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'At least one operating day is required')
      .max(7),
  })
  .strict()
  .refine((val) => val.startTime < val.endTime, {
    message: 'Operating hours startTime must be earlier than endTime',
    path: ['endTime'],
  });

export const createEquipmentSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(5).max(1500),
    category: z.string().trim().min(2).max(80),
    department: z.string().trim().min(2).max(80),
    location: z.string().trim().min(2).max(150),
    capacity: z.number().int().min(1).max(100),
    operatingHours: operatingHoursSchema,
    maxBookingDurationMinutes: z.number().int().min(15).max(1440),
    requiredTrainings: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    safetyRequirements: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    tags: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  })
  .strict();

export const updateEquipmentSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().min(5).max(1500).optional(),
    category: z.string().trim().min(2).max(80).optional(),
    department: z.string().trim().min(2).max(80).optional(),
    location: z.string().trim().min(2).max(150).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    operatingHours: operatingHoursSchema.optional(),
    maxBookingDurationMinutes: z.number().int().min(15).max(1440).optional(),
    requiredTrainings: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    safetyRequirements: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const archiveEquipmentSchema = z
  .object({
    archived: z.boolean().default(true),
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .strict();

export const createBookingSchema = z
  .object({
    equipmentId: safeIdSchema,
    startTime: isoDateTimeSchema,
    endTime: isoDateTimeSchema,
    purpose: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine((val) => Date.parse(val.startTime) < Date.parse(val.endTime), {
    message: 'startTime must be strictly earlier than endTime',
    path: ['endTime'],
  });

export const cancelActionSchema = z
  .object({
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .strict();

export const createAccessRequestSchema = z
  .object({
    equipmentId: safeIdSchema,
    startTime: isoDateTimeSchema,
    endTime: isoDateTimeSchema,
    purpose: z.string().trim().min(5).max(600),
    projectType: z.enum(PROJECT_TYPES).default('COURSEWORK'),
    deadline: isoDateTimeSchema.nullable().optional(),
  })
  .strict()
  .refine((val) => Date.parse(val.startTime) < Date.parse(val.endTime), {
    message: 'startTime must be strictly earlier than endTime',
    path: ['endTime'],
  });

export const approveRequestSchema = z
  .object({
    decisionReason: z.string().trim().min(2).max(400).optional(),
    overrideReason: z
      .string()
      .trim()
      .min(3, 'Override reason must be at least 3 characters')
      .max(400)
      .optional(),
  })
  .strict();

export const rejectRequestSchema = z
  .object({
    decisionReason: z.string().trim().min(3, 'Rejection reason must be at least 3 characters').max(400),
  })
  .strict();

export const createMaintenanceSchema = z
  .object({
    equipmentId: safeIdSchema,
    title: z.string().trim().min(3).max(120),
    reason: z.string().trim().min(5).max(500),
    startTime: isoDateTimeSchema,
    endTime: isoDateTimeSchema,
  })
  .strict()
  .refine((val) => Date.parse(val.startTime) < Date.parse(val.endTime), {
    message: 'startTime must be strictly earlier than endTime',
    path: ['endTime'],
  });

export const updateMaintenanceSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    reason: z.string().trim().min(5).max(500).optional(),
    startTime: isoDateTimeSchema.optional(),
    endTime: isoDateTimeSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided for maintenance update',
  });

export const idParamSchema = z
  .object({
    id: safeIdSchema,
  })
  .strict();

export const availabilityQuerySchema = z
  .object({
    startTime: isoDateTimeSchema,
    endTime: isoDateTimeSchema,
  })
  .strict()
  .refine((val) => Date.parse(val.startTime) < Date.parse(val.endTime), {
    message: 'startTime must be strictly earlier than endTime',
    path: ['endTime'],
  });

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const equipmentFilterQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    department: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    includeArchived: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const bookingsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    equipmentId: safeIdSchema.optional(),
    status: z.enum(BOOKING_STATUSES).optional(),
    startTime: isoDateTimeSchema.optional(),
    endTime: isoDateTimeSchema.optional(),
  })
  .strict();

export const requestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    equipmentId: safeIdSchema.optional(),
    status: z.enum(REQUEST_STATUSES).optional(),
    sortBy: z.enum(['fairness', 'createdAt']).default('fairness'),
  })
  .strict();

export const maintenanceQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    equipmentId: safeIdSchema.optional(),
    activeOnly: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const auditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    actorId: safeIdSchema.optional(),
    targetId: safeIdSchema.optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
  })
  .strict();

export const analyticsQuerySchema = z
  .object({
    startTime: isoDateTimeSchema.optional(),
    endTime: isoDateTimeSchema.optional(),
    department: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine(
    (val) => {
      if (val.startTime && val.endTime) {
        return Date.parse(val.startTime) < Date.parse(val.endTime);
      }
      return true;
    },
    {
      message: 'startTime must be strictly earlier than endTime',
      path: ['endTime'],
    },
  );

export const aiRecommendationsSchema = z
  .object({
    equipmentId: safeIdSchema.optional(),
    projectDescription: z
      .string()
      .trim()
      .min(5, 'Project description must be at least 5 characters')
      .max(
        AI_MAX_USER_INPUT_CHARS,
        `Project description must be at most ${AI_MAX_USER_INPUT_CHARS} characters`,
      ),
    preferredStartTime: isoDateTimeSchema.optional(),
    preferredEndTime: isoDateTimeSchema.optional(),
  })
  .strict()
  .refine(
    (val) => {
      const hasStart = Boolean(val.preferredStartTime);
      const hasEnd = Boolean(val.preferredEndTime);
      return hasStart === hasEnd;
    },
    {
      message: 'Both preferredStartTime and preferredEndTime must be provided together',
      path: ['preferredEndTime'],
    },
  )
  .refine(
    (val) => {
      if (val.preferredStartTime && val.preferredEndTime) {
        return Date.parse(val.preferredStartTime) < Date.parse(val.preferredEndTime);
      }
      return true;
    },
    {
      message: 'preferredStartTime must be strictly earlier than preferredEndTime',
      path: ['preferredEndTime'],
    },
  );

export const aiProjectMatchingSchema = z
  .object({
    projectDescription: z
      .string()
      .trim()
      .min(5, 'Project description must be at least 5 characters')
      .max(
        AI_MAX_USER_INPUT_CHARS,
        `Project description must be at most ${AI_MAX_USER_INPUT_CHARS} characters`,
      ),
    department: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const aiExplainSchedulingSchema = z
  .object({
    requestId: safeIdSchema,
  })
  .strict();
