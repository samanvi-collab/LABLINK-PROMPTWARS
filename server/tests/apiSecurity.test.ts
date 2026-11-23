import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { validateEnvironment } from '../src/config/env';
import { initializeFirebaseAdmin } from '../src/config/firebase';
import { DemoRepository } from '../src/repositories/DemoRepository';

function setupApp(mode: 'demo' | 'firebase' = 'demo') {
  if (mode === 'demo') {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      STORAGE_MODE: 'demo',
      AUTH_MODE: 'demo',
    });
    const repository = new DemoRepository();
    return createApp({ config, repository });
  }

  const config = validateEnvironment({
    NODE_ENV: 'test',
    STORAGE_MODE: 'firestore',
    AUTH_MODE: 'firebase',
    FIREBASE_PROJECT_ID: 'lablink-test-project',
  });
  const repository = new DemoRepository();
  const mockFirebaseAuth = {
    verifyIdToken: async () => {
      throw new Error('Invalid token');
    },
  } as unknown as Parameters<typeof createApp>[0]['firebaseAuth'];
  return createApp({ config, repository, firebaseAuth: mockFirebaseAuth });
}

function getNextWeekdaySlot(offsetDays: number, startHourIst: number, endHourIst: number) {
  const day = new Date(Date.now() + offsetDays * 86_400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day.getUTCDate()).padStart(2, '0');
  return {
    startTime: `${yyyy}-${mm}-${dd}T${String(startHourIst).padStart(2, '0')}:00:00+05:30`,
    endTime: `${yyyy}-${mm}-${dd}T${String(endHourIst).padStart(2, '0')}:00:00+05:30`,
  };
}

describe('Configuration & Mode Validation', () => {
  it('rejects invalid STORAGE_MODE + AUTH_MODE combinations', () => {
    expect(() =>
      validateEnvironment({ STORAGE_MODE: 'demo', AUTH_MODE: 'firebase' }),
    ).toThrow(/Invalid mode combination/);

    expect(() =>
      validateEnvironment({ STORAGE_MODE: 'firestore', AUTH_MODE: 'demo' }),
    ).toThrow(/Invalid mode combination/);
  });

  it('requires explicit ALLOW_DEMO_IN_PRODUCTION in production demo mode', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        STORAGE_MODE: 'demo',
        AUTH_MODE: 'demo',
      }),
    ).toThrow(/ALLOW_DEMO_IN_PRODUCTION/);

    const allowed = validateEnvironment({
      NODE_ENV: 'production',
      STORAGE_MODE: 'demo',
      AUTH_MODE: 'demo',
      ALLOW_DEMO_IN_PRODUCTION: 'true',
    });
    expect(allowed.demoMode).toBe(true);
  });

  it('fails clearly when Firestore mode is missing FIREBASE_PROJECT_ID', () => {
    expect(() =>
      validateEnvironment({
        STORAGE_MODE: 'firestore',
        AUTH_MODE: 'firebase',
      }),
    ).toThrow(/FIREBASE_PROJECT_ID/);

    const demoOnlyConfig = validateEnvironment({
      STORAGE_MODE: 'demo',
      AUTH_MODE: 'demo',
    });
    expect(() => initializeFirebaseAdmin(demoOnlyConfig)).toThrow(/Firebase Admin/);
  });
});

