import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './adminAuth.js';
import { AUTH_COOKIE_NAME } from './auth.js';

let server: Server;
let BASE_URL: string;
let adminCookie: string;
let customerCookie: string;
let testOrderNo: string;
let testOrderId: string;
let testOrderItemId: string;

describe('Phase D: Admin Orders Board & State Machine', () => {
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
    const adminEmail = `admin-orders-${Date.now()}@plukit.test`;
    const hashed = await bcrypt.hash('Secret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Order Master',
        password_hash: hashed,
        is_active: true,
      },
    });

    const adminToken = crypto.randomBytes(32).toString('hex');
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    adminCookie = `${ADMIN_COOKIE_NAME}=${adminToken}`;

    // 2. Create Customer Session
    const customer = await prisma.user.create({
      data: {
        name: 'Order Shopper',
        phone: `9833${Math.floor(100000 + Math.random() * 900000)}`,
        role: 'CUSTOMER',
      },
    });
    const custToken = crypto.randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        user_id: customer.id,
        token: custToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    customerCookie = `${AUTH_COOKIE_NAME}=${custToken}`;

    // 3. Create a test COD order
    const shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    const product = await prisma.product.findFirst({ where: { is_available: true, is_active: true } });

    testOrderNo = `PLUK-TEST-D-${Date.now()}`;
    const order = await prisma.order.create({
      data: {
        order_no: testOrderNo,
        guest_name: 'Test Customer',
        guest_phone: '9876543210',
        address: { line1: '123 Baker Street', pincode: '400001' },
        status: 'PLACED',
        subtotal_paise: product!.selling_price_paise * 2,
        delivery_fee_paise: 2000,
        total_paise: product!.selling_price_paise * 2 + 2000,
        payment_method: 'COD',
        payment_status: 'PENDING',
        idempotency_key: `idemp-${Date.now()}`,
        items: {
          create: [
            {
              product_id: product!.id,
              shop_id: shop!.id,
              qty: 2,
              mrp_paise: product!.mrp_paise,
              shop_price_paise: product!.shop_price_paise,
              selling_price_paise: product!.selling_price_paise,
              line_total_paise: product!.selling_price_paise * 2,
            },
          ],
        },
      },
      include: { items: true },
    });

    testOrderId = order.id;
    testOrderItemId = order.items[0].id;
  });

  afterAll(async () => {
    // Clean up test order
    if (testOrderId) {
      await prisma.auditLog.deleteMany({ where: { entity_id: testOrderId } }).catch(() => null);
      await prisma.orderNotification.deleteMany({ where: { order_id: testOrderId } }).catch(() => null);
      await prisma.orderItem.deleteMany({ where: { order_id: testOrderId } }).catch(() => null);
      await prisma.order.delete({ where: { id: testOrderId } }).catch(() => null);
    }

    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await prisma.$disconnect();
  });

  it('1. Rejects unauthenticated requests to GET /api/admin/orders with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders`);
    expect(res.status).toBe(401);
  });

  it('2. Rejects customer session tokens from accessing admin orders with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders`, {
      headers: { Cookie: customerCookie },
    });
    expect(res.status).toBe(401);
  });

  it('3. Returns grouped orders and column counts to admin', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('columns');
    expect(data).toHaveProperty('counts');
    expect(data.columns).toHaveProperty('PLACED');
    expect(data.columns).toHaveProperty('CONFIRMED');
    expect(data.columns).toHaveProperty('SENT_TO_SHOP');
    expect(data.columns).toHaveProperty('PACKED');
    expect(data.columns).toHaveProperty('OUT_FOR_DELIVERY');
    expect(data.columns).toHaveProperty('DELIVERED');
    expect(data.columns).toHaveProperty('ISSUES');
  });

  it('4. Refuses moving unconfirmed COD order to SENT_TO_SHOP with HTTP 400 (Section 4 & Section 13.2)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderNo}/send-to-shop`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('without customer confirmation');
  });

  it('5. Confirms customer order with confirmation method (Section 4)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderNo}/confirm-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ method: 'PHONE' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.order.status).toBe('CONFIRMED');
    expect(data.order.confirmed_with_customer_at).toBeDefined();
    expect(data.order.customer_confirmation_method).toBe('PHONE');
  });

  it('6. Successfully sends confirmed order to shop', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderNo}/send-to-shop`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.status).toBe('SENT_TO_SHOP');
  });

  it('7. Marks order packed with shop reply note', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderNo}/mark-packed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ shop_packing_note: 'WhatsApp: All 2 items packed fresh' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.status).toBe('PACKED');
    expect(data.order.shop_packing_note).toContain('All 2 items packed fresh');
  });

  it('8. Dispatches order to out for delivery', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderNo}/out-for-delivery`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.status).toBe('OUT_FOR_DELIVERY');
  });

  it('9. Marks order delivered, updates payment status to PAID', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${testOrderNo}/mark-delivered`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ cash_collected_paise: 5000 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.status).toBe('DELIVERED');
    expect(data.order.payment_status).toBe('SUCCESS');
  });

  it('10. Partial availability recalculates order totals authority-side (Section 5)', async () => {
    // Create a new multi-item order for partial availability test
    const shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    const products = await prisma.product.findMany({ where: { is_available: true }, take: 2 });

    const partialOrderNo = `PLUK-PARTIAL-${Date.now()}`;
    const p1Total = products[0].selling_price_paise;
    const p2Total = products[1].selling_price_paise;

    const partialOrder = await prisma.order.create({
      data: {
        order_no: partialOrderNo,
        guest_name: 'Partial Customer',
        guest_phone: '9811223344',
        address: { line1: '456 Marine Drive', pincode: '400001' },
        status: 'PLACED',
        subtotal_paise: p1Total + p2Total,
        delivery_fee_paise: 2000,
        total_paise: p1Total + p2Total + 2000,
        idempotency_key: `idemp-partial-${Date.now()}`,
        items: {
          create: [
            {
              product_id: products[0].id,
              shop_id: shop!.id,
              qty: 1,
              mrp_paise: products[0].mrp_paise,
              shop_price_paise: products[0].shop_price_paise,
              selling_price_paise: products[0].selling_price_paise,
              line_total_paise: p1Total,
            },
            {
              product_id: products[1].id,
              shop_id: shop!.id,
              qty: 1,
              mrp_paise: products[1].mrp_paise,
              shop_price_paise: products[1].shop_price_paise,
              selling_price_paise: products[1].selling_price_paise,
              line_total_paise: p2Total,
            },
          ],
        },
      },
      include: { items: true },
    });

    const itemToMark = partialOrder.items[0];

    // Mark item 0 unavailable
    const res = await fetch(`${BASE_URL}/api/admin/orders/${partialOrderNo}/item-unavailable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ orderItemId: itemToMark.id }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // Subtotal must now equal only item 1
    expect(data.order.subtotal_paise).toBe(p2Total);

    // Clean up partial test order
    await prisma.auditLog.deleteMany({ where: { entity_id: partialOrder.id } }).catch(() => null);
    await prisma.orderItem.deleteMany({ where: { order_id: partialOrder.id } }).catch(() => null);
    await prisma.order.delete({ where: { id: partialOrder.id } }).catch(() => null);
  });
});
