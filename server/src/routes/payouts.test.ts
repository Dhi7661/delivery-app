import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './admin.js';

let server: Server;
let BASE_URL: string;
let adminToken: string;
let adminCookie: string;
let testShopId: string;
let createdPayoutId: string;

describe('F23: Shop Ledger and Fortnightly Payouts API', () => {
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
    const adminEmail = `f23-payout-admin-${Date.now()}@plukit.test`;
    const hashedAdminPw = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Finance Admin',
        password_hash: hashedAdminPw,
      },
    });

    adminToken = `f23-adm-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    adminCookie = `${ADMIN_COOKIE_NAME}=${adminToken}`;

    // Get a test shop
    const shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    if (!shop) throw new Error('No active test shop found');
    testShopId = shop.id;

    // Clean up test shop payouts and ledger entries
    await prisma.shopLedger.deleteMany({ where: { shop_id: testShopId } });
    await prisma.payout.deleteMany({ where: { shop_id: testShopId } });

    // Set up bank ref for test shop
    await prisma.shopBankRef.upsert({
      where: { shop_id: testShopId },
      create: {
        shop_id: testShopId,
        provider_ref: 'MANUAL',
        last4: '4321',
        ifsc_code: 'HDFC0001234',
        bank_name: 'HDFC Bank, Viman Nagar',
        account_name: shop.name,
      },
      update: {
        provider_ref: 'MANUAL',
        last4: '4321',
        ifsc_code: 'HDFC0001234',
        bank_name: 'HDFC Bank, Viman Nagar',
        account_name: shop.name,
      },
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Role-Based Access Control (RBAC)', () => {
    it('rejects unauthenticated requests to payouts list with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/payouts`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to payout generation with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/payouts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: testShopId,
          periodStart: '2026-10-01',
          periodEnd: '2026-10-15',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('2. Automatic Shop Ledger Entries on Order DELIVERED', () => {
    it('automatically credits shop ledger with shop_price_paise * qty when order reaches DELIVERED', async () => {
      // Find a product belonging to testShopId
      const product = await prisma.product.findFirst({ where: { shop_id: testShopId } });
      expect(product).toBeTruthy();

      const orderNo = `ORD-F23-${Date.now()}`;
      const qty = 2;
      const expectedSaleAmount = product!.shop_price_paise * qty;

      // Create an order in OUT_FOR_DELIVERY status
      const order = await prisma.order.create({
        data: {
          order_no: orderNo,
          idempotency_key: `idem-f23-${Date.now()}-1`,
          status: 'OUT_FOR_DELIVERY',
          payment_status: 'PENDING',
          payment_method: 'COD',
          subtotal_paise: product!.selling_price_paise * qty,
          delivery_fee_paise: 0,
          total_paise: product!.selling_price_paise * qty,
          address: { street: 'Main Rd', city: 'Pune', pincode: '411014' },
          guest_name: 'Pooja Patil',
          guest_phone: '9876500001',
          items: {
            create: {
              product_id: product!.id,
              shop_id: testShopId,
              qty,
              mrp_paise: product!.mrp_paise,
              selling_price_paise: product!.selling_price_paise,
              shop_price_paise: product!.shop_price_paise,
              line_total_paise: product!.selling_price_paise,
            },
          },
          delivery: {
            create: {
              status: 'OUT_FOR_DELIVERY',
            },
          },
        },
        include: { items: true },
      });

      // Transition order to DELIVERED via Admin status update
      const res = await fetch(`${BASE_URL}/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          status: 'DELIVERED',
        }),
      });

      expect(res.status).toBe(200);

      // Verify that a SALE ledger entry was automatically created for this item
      const ledgerEntry = await prisma.shopLedger.findFirst({
        where: {
          shop_id: testShopId,
          order_item_id: order.items[0].id,
          entry_type: 'SALE',
        },
      });

      expect(ledgerEntry).toBeTruthy();
      expect(ledgerEntry!.amount_paise).toBe(expectedSaleAmount);
      expect(ledgerEntry!.payout_id).toBeNull(); // unbilled initially
    });

    it('does NOT create shop ledger entries for cancelled orders', async () => {
      const product = await prisma.product.findFirst({ where: { shop_id: testShopId } });
      const orderNo = `ORD-F23-CANCEL-${Date.now()}`;

      // Create order in PLACED status
      const order = await prisma.order.create({
        data: {
          order_no: orderNo,
          idempotency_key: `idem-f23-${Date.now()}-2`,
          status: 'PLACED',
          payment_status: 'PENDING',
          payment_method: 'COD',
          subtotal_paise: product!.selling_price_paise,
          delivery_fee_paise: 0,
          total_paise: product!.selling_price_paise,
          address: { street: 'Main Rd', city: 'Pune', pincode: '411014' },
          guest_name: 'Vikram Roy',
          guest_phone: '9876500002',
          items: {
            create: {
              product_id: product!.id,
              shop_id: testShopId,
              qty: 1,
              mrp_paise: product!.mrp_paise,
              selling_price_paise: product!.selling_price_paise,
              shop_price_paise: product!.shop_price_paise,
              line_total_paise: product!.selling_price_paise,
            },
          },
        },
        include: { items: true },
      });

      // Cancel order
      const res = await fetch(`${BASE_URL}/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          status: 'CANCELLED',
          reason: 'Customer requested cancellation before fulfillment',
        }),
      });

      expect(res.status).toBe(200);

      // Ensure no SALE ledger entry was created
      const ledgerEntry = await prisma.shopLedger.findFirst({
        where: {
          shop_id: testShopId,
          order_item_id: order.items[0].id,
        },
      });

      expect(ledgerEntry).toBeNull();
    });
  });

  describe('3. Return Deductions and Unbilled Balances', () => {
    it('includes RETURN_DEDUCTION in unbilled balance computation', async () => {
      // Create a manual return deduction ledger entry
      const returnEntry = await prisma.shopLedger.create({
        data: {
          shop_id: testShopId,
          amount_paise: 7500, // Rs. 75.00 deduction for expired/damaged unit
          entry_type: 'RETURN_DEDUCTION',
          notes: 'Deduction for damaged dairy return',
        },
      });

      expect(returnEntry).toBeTruthy();

      // Check shop unbilled balance via API
      const res = await fetch(`${BASE_URL}/api/admin/payouts/shops`, {
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const shopData = data.shops.find((s: any) => s.id === testShopId);
      expect(shopData).toBeTruthy();
      expect(shopData.unbilledDeductionsPaise).toBeGreaterThanOrEqual(7500);
    });
  });

  describe('4. 15-Day Payout Run Generation & Period Locking', () => {
    it('generates a 15-day payout run linking unbilled ledger entries and computing net amount', async () => {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const periodEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const res = await fetch(`${BASE_URL}/api/admin/payouts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          shopId: testShopId,
          periodStart,
          periodEnd,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.payout).toBeTruthy();
      expect(data.payout.status).toBe('SCHEDULED');
      expect(data.payout.amount_paise).toBe(data.payout.gross_sales_paise - data.payout.deductions_paise);

      createdPayoutId = data.payout.id;

      // Verify ledger entries are linked to this payout
      const linkedEntries = await prisma.shopLedger.findMany({
        where: { payout_id: createdPayoutId },
      });
      expect(linkedEntries.length).toBeGreaterThan(0);
    });

    it('records bank transfer reference (UTR) and locks the payout period permanently', async () => {
      const bankRef = `UTR-TEST-${Date.now()}`;

      const res = await fetch(`${BASE_URL}/api/admin/payouts/${createdPayoutId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          bankReference: bankRef,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.payout.status).toBe('PAID');
      expect(data.payout.bank_reference).toBe(bankRef);
      expect(data.payout.paid_at).toBeTruthy();
    });

    it('enforces F23 rule: locked payout period CANNOT be paid again or edited', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/payouts/${createdPayoutId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          bankReference: 'ANOTHER-REF-999',
        }),
      });

      // Must be rejected because already PAID and locked
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('already been paid and locked');
    });

    it('records manual adjustments for post-payout corrections to be processed in future runs', async () => {
      const adjRes = await fetch(`${BASE_URL}/api/admin/payouts/adjustments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          shopId: testShopId,
          amountPaise: 12000, // Rs. 120.00 credit adjustment
          notes: 'Audit correction for late delivery bonus adjustment',
        }),
      });

      expect(adjRes.status).toBe(201);
      const adjData = await adjRes.json();
      expect(adjData.success).toBe(true);
      expect(adjData.adjustment.entry_type).toBe('ADJUSTMENT');
      expect(adjData.adjustment.payout_id).toBeNull(); // ready for next period
    });
  });

  describe('5. Payout Statements and PDF Download', () => {
    it('retrieves detailed statement breakdown with itemized ledger entries', async () => {
      const targetPayoutId = createdPayoutId || (await prisma.payout.findFirst({ where: { shop_id: testShopId, status: 'PAID' } }))?.id;
      expect(targetPayoutId).toBeTruthy();

      const res = await fetch(`${BASE_URL}/api/admin/payouts/${targetPayoutId}/statement`, {
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.shop.name).toBeTruthy();
      expect(data.summary.status).toBe('PAID');
      expect(data.summary.bankReference).toBeTruthy();
      expect(data.payout.ledger_entries.length).toBeGreaterThan(0);
    });

    it('streams generated PDF statement with valid application/pdf Content-Type', async () => {
      const targetPayoutId = createdPayoutId || (await prisma.payout.findFirst({ where: { shop_id: testShopId, status: 'PAID' } }))?.id;
      expect(targetPayoutId).toBeTruthy();

      const res = await fetch(`${BASE_URL}/api/admin/payouts/${targetPayoutId}/pdf`, {
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('attachment');

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.length).toBeGreaterThan(500); // valid PDF binary

      // Verify PDF header magic bytes %PDF-
      const header = buffer.subarray(0, 4).toString('utf-8');
      expect(header).toBe('%PDF');
    });
  });
});
