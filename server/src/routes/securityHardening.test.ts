import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { resetAllRateLimits, createRateLimiter } from '../lib/rateLimit.js';
import { ADMIN_COOKIE_NAME } from './admin.js';
import { AUTH_COOKIE_NAME } from './auth.js';
import express from 'express';

let server: Server;
let BASE_URL: string;
let adminToken: string;
let customerAToken: string;
let customerBToken: string;
let customerAId: string;
let customerBId: string;
let orderAOrderNo: string;

describe('F19: Legal Pages and Security Hardening', () => {
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

    // 1. Create Admin User & Session
    const adminEmail = `f19-admin-${Date.now()}@plukit.test`;
    const hashedAdminPw = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Hardening Admin',
        password_hash: hashedAdminPw,
      },
    });

    adminToken = `f19-adm-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 2. Create Customer A & Session
    const phoneA = `9822${Math.floor(100000 + Math.random() * 900000)}`;
    const userA = await prisma.user.create({
      data: {
        phone: phoneA,
        name: 'Customer A',
        email: `customer.a.${Date.now()}@plukit.test`,
      },
    });
    customerAId = userA.id;
    customerAToken = `f19-custA-token-${Date.now()}`;
    await prisma.session.create({
      data: {
        user_id: userA.id,
        token: customerAToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 3. Create Customer B & Session
    const phoneB = `9822${Math.floor(100000 + Math.random() * 900000)}`;
    const userB = await prisma.user.create({
      data: {
        phone: phoneB,
        name: 'Customer B',
        email: `customer.b.${Date.now()}@plukit.test`,
      },
    });
    customerBId = userB.id;
    customerBToken = `f19-custB-token-${Date.now()}`;
    await prisma.session.create({
      data: {
        user_id: userB.id,
        token: customerBToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 4. Create an Order owned by Customer A
    const shop = await prisma.shop.findFirst();
    const product = await prisma.product.findFirst();
    const orderNo = `PLUK-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    orderAOrderNo = orderNo;

    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        idempotency_key: `f19-idem-${Date.now()}-${Math.random()}`,
        user_id: userA.id,
        status: 'CONFIRMED',
        payment_method: 'COD',
        payment_status: 'PENDING',
        address: { line1: '101 Lotus Towers, Shivajinagar, Pune', pincode: '411005' },
        subtotal_paise: 35000,
        delivery_fee_paise: 0,
        total_paise: 35000,
        items: {
          create: [
            {
              product_id: product!.id,
              shop_id: shop!.id,
              qty: 2,
              mrp_paise: 20000,
              shop_price_paise: 15000,
              selling_price_paise: 17500,
              line_total_paise: 35000,
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Security Headers & CORS Enforcement', () => {
    it('sets security headers (Helmet: CSP, HSTS, X-Content-Type-Options, X-Frame-Options)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/health`);
      expect(res.status).toBe(200);

      // Check Content-Security-Policy
      const csp = res.headers.get('content-security-policy');
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");

      // Check nosniff
      const nosniff = res.headers.get('x-content-type-options');
      expect(nosniff).toBe('nosniff');

      // Check X-Frame-Options
      const frameOptions = res.headers.get('x-frame-options');
      expect(frameOptions).toBe('SAMEORIGIN');

      // Check Strict-Transport-Security (HSTS)
      const hsts = res.headers.get('strict-transport-security');
      expect(hsts).toBeTruthy();
      expect(hsts).toContain('max-age=31536000');
    });

    it('allows CORS requests from authorized frontend domain', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/health`, {
        headers: {
          Origin: 'http://localhost:3000',
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('blocks CORS requests from unauthorized external origins', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/health`, {
        headers: {
          Origin: 'https://evil-unauthorized-tracker.com',
        },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('CORS blocked');
    });
  });

  describe('2. Admin Route Protection & Customer Authorization', () => {
    it('rejects unauthenticated requests to admin endpoints with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/orders`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Admin authentication required');
    });

    it('rejects customer tokens attempting to access admin endpoints with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/orders`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${customerAToken}`,
        },
      });
      expect(res.status).toBe(401);
    });

    it('allows authenticated admin to access admin routes with HTTP 200', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/orders`, {
        headers: {
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orders).toBeDefined();
    });
  });

  describe('3. Customer Order Ownership Isolation', () => {
    it('allows Customer A to view their own order with HTTP 200', async () => {
      const res = await fetch(`${BASE_URL}/api/orders/${orderAOrderNo}`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${customerAToken}`,
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.order.order_no).toBe(orderAOrderNo);
      expect(data.isVerified).toBe(true);
    });

    it('prevents Customer B from viewing Customer As order with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/orders/${orderAOrderNo}`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${customerBToken}`,
        },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('You do not have permission to view this order');
    });

    it('prevents Customer B from cancelling Customer As order with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/orders/${orderAOrderNo}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAME}=${customerBToken}`,
        },
        body: JSON.stringify({ reason: 'Malicious cancellation attempt' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('You do not have permission to cancel this order');
    });

    it('prevents unauthenticated guest from viewing customer order with mismatched phone with HTTP 403', async () => {
      const res = await fetch(`${BASE_URL}/api/orders/${orderAOrderNo}?phone=9999999999`);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Phone number does not match');
    });
  });

  describe('4. Rate Limiting Mechanism', () => {
    it('sets X-RateLimit headers and returns HTTP 429 when threshold exceeded', async () => {
      resetAllRateLimits();

      // Test rate limiter middleware with a tight threshold (3 hits per minute)
      const testLimiterApp = express();
      const testLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: 'Rate limit test exceeded',
        keyGenerator: () => 'test-ip-client',
      });

      testLimiterApp.get('/test-rate-limit', testLimiter, (_req, res) => {
        res.json({ ok: true });
      });

      const testServer: Server = await new Promise((resolve) => {
        const s = testLimiterApp.listen(0, () => resolve(s));
      });
      const addr = testServer.address();
      const testPort = addr && typeof addr === 'object' ? addr.port : 0;
      const testUrl = `http://localhost:${testPort}/test-rate-limit`;

      const testHeaders = { 'x-test-rate-limit': 'true' };

      try {
        // Hit 1: Remaining = 2
        const r1 = await fetch(testUrl, { headers: testHeaders });
        expect(r1.status).toBe(200);
        expect(r1.headers.get('x-ratelimit-limit')).toBe('3');
        expect(r1.headers.get('x-ratelimit-remaining')).toBe('2');

        // Hit 2: Remaining = 1
        const r2 = await fetch(testUrl, { headers: testHeaders });
        expect(r2.status).toBe(200);
        expect(r2.headers.get('x-ratelimit-remaining')).toBe('1');

        // Hit 3: Remaining = 0
        const r3 = await fetch(testUrl, { headers: testHeaders });
        expect(r3.status).toBe(200);
        expect(r3.headers.get('x-ratelimit-remaining')).toBe('0');

        // Hit 4: Exceeded -> HTTP 429
        const r4 = await fetch(testUrl, { headers: testHeaders });
        expect(r4.status).toBe(429);
        expect(r4.headers.get('retry-after')).toBeTruthy();
        const data4 = await r4.json();
        expect(data4.error).toBe('Rate limit test exceeded');
        expect(data4.retryAfter).toBeGreaterThan(0);
      } finally {
        await new Promise<void>((resolve) => testServer.close(() => resolve()));
      }
    });
  });

  describe('5. Legal Pages & Footer Navigation Verification', () => {
    it('verifies client Footer links exist and point to all required legal policies', () => {
      const footerPath = path.resolve(__dirname, '../../../client/components/ui/Footer.tsx');
      expect(fs.existsSync(footerPath)).toBe(true);

      const content = fs.readFileSync(footerPath, 'utf8');
      expect(content).toContain('/terms');
      expect(content).toContain('/privacy');
      expect(content).toContain('/refund-policy');
      expect(content).toContain('/delivery-policy');
      expect(content).toContain('/contact');
      expect(content).toContain('DPDP');
      expect(content).toContain('Rohit Deshmukh');
      expect(content).toContain('grievance@plukit.in');
    });

    it('verifies Privacy Policy implements DPDP Act 2023 with Data Principal rights', () => {
      const privacyPath = path.resolve(__dirname, '../../../client/app/privacy/page.tsx');
      expect(fs.existsSync(privacyPath)).toBe(true);

      const content = fs.readFileSync(privacyPath, 'utf8');
      expect(content).toContain('Digital Personal Data Protection Act, 2023');
      expect(content).toContain('Zero Third-Party Data Selling Guarantee');
      expect(content).toContain('Data Principal');
      expect(content).toContain('Rohit Deshmukh');
      expect(content).toContain('grievance@plukit.in');
      expect(content).toContain('+91 98220 12345');
    });

    it('verifies Terms & Conditions, Refund Policy, and Delivery Policy pages exist with Pune jurisdiction', () => {
      const termsPath = path.resolve(__dirname, '../../../client/app/terms/page.tsx');
      const refundPath = path.resolve(__dirname, '../../../client/app/refund-policy/page.tsx');
      const deliveryPath = path.resolve(__dirname, '../../../client/app/delivery-policy/page.tsx');
      const contactPath = path.resolve(__dirname, '../../../client/app/contact/page.tsx');

      expect(fs.existsSync(termsPath)).toBe(true);
      expect(fs.existsSync(refundPath)).toBe(true);
      expect(fs.existsSync(deliveryPath)).toBe(true);
      expect(fs.existsSync(contactPath)).toBe(true);

      const termsContent = fs.readFileSync(termsPath, 'utf8');
      expect(termsContent).toContain('Pune, Maharashtra, India');

      const refundContent = fs.readFileSync(refundPath, 'utf8');
      expect(refundContent).toContain('5 to 7 business days');
      expect(refundContent).toContain('CONFIRMED');

      const deliveryContent = fs.readFileSync(deliveryPath, 'utf8');
      expect(deliveryContent).toContain('411001');
      expect(deliveryContent).toContain('411004');
    });
  });
});
