import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { Server } from 'node:http';

let server: Server;
let BASE_URL: string;

describe('F07: Customer Authentication & OTP API', () => {
  const TEST_PHONE = '9871122334';
  const MOCK_OTP = '654321';
  let authCookie: string;

  beforeAll(async () => {
    await seedCatalog();

    await new Promise<void>((resolve) => {
      server = app.listen(4005, () => {
        BASE_URL = 'http://localhost:4005';
        resolve();
      });
    });

    // Clean up test data
    await prisma.otpVerification.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });
  });

  afterAll(async () => {
    // Clean up
    await prisma.otpVerification.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Rejects invalid phone number format', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '12345' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('valid 10-digit');
  });

  it('Sends OTP successfully and stores hashed verification record', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, mockOtp: MOCK_OTP }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const record = await prisma.otpVerification.findUnique({
      where: { phone: TEST_PHONE },
    });
    expect(record).not.toBeNull();
    expect(record!.attempts).toBe(0);
    expect(record!.otp_hash).toBeDefined();
  });

  it('Rate limits rapid successive OTP requests', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE }),
    });

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('wait a few seconds');
  });

  it('Fourth code request within 10 minutes is blocked', async () => {
    const RATE_LIMIT_PHONE = '9875566778';

    // Insert 3 prior requests into audit logs within the 10-minute window
    for (let i = 0; i < 3; i++) {
      await prisma.auditLog.create({
        data: {
          actor_id: RATE_LIMIT_PHONE,
          action: 'OTP_REQUESTED',
          entity: 'otp_verifications',
          entity_id: RATE_LIMIT_PHONE,
          created_at: new Date(Date.now() - (i + 1) * 60 * 1000), // 1, 2, 3 minutes ago
        },
      });
    }

    // Fourth request must be blocked
    const res = await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: RATE_LIMIT_PHONE }),
    });

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('Maximum 3 requests allowed every 10 minutes');

    // Clean up
    await prisma.auditLog.deleteMany({ where: { entity_id: RATE_LIMIT_PHONE } });
  });

  it('Expired code is rejected', async () => {
    const EXPIRED_PHONE = '9874455667';
    // Create an expired OTP verification record
    await prisma.otpVerification.upsert({
      where: { phone: EXPIRED_PHONE },
      update: {
        otp_hash: 'dummyhash',
        attempts: 0,
        expires_at: new Date(Date.now() - 60 * 1000), // 1 minute ago
      },
      create: {
        phone: EXPIRED_PHONE,
        otp_hash: 'dummyhash',
        attempts: 0,
        expires_at: new Date(Date.now() - 60 * 1000),
      },
    });

    const res = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: EXPIRED_PHONE,
        otp: '123456',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('OTP has expired');

    // Clean up
    await prisma.otpVerification.deleteMany({ where: { phone: EXPIRED_PHONE } });
  });

  it('Sixth wrong attempt is blocked', async () => {
    const ATTEMPTS_PHONE = '9873344556';
    const VALID_CODE = '556677';

    // Request an OTP
    const sendRes = await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ATTEMPTS_PHONE, mockOtp: VALID_CODE }),
    });
    expect(sendRes.status).toBe(200);

    // Attempts 1 to 4 fail
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: ATTEMPTS_PHONE, otp: '000000' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('attempt');
    }

    // 5th attempt fails and cancels the code
    const fifthRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ATTEMPTS_PHONE, otp: '000000' }),
    });
    expect(fifthRes.status).toBe(400);
    const fifthData = await fifthRes.json();
    expect(fifthData.error).toContain('cancelled');

    // 6th attempt is blocked, even if user now provides the right code!
    const sixthRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ATTEMPTS_PHONE, otp: VALID_CODE }),
    });
    expect(sixthRes.status).toBe(400);
    const sixthData = await sixthRes.json();
    expect(sixthData.error).toContain('cancelled');

    // Clean up
    await prisma.otpVerification.deleteMany({ where: { phone: ATTEMPTS_PHONE } });
    await prisma.auditLog.deleteMany({ where: { entity_id: ATTEMPTS_PHONE } });
  });

  it('Rejects incorrect OTP and increments attempt counter', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: TEST_PHONE,
        otp: '000000', // wrong OTP
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid verification code');

    const record = await prisma.otpVerification.findUnique({
      where: { phone: TEST_PHONE },
    });
    expect(record!.attempts).toBe(1);
  });

  it('Successfully verifies OTP, creates user, links past guest orders, and sets auth cookie', async () => {
    // 1. Create a prior guest order with this phone
    const guestOrder = await prisma.order.create({
      data: {
        order_no: `PLUK-TEST-GUEST-${Date.now().toString().slice(-6)}`,
        user_id: null,
        guest_name: 'Guest Customer',
        guest_phone: TEST_PHONE,
        address: { line1: 'MG Road', pincode: '411001' },
        status: 'CONFIRMED',
        subtotal_paise: 25000,
        delivery_fee_paise: 2000,
        total_paise: 27000,
        payment_method: 'COD',
        payment_status: 'PENDING_COLLECTION',
        idempotency_key: `guest-key-${Date.now()}`,
      },
    });

    // 2. Verify with valid OTP
    const res = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: TEST_PHONE,
        otp: MOCK_OTP,
        name: 'Dhiraj Kurangale',
      }),
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('auth_token=');
    authCookie = setCookie!.match(/auth_token=([^;]+)/)![0];

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.phone).toBe(TEST_PHONE);
    expect(data.user.name).toBe('Dhiraj Kurangale');

    // 3. Confirm user exists in DB
    const dbUser = await prisma.user.findUnique({
      where: { phone: TEST_PHONE },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.name).toBe('Dhiraj Kurangale');

    // 4. Confirm prior guest order was automatically linked to this user
    const updatedOrder = await prisma.order.findUnique({
      where: { id: guestOrder.id },
    });
    expect(updatedOrder!.user_id).toBe(dbUser!.id);
  });

  it('GET /api/auth/me returns authenticated user details with cookie', async () => {
    // Without cookie -> 401
    const unauthRes = await fetch(`${BASE_URL}/api/auth/me`);
    expect(unauthRes.status).toBe(401);

    // With cookie -> 200
    const authRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: authCookie },
    });
    expect(authRes.status).toBe(200);
    const data = await authRes.json();
    expect(data.user.phone).toBe(TEST_PHONE);
    expect(data.user.name).toBe('Dhiraj Kurangale');
  });

  it('GET /api/auth/orders returns user order history', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/orders`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.orders)).toBe(true);
    expect(data.orders.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/auth/logout deletes session and clears auth cookie', async () => {
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: authCookie },
    });

    expect(logoutRes.status).toBe(200);
    const setCookie = logoutRes.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('auth_token=;'); // cleared

    // Subsequent GET /api/auth/me fails with 401
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: authCookie },
    });
    expect(meRes.status).toBe(401);
  });

  it('Isolates cart between different users: User B never sees User A items after login', async () => {
    const PHONE_A = '9870000001';
    const PHONE_B = '9870000002';
    const MOCK_CODE = '112233';

    // 1. User A logs in
    await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: PHONE_A, mockOtp: MOCK_CODE }),
    });

    const verifyARes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: PHONE_A, otp: MOCK_CODE }),
    });
    const cookieA = verifyARes.headers.get('set-cookie')!;

    // 2. User A adds a product to cart
    const product = await prisma.product.findFirst({ where: { is_active: true, is_available: true } });
    const addRes = await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({ productId: product!.id, qty: 3 }),
    });
    expect(addRes.status).toBe(200);
    const cartA = await addRes.json();
    expect(cartA.item_count).toBe(3);

    // 3. User A logs out
    await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });

    // 4. User B logs in
    await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: PHONE_B, mockOtp: MOCK_CODE }),
    });

    const verifyBRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: PHONE_B, otp: MOCK_CODE }),
    });
    const cookieB = verifyBRes.headers.get('set-cookie')!;

    // 5. User B fetches their cart
    const cartBRes = await fetch(`${BASE_URL}/api/cart`, {
      headers: { Cookie: cookieB },
    });
    expect(cartBRes.status).toBe(200);
    const cartB = await cartBRes.json();

    // User B must have an empty cart, NOT User A's items!
    expect(cartB.item_count).toBe(0);
    expect(cartB.items).toEqual([]);

    // Clean up
    await prisma.cart.deleteMany({ where: { user: { phone: { in: [PHONE_A, PHONE_B] } } } });
    await prisma.user.deleteMany({ where: { phone: { in: [PHONE_A, PHONE_B] } } });
    await prisma.otpVerification.deleteMany({ where: { phone: { in: [PHONE_A, PHONE_B] } } });
  });
});

