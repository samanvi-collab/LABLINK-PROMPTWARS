import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { validateEnvironment } from '../src/config/env';
import { DemoRepository } from '../src/repositories/DemoRepository';

function setupTestServer() {
  const config = validateEnvironment({
    NODE_ENV: 'test',
    STORAGE_MODE: 'demo',
    AUTH_MODE: 'demo',
  });
  const repository = new DemoRepository();
  const app = createApp({ config, repository });
  return { app, repository };
}

function getNextWeekdaySlot(offsetDays: number, startHourIst: number, endHourIst: number) {
  const day = new Date(Date.now() + offsetDays * 86_400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day.getUTCDate()).padStart(2, '0');
  const sh = String(startHourIst).padStart(2, '0');
  const eh = String(endHourIst).padStart(2, '0');
  return {
    startTime: `${yyyy}-${mm}-${dd}T${sh}:00:00+05:30`,
    endTime: `${yyyy}-${mm}-${dd}T${eh}:00:00+05:30`,
  };
}

describe('Access Request & Booking State Machine', () => {
  it('verifies PENDING request is not a confirmed booking and does not consume capacity', async () => {
    const { app, repository } = setupTestServer();
    const slot = getNextWeekdaySlot(4, 10, 12);

    const res1 = await request(app)
      .post('/api/requests')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-cobot-arm', // capacity 1
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'Inverse kinematics validation test 1',
        projectType: 'CAPSTONE',
      });
    expect(res1.status).toBe(201);
    expect(res1.body.request.status).toBe('PENDING');

    // A second student can still submit a PENDING request for the same slot
    const res2 = await request(app)
      .post('/api/requests')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-cobot-arm',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'Inverse kinematics validation test 2',
        projectType: 'RESEARCH',
      });
    expect(res2.status).toBe(201);

    const bookings = await repository.getBookingsForEquipmentInRange(
      'eq-cse-cobot-arm',
      slot.startTime,
      slot.endTime,
    );
    expect(bookings).toHaveLength(0);
  });

  it('enforces valid transitions and rejects invalid or duplicate transitions', async () => {
    const { app } = setupTestServer();
    const slot = getNextWeekdaySlot(5, 11, 13);

    // 1. Create and approve -> PENDING -> APPROVED
    const createRes = await request(app)
      .post('/api/requests')
      .set('x-demo-user-id', 'stu-arjun')
      .send({
        equipmentId: 'eq-cse-a100-node',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'Transformer pruning experiment',
        projectType: 'RESEARCH',
      });
    expect(createRes.status).toBe(201);
    const reqId = createRes.body.request.id;

    const approveRes = await request(app)
      .post(`/api/requests/${reqId}/approve`)
      .set('x-demo-user-id', 'fac-sharma')
      .send({ decisionReason: 'Approved for research' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.request.status).toBe('APPROVED');
    expect(approveRes.body.booking.status).toBe('CONFIRMED');
    const bookingId = approveRes.body.booking.id;

    // Duplicate approval must fail with 409
    const dupApprove = await request(app)
      .post(`/api/requests/${reqId}/approve`)
      .set('x-demo-user-id', 'fac-sharma')
      .send({});
    expect(dupApprove.status).toBe(409);

    // Rejecting an already APPROVED request must fail with 409
    const rejectAfterApprove = await request(app)
      .post(`/api/requests/${reqId}/reject`)
      .set('x-demo-user-id', 'fac-sharma')
      .send({ decisionReason: 'Too late' });
    expect(rejectAfterApprove.status).toBe(409);

    // Cancelling an already APPROVED request must fail with 409
    const cancelAfterApprove = await request(app)
      .post(`/api/requests/${reqId}/cancel`)
      .set('x-demo-user-id', 'stu-arjun')
      .send({});
    expect(cancelAfterApprove.status).toBe(409);

    // Booking cancellation -> duplicate cancellation must fail with 409
    const cancelBooking = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('x-demo-user-id', 'stu-arjun')
      .send({ reason: 'Completed early' });
    expect(cancelBooking.status).toBe(200);
    expect(cancelBooking.body.booking.status).toBe('CANCELLED');

    const dupCancelBooking = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('x-demo-user-id', 'stu-arjun')
      .send({});
    expect(dupCancelBooking.status).toBe(409);
  });

  it('blocks approval with 409 and keeps request PENDING if availability changed before approval', async () => {
    const { app, repository } = setupTestServer();
    const slot = getNextWeekdaySlot(6, 14, 16);

    const createRes = await request(app)
      .post('/api/requests')
      .set('x-demo-user-id', 'stu-meera')
      .send({
        equipmentId: 'eq-ece-rf-vna',
        startTime: slot.startTime,
        endTime: slot.endTime,
        purpose: 'RF coupler characterization',
        projectType: 'CAPSTONE',
      });
    expect(createRes.status).toBe(201);
    const reqId = createRes.body.request.id;

    // Faculty schedules maintenance over the same window before approving
    const mwRes = await request(app)
      .post('/api/maintenance')
      .set('x-demo-user-id', 'fac-iyer')
      .send({
        equipmentId: 'eq-ece-rf-vna',
        title: 'Emergency VNA Port Repair',
        reason: 'Connector replacement required',
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    expect(mwRes.status).toBe(201);

    const approveRes = await request(app)
      .post(`/api/requests/${reqId}/approve`)
      .set('x-demo-user-id', 'fac-iyer')
      .send({});
    expect(approveRes.status).toBe(409);
    expect(approveRes.body.error.alternatives).toBeDefined();

    // Request must still remain PENDING and no booking created
    const reqAfter = await repository.getAccessRequestById(reqId);
    expect(reqAfter?.status).toBe('PENDING');
  });
});
