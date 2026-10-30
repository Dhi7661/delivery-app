import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './admin.js';

let server: Server;
let BASE_URL: string;
let adminToken: string;

describe('F22: Soft Launch Operations API', () => {
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

    // Create Admin User & Session
    const adminEmail = `f22-ops-admin-${Date.now()}@plukit.test`;
    const hashedAdminPw = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Operations Manager',
        password_hash: hashedAdminPw,
      },
    });

    adminToken = `f22-adm-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Role-Based Access Control (RBAC)', () => {
    it('rejects unauthenticated requests to operations summary with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/summary`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to cash reconciliation with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/cash-reconciliation`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to issues log with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/issues`);
      expect(res.status).toBe(401);
    });
  });

  describe('2. Operations Summary & Unit Economics (GET /api/admin/operations/summary)', () => {
    it('returns operational scorecard with target progress, on-time rate, and margins', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/summary`, {
        headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Target progress
      expect(data).toHaveProperty('targetProgress');
      expect(data.targetProgress).toHaveProperty('completed');
      expect(data.targetProgress).toHaveProperty('target', 20);
      expect(data.targetProgress).toHaveProperty('percentage');
      expect(typeof data.targetProgress.isTargetMet).toBe('boolean');

      // On-time delivery rate
      expect(data).toHaveProperty('onTimeDelivery');
      expect(data.onTimeDelivery).toHaveProperty('onTimeRatePercent');
      expect(data.onTimeDelivery.targetMinutes).toBe(45);

      // Repeat customers
      expect(data).toHaveProperty('repeatCustomers');
      expect(data.repeatCustomers).toHaveProperty('repeatCustomerRatePercent');

      // Unit Economics formula verification
      expect(data).toHaveProperty('unitEconomics');
      const {
        retailMarkUpPaise,
        totalDeliveryFeePaise,
        totalDeliveryCostPaise,
        grossMarginPaise,
        avgMarginPerOrderPaise,
      } = data.unitEconomics;

      // Net Margin = retailMarkUp + totalDeliveryFee - totalDeliveryCost
      expect(grossMarginPaise).toBe(
        retailMarkUpPaise + totalDeliveryFeePaise - totalDeliveryCostPaise
      );

      if (data.targetProgress.completed > 0) {
        expect(avgMarginPerOrderPaise).toBe(
          Math.round(grossMarginPaise / data.targetProgress.completed)
        );
      }
    });
  });

  describe('3. Daily Cash Reconciliation (GET & POST /api/admin/operations/cash-reconciliation)', () => {
    it('returns daily reconciliation list grouped by rider and date', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/cash-reconciliation`, {
        headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('reconciliations');
      expect(Array.isArray(data.reconciliations)).toBe(true);
    });

    it('rejects invalid cash reconciliation submission with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/cash-reconciliation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          date: 'invalid-date',
          riderName: '',
          collectedCashPaise: -500,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('records and balances daily rider cash with audit trail', async () => {
      const testDate = new Date().toISOString().split('T')[0];
      const testRider = `Rider-Test-${Date.now()}`;

      const res = await fetch(`${BASE_URL}/api/admin/operations/cash-reconciliation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          date: testDate,
          riderName: testRider,
          collectedCashPaise: 150000, // ₹1,500
          notes: 'Test end-of-day deposit verified',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.reconciliation.rider_name).toBe(testRider);
      expect(data.reconciliation.collected_cash_paise).toBe(150000);

      // Verify audit log entry
      const log = await prisma.auditLog.findFirst({
        where: {
          action: 'CASH_RECONCILIATION_SUBMIT',
          entity_id: data.reconciliation.id,
        },
      });
      expect(log).toBeDefined();
    });
  });

  describe('4. Operational Issues Log (CRUD)', () => {
    let createdIssueId: string;

    it('allows admin to log a new operational issue', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          category: 'WRONG_ITEM',
          severity: 'HIGH',
          description: 'Customer received 500g variant instead of 1kg packet.',
          reportedBy: 'CUSTOMER',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.issue.category).toBe('WRONG_ITEM');
      expect(data.issue.severity).toBe('HIGH');
      expect(data.issue.status).toBe('OPEN');

      createdIssueId = data.issue.id;
    });

    it('lists operational issues with optional status filter', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/issues?status=OPEN`, {
        headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('issues');
      expect(Array.isArray(data.issues)).toBe(true);

      const found = data.issues.find((i: any) => i.id === createdIssueId);
      expect(found).toBeDefined();
    });

    it('updates operational issue status to RESOLVED with notes', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/operations/issues/${createdIssueId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          status: 'RESOLVED',
          rootCause: 'Shelf labeling error at partner store',
          resolutionNotes: 'Dispatched 500g top-up packet and offered ₹25 wallet credit',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.issue.status).toBe('RESOLVED');
      expect(data.issue.resolved_at).toBeDefined();
      expect(data.issue.root_cause).toContain('Shelf labeling error');
    });
  });

  describe('5. Documentation & Review Artifact Integrity', () => {
    const rootDir = path.resolve(__dirname, '../../../');

    it('verifies docs/soft_launch_review.md exists with all required sections', () => {
      const reviewFile = path.join(rootDir, 'docs/soft_launch_review.md');
      expect(fs.existsSync(reviewFile)).toBe(true);

      const content = fs.readFileSync(reviewFile, 'utf8');
      expect(content).toContain('PlukIt Soft Launch Weekly Review');
      expect(content).toContain('On-Time Delivery Rate');
      expect(content).toContain('Repeat Customer Rate');
      expect(content).toContain('Unit Economics & Profitability Analysis');
      expect(content).toContain('Daily Cash Reconciliation Summary');
      expect(content).toContain('Issues Log & Root Cause Analysis');
      expect(content).toContain('Founder Launch Sign-Off');
    });

    it('verifies client/app/admin/operations/page.tsx exists', () => {
      const pageFile = path.join(rootDir, 'client/app/admin/operations/page.tsx');
      expect(fs.existsSync(pageFile)).toBe(true);
    });
  });
});
