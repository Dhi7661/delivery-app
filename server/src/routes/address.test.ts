import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { Server } from 'node:http';

let server: Server;
let BASE_URL: string;

describe('F11: Saved Addresses API', () => {
  const PHONE_A = '9870011111';
  const PHONE_B = '9870022222';
  let userAId: string;
  let userBId: string;
  let cookieA: string;
  let cookieB: string;
  let addressA1Id: string;

  beforeAll(async () => {
    await seedCatalog();

    await new Promise<void>((resolve) => {
      server = app.listen(4009, () => {
        BASE_URL = 'http://localhost:4009';
        resolve();
      });
    });

    // Create User A and User B
    const userA = await prisma.user.upsert({
      where: { phone: PHONE_A },
      update: {},
      create: { phone: PHONE_A, name: 'Customer A' },
    });
    userAId = userA.id;

    const userB = await prisma.user.upsert({
      where: { phone: PHONE_B },
      update: {},
      create: { phone: PHONE_B, name: 'Customer B' },
    });
    userBId = userB.id;

    // Create sessions
    const sessionA = await prisma.session.create({
      data: {
        user_id: userAId,
        token: 'session-token-user-a',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    cookieA = `auth_token=${sessionA.token}`;

    const sessionB = await prisma.session.create({
      data: {
        user_id: userBId,
        token: 'session-token-user-b',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    cookieB = `auth_token=${sessionB.token}`;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.address.deleteMany({
      where: { user_id: { in: [userAId, userBId] } },
    });
    await prisma.order.deleteMany({
      where: { user_id: { in: [userAId, userBId] } },
    });
    await prisma.session.deleteMany({
      where: { user_id: { in: [userAId, userBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/addresses`);
    expect(res.status).toBe(401);
  });

  it('Non-serviceable pincode is refused when saving', async () => {
    const res = await fetch(`${BASE_URL}/api/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        line1: 'Flat 401, Galaxy Apartments',
        landmark: 'Near Bus Stand',
        pincode: '999999', // Non-serviceable pincode
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('do not deliver to pincode 999999');
  });

  it('Saves a serviceable address and marks first address as default', async () => {
    const res = await fetch(`${BASE_URL}/api/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        line1: 'Flat 101, Sunshine Heights, Camp',
        landmark: 'Near Ruby Hall Clinic',
        pincode: '411001',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.address.line1).toBe('Flat 101, Sunshine Heights, Camp');
    expect(data.address.pincode).toBe('411001');
    expect(data.address.is_default).toBe(true);

    addressA1Id = data.address.id;
  });

  it('Customer B cannot read or edit Customer A addresses', async () => {
    // 1. Customer B attempts to GET addresses -> gets empty list (not Customer A's)
    const listRes = await fetch(`${BASE_URL}/api/addresses`, {
      headers: { Cookie: cookieB },
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.addresses).toEqual([]);

    // 2. Customer B attempts to PUT edit Customer A's address -> 404/unauthorized
    const editRes = await fetch(`${BASE_URL}/api/addresses/${addressA1Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieB,
      },
      body: JSON.stringify({
        line1: 'Malicious modification by B',
      }),
    });
    expect(editRes.status).toBe(404);

    // 3. Customer B attempts to DELETE Customer A's address -> 404/unauthorized
    const deleteRes = await fetch(`${BASE_URL}/api/addresses/${addressA1Id}`, {
      method: 'DELETE',
      headers: { Cookie: cookieB },
    });
    expect(deleteRes.status).toBe(404);

    // 4. Customer B attempts to PATCH default Customer A's address -> 404/unauthorized
    const patchRes = await fetch(`${BASE_URL}/api/addresses/${addressA1Id}/default`, {
      method: 'PATCH',
      headers: { Cookie: cookieB },
    });
    expect(patchRes.status).toBe(404);
  });

  it('Setting a second address as default updates previous default', async () => {
    // Customer A saves second address as default
    const res = await fetch(`${BASE_URL}/api/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        line1: 'Office 202, Platinum Towers, MG Road',
        pincode: '411001',
        is_default: true,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.address.is_default).toBe(true);
    const addressA2Id = data.address.id;

    // Verify first address is no longer default
    const firstAddr = await prisma.address.findUnique({ where: { id: addressA1Id } });
    expect(firstAddr!.is_default).toBe(false);

    // Revert default back to first address via PATCH /default
    const defaultRes = await fetch(`${BASE_URL}/api/addresses/${addressA1Id}/default`, {
      method: 'PATCH',
      headers: { Cookie: cookieA },
    });
    expect(defaultRes.status).toBe(200);
    const defaultData = await defaultRes.json();
    expect(defaultData.address.is_default).toBe(true);

    const secondAddr = await prisma.address.findUnique({ where: { id: addressA2Id } });
    expect(secondAddr!.is_default).toBe(false);
  });

  it('Enforces maximum 5 addresses per customer', async () => {
    // Customer A currently has 2 addresses. Add 3 more to reach 5.
    for (let i = 3; i <= 5; i++) {
      const res = await fetch(`${BASE_URL}/api/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieA,
        },
        body: JSON.stringify({
          line1: `Address number ${i}, Pune Camp`,
          pincode: '411001',
        }),
      });
      expect(res.status).toBe(201);
    }

    // Attempting to add a 6th address must be blocked
    const sixthRes = await fetch(`${BASE_URL}/api/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        line1: 'Address number 6, Over Limit',
        pincode: '411001',
      }),
    });

    expect(sixthRes.status).toBe(400);
    const sixthData = await sixthRes.json();
    expect(sixthData.error).toContain('maximum of 5 delivery addresses');
  });

  it('Checkout uses the default address and snapshots it into the order', async () => {
    // 1. Put an item in Customer A's cart
    const product = await prisma.product.findFirst({
      where: { is_active: true, is_available: true },
    });

    await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({ productId: product!.id, qty: 1 }),
    });

    // 2. Checkout without passing explicit address (uses default address automatically)
    const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        name: 'Customer A',
        phone: PHONE_A,
        idempotencyKey: `default-addr-order-${Date.now()}`,
      }),
    });

    expect(checkoutRes.status).toBe(201);
    const orderData = await checkoutRes.json();
    expect(orderData.success).toBe(true);

    // 3. Inspect order address snapshot in database
    const orderInDb = await prisma.order.findUnique({
      where: { id: orderData.orderId },
    });
    expect(orderInDb).toBeDefined();
    const snap = orderInDb!.address as any;
    expect(snap.line1).toBe('Flat 101, Sunshine Heights, Camp');
    expect(snap.pincode).toBe('411001');

    // 4. Modifying Customer A's address later does NOT alter the past order's snapshot
    await fetch(`${BASE_URL}/api/addresses/${addressA1Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        line1: 'Renamed Building 101, New Camp Road',
      }),
    });

    const orderAfterEdit = await prisma.order.findUnique({
      where: { id: orderData.orderId },
    });
    const snapAfter = orderAfterEdit!.address as any;
    expect(snapAfter.line1).toBe('Flat 101, Sunshine Heights, Camp'); // unchanged snapshot!
  });
});
