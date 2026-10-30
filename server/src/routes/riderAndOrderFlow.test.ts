import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import { prisma } from '../lib/db.js';
import { ADMIN_COOKIE_NAME } from './admin.js';
import { RIDER_COOKIE_NAME } from './riderAuth.js';

describe('Spec v1.2: Rider Portal, COD Confirmation, Cash Handover & Order Flow', () => {
  let server: Server;
  let BASE_URL: string;
  let adminToken: string;
  let adminCookie: string;
  let adminId: string;
  let riderToken: string;
  let riderCookie: string;
  let riderId: string;
  let testShopId: string;
  let testProductId: string;
  let testOrderId: string;
  let testOrderNo: string;
  const riderPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

  beforeAll(async () => {
    // 1. Start server on dynamic port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          BASE_URL = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });

    // 2. Setup admin user
    const adminEmail = `admin-flow-${Date.now()}@plukit.test`;
    const hashedAdminPw = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Super Admin',
        phone: '9822114455',
        password_hash: hashedAdminPw,
      },
    });
    adminId = admin.id;

    adminToken = `adm-token-flow-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    adminCookie = `${ADMIN_COOKIE_NAME}=${adminToken}`;

    // 3. Setup rider user
    const riderUser = await prisma.user.create({
      data: {
        name: 'Test Rider',
        phone: riderPhone,
        role: 'RIDER',
      },
    });
    riderId = riderUser.id;

    riderToken = `rider-token-flow-${Date.now()}`;
    await prisma.riderSession.create({
      data: {
        user_id: riderUser.id,
        token: riderToken,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    riderCookie = `${RIDER_COOKIE_NAME}=${riderToken}`;

    // 4. Setup partner shop and product
    const shop = await prisma.shop.create({
      data: {
        name: `[TEST] Shop Flow ${Date.now()}`,
        owner_name: 'Shop Owner Flow',
        phone: '9822334455',
        address: 'MG Road, Camp, Pune - 411001',
        upi_id: 'quickmart@okicici',
      },
    });
    testShopId = shop.id;

    let cat = await prisma.category.findFirst();
    if (!cat) {
      cat = await prisma.category.create({ data: { name: `Groceries-${Date.now()}` } });
    }

    const prod = await prisma.product.create({
      data: {
        shop_id: shop.id,
        category_id: cat.id,
        name: `[TEST] Flow Milk ${Date.now()}`,
        brand: 'FlowDairy',
        unit_size: '500 ml',
        mrp_paise: 4000,
        shop_price_paise: 3000,
        selling_price_paise: 3600,
        is_available: true,
      },
    });
    testProductId = prod.id;
  });

  afterAll(async () => {
    await prisma.cashHandover.deleteMany({ where: { rider_id: riderId } });
    await prisma.riderSession.deleteMany({ where: { user_id: riderId } });
    await prisma.adminSession.deleteMany({ where: { admin_user_id: adminId } });
    await prisma.shopLedger.deleteMany({ where: { shop_id: testShopId } });
    await prisma.payout.deleteMany({ where: { shop_id: testShopId } });
    await prisma.orderItem.deleteMany({ where: { shop_id: testShopId } });
    await prisma.order.deleteMany({ where: { id: testOrderId } });
    await prisma.product.deleteMany({ where: { shop_id: testShopId } });
    await prisma.shop.deleteMany({ where: { id: testShopId } });
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. COD Customer Confirmation Gate (Spec Section 4)', () => {
    it('creates a COD order and blocks moving to SENT_TO_SHOP without customer confirmation', async () => {
      testOrderNo = `PLUK-FLOW-${Date.now()}`;
      const order = await prisma.order.create({
        data: {
          order_no: testOrderNo,
          guest_name: 'Rahul Sharma',
          guest_phone: '9811223344',
          address: { line1: 'Flat 101, Galaxy Apts', area: 'Kothrud', pincode: '411038' },
          status: 'CONFIRMED',
          payment_method: 'COD',
          payment_status: 'PENDING',
          subtotal_paise: 7200,
          delivery_fee_paise: 3000,
          total_paise: 10200, // ₹102.00
          idempotency_key: `key-${testOrderNo}`,
          items: {
            create: [
              {
                product_id: testProductId,
                shop_id: testShopId,
                qty: 2,
                mrp_paise: 4000,
                shop_price_paise: 3000,
                selling_price_paise: 3600,
                line_total_paise: 7200,
                is_available: true,
              },
            ],
          },
        },
      });
      testOrderId = order.id;

      // Attempt to move to SENT_TO_SHOP without customer confirmation -> must be rejected with 400
      const res = await fetch(`${BASE_URL}/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ status: 'SENT_TO_SHOP' }),
      });

      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.requiresCustomerConfirmation).toBe(true);
      expect(data.error).toContain('A COD order cannot move to SENT_TO_SHOP without a customer confirmation');
    });

    it('records customer confirmation via WHATSAPP and allows moving to SENT_TO_SHOP', async () => {
      // Record customer confirmation
      const confirmRes = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/confirm-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ method: 'WHATSAPP', note: 'Customer confirmed 2x Milk for ₹102.00' }),
      });

      const confirmData = await confirmRes.json();
      expect(confirmRes.status).toBe(200);
      expect(confirmData.success).toBe(true);
      expect(confirmData.order.customer_confirmation_method).toBe('WHATSAPP');
      expect(confirmData.order.confirmed_with_customer_at).toBeDefined();

      // Now moving to SENT_TO_SHOP succeeds
      const statusRes = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ status: 'SENT_TO_SHOP' }),
      });

      const statusData = await statusRes.json();
      expect(statusRes.status).toBe(200);
      expect(statusData.order.status).toBe('SENT_TO_SHOP');
    });
  });

  describe('2. Shop WhatsApp Packing Confirmation & Step Separation (Spec Section 3 & 8.1)', () => {
    it('moves order from SENT_TO_SHOP to PACKED with shop packing note recorded', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          status: 'PACKED',
          packingNote: 'Shop confirmed packed via WhatsApp: Ready at billing counter',
        }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.order.status).toBe('PACKED');
      expect(data.order.shop_packing_note).toContain('Shop confirmed packed via WhatsApp');
    });
  });

  describe('3. Rider Portal: Data Isolation & Order Execution (Spec Section 7)', () => {
    it('returns order on rider screen with strict data isolation (NO shop buy prices or margins)', async () => {
      const res = await fetch(`${BASE_URL}/api/delivery/orders`, {
        headers: { Cookie: riderCookie },
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.orders.length).toBeGreaterThan(0);

      const riderOrder = data.orders.find((o: any) => o.id === testOrderId);
      expect(riderOrder).toBeDefined();
      expect(riderOrder.status).toBe('PACKED');
      expect(riderOrder.actions.canPickup).toBe(true);

      // Strict data isolation verification (Acceptance criteria §13.2)
      for (const item of riderOrder.items) {
        expect((item as any).shop_price_paise).toBeUndefined();
        expect((item as any).margin_paise).toBeUndefined();
        expect(item.sellingPricePaise).toBe(3600);
      }

      // Customer contact is active and clickable
      expect(riderOrder.customer.phoneTel).toBe('tel:9811223344');
      expect(riderOrder.payment.label).toBe('Collect cash: ₹102');
    });

    it('rider picks up the order: transitions PACKED -> OUT_FOR_DELIVERY', async () => {
      const res = await fetch(`${BASE_URL}/api/delivery/orders/${testOrderId}/pickup`, {
        method: 'POST',
        headers: { Cookie: riderCookie },
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.order.status).toBe('OUT_FOR_DELIVERY');
      expect(data.order.delivery.status).toBe('OUT_FOR_DELIVERY');
    });

    it('rider records delivery and collects COD cash', async () => {
      // Cash mismatch without note fails
      const failRes = await fetch(`${BASE_URL}/api/delivery/orders/${testOrderId}/delivered`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: riderCookie,
        },
        body: JSON.stringify({ cashCollectedPaise: 10000 }), // ₹100 instead of ₹102
      });

      const failData = await failRes.json();
      expect(failRes.status).toBe(400);
      expect(failData.error).toContain('A note explaining the difference is required');

      // Cash with exact amount succeeds
      const res = await fetch(`${BASE_URL}/api/delivery/orders/${testOrderId}/delivered`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: riderCookie,
        },
        body: JSON.stringify({ cashCollectedPaise: 10200 }), // Exact ₹102.00
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.order.status).toBe('DELIVERED');
      expect(data.order.payment_status).toBe('SUCCESS');
    });

    it('customer phone and address are hidden/masked on rider screen after order is DELIVERED', async () => {
      const res = await fetch(`${BASE_URL}/api/delivery/orders`, {
        headers: { Cookie: riderCookie },
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      const deliveredOrder = data.orders.find((o: any) => o.id === testOrderId);
      expect(deliveredOrder).toBeDefined();
      expect(deliveredOrder.status).toBe('DELIVERED');

      // Spec Section 7.5: Data hidden post-delivery
      expect(deliveredOrder.customer.phoneTel).toBeNull();
      expect(deliveredOrder.customer.phone).toContain('***');
    });
  });

  describe('4. Daily Cash Handover Flow (Spec Section 7.4)', () => {
    let handoverId: string;

    it('rider sees today cash collection summary and submits cash handover', async () => {
      const summaryRes = await fetch(`${BASE_URL}/api/delivery/cash/summary`, {
        headers: { Cookie: riderCookie },
      });

      const summaryData = await summaryRes.json();
      expect(summaryRes.status).toBe(200);
      expect(summaryData.summary.totalCollectedPaise).toBeGreaterThanOrEqual(10200);

      // Rider submits handover
      const confirmRes = await fetch(`${BASE_URL}/api/delivery/cash/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: riderCookie,
        },
        body: JSON.stringify({ actualAmountPaise: 10200 }),
      });

      const confirmData = await confirmRes.json();
      expect(confirmRes.status).toBe(200);
      expect(confirmData.success).toBe(true);
      handoverId = confirmData.handover.id;
    });

    it('admin views and acknowledges cash handover, resetting balance', async () => {
      const listRes = await fetch(`${BASE_URL}/api/admin/cash-handovers`, {
        headers: { Cookie: adminCookie },
      });

      const listData = await listRes.json();
      expect(listRes.status).toBe(200);
      expect(listData.handovers.some((h: any) => h.id === handoverId)).toBe(true);

      // Admin acknowledges
      const ackRes = await fetch(`${BASE_URL}/api/admin/cash-handovers/${handoverId}/acknowledge`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
      });

      const ackData = await ackRes.json();
      expect(ackRes.status).toBe(200);
      expect(ackData.handover.admin_confirmed_at).toBeDefined();
    });
  });

  describe('5. Multi-Mode Shop Payouts (Spec Section 9)', () => {
    let payoutId: string;

    beforeAll(async () => {
      // Generate a payout for testShop
      const genRes = await fetch(`${BASE_URL}/api/admin/payouts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          shopId: testShopId,
          periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
        }),
      });

      const genData = await genRes.json();
      payoutId = genData.payout.id;
    });

    it('rejects UPI payout without 12-digit transaction reference', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/payouts/${payoutId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ paymentMode: 'UPI', upiRef: '' }),
      });

      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('UPI transaction reference (12 digits) is required');
    });

    it('records payout via UPI with 12-digit ref and permanently locks the period', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/payouts/${payoutId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ paymentMode: 'UPI', upiRef: '412356789012' }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.payout.status).toBe('PAID');
      expect(data.payout.payment_mode).toBe('UPI');
      expect(data.payout.upi_ref).toBe('412356789012');

      // Attempting to repay locked payout fails
      const rePay = await fetch(`${BASE_URL}/api/admin/payouts/${payoutId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ paymentMode: 'UPI', upiRef: '412356789099' }),
      });

      const rePayData = await rePay.json();
      expect(rePay.status).toBe(400);
      expect(rePayData.error).toContain('already been paid and locked');
    });

    it('exports payouts as CSV including payment mode and reference', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/payouts/export/csv`, {
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const text = await res.text();
      expect(text).toContain('Payment Mode');
      expect(text).toContain('412356789012');
    });
  });
});