describe('API Validation, Authentication, Authorization & Security', () => {
  it('exposes safe health and public-config without secrets', async () => {
    const app = setupApp('demo');
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.body.timezone).toBe('Asia/Kolkata');
    expect(health.body.demoMode).toBe(true);
    expect(JSON.stringify(health.body)).not.toMatch(/secret|apiKey|token/i);

    const pub = await request(app).get('/api/public-config');
    expect(pub.status).toBe(200);
    expect(pub.body.appName).toBe('LABLINK');
    expect(pub.body.demoMode).toBe(true);
  });

  it('returns 401 when unauthenticated or using demo header in firebase mode', async () => {
    const demoApp = setupApp('demo');
    const unauth = await request(demoApp).get('/api/equipment');
    expect(unauth.status).toBe(401);

    const unknownUser = await request(demoApp)
      .get('/api/equipment')
      .set('x-demo-user-id', 'nonexistent-user');
    expect(unknownUser.status).toBe(401);

    const firebaseApp = setupApp('firebase');
    const demoHeaderRejected = await request(firebaseApp)
      .get('/api/equipment')
      .set('x-demo-user-id', 'stu-arjun');
    expect(demoHeaderRejected.status).toBe(401);

    const invalidBearer = await request(firebaseApp)
      .get('/api/equipment')
      .set('Authorization', 'Bearer bad-token');
    expect(invalidBearer.status).toBe(401);
  });

  it('returns 400 on invalid payloads and rejects unknown fields', async () => {
    const app = setupApp('demo');
    const slot = getNextWeekdaySlot(4, 10, 12);

    // Unknown field on booking
    const unknownField = await request(app)
      .post('/api/bookings')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-a100-node',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'Testing unknown field rejection',
        injectedAdminFlag: true,
      });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body.error.code).toBe('VALIDATION_ERROR');

    // startTime >= endTime
    const badRange = await request(app)
      .post('/api/bookings')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-a100-node',
        startTime: slot.endTime,
        endTime: slot.startTime,
        purpose: 'Reversed interval test',
      });
    expect(badRange.status).toBe(400);
  });

  it('enforces RBAC, resource ownership, and ignores client-supplied role headers', async () => {
    const app = setupApp('demo');

    // Student cannot create equipment even if spoofing x-user-role header
    const createEq = await request(app)
      .post('/api/equipment')
      .set('x-demo-user-id', 'stu-arjun')
      .set('x-user-role', 'Admin')
      .send({
        name: 'Unauthorized Microscope',
        description: 'Should be rejected for Student role',
        category: 'Optics',
        department: 'CSE',
        location: 'Room 99',
        capacity: 1,
        operatingHours: { startTime: '09:00', endTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] },
        maxBookingDurationMinutes: 120,
      });
    expect(createEq.status).toBe(403);

    // Student cannot approve requests, view analytics, or view audit logs
    const approveRes = await request(app)
      .post('/api/requests/req-seed-01/approve')
      .set('x-demo-user-id', 'stu-arjun')
      .send({});
    expect(approveRes.status).toBe(403);

    const analyticsRes = await request(app)
      .get('/api/analytics/overview')
      .set('x-demo-user-id', 'stu-arjun');
    expect(analyticsRes.status).toBe(403);

    const auditRes = await request(app)
      .get('/api/audit-logs')
      .set('x-demo-user-id', 'stu-arjun');
    expect(auditRes.status).toBe(403);

    // Resource-level auth: Student cannot cancel another student's booking
    const cancelOthers = await request(app)
      .post('/api/bookings/bkg-seed-01/cancel')
      .set('x-demo-user-id', 'stu-meera')
      .send({ reason: 'Unauthorized attempt' });
    expect(cancelOthers.status).toBe(403);

    // Faculty cannot archive equipment (Admin only)
    const facultyArchive = await request(app)
      .post('/api/equipment/eq-cse-a100-node/archive')
      .set('x-demo-user-id', 'fac-sharma')
      .send({ archived: true });
    expect(facultyArchive.status).toBe(403);
  });

  it('returns 404 for nonexistent resources and 409 with alternatives on conflicts', async () => {
    const app = setupApp('demo');

    const notFound = await request(app)
      .get('/api/equipment/eq-does-not-exist')
      .set('x-demo-user-id', 'stu-arjun');
    expect(notFound.status).toBe(404);

    // Create a booking for a capacity-1 equipment, then try to double-book the exact same slot
    const slot = getNextWeekdaySlot(7, 10, 12);
    const first = await request(app)
      .post('/api/bookings')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-cobot-arm',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'First confirmed booking',
      });
    expect(first.status).toBe(201);

    const conflict = await request(app)
      .post('/api/bookings')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-cobot-arm',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'Conflicting booking attempt',
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('SCHEDULING_CONFLICT');
    expect(conflict.body.error.alternatives).toBeDefined();
    expect(conflict.body.error.alternatives.timeSlots.length).toBeGreaterThan(0);
  });

  it('supports /api/me, /api/requests/:id/ranking RBAC, and overrideReason audit logging', async () => {
    const app = setupApp('demo');

    const meRes = await request(app)
      .get('/api/me')
      .set('x-demo-user-id', 'stu-arjun');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.id).toBe('stu-arjun');
    expect(meRes.body.user.role).toBe('Student');

    // Create two competing requests on the same slot (both Arjun and Meera have gpu-safety training)
    const slot = getNextWeekdaySlot(8, 10, 12);
    const req1 = await request(app)
      .post('/api/requests')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-a100-node',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'Capstone kinematics evaluation run',
        projectType: 'CAPSTONE',
      });
    expect(req1.status).toBe(201);

    const req2 = await request(app)
      .post('/api/requests')
      .set('x-demo-user-id', 'stu-meera')
      .send({
        equipmentId: 'eq-cse-a100-node',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'Personal benchmark test run',
        projectType: 'PERSONAL',
      });
    expect(req2.status).toBe(201);

    // Student cannot inspect ranking
    const studentRank = await request(app)
      .get(`/api/requests/${req2.body.request.id}/ranking`)
      .set('x-demo-user-id', 'stu-meera');
    expect(studentRank.status).toBe(403);

    // Faculty inspects lower-ranked request and sees requiresOverrideReason: true
    const facultyRank = await request(app)
      .get(`/api/requests/${req2.body.request.id}/ranking`)
      .set('x-demo-user-id', 'fac-sharma');
    expect(facultyRank.status).toBe(200);
    expect(facultyRank.body.competingRequests.length).toBeGreaterThanOrEqual(2);
    expect(facultyRank.body.isTopRanked).toBe(false);
    expect(facultyRank.body.requiresOverrideReason).toBe(true);

    // Faculty approves with overrideReason and verifies persistence
    const approveOverride = await request(app)
      .post(`/api/requests/${req2.body.request.id}/approve`)
      .set('x-demo-user-id', 'fac-sharma')
      .send({
        decisionReason: 'Urgent hardware demonstration today',
        overrideReason: 'External committee demo scheduled in 2 hours',
      });
    expect(approveOverride.status).toBe(200);
    expect(approveOverride.body.request.overrideReason).toBe(
      'External committee demo scheduled in 2 hours',
    );
  });
});

