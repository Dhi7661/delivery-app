import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { Server } from 'node:http';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/db.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './admin.js';
import {
  ALLOWED_TRANSITIONS,
  isValidStatusTransition,
  getNextAllowedStatuses,
  isFinalStatus,
  requiresCancellationReason,
} from '../lib/orderStatus.js';

let server: Server;
let BASE_URL: string;

describe('F12: Order Status State Machine (Unit Tests)', () => {
  const allStatuses: OrderStatus[] = [
    'PLACED',
    'PAYMENT_PENDING',
    'PAYMENT_FAILED',
    'CONFIRMED',
    'SENT_TO_SHOP',
    'PACKED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED_DELIVERY',
    'CANCELLED',
    'RETURNED',
    'CLOSED',
  ];

  it('Every allowed transition in the specification returns true', () => {
    // Expected transitions per docs/features.md:
    const expectedTransitions: [OrderStatus, OrderStatus][] = [
      ['PLACED', 'PAYMENT_PENDING'],
      ['PLACED', 'CONFIRMED'],
      ['PAYMENT_PENDING', 'CONFIRMED'],
      ['PAYMENT_PENDING', 'PAYMENT_FAILED'],
      ['PAYMENT_FAILED', 'PLACED'],
      ['PAYMENT_FAILED', 'CANCELLED'],
      ['CONFIRMED', 'SENT_TO_SHOP'],
      ['CONFIRMED', 'CANCELLED'],
      ['SENT_TO_SHOP', 'PACKED'],
      ['SENT_TO_SHOP', 'CANCELLED'],
      ['PACKED', 'OUT_FOR_DELIVERY'],
      ['OUT_FOR_DELIVERY', 'DELIVERED'],
      ['OUT_FOR_DELIVERY', 'FAILED_DELIVERY'],
      ['FAILED_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['FAILED_DELIVERY', 'CANCELLED'],
      ['DELIVERED', 'RETURNED'],
    ];

    for (const [from, to] of expectedTransitions) {
      expect(isValidStatusTransition(from, to), `Expected ${from} -> ${to} to be valid`).toBe(true);
    }
  });

  it('Every non-allowed transition returns false', () => {
    for (const from of allStatuses) {
      const allowed = ALLOWED_TRANSITIONS[from];
      for (const to of allStatuses) {
        if (!allowed.includes(to)) {
          expect(
            isValidStatusTransition(from, to),
            `Expected ${from} -> ${to} to be invalid`
          ).toBe(false);
        }
      }
    }
  });

  it('CANCELLED and RETURNED are strictly final states', () => {
    expect(isFinalStatus('CANCELLED')).toBe(true);
    expect(isFinalStatus('RETURNED')).toBe(true);
    expect(getNextAllowedStatuses('CANCELLED')).toEqual([]);
    expect(getNextAllowedStatuses('RETURNED')).toEqual([]);

    for (const target of allStatuses) {
      expect(isValidStatusTransition('CANCELLED', target)).toBe(false);
      expect(isValidStatusTransition('RETURNED', target)).toBe(false);
    }
  });

  it('requiresCancellationReason returns true for post-pack cancellations', () => {
    expect(requiresCancellationReason('FAILED_DELIVERY', 'CANCELLED')).toBe(true);
    expect(requiresCancellationReason('PACKED', 'CANCELLED')).toBe(true);
    expect(requiresCancellationReason('CONFIRMED', 'CANCELLED')).toBe(false);
    expect(requiresCancellationReason('SENT_TO_SHOP', 'CANCELLED')).toBe(false);
  });
});

describe('F12: Admin Order Board & Status Transition API (Integration Tests)', () => {
  let adminToken: string;
  let adminId: string;
  let testOrderId: string;
  let testOrderNo: string;

  beforeAll(async () => {
    // 1. Create or ensure test admin
    const adminEmail = `order-board-admin-${Date.now()}@plukit.test`;
    const hashed = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Order Board Admin',
        password_hash: hashed,
      },
    });
    adminId = admin.id;

    // Create session
    adminToken = `order-board-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 2. Create sample order in PLACED state with items and delivery
    testOrderNo = `PLUK-TEST-${Date.now()}`;
    const order = await prisma.order.create({
      data: {
        order_no: testOrderNo,
        guest_name: 'Test Customer',
        guest_phone: '9876543210',
        address: { line1: '123 Test Camp Road', pincode: '411001' },
        status: 'PLACED',
        subtotal_paise: 50000,
        delivery_fee_paise: 0,
        total_paise: 50000,
        idempotency_key: `key-${Date.now()}`,
        delivery: {
          create: {
            status: 'PENDING',
          },
        },
      },
      include: { delivery: true },
    });
    testOrderId = order.id;

    // Start server on dedicated port
    await new Promise<void>((resolve) => {
      server = app.listen(4011, () => {
        BASE_URL = 'http://localhost:4011';
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testOrderId) {
      await prisma.auditLog.deleteMany({
        where: { entity: 'orders', entity_id: testOrderId },
      });
      await prisma.delivery.deleteMany({ where: { order_id: testOrderId } });
      await prisma.order.deleteMany({ where: { id: testOrderId } });
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
    const res = await fetch(`${BASE_URL}/api/admin/orders`);
    expect(res.status).toBe(401);
  });

  it('Lists orders with status counts and allowedTransitions', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.orders)).toBe(true);
    expect(body.counts).toBeDefined();
    expect(body.counts.total).toBeGreaterThanOrEqual(1);

    const found = body.orders.find((o: any) => o.id === testOrderId);
    expect(found).toBeDefined();
    expect(found.status).toBe('PLACED');
    expect(found.allowedTransitions).toEqual(['PAYMENT_PENDING', 'CONFIRMED']);
  });

  it('Filters orders by status and date', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders?status=PLACED&search=${testOrderNo}`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders.length).toBe(1);
    expect(body.orders[0].order_no).toBe(testOrderNo);
  });

  it('Gets single order detail with audit history', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.order.id).toBe(testOrderId);
    expect(body.order.allowedTransitions).toEqual(['PAYMENT_PENDING', 'CONFIRMED']);
    expect(Array.isArray(body.auditLogs)).toBe(true);
  });

  it('Refuses an invalid transition (PLACED -> DELIVERED) with 400', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid status transition from PLACED to DELIVERED');
  });

  it('Executes valid lifecycle transitions and creates audit logs: PLACED -> CONFIRMED -> SENT_TO_SHOP -> PACKED -> OUT_FOR_DELIVERY -> DELIVERED -> RETURNED', async () => {
    // 1. PLACED -> CONFIRMED
    const step1Res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    const step1 = await step1Res.json();
    expect(step1Res.status).toBe(200);
    expect(step1.order.status).toBe('CONFIRMED');
    expect(step1.order.allowedTransitions).toEqual(['SENT_TO_SHOP', 'CANCELLED']);

    // 2. Confirm COD with customer (Spec Section 4)
    await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/confirm-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ method: 'PHONE' }),
    });

    // 2. CONFIRMED -> SENT_TO_SHOP
    const step2Res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'SENT_TO_SHOP' }),
    });
    const step2 = await step2Res.json();
    expect(step2Res.status).toBe(200);
    expect(step2.order.status).toBe('SENT_TO_SHOP');
    expect(step2.order.allowedTransitions).toEqual(['PACKED', 'CANCELLED']);

    // 3. SENT_TO_SHOP -> PACKED
    const step3Res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'PACKED' }),
    });
    const step3 = await step3Res.json();
    expect(step3Res.status).toBe(200);
    expect(step3.order.status).toBe('PACKED');
    expect(step3.order.allowedTransitions).toEqual(['OUT_FOR_DELIVERY']);

    // 4. PACKED -> OUT_FOR_DELIVERY
    const step4Res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'OUT_FOR_DELIVERY' }),
    });
    const step4 = await step4Res.json();
    expect(step4Res.status).toBe(200);
    expect(step4.order.status).toBe('OUT_FOR_DELIVERY');
    expect(step4.order.delivery?.status).toBe('OUT_FOR_DELIVERY');
    expect(step4.order.allowedTransitions).toEqual(['DELIVERED', 'FAILED_DELIVERY']);

    // 5. OUT_FOR_DELIVERY -> DELIVERED
    const step5Res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    const step5 = await step5Res.json();
    expect(step5Res.status).toBe(200);
    expect(step5.order.status).toBe('DELIVERED');
    expect(step5.order.payment_status).toBe('SUCCESS');
    expect(step5.order.delivery?.status).toBe('DELIVERED');
    expect(step5.order.allowedTransitions).toEqual(['RETURNED']);

    // 6. DELIVERED -> RETURNED
    const step6Res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'RETURNED' }),
    });
    const step6 = await step6Res.json();
    expect(step6Res.status).toBe(200);
    expect(step6.order.status).toBe('RETURNED');
    expect(step6.order.allowedTransitions).toEqual([]);

    // 7. From RETURNED, any further transition must be refused (terminal)
    const step7Res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    expect(step7Res.status).toBe(400);

    // Verify Audit Logs count and content
    const logs = await prisma.auditLog.findMany({
      where: { entity: 'orders', entity_id: testOrderId, action: 'ORDER_STATUS_UPDATE' },
      orderBy: { created_at: 'asc' },
    });

    expect(logs.length).toBe(6);

    const codLog = await prisma.auditLog.findFirst({
      where: { entity: 'orders', entity_id: testOrderId, action: 'CUSTOMER_COD_CONFIRMED' },
    });
    expect(codLog).toBeDefined();
    expect(logs[0].action).toBe('ORDER_STATUS_UPDATE');
    expect((logs[0].old_value as any).status).toBe('PLACED');
    expect((logs[0].new_value as any).status).toBe('CONFIRMED');
    expect(logs[0].actor_id).toBe(adminId);

    expect((logs[5].old_value as any).status).toBe('DELIVERED');
    expect((logs[5].new_value as any).status).toBe('RETURNED');
  });

  it('Cancellation from FAILED_DELIVERY requires an explicit reason', async () => {
    // Create an order in FAILED_DELIVERY status
    const failedOrder = await prisma.order.create({
      data: {
        order_no: `PLUK-FAIL-${Date.now()}`,
        guest_name: 'Failed Delivery Customer',
        guest_phone: '9876543211',
        address: { line1: '456 Camp Road', pincode: '411001' },
        status: 'FAILED_DELIVERY',
        subtotal_paise: 30000,
        delivery_fee_paise: 2000,
        total_paise: 32000,
        idempotency_key: `key-fail-${Date.now()}`,
      },
    });

    // Attempt cancel without reason -> should fail with 400
    const noReasonRes = await fetch(`${BASE_URL}/api/admin/orders/${failedOrder.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });

    expect(noReasonRes.status).toBe(400);
    const noReasonData = await noReasonRes.json();
    expect(noReasonData.error).toContain('cancellation reason is required');

    // Cancel with valid reason -> should succeed
    const withReasonRes = await fetch(`${BASE_URL}/api/admin/orders/${failedOrder.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      body: JSON.stringify({ status: 'CANCELLED', reason: 'Customer unreachable after 3 attempts' }),
    });

    expect(withReasonRes.status).toBe(200);
    const withReasonData = await withReasonRes.json();
    expect(withReasonData.order.status).toBe('CANCELLED');

    // Clean up
    await prisma.auditLog.deleteMany({ where: { entity: 'orders', entity_id: failedOrder.id } });
    await prisma.order.deleteMany({ where: { id: failedOrder.id } });
  });
});
