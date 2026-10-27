import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { Server } from 'node:http';
import { ADMIN_COOKIE_NAME } from './admin.js';

let server: Server;
let BASE_URL: string;

describe('F09: Admin Login & Session Authentication API', () => {
  const TEST_ADMIN_EMAIL = 'admin-test@plukit.in';
  const TEST_ADMIN_PASSWORD = 'CorrectAdminPass123!';
  let adminUserId: string;
  let validAdminToken: string;
  let adminCookieHeader: string;

  beforeAll(async () => {
    await seedCatalog();

    // Create test admin user with bcrypt hashed password
    const password_hash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);
    const admin = await prisma.adminUser.upsert({
      where: { email: TEST_ADMIN_EMAIL },
      update: {
        password_hash,
        is_active: true,
      },
      create: {
        email: TEST_ADMIN_EMAIL,
        name: 'Test Administrator',
        password_hash,
        is_active: true,
      },
    });
    adminUserId = admin.id;

    await new Promise<void>((resolve) => {
      server = app.listen(4008, () => {
        BASE_URL = 'http://localhost:4008';
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up test admin sessions, audit logs, and products
    await prisma.adminSession.deleteMany({
      where: { admin_user_id: adminUserId },
    });
    await prisma.adminUser.deleteMany({
      where: { email: TEST_ADMIN_EMAIL },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { action: { in: ['ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILED', 'ADMIN_LOGOUT', 'PRODUCT_CSV_UPLOAD'] } },
        ],
      },
    });

    await prisma.priceHistory.deleteMany({
      where: {
        product: {
          OR: [
            { name: { contains: 'Fresh Organic Oats' } },
            { name: { contains: 'Existing Honey' } },
            { name: { contains: 'Test' } },
          ],
        },
      },
    });

    await prisma.product.deleteMany({
      where: {
        OR: [
          { name: { contains: 'Fresh Organic Oats' } },
          { name: { contains: 'Existing Honey' } },
          { name: { contains: 'Test' } },
        ],
      },
    });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Wrong password is rejected with 401 and logged to audit_logs without password', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: 'IncorrectPassword999!',
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid email or password');

    // Verify audit log entry
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_LOGIN_FAILED',
        entity_id: TEST_ADMIN_EMAIL.toLowerCase(),
      },
      orderBy: { created_at: 'desc' },
    });

    expect(auditEntry).toBeDefined();
    expect(auditEntry?.action).toBe('ADMIN_LOGIN_FAILED');
    // Ensure raw password is NEVER logged
    const logStr = JSON.stringify(auditEntry);
    expect(logStr).not.toContain('IncorrectPassword999!');
  });

  it('Non-existent admin email is rejected with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'unknown-admin@plukit.in',
        password: 'any-password',
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid email or password');
  });

  it('Sixth failed attempt is blocked by rate limiting (429)', async () => {
    const targetEmail = 'rate-limit-target@plukit.in';
    const testIp = '127.0.0.99';

    // Insert 5 failed login entries within the 15-minute window
    for (let i = 0; i < 5; i++) {
      await prisma.auditLog.create({
        data: {
          actor_id: testIp,
          action: 'ADMIN_LOGIN_FAILED',
          entity: 'admin_users',
          entity_id: targetEmail,
          new_value: { reason: 'invalid_credentials' },
        },
      });
    }

    // Sixth attempt with that email/ip must be blocked with 429
    const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({
        email: targetEmail,
        password: 'any-password',
      }),
    });

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('Too many failed login attempts');
  });

  it('Successful login sets admin_token cookie, updates last_login_at, and writes audit log', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.admin.email).toBe(TEST_ADMIN_EMAIL);
    expect(data.token).toBeDefined();

    validAdminToken = data.token;

    // Check Set-Cookie header contains admin_token with Strict
    const rawCookie = res.headers.get('set-cookie');
    expect(rawCookie).toBeDefined();
    expect(rawCookie).toContain(ADMIN_COOKIE_NAME);
    expect(rawCookie?.toLowerCase()).toContain('samesite=strict');

    // Extract cookie for subsequent tests
    const match = rawCookie?.match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`));
    adminCookieHeader = `${ADMIN_COOKIE_NAME}=${match ? match[1] : validAdminToken}`;

    // Verify session in database
    const sessionInDb = await prisma.adminSession.findUnique({
      where: { token: validAdminToken },
    });
    expect(sessionInDb).toBeDefined();
    expect(sessionInDb?.admin_user_id).toBe(adminUserId);

    // Verify audit log for success
    const successLog = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_LOGIN_SUCCESS',
        actor_id: adminUserId,
      },
    });
    expect(successLog).toBeDefined();
  });

  it('GET /api/admin/auth/me returns admin profile with valid session', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/me`, {
      headers: {
        Cookie: adminCookieHeader,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.admin.email).toBe(TEST_ADMIN_EMAIL);
    expect(data.admin.name).toBe('Test Administrator');
  });

  it('Customer session cannot open /admin or call admin APIs', async () => {
    // Fake customer session token in auth_token cookie
    const res = await fetch(`${BASE_URL}/api/admin/auth/me`, {
      headers: {
        Cookie: 'auth_token=customer-regular-token-12345',
      },
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Admin authentication required');
  });

  it('Rejects admin product upload without admin session', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        csvContent: 'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees\n',
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Admin authentication required');
  });

  it('Allows admin product upload with valid admin session and creates audit log', async () => {
    const csv = [
      'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees',
      '[DUMMY] Green Valley Supermarket,Groceries,Fresh Organic Oats,BrandX,500 g,150.00,120.00',
    ].join('\n');

    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookieHeader,
      },
      body: JSON.stringify({ csvContent: csv, fileName: 'oats.csv' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.createdCount).toBe(1);

    // Verify audit log has admin user ID as actor
    const uploadAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'PRODUCT_CSV_UPLOAD',
        actor_id: adminUserId,
      },
    });
    expect(uploadAudit).toBeDefined();
  });

  it('Logout ends session, removes token from DB, and clears cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: adminCookieHeader,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Session must no longer exist in DB
    const sessionInDb = await prisma.adminSession.findUnique({
      where: { token: validAdminToken },
    });
    expect(sessionInDb).toBeNull();

    // Calling /me with that token must now be rejected
    const meRes = await fetch(`${BASE_URL}/api/admin/auth/me`, {
      headers: {
        Cookie: adminCookieHeader,
      },
    });
    expect(meRes.status).toBe(401);

    // Verify logout audit log
    const logoutLog = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_LOGOUT',
        actor_id: adminUserId,
      },
    });
    expect(logoutLog).toBeDefined();
  });
});