describe('Phase 3 Security Hardening Regressions', () => {
  it('sets production CSP and same-origin-allow-popups COOP headers without breaking Google Auth or fonts', async () => {
    const config = validateEnvironment({
      NODE_ENV: 'production',
      STORAGE_MODE: 'demo',
      AUTH_MODE: 'demo',
      ALLOW_DEMO_IN_PRODUCTION: 'true',
    });
    const repository = new DemoRepository();
    const app = createApp({ config, repository });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(res.headers['content-security-policy']).toContain('https://fonts.googleapis.com');
    expect(res.headers['content-security-policy']).toContain('https://apis.google.com');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects Firebase ID tokens with unverified emails (401)', async () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      STORAGE_MODE: 'firestore',
      AUTH_MODE: 'firebase',
      FIREBASE_PROJECT_ID: 'lablink-test-project',
    });
    const repository = new DemoRepository();
    const mockFirebaseAuth = {
      verifyIdToken: async () => ({
        uid: 'unverified-uid-1',
        email: 'unverified@campus.edu',
        email_verified: false,
      }),
    } as unknown as Parameters<typeof createApp>[0]['firebaseAuth'];
    const app = createApp({ config, repository, firebaseAuth: mockFirebaseAuth });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer valid-signature-unverified-email');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Verified email/i);
  });

  it('enforces per-user AI rate limiting independently across users and returns 413 on oversized JSON', async () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      STORAGE_MODE: 'demo',
      AUTH_MODE: 'demo',
      AI_RATE_LIMIT_MAX: '2',
    });
    const repository = new DemoRepository();
    const app = createApp({ config, repository });

    // Arjun makes 2 AI calls (allowed), 3rd returns 429 AI_RATE_LIMIT_EXCEEDED
    const r1 = await request(app)
      .post('/api/ai/project-matching')
      .set('x-demo-user-id', 'stu-arjun')
      .send({ projectDescription: 'Testing first rate-limit call for GPU compute' });
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post('/api/ai/project-matching')
      .set('x-demo-user-id', 'stu-arjun')
      .send({ projectDescription: 'Testing second rate-limit call for robotics arm' });
    expect(r2.status).toBe(200);

    const r3 = await request(app)
      .post('/api/ai/project-matching')
      .set('x-demo-user-id', 'stu-arjun')
      .send({ projectDescription: 'Testing third call should be rate limited' });
    expect(r3.status).toBe(429);
    expect(r3.body.error.code).toBe('AI_RATE_LIMIT_EXCEEDED');

    // Different user Meera still has her own independent per-user quota
    const meeraRes = await request(app)
      .post('/api/ai/project-matching')
      .set('x-demo-user-id', 'stu-meera')
      .send({ projectDescription: 'Independent user quota verification for FPGA bench' });
    expect(meeraRes.status).toBe(200);

    // Oversized JSON (>100kb) returns clean 413 JSON envelope instead of 500
    const hugePayload = await request(app)
      .post('/api/ai/project-matching')
      .set('x-demo-user-id', 'stu-meera')
      .send({ projectDescription: 'x'.repeat(120_000) });
    expect(hugePayload.status).toBe(413);
    expect(hugePayload.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});


