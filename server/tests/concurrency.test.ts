import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { validateEnvironment } from '../src/config/env';
import { DemoRepository } from '../src/repositories/DemoRepository';
import { runTransactionWithRetry } from '../src/repositories/FirestoreRepository';

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

describe('Concurrency & Transaction Contention', () => {
  it('allows exactly one winner when two approvals race on single-capacity equipment', async () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      STORAGE_MODE: 'demo',
      AUTH_MODE: 'demo',
    });
    const repository = new DemoRepository();
    const app = createApp({ config, repository });
    const slot = getNextWeekdaySlot(8, 13, 15);

    // Create two competing PENDING access requests for the same capacity=1 equipment & time slot
    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/requests')
        .set('x-demo-user-id', 'stu-arjun')
        .send({
          equipmentId: 'eq-cse-cobot-arm', // capacity 1
          startTime: slot.startTime,
          endTime: slot.endTime,
          purpose: 'Competing request alpha',
          projectType: 'CAPSTONE',
        }),
      request(app)
        .post('/api/requests')
        .set('x-demo-user-id', 'stu-arjun')
        .send({
          equipmentId: 'eq-cse-cobot-arm',
          startTime: slot.startTime,
          endTime: slot.endTime,
          purpose: 'Competing request beta',
          projectType: 'RESEARCH',
        }),
    ]);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const id1 = r1.body.request.id;
    const id2 = r2.body.request.id;

    // Fire two simultaneous faculty approval requests
    const [approve1, approve2] = await Promise.all([
      request(app)
        .post(`/api/requests/${id1}/approve`)
        .set('x-demo-user-id', 'fac-sharma')
        .send({ decisionReason: 'Faculty 1 approval' }),
      request(app)
        .post(`/api/requests/${id2}/approve`)
        .set('x-demo-user-id', 'adm-rao')
        .send({ decisionReason: 'Admin concurrent approval' }),
    ]);

    const statuses = [approve1.status, approve2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = approve1.status === 200 ? approve1 : approve2;
    const loser = approve1.status === 409 ? approve1 : approve2;
    const loserId = approve1.status === 409 ? id1 : id2;

    expect(winner.body.booking.status).toBe('CONFIRMED');
    expect(loser.body.error.code).toBe('APPROVAL_CONFLICT');
    expect(loser.body.error.alternatives).toBeDefined();

    // Verify losing request remains PENDING and total overlapping confirmed bookings == 1
    const loserReq = await repository.getAccessRequestById(loserId);
    expect(loserReq?.status).toBe('PENDING');

    const activeBookings = await repository.getBookingsForEquipmentInRange(
      'eq-cse-cobot-arm',
      slot.startTime,
      slot.endTime,
    );
    expect(activeBookings).toHaveLength(1);
  });

  it('allows up to capacity=2 concurrent winners and blocks the 3rd', async () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      STORAGE_MODE: 'demo',
      AUTH_MODE: 'demo',
    });
    const repository = new DemoRepository();
    const app = createApp({ config, repository });
    const slot = getNextWeekdaySlot(9, 10, 12);

    const createReq = (purpose: string) =>
      request(app)
        .post('/api/requests')
        .set('x-demo-user-id', 'stu-meera')
        .send({
          equipmentId: 'eq-ece-fpga-rack', // capacity 2
          startTime: slot.startTime,
          endTime: slot.endTime,
          purpose,
          projectType: 'RESEARCH',
        });

    const [a, b, c] = await Promise.all([
      createReq('FPGA test 1'),
      createReq('FPGA test 2'),
      createReq('FPGA test 3'),
    ]);

    const [resA, resB, resC] = await Promise.all([
      request(app).post(`/api/requests/${a.body.request.id}/approve`).set('x-demo-user-id', 'fac-iyer').send({}),
      request(app).post(`/api/requests/${b.body.request.id}/approve`).set('x-demo-user-id', 'fac-iyer').send({}),
      request(app).post(`/api/requests/${c.body.request.id}/approve`).set('x-demo-user-id', 'adm-rao').send({}),
    ]);

    const codes = [resA.status, resB.status, resC.status].sort();
    expect(codes).toEqual([200, 200, 409]);

    const activeBookings = await repository.getBookingsForEquipmentInRange(
      'eq-ece-fpga-rack',
      slot.startTime,
      slot.endTime,
    );
    expect(activeBookings).toHaveLength(2);
  });

  it('retries transient Firestore transaction ABORTED contention errors cleanly', async () => {
    let attempts = 0;
    const result = await runTransactionWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const err = new Error('10 ABORTED: cross-transaction contention') as Error & { code: number };
          err.code = 10;
          throw err;
        }
        return 'committed';
      },
      5,
      1,
    );

    expect(result).toBe('committed');
    expect(attempts).toBe(3);

    // Fails once maxAttempts exceeded
    await expect(
      runTransactionWithRetry(
        async () => {
          const err = new Error('ABORTED') as Error & { code: string };
          err.code = 'ABORTED';
          throw err;
        },
        2,
        1,
      ),
    ).rejects.toThrow(/ABORTED/);
  });
});
