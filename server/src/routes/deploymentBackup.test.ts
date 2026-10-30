import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './admin.js';
import { AUTH_COOKIE_NAME } from './auth.js';
import { setOnlinePaymentsEnabled, isOnlinePaymentsEnabled } from '../lib/settings.js';

let server: Server;
let BASE_URL: string;
let adminToken: string;
let customerToken: string;
let customerId: string;
let customerPhone: string;
let activeProductId: string;

describe('F21: Backups, Deployment, and Launch Checklist', () => {
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
    const adminEmail = `f21-admin-${Date.now()}@plukit.test`;
    const hashedAdminPw = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Deployment Admin',
        password_hash: hashedAdminPw,
      },
    });

    adminToken = `f21-adm-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 2. Create Customer & Session
    customerPhone = `9822${Math.floor(100000 + Math.random() * 900000)}`;
    const user = await prisma.user.create({
      data: {
        phone: customerPhone,
        name: 'Launch Checklist Customer',
        role: 'CUSTOMER',
      },
    });
    customerId = user.id;

    customerToken = `f21-cust-token-${Date.now()}`;
    await prisma.session.create({
      data: {
        user_id: user.id,
        token: customerToken,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 3. Get an active product for cart/checkout tests
    const product = await prisma.product.findFirst({
      where: { is_available: true },
    });
    if (!product) throw new Error('No active product found for F21 testing');
    activeProductId = product.id;

    // Ensure online payments are initially enabled
    await setOnlinePaymentsEnabled(true);
  });

  afterAll(async () => {
    // Restore default state
    await setOnlinePaymentsEnabled(true);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Public Settings Endpoint (GET /api/settings/public)', () => {
    it('returns public settings without requiring authentication', async () => {
      const res = await fetch(`${BASE_URL}/api/settings/public`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('serviceablePincode', '411001');
      expect(data).toHaveProperty('codMaxLimitPaise', 100000);
      expect(data).toHaveProperty('onlinePaymentsEnabled');
      expect(typeof data.onlinePaymentsEnabled).toBe('boolean');
    });
  });

  describe('2. Admin Settings Endpoint (GET & PATCH /api/admin/settings)', () => {
    it('rejects unauthenticated requests to GET /api/admin/settings with 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/settings`);
      expect(res.status).toBe(401);
    });

    it('returns system settings and recent audit logs to authenticated admin', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/settings`, {
        headers: {
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('onlinePaymentsEnabled');
      expect(data).toHaveProperty('settings');
      expect(data).toHaveProperty('recentLogs');
      expect(Array.isArray(data.recentLogs)).toBe(true);
    });

    it('allows admin to engage payment kill-switch (disable UPI)', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/settings/payments`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          enabled: false,
          reason: 'Emergency gateway downtime drill',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.onlinePaymentsEnabled).toBe(false);

      // Verify DB helper confirms state
      const dbEnabled = await isOnlinePaymentsEnabled();
      expect(dbEnabled).toBe(false);

      // Verify audit log was recorded
      const log = await prisma.auditLog.findFirst({
        where: {
          action: 'PAYMENT_KILL_SWITCH_TOGGLE',
        },
        orderBy: { created_at: 'desc' },
      });
      expect(log).toBeDefined();
      expect(log?.new_value).toMatchObject({
        enabled: false,
        reason: 'Emergency gateway downtime drill',
      });
    });

    it('reflects disabled status on GET /api/settings/public', async () => {
      const res = await fetch(`${BASE_URL}/api/settings/public`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.onlinePaymentsEnabled).toBe(false);
    });
  });

  describe('3. Payment Kill-Switch Enforcement at Checkout', () => {
    it('rejects UPI checkout when kill-switch is engaged with HTTP 400', async () => {
      const cartToken = `cart-f21-upi-${Date.now()}`;
      // Setup customer cart
      const cartRes = await fetch(`${BASE_URL}/api/cart/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `cart_token=${cartToken}; ${AUTH_COOKIE_NAME}=${customerToken}`,
        },
        body: JSON.stringify({
          productId: activeProductId,
          qty: 1,
        }),
      });
      expect(cartRes.status).toBe(200);

      // Attempt checkout via UPI
      const res = await fetch(`${BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `cart_token=${cartToken}; ${AUTH_COOKIE_NAME}=${customerToken}`,
        },
        body: JSON.stringify({
          name: 'Launch Customer',
          phone: customerPhone,
          address: 'Camp MG Road Flat 101',
          pincode: '411001',
          paymentMethod: 'UPI',
          idempotencyKey: `f21-upi-blocked-${Date.now()}`,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('ONLINE_PAYMENTS_DISABLED');
      expect(data.error).toContain('Cash on Delivery');
    });

    it('allows COD checkout even when UPI kill-switch is engaged', async () => {
      const cartToken = `cart-f21-cod-${Date.now()}`;
      const cartRes = await fetch(`${BASE_URL}/api/cart/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `cart_token=${cartToken}; ${AUTH_COOKIE_NAME}=${customerToken}`,
        },
        body: JSON.stringify({
          productId: activeProductId,
          qty: 1,
        }),
      });
      expect(cartRes.status).toBe(200);

      const res = await fetch(`${BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `cart_token=${cartToken}; ${AUTH_COOKIE_NAME}=${customerToken}`,
        },
        body: JSON.stringify({
          name: 'Launch Customer',
          phone: customerPhone,
          address: 'Camp MG Road Flat 101',
          pincode: '411001',
          paymentMethod: 'COD',
          idempotencyKey: `f21-cod-success-${Date.now()}`,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toHaveProperty('orderNumber');
      expect(data.paymentMethod).toBe('COD');
      expect(data.status).toBe('CONFIRMED');
    });
  });

  describe('4. Resuming Online Payments', () => {
    it('allows admin to re-enable online payments', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/settings/payments`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Gateway restored drill complete',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.onlinePaymentsEnabled).toBe(true);

      const pubRes = await fetch(`${BASE_URL}/api/settings/public`);
      const pubData = await pubRes.json();
      expect(pubData.onlinePaymentsEnabled).toBe(true);
    });

    it('allows UPI checkout once online payments are restored', async () => {
      const cartToken = `cart-f21-restored-${Date.now()}`;
      // Re-populate cart
      const cartRes = await fetch(`${BASE_URL}/api/cart/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `cart_token=${cartToken}; ${AUTH_COOKIE_NAME}=${customerToken}`,
        },
        body: JSON.stringify({
          productId: activeProductId,
          qty: 1,
        }),
      });
      expect(cartRes.status).toBe(200);

      const res = await fetch(`${BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `cart_token=${cartToken}; ${AUTH_COOKIE_NAME}=${customerToken}`,
        },
        body: JSON.stringify({
          name: 'Launch Customer',
          phone: customerPhone,
          address: 'Camp MG Road Flat 101',
          pincode: '411001',
          paymentMethod: 'UPI',
          idempotencyKey: `f21-upi-restored-${Date.now()}`,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.paymentMethod).toBe('UPI');
      expect(data.status).toBe('PAYMENT_PENDING');
      expect(data).toHaveProperty('razorpay');
    });
  });

  describe('5. Database Backup and Restore Script Integrity', () => {
    const rootDir = path.resolve(__dirname, '../../../');

    it('verifies backup scripts exist in scripts/', () => {
      const psBackup = path.join(rootDir, 'scripts/backup_db.ps1');
      const shBackup = path.join(rootDir, 'scripts/backup_db.sh');

      expect(fs.existsSync(psBackup)).toBe(true);
      expect(fs.existsSync(shBackup)).toBe(true);

      const psContent = fs.readFileSync(psBackup, 'utf8');
      expect(psContent).toContain('pg_dump');
      expect(psContent).toContain('RetentionDays');

      const shContent = fs.readFileSync(shBackup, 'utf8');
      expect(shContent).toContain('pg_dump');
      expect(shContent).toContain('RETENTION_DAYS');
    });

    it('verifies restore scripts exist in scripts/', () => {
      const psRestore = path.join(rootDir, 'scripts/restore_db.ps1');
      const shRestore = path.join(rootDir, 'scripts/restore_db.sh');

      expect(fs.existsSync(psRestore)).toBe(true);
      expect(fs.existsSync(shRestore)).toBe(true);

      const psContent = fs.readFileSync(psRestore, 'utf8');
      expect(psContent).toContain('psql');

      const shContent = fs.readFileSync(shRestore, 'utf8');
      expect(shContent).toContain('psql');
    });

    it('verifies automated test restore script exists', () => {
      const testRestore = path.join(rootDir, 'scripts/test_backup_restore.cjs');
      expect(fs.existsSync(testRestore)).toBe(true);
    });
  });

  describe('6. Production Deployment & Launch Documentation Integrity', () => {
    const rootDir = path.resolve(__dirname, '../../../');

    it('verifies deployment/nginx.conf exists with security headers and caching', () => {
      const nginxFile = path.join(rootDir, 'deployment/nginx.conf');
      expect(fs.existsSync(nginxFile)).toBe(true);

      const content = fs.readFileSync(nginxFile, 'utf8');
      expect(content).toContain('ssl_protocols TLSv1.2 TLSv1.3');
      expect(content).toContain('Strict-Transport-Security');
      expect(content).toContain('Content-Security-Policy');
      expect(content).toContain('limit_req_zone');
      expect(content).toContain('_next/static');
    });

    it('verifies deployment/ecosystem.config.cjs exists with PM2 cluster configuration', () => {
      const pm2File = path.join(rootDir, 'deployment/ecosystem.config.cjs');
      expect(fs.existsSync(pm2File)).toBe(true);

      const content = fs.readFileSync(pm2File, 'utf8');
      expect(content).toContain('plukit-server');
      expect(content).toContain('plukit-client');
      expect(content).toContain('exec_mode: \'cluster\'');
    });

    it('verifies docs/runbook.md contains all emergency procedures', () => {
      const runbookFile = path.join(rootDir, 'docs/runbook.md');
      expect(fs.existsSync(runbookFile)).toBe(true);

      const content = fs.readFileSync(runbookFile, 'utf8');
      expect(content).toContain('Payment Kill-Switch Protocol');
      expect(content).toContain('Database Restoration Protocol');
      expect(content).toContain('Customer Incident Notification Protocol');
      expect(content).toContain('Escalation Contact Directory');
    });

    it('verifies docs/launch_checklist.md maps to Plan Section 13 with all 11 criteria', () => {
      const checklistFile = path.join(rootDir, 'docs/launch_checklist.md');
      expect(fs.existsSync(checklistFile)).toBe(true);

      const content = fs.readFileSync(checklistFile, 'utf8');
      expect(content).toContain('Plan Section 13');
      expect(content).toContain('Every selling price is at or below MRP');
      expect(content).toContain('Free-delivery threshold and COD limit');
      expect(content).toContain('Payment success, failure, refund, and duplicate webhook');
      expect(content).toContain('Two test customers cannot see each other\'s orders');
      expect(content).toContain('Customer accounts cannot reach admin pages');
      expect(content).toContain('HTTPS and security headers checked');
      expect(content).toContain('Error tracking and uptime alerts');
      expect(content).toContain('Policies published');
      expect(content).toContain('Checked on a real Android phone');
      expect(content).toContain('Support WhatsApp number');
    });

    it('verifies docs/production_setup.md exists', () => {
      const prodSetupFile = path.join(rootDir, 'docs/production_setup.md');
      expect(fs.existsSync(prodSetupFile)).toBe(true);
    });
  });
});
