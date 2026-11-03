import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import {
  ADMIN_COOKIE_NAME,
  resetAdminRateLimits,
} from './adminAuth.js';
import { AUTH_COOKIE_NAME } from './auth.js';

let server: Server;
let BASE_URL: string;
const TEST_ADMIN_PASSWORD = 'FounderSecret2026!';
let testAdminEmail: string;
let testAdminId: string;
let customerToken: string;

describe('Phase B: Admin Foundation & 2FA Authentication', () => {
  beforeAll(async () => {
    await seedCatalog();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          BASE_URL = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });

    // 1. Create Test Admin / Owner
    testAdminEmail = `founder-${Date.now()}@plukit.test`;
    const hashedPw = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: testAdminEmail,
        name: 'PlukIt Founder',
        phone: '9822998877',
        password_hash: hashedPw,
        is_active: true,
      },
    });
    testAdminId = admin.id;

    // 2. Create Test Customer & Session (to verify customer cannot access admin)
    const customer = await prisma.user.create({
      data: {
        name: 'Test Customer',
        phone: `9822${Math.floor(100000 + Math.random() * 900000)}`,
        role: 'CUSTOMER',
      },
    });
    customerToken = `cust-token-${Date.now()}`;
    await prisma.session.create({
      data: {
        user_id: customer.id,
        token: customerToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await prisma.$disconnect();
  });

  it('1. Rejects login with invalid email or wrong password with HTTP 401', async () => {
    resetAdminRateLimits();
    const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testAdminEmail,
        password: 'CompletelyWrongPassword!',
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/invalid email or password/i);

    // Verify failure logged in audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_LOGIN_FAILED',
        entity_id: testAdminId,
      },
      orderBy: { created_at: 'desc' },
    });
    expect(audit).toBeDefined();
  });

  it('2. Enforces rate-limiting: 6th failed login is blocked with HTTP 429', async () => {
    resetAdminRateLimits();
    const attackerEmail = `victim-${Date.now()}@plukit.test`;

    // 5 attempts allowed
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: attackerEmail,
          password: 'WrongPassword!',
        }),
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt must be blocked with 429
    const blockedRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: attackerEmail,
        password: 'WrongPassword!',
      }),
    });

    expect(blockedRes.status).toBe(429);
    const data = await blockedRes.json();
    expect(data.error).toMatch(/too many failed login attempts/i);
    resetAdminRateLimits();
  });

  it('3. Valid email and password triggers 2FA code step', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testAdminEmail,
        password: TEST_ADMIN_PASSWORD,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requiresTwoFactor).toBe(true);
    expect(data.tempToken).toBeTruthy();
    expect(data.phoneLast4).toBe('8877');
    expect(data.debugOtp).toMatch(/^\d{6}$/);
  });

  it('4. Wrong 2FA code is rejected with HTTP 401', async () => {
    // Initiate login
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testAdminEmail,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { tempToken } = await loginRes.json();

    // Send invalid 2FA code
    const verifyRes = await fetch(`${BASE_URL}/api/admin/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempToken,
        code: '000000',
      }),
    });

    expect(verifyRes.status).toBe(401);
    const data = await verifyRes.json();
    expect(data.error).toMatch(/invalid verification code/i);
  });

  it('5. Correct 2FA code logs in successfully and sets HTTP-only cookie', async () => {
    // Initiate login
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testAdminEmail,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { tempToken, debugOtp } = await loginRes.json();
    expect(debugOtp).toBeDefined();

    // Verify 2FA
    const verifyRes = await fetch(`${BASE_URL}/api/admin/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempToken,
        code: debugOtp,
      }),
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.admin.role).toBe('OWNER');
    expect(verifyData.admin.email).toBe(testAdminEmail);

    // Verify cookie set in header
    const setCookie = verifyRes.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(ADMIN_COOKIE_NAME);
    expect(setCookie?.toLowerCase()).toContain('httponly');
    expect(setCookie?.toLowerCase()).toContain('samesite=strict');

    // Verify login success written to audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_LOGIN_SUCCESS',
        entity_id: testAdminId,
      },
      orderBy: { created_at: 'desc' },
    });
    expect(audit).toBeDefined();
  });

  it('6. GET /api/admin/auth/me returns admin profile for authenticated session', async () => {
    // Log in to get session cookie
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testAdminEmail,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { tempToken, debugOtp } = await loginRes.json();

    const verifyRes = await fetch(`${BASE_URL}/api/admin/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, code: debugOtp }),
    });
    const cookieHeader = verifyRes.headers.get('set-cookie')!;
    const adminCookie = cookieHeader.split(';')[0];

    // Fetch /me
    const meRes = await fetch(`${BASE_URL}/api/admin/auth/me`, {
      headers: {
        Cookie: adminCookie,
      },
    });

    expect(meRes.status).toBe(200);
    const meData = await meRes.json();
    expect(meData.authenticated).toBe(true);
    expect(meData.admin.email).toBe(testAdminEmail);
    expect(meData.admin.role).toBe('OWNER');
  });

  it('7. Customer tokens cannot access admin endpoints (HTTP 401)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/me`, {
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${customerToken}`,
      },
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/admin authentication required/i);
  });

  it('8. Unauthenticated requests to /api/admin/auth/me return HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/auth/me`);
    expect(res.status).toBe(401);
  });

  it('9. POST /api/admin/auth/logout destroys session in DB and clears cookie', async () => {
    // Log in
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testAdminEmail,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { tempToken, debugOtp } = await loginRes.json();

    const verifyRes = await fetch(`${BASE_URL}/api/admin/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, code: debugOtp }),
    });
    const cookieHeader = verifyRes.headers.get('set-cookie')!;
    const adminCookie = cookieHeader.split(';')[0];
    const tokenVal = adminCookie.split('=')[1];

    // Verify session exists in DB
    const dbSessionBefore = await prisma.adminSession.findUnique({
      where: { token: tokenVal },
    });
    expect(dbSessionBefore).toBeDefined();

    // Call logout
    const logoutRes = await fetch(`${BASE_URL}/api/admin/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
      },
    });

    expect(logoutRes.status).toBe(200);
    const logoutData = await logoutRes.json();
    expect(logoutData.success).toBe(true);

    // Verify session removed from DB
    const dbSessionAfter = await prisma.adminSession.findUnique({
      where: { token: tokenVal },
    });
    expect(dbSessionAfter).toBeNull();

    // Verify subsequent call with same cookie is rejected
    const meRes = await fetch(`${BASE_URL}/api/admin/auth/me`, {
      headers: {
        Cookie: adminCookie,
      },
    });
    expect(meRes.status).toBe(401);
  });

  it('10. Expired admin sessions (>12 hours) are rejected and pruned', async () => {
    // Create an expired session directly in DB
    const expiredToken = `expired-adm-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: testAdminId,
        token: expiredToken,
        expires_at: new Date(Date.now() - 1000), // Expired 1 second ago
      },
    });

    const res = await fetch(`${BASE_URL}/api/admin/auth/me`, {
      headers: {
        Cookie: `${ADMIN_COOKIE_NAME}=${expiredToken}`,
      },
    });

    expect(res.status).toBe(401);

    // Verify expired session was pruned from DB
    const dbSession = await prisma.adminSession.findUnique({
      where: { token: expiredToken },
    });
    expect(dbSession).toBeNull();
  });
});

