import { z } from 'zod';
import { AUTH_MODES, DEFAULT_TIMEZONE, STORAGE_MODES } from '../../../shared/constants';
import { AuthMode, StorageMode } from '../../../shared/types';
import { ConfigurationError } from '../utils/errors';

const rawEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().trim().optional(),
  APP_TIMEZONE: z.string().trim().min(1).default(DEFAULT_TIMEZONE),
  APP_VERSION: z.string().trim().min(1).default('1.0.0'),
  STORAGE_MODE: z.enum(STORAGE_MODES).default('demo'),
  AUTH_MODE: z.enum(AUTH_MODES).default('demo'),
  ALLOW_DEMO_IN_PRODUCTION: z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  CORS_ORIGINS: z.string().trim().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(5).default(120),
  BOOKING_RATE_LIMIT_MAX: z.coerce.number().int().min(2).default(30),
  FIREBASE_PROJECT_ID: z.string().trim().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().trim().optional(),
  GCLOUD_PROJECT: z.string().trim().optional(),
  FIREBASE_DATABASE_ID: z.string().trim().default('(default)'),
  FIRESTORE_EMULATOR_HOST: z.string().trim().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().trim().optional(),
  FIREBASE_WEB_API_KEY: z.string().trim().optional(),
  FIREBASE_WEB_AUTH_DOMAIN: z.string().trim().optional(),
  FIREBASE_WEB_APP_ID: z.string().trim().optional(),
  FIREBASE_WEB_STORAGE_BUCKET: z.string().trim().optional(),
  FIREBASE_WEB_MESSAGING_SENDER_ID: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-4-hydrogen'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8_000),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(2).max(500).default(20),
  AI_CACHE_TTL_MS: z.coerce.number().int().min(5_000).max(600_000).default(60_000),
  AI_CACHE_MAX_ENTRIES: z.coerce.number().int().min(8).max(500).default(64),
});

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  appUrl?: string;
  timezone: string;
  version: string;
  storageMode: StorageMode;
  authMode: AuthMode;
  demoMode: boolean;
  allowDemoInProduction: boolean;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  bookingRateLimitMax: number;
  firebase: {
    projectId: string | null;
    databaseId: string;
    firestoreEmulatorHost?: string;
    authEmulatorHost?: string;
    webConfig: {
      apiKey: string;
      authDomain: string;
      projectId: string;
      appId: string;
      storageBucket?: string;
      messagingSenderId?: string;
    } | null;
  };
  gemini: {
    apiKey?: string;
    configured: boolean;
    model: string;
    timeoutMs: number;
    rateLimitMax: number;
    cacheTtlMs: number;
    cacheMaxEntries: number;
  };
}

export function validateEnvironment(rawEnv: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = rawEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigurationError('Invalid environment configuration', parsed.error.flatten());
  }

  const data = parsed.data;

  // Validate timezone using Intl
  try {
    Intl.DateTimeFormat('en-US', { timeZone: data.APP_TIMEZONE });
  } catch {
    throw new ConfigurationError(`Invalid APP_TIMEZONE: "${data.APP_TIMEZONE}"`);
  }

  // Enforce allowed STORAGE_MODE + AUTH_MODE pairs ONLY: demo+demo OR firestore+firebase
  const isDemoPair = data.STORAGE_MODE === 'demo' && data.AUTH_MODE === 'demo';
  const isFirestorePair = data.STORAGE_MODE === 'firestore' && data.AUTH_MODE === 'firebase';

  if (!isDemoPair && !isFirestorePair) {
    throw new ConfigurationError(
      `Invalid mode combination: STORAGE_MODE="${data.STORAGE_MODE}" with AUTH_MODE="${data.AUTH_MODE}". Only (demo + demo) or (firestore + firebase) are permitted.`,
    );
  }

  if (data.NODE_ENV === 'production' && isDemoPair && !data.ALLOW_DEMO_IN_PRODUCTION) {
    throw new ConfigurationError(
      'Demo mode cannot run in production without explicitly setting ALLOW_DEMO_IN_PRODUCTION=true.',
    );
  }

  const projectId =
    data.FIREBASE_PROJECT_ID || data.GOOGLE_CLOUD_PROJECT || data.GCLOUD_PROJECT || null;

  if (isFirestorePair && !projectId) {
    throw new ConfigurationError(
      'STORAGE_MODE=firestore requires FIREBASE_PROJECT_ID (or GOOGLE_CLOUD_PROJECT) to be configured.',
    );
  }

  const corsOrigins = (data.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const hasFullWebConfig =
    Boolean(data.FIREBASE_WEB_API_KEY) &&
    Boolean(data.FIREBASE_WEB_AUTH_DOMAIN) &&
    Boolean(data.FIREBASE_WEB_APP_ID) &&
    Boolean(projectId);

  return {
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    appUrl: data.APP_URL || undefined,
    timezone: data.APP_TIMEZONE,
    version: data.APP_VERSION,
    storageMode: data.STORAGE_MODE,
    authMode: data.AUTH_MODE,
    demoMode: isDemoPair,
    allowDemoInProduction: Boolean(data.ALLOW_DEMO_IN_PRODUCTION),
    corsOrigins,
    rateLimitWindowMs: data.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: data.RATE_LIMIT_MAX_REQUESTS,
    bookingRateLimitMax: data.BOOKING_RATE_LIMIT_MAX,
    firebase: {
      projectId,
      databaseId: data.FIREBASE_DATABASE_ID || '(default)',
      firestoreEmulatorHost: data.FIRESTORE_EMULATOR_HOST || undefined,
      authEmulatorHost: data.FIREBASE_AUTH_EMULATOR_HOST || undefined,
      webConfig: hasFullWebConfig
        ? {
            apiKey: data.FIREBASE_WEB_API_KEY!,
            authDomain: data.FIREBASE_WEB_AUTH_DOMAIN!,
            projectId: projectId!,
            appId: data.FIREBASE_WEB_APP_ID!,
            ...(data.FIREBASE_WEB_STORAGE_BUCKET
              ? { storageBucket: data.FIREBASE_WEB_STORAGE_BUCKET }
              : {}),
            ...(data.FIREBASE_WEB_MESSAGING_SENDER_ID
              ? { messagingSenderId: data.FIREBASE_WEB_MESSAGING_SENDER_ID }
              : {}),
          }
        : null,
    },
    gemini: {
      apiKey:
        data.GEMINI_API_KEY && data.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
          ? data.GEMINI_API_KEY
          : undefined,
      configured: Boolean(data.GEMINI_API_KEY && data.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      model: data.GEMINI_MODEL || 'gemini-4-hydrogen',
      timeoutMs: data.GEMINI_TIMEOUT_MS,
      rateLimitMax: data.AI_RATE_LIMIT_MAX,
      cacheTtlMs: data.AI_CACHE_TTL_MS,
      cacheMaxEntries: data.AI_CACHE_MAX_ENTRIES,
    },
  };
}
