import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { Server } from 'node:http';
import { prisma } from '../lib/db.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './admin.js';
import {
  dispatchOrderStatusNotifications,
  setCustomSmsSender,
  retryNotification,
} from '../lib/notifications.js';

let server: Server;
let BASE_URL: string;

describe('F14: Order Tracking and Notifications API', () => {
  let adminToken: string;
  let adminId: string;
  let testShopId: string;
  let testProductId: string;
  let testProductName: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    // 1. Create test admin user
    const adminEmail = `notif-admin-${Date.now()}@plukit.test`;
    const hashed = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Notification Admin',
        password_hash: hashed,
      },
    });
    adminId = admin.id;

    // Create admin session
    adminToken = `notif-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 2. Ensure test shop and product exist
    let shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    if (!shop) {
      shop = await prisma.shop.create({
        data: {
          name: `Test Fresh Shop ${Date.now()}`,
          owner_name: 'Shop Owner',
          phone: '9876543210',
          commission_rate: 0.1,
          status: 'ACTIVE',
        },
      });
    }
    testShopId = shop.id;

    let product = await prisma.product.findFirst({ where: { shop_id: testShopId } });
    if (!product) {
      const category = await prisma.category.findFirst() || await prisma.category.create({
        data: { name: `Test Category ${Date.now()}` },
      });
      product = await prisma.product.create({
        data: {
          shop_id: testShopId,
          category_id: category.id,
          name: 'Fresh Alphonso Mangoes',
          brand: 'PlukFresh',
          unit_size: '1 kg',
          mrp_paise: 30000,
          shop_price_paise: 25000,
          selling_price_paise: 30000,
          is_available: true,
          is_active: true,
        },
      });
    }
    testProductId = product.id;
    testProductName = product.name;

    // Start server on dedicated test port 4014
    await new Promise<void>((resolve) => {
      server = app.listen(4014, () => {
        BASE_URL = 'http://localhost:4014';
        resolve();
      });
    });
  });

  afterAll(async () => {
    setCustomSmsSender(null);
    if (createdOrderIds.length > 0) {
      await prisma.orderNotification.deleteMany({
        where: { order_id: { in: createdOrderIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entity_id: { in: createdOrderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { order_id: { in: createdOrderIds } },
      });
      await prisma.delivery.deleteMany({
        where: { order_id: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
    if (adminId) {
      await prisma.adminSession.deleteMany({ where: { admin_user_id: adminId } });
      await prisma.adminUser.deleteMany({ where: { id: adminId } });
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Helper to create an order
  async function createTestOrder(opts?: { phone?: string; name?: string; status?: any }) {
    const orderNo = `PLUK-TEST-F14-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const phone = opts?.phone || '9876543210';
    const name = opts?.name || 'Aarav Patel';
    const status = opts?.status || 'CONFIRMED';

    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        guest_name: name,
        guest_phone: phone,
        status,
        subtotal_paise: 30000,
        delivery_fee_paise: 0,
        total_paise: 30000,
        payment_method: 'COD',
        payment_status: 'PENDING_COLLECTION',
        idempotency_key: `key-${orderNo}`,
        address: {
          line1: 'Flat 402, Sunshine Heights',
          pincode: '411001',
        },
        items: {
          create: [
            {
              product_id: testProductId,
              shop_id: testShopId,
              qty: 2,
              mrp_paise: 30000,
              shop_price_paise: 25000,
              selling_price_paise: 30000,
              line_total_paise: 60000,
            },
          ],
        },
        delivery: {
          create: {
            status: 'PENDING',
            cod_collected_paise: 0,
          },
        },
      },
    });

    createdOrderIds.push(order.id);
    return order;
  }

  it('One status change creates exactly one notification record', async () => {
    const order = await createTestOrder({ phone: '9811122233', status: 'CONFIRMED' });

    // Trigger CONFIRMED notification
    const notifs = await dispatchOrderStatusNotifications(order.id, 'CONFIRMED');
    expect(notifs.length).toBe(1);
    expect(notifs[0].order_status).toBe('CONFIRMED');
    expect(notifs[0].recipient_type).toBe('CUSTOMER');
    expect(notifs[0].recipient).toBe('9811122233');
    expect(notifs[0].channel).toBe('SMS');
    expect(notifs[0].status).toBe('SENT');
    expect(notifs[0].attempts).toBe(1);

    // Verify record in database
    const dbNotifs = await prisma.orderNotification.findMany({
      where: { order_id: order.id, order_status: 'CONFIRMED' },
    });
    expect(dbNotifs.length).toBe(1);
  });

  it('Repeated status does not resend (Notification idempotency)', async () => {
    const order = await createTestOrder({ phone: '9822233344', status: 'CONFIRMED' });

    // First trigger
    const firstRun = await dispatchOrderStatusNotifications(order.id, 'CONFIRMED');
    expect(firstRun.length).toBe(1);

    // Second trigger with same status
    const secondRun = await dispatchOrderStatusNotifications(order.id, 'CONFIRMED');
    expect(secondRun.length).toBe(0); // Idempotent: no new notification created

    // Total in DB must remain exactly 1
    const totalInDb = await prisma.orderNotification.count({
      where: { order_id: order.id, order_status: 'CONFIRMED' },
    });
    expect(totalInDb).toBe(1);
  });

  it('Shop notification on SENT_TO_SHOP generates WhatsApp message with items, quantities, and customer anonymity', async () => {
    const order = await createTestOrder({ phone: '9833344455', name: 'Private Customer Name' });

    // Trigger SENT_TO_SHOP
    const notifs = await dispatchOrderStatusNotifications(order.id, 'SENT_TO_SHOP');
    expect(notifs.length).toBe(1);

    const shopNotif = notifs[0];
    expect(shopNotif.recipient_type).toBe('SHOP');
    expect(shopNotif.channel).toBe('WHATSAPP');
    expect(shopNotif.status).toBe('SENT');

    // Message must include item list and quantities
    expect(shopNotif.message).toContain(testProductName);
    expect(shopNotif.message).toContain('2x');

    // Customer anonymity check: must NEVER contain customer name or customer phone
    expect(shopNotif.message).not.toContain('Private Customer Name');
    expect(shopNotif.message).not.toContain('9833344455');

    // WhatsApp URL should be populated in metadata
    const metadata = shopNotif.metadata as any;
    expect(metadata).toBeDefined();
    expect(metadata.whatsapp_url).toContain('https://wa.me/91');
    expect(metadata.whatsapp_url).toContain(encodeURIComponent(order.order_no));
  });

  it('Automatic retry once on failed send; failed messages logged for founder review', async () => {
    const order = await createTestOrder({ phone: '9844455566' });

    // Configure mock SMS sender to always fail
    let callCount = 0;
    setCustomSmsSender(async () => {
      callCount += 1;
      return false; // Simulation of gateway failure
    });

    // Trigger OUT_FOR_DELIVERY notification
    const notifs = await dispatchOrderStatusNotifications(order.id, 'OUT_FOR_DELIVERY');
    expect(notifs.length).toBe(1);

    const failedNotif = notifs[0];
    expect(failedNotif.status).toBe('FAILED');
    expect(failedNotif.attempts).toBe(2); // Attempt 1 + 1 Automatic Retry
    expect(callCount).toBe(2);
    expect(failedNotif.last_error).toBeDefined();

    // Reset sender
    setCustomSmsSender(null);
  });

  it('Admin can review failed notifications and manually retry them', async () => {
    const order = await createTestOrder({ phone: '9855566677' });

    // 1. Create a failed notification
    setCustomSmsSender(async () => false);
    const [failed] = await dispatchOrderStatusNotifications(order.id, 'DELIVERED');
    expect(failed.status).toBe('FAILED');
    setCustomSmsSender(null);

    // 2. Admin retrieves list of failed notifications
    const listRes = await fetch(`${BASE_URL}/api/admin/notifications?status=FAILED`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    const found = listData.notifications.find((n: any) => n.id === failed.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('FAILED');

    // 3. Admin retries the notification
    const retryRes = await fetch(`${BASE_URL}/api/admin/notifications/${failed.id}/retry`, {
      method: 'POST',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    expect(retryRes.status).toBe(200);
    const retryData = await retryRes.json();
    expect(retryData.success).toBe(true);
    expect(retryData.notification.status).toBe('SENT');
  });

  it('Guest cannot see another guest order with a wrong phone number (returns 403 Forbidden)', async () => {
    const order = await createTestOrder({ phone: '9123456789' });

    // Guest attempts to track with an incorrect phone number
    const res = await fetch(`${BASE_URL}/api/orders/${order.order_no}?phone=9999999999`);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Phone number does not match this order.');
  });

  it('Guest enters correct order number and phone to view status timeline (returns 200 OK and timeline)', async () => {
    const order = await createTestOrder({ phone: '9123456789' });

    // Guest enters matching 10-digit phone
    const res = await fetch(`${BASE_URL}/api/orders/${order.order_no}?phone=9123456789`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.order_no).toBe(order.order_no);
    expect(data.isVerified).toBe(true);

    // Timeline validation
    expect(Array.isArray(data.timeline)).toBe(true);
    expect(data.timeline.length).toBeGreaterThanOrEqual(5);

    const confirmedStep = data.timeline.find((s: any) => s.status === 'CONFIRMED');
    expect(confirmedStep).toBeDefined();
    expect(confirmedStep.label).toBe('Order Confirmed');
    expect(confirmedStep.completed).toBe(true);
    expect(confirmedStep.timestamp).toBeDefined();
  });
});
