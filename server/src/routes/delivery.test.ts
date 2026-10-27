import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { Server } from 'node:http';
import { prisma } from '../lib/db.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './admin.js';

let server: Server;
let BASE_URL: string;

describe('F13: Delivery List and Cash Collection API', () => {
  let adminToken: string;
  let adminId: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    // 1. Create or ensure test admin
    const adminEmail = `delivery-admin-${Date.now()}@plukit.test`;
    const hashed = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Delivery Founder',
        password_hash: hashed,
      },
    });
    adminId = admin.id;

    // Create admin session
    adminToken = `delivery-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Start server on dedicated test port 4012
    await new Promise<void>((resolve) => {
      server = app.listen(4012, () => {
        BASE_URL = 'http://localhost:4012';
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up created orders, deliveries, and audit logs
    if (createdOrderIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: 'deliveries', entity_id: { in: createdOrderIds } },
      });
      await prisma.delivery.deleteMany({
        where: { order_id: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
    if (adminId) {
      await prisma.adminSession.deleteMany({ where: { admin_user_id: adminId } });
      await prisma.adminUser.deleteMany({ where: { id: adminId } });
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('Rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/deliveries`);
    expect(res.status).toBe(401);
  });

  it('Start delivery (PACKED -> OUT_FOR_DELIVERY) succeeds and assigns to founder', async () => {
    // Create test order in PACKED status
    const order = await prisma.order.create({
      data: {
        order_no: `PLUK-DEL-${Date.now()}-1`,
        guest_name: 'Delivery Customer 1',
        guest_phone: '9876543210',
        address: { line1: 'Flat 101 Camp Road', pincode: '411001' },
        status: 'PACKED',
        subtotal_paise: 40000,
        delivery_fee_paise: 0,
        total_paise: 40000,
        idempotency_key: `key-del-1-${Date.now()}`,
        delivery: {
          create: { status: 'PENDING' },
        },
      },
    });
    createdOrderIds.push(order.id);

    const res = await fetch(`${BASE_URL}/api/admin/deliveries/${order.id}/start`, {
      method: 'POST',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.order.status).toBe('OUT_FOR_DELIVERY');
    expect(body.order.delivery.status).toBe('OUT_FOR_DELIVERY');
    expect(body.order.delivery.assigned_to).toBe(adminId);
  });

  it('Refuses to start delivery if order is not PACKED', async () => {
    // Order in SENT_TO_SHOP
    const order = await prisma.order.create({
      data: {
        order_no: `PLUK-DEL-${Date.now()}-2`,
        guest_name: 'Customer Shop',
        guest_phone: '9876543211',
        address: { line1: 'Flat 102 Camp Road', pincode: '411001' },
        status: 'SENT_TO_SHOP',
        subtotal_paise: 30000,
        delivery_fee_paise: 0,
        total_paise: 30000,
        idempotency_key: `key-del-2-${Date.now()}`,
      },
    });
    createdOrderIds.push(order.id);

    const res = await fetch(`${BASE_URL}/api/admin/deliveries/${order.id}/start`, {
      method: 'POST',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Order must be in PACKED status');
  });

  it('Delivered is refused if order is not in OUT_FOR_DELIVERY', async () => {
    // Order still in PACKED
    const order = await prisma.order.create({
      data: {
        order_no: `PLUK-DEL-${Date.now()}-3`,
        guest_name: 'Customer 3',
        guest_phone: '9876543212',
        address: { line1: 'Flat 103 Camp Road', pincode: '411001' },
        status: 'PACKED',
        subtotal_paise: 25000,
        delivery_fee_paise: 2000,
        total_paise: 27000,
        idempotency_key: `key-del-3-${Date.now()}`,
      },
    });
    createdOrderIds.push(order.id);

    const res = await fetch(`${BASE_URL}/api/admin/deliveries/${order.id}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ cashCollectedPaise: 27000 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('A delivery can be marked Delivered only from OUT_FOR_DELIVERY');
  });

  it('Cash collected not equal to total is refused unless a note is added', async () => {
    // Order in OUT_FOR_DELIVERY with total ₹500 (50000 paise)
    const order = await prisma.order.create({
      data: {
        order_no: `PLUK-DEL-${Date.now()}-4`,
        guest_name: 'Cash Mismatch Customer',
        guest_phone: '9876543213',
        address: { line1: 'Flat 104 Camp Road', pincode: '411001' },
        status: 'OUT_FOR_DELIVERY',
        subtotal_paise: 50000,
        delivery_fee_paise: 0,
        total_paise: 50000,
        idempotency_key: `key-del-4-${Date.now()}`,
        delivery: {
          create: { status: 'OUT_FOR_DELIVERY' },
        },
      },
    });
    createdOrderIds.push(order.id);

    // Attempt to collect ₹450 without note (₹50 short)
    const noNoteRes = await fetch(`${BASE_URL}/api/admin/deliveries/${order.id}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ cashCollectedPaise: 45000 }), // missing note
    });

    expect(noNoteRes.status).toBe(400);
    const noNoteBody = await noNoteRes.json();
    expect(noNoteBody.error).toContain('A note explaining the difference is required');

    // Supply note explaining shortage -> should succeed
    const withNoteRes = await fetch(`${BASE_URL}/api/admin/deliveries/${order.id}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({
        cashCollectedPaise: 45000,
        cashNote: 'Customer did not have ₹50 change, will collect on next order',
      }),
    });

    expect(withNoteRes.status).toBe(200);
    const withNoteBody = await withNoteRes.json();
    expect(withNoteBody.order.status).toBe('DELIVERED');
    expect(withNoteBody.order.delivery.cod_collected_paise).toBe(45000);
    expect(withNoteBody.order.delivery.cash_note).toContain('did not have ₹50 change');
  });

  it('Daily COD summary matches the sum of delivered COD orders', async () => {
    // Create an exact delivered order for ₹350
    const exactOrder = await prisma.order.create({
      data: {
        order_no: `PLUK-DEL-${Date.now()}-5`,
        guest_name: 'Exact Customer',
        guest_phone: '9876543214',
        address: { line1: 'Flat 105 Camp Road', pincode: '411001' },
        status: 'OUT_FOR_DELIVERY',
        subtotal_paise: 35000,
        delivery_fee_paise: 0,
        total_paise: 35000,
        idempotency_key: `key-del-5-${Date.now()}`,
        delivery: {
          create: { status: 'OUT_FOR_DELIVERY' },
        },
      },
    });
    createdOrderIds.push(exactOrder.id);

    // Deliver exact order
    const deliverRes = await fetch(`${BASE_URL}/api/admin/deliveries/${exactOrder.id}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ cashCollectedPaise: 35000 }),
    });
    expect(deliverRes.status).toBe(200);

    // Fetch daily summary
    const todayStr = new Date().toISOString().split('T')[0];
    const listRes = await fetch(`${BASE_URL}/api/admin/deliveries?date=${todayStr}&status=ALL`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.summary).toBeDefined();

    // Summary checks
    expect(listBody.summary.expectedCashPaise).toBeGreaterThanOrEqual(85000); // 50000 + 35000 from tests
    expect(listBody.summary.collectedCashPaise).toBeGreaterThanOrEqual(80000); // 45000 + 35000 from tests
    expect(listBody.summary.differencePaise).toBe(
      listBody.summary.collectedCashPaise - listBody.summary.expectedCashPaise
    );
  });

  it('Failed delivery records reason from allowed list', async () => {
    const order = await prisma.order.create({
      data: {
        order_no: `PLUK-DEL-${Date.now()}-6`,
        guest_name: 'Unreachable Customer',
        guest_phone: '9876543215',
        address: { line1: 'Flat 106 Camp Road', pincode: '411001' },
        status: 'OUT_FOR_DELIVERY',
        subtotal_paise: 20000,
        delivery_fee_paise: 2000,
        total_paise: 22000,
        idempotency_key: `key-del-6-${Date.now()}`,
        delivery: {
          create: { status: 'OUT_FOR_DELIVERY' },
        },
      },
    });
    createdOrderIds.push(order.id);

    // Invalid reason rejected
    const invalidRes = await fetch(`${BASE_URL}/api/admin/deliveries/${order.id}/failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ reason: 'random invalid reason' }),
    });
    expect(invalidRes.status).toBe(400);

    // Valid reason (no answer) accepted
    const validRes = await fetch(`${BASE_URL}/api/admin/deliveries/${order.id}/failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ reason: 'no answer', note: 'Phone switched off on 3 attempts' }),
    });

    expect(validRes.status).toBe(200);
    const validBody = await validRes.json();
    expect(validBody.order.status).toBe('FAILED_DELIVERY');
    expect(validBody.order.delivery.status).toBe('FAILED');
    expect(validBody.order.delivery.failure_reason).toContain('no answer: Phone switched off on 3 attempts');
  });
});
