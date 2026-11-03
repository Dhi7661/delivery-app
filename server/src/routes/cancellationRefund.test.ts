import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';

import { generateOrderInvoice } from '../lib/invoice.js';
import { cancelOrderWithRefund, processOrderReturn } from '../lib/cancellation.js';

let server: Server;
let BASE_URL: string;
let adminToken: string;
let adminId: string;
let products: Array<{ id: string; shop_id: string; selling_price_paise: number; shop_price_paise: number }>;

describe('F18: Cancellations, Refunds, and Returns', () => {
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

    // 1. Create or ensure test admin
    const adminEmail = `f18-admin-${Date.now()}@plukit.test`;
    const hashed = await bcrypt.hash('AdminSecret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Refund Admin',
        password_hash: hashed,
      },
    });
    adminId = admin.id;

    adminToken = `f18-token-${Date.now()}`;
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const prods = await prisma.product.findMany({
      where: { is_active: true, is_available: true },
      take: 2,
    });
    products = prods;
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

  it('1. Full cancellation before packing refunds the full amount', async () => {
    const orderNo = `PLUK-F18-FULL-${Date.now()}`;
    const totalPaise = 15000;

    // Create online UPI order in CONFIRMED state with successful payment
    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        guest_name: 'Anita Sharma',
        guest_phone: '9822114455',
        address: { line1: 'Flat 101, Camp', pincode: '411001' },
        status: 'CONFIRMED',
        subtotal_paise: totalPaise - 2000,
        delivery_fee_paise: 2000,
        total_paise: totalPaise,
        payment_method: 'UPI',
        payment_status: 'SUCCESS',
        idempotency_key: `f18-key-1-${Date.now()}`,
        items: {
          create: [
            {
              product_id: products[0].id,
              shop_id: products[0].shop_id,
              qty: 1,
              mrp_paise: 15000,
              shop_price_paise: 12000,
              selling_price_paise: totalPaise - 2000,
              line_total_paise: totalPaise - 2000,
            },
          ],
        },
        payments: {
          create: {
            gateway: 'razorpay',
            gateway_order_id: `order_rzp_${Date.now()}`,
            gateway_payment_id: `pay_rzp_full_${Date.now()}`,
            amount_paise: totalPaise,
            status: 'SUCCESS',
          },
        },
        delivery: {
          create: { status: 'PENDING' },
        },
      },
    });

    // Customer cancels order before packing
    const cancelRes = await fetch(`${BASE_URL}/api/orders/${orderNo}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '9822114455',
        reason: 'Change of mind before packing',
      }),
    });

    expect(cancelRes.status).toBe(200);
    const cancelData = await cancelRes.json();
    expect(cancelData.success).toBe(true);
    expect(cancelData.order.status).toBe('CANCELLED');
    expect(cancelData.order.payment_status).toBe('REFUNDED');
    expect(cancelData.refundAmountPaise).toBe(totalPaise);
    expect(cancelData.refund).toBeDefined();
    expect(cancelData.refund.amount_paise).toBe(totalPaise);
    expect(cancelData.refund.status).toBe('processed');
    expect(cancelData.refund.gateway_refund_id).toBeTruthy();

    // Verify in database
    const dbOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { refunds: true },
    });
    expect(dbOrder?.status).toBe('CANCELLED');
    expect(dbOrder?.payment_status).toBe('REFUNDED');
    expect(dbOrder?.refunds.length).toBe(1);
    expect(dbOrder?.refunds[0].amount_paise).toBe(totalPaise);
  });

  it('2. Cancellation after packing is refused for the customer', async () => {
    const orderNo = `PLUK-F18-PACKED-${Date.now()}`;
    const totalPaise = 18000;

    // Create order and advance it to PACKED
    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        guest_name: 'Rahul Varma',
        guest_phone: '9822334455',
        address: { line1: 'Flat 202, Camp', pincode: '411001' },
        status: 'PACKED',
        subtotal_paise: totalPaise,
        delivery_fee_paise: 0,
        total_paise: totalPaise,
        payment_method: 'UPI',
        payment_status: 'SUCCESS',
        idempotency_key: `f18-key-2-${Date.now()}`,
        items: {
          create: [
            {
              product_id: products[0].id,
              shop_id: products[0].shop_id,
              qty: 1,
              mrp_paise: 18000,
              shop_price_paise: 15000,
              selling_price_paise: totalPaise,
              line_total_paise: totalPaise,
            },
          ],
        },
        delivery: {
          create: { status: 'PENDING' },
        },
      },
    });

    // Customer attempts to cancel after PACKED -> must be refused
    const customerCancelRes = await fetch(`${BASE_URL}/api/orders/${orderNo}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '9822334455',
        reason: 'Too late cancellation',
      }),
    });

    expect(customerCancelRes.status).toBe(400);
    const errData = await customerCancelRes.json();
    expect(errData.error).toMatch(/already been packed/i);

    // Verify order status is still PACKED
    const checkDb = await prisma.order.findUnique({ where: { id: order.id } });
    expect(checkDb?.status).toBe('PACKED');

    // Admin CAN cancel packed order when explicit reason is provided
    const adminCancelData = await cancelOrderWithRefund({
      orderId: order.id,
      actorId: adminId,
      actorRole: 'ADMIN',
      reason: 'Admin emergency stock quality rejection',
    });
    expect(adminCancelData.order.status).toBe('CANCELLED');
  });

  it('3. Partial return refunds only the returned items', async () => {
    const orderNo = `PLUK-F18-RETURN-${Date.now()}`;
    const p1Price = 5000;
    const p2Price = 7000;
    const subtotal = p1Price * 2 + p2Price; // 10000 + 7000 = 17000
    const deliveryFee = 2000;
    const totalPaise = subtotal + deliveryFee; // 19000

    // Create DELIVERED order with 2 order items and an invoice
    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        guest_name: 'Pooja Patil',
        guest_phone: '9822998877',
        address: { line1: 'Bungalow 5, Camp', pincode: '411001' },
        status: 'DELIVERED',
        subtotal_paise: subtotal,
        delivery_fee_paise: deliveryFee,
        total_paise: totalPaise,
        payment_method: 'UPI',
        payment_status: 'SUCCESS',
        idempotency_key: `f18-key-3-${Date.now()}`,
        items: {
          create: [
            {
              product_id: products[0].id,
              shop_id: products[0].shop_id,
              qty: 2,
              mrp_paise: 6000,
              shop_price_paise: 4000,
              selling_price_paise: p1Price,
              line_total_paise: p1Price * 2,
            },
            {
              product_id: products[1].id,
              shop_id: products[1].shop_id,
              qty: 1,
              mrp_paise: 8000,
              shop_price_paise: 5500,
              selling_price_paise: p2Price,
              line_total_paise: p2Price,
            },
          ],
        },
        payments: {
          create: {
            gateway: 'razorpay',
            gateway_order_id: `order_rzp_${Date.now()}`,
            gateway_payment_id: `pay_rzp_return_${Date.now()}`,
            amount_paise: totalPaise,
            status: 'SUCCESS',
          },
        },
        delivery: {
          create: { status: 'DELIVERED', delivered_at: new Date() },
        },
      },
      include: { items: true },
    });

    // Generate invoice for the delivered order (F15)
    await generateOrderInvoice(order.id);

    const itemToReturn = order.items[0]; // Product 1 (qty 2)

    // Return 1 of product 1 for reason "damaged"
    const returnData = await processOrderReturn({
      orderId: order.id,
      actorId: adminId,
      items: [
        {
          orderItemId: itemToReturn.id,
          qty: 1,
          reasonCode: 'damaged',
        },
      ],
      notes: 'Carton arrived pierced and leaking',
    });

    // Partial refund amount must be exactly 1 * p1Price = 5000 paise
    expect(returnData.refundAmountPaise).toBe(5000);
    expect(returnData.totalReturnPaise).toBe(5000);
    expect(returnData.refund.amount_paise).toBe(5000);
    expect(returnData.creditNote).toBeDefined();

    // Check return record in DB
    const returnRecs = await prisma.return.findMany({
      where: { order_item_id: itemToReturn.id },
    });
    expect(returnRecs.length).toBe(1);
    expect(returnRecs[0].qty).toBe(1);
    expect(returnRecs[0].reason_code).toBe('damaged');
    expect(returnRecs[0].shop_cost_paise).toBe(4000);

    // Rule: Returns for damaged or expired goods create a shop ledger deduction (F18 & F23)
    const ledgerEntries = await prisma.shopLedger.findMany({
      where: { order_item_id: itemToReturn.id, entry_type: 'RETURN_DEDUCTION' },
    });
    expect(ledgerEntries.length).toBe(1);
    expect(ledgerEntries[0].amount_paise).toBe(4000);
    expect(ledgerEntries[0].shop_id).toBe(products[0].shop_id);
  });

  it('4. Refund cannot exceed the amount paid', async () => {
    const orderNo = `PLUK-F18-CAP-${Date.now()}`;
    const itemPrice = 8000;
    const totalPaise = itemPrice; // 8000 paise paid

    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        guest_name: 'Vikas Deshmukh',
        guest_phone: '9822445566',
        address: { line1: 'Flat 303, Camp', pincode: '411001' },
        status: 'DELIVERED',
        subtotal_paise: totalPaise,
        delivery_fee_paise: 0,
        total_paise: totalPaise,
        payment_method: 'UPI',
        payment_status: 'SUCCESS',
        idempotency_key: `f18-key-4-${Date.now()}`,
        items: {
          create: [
            {
              product_id: products[0].id,
              shop_id: products[0].shop_id,
              qty: 2,
              mrp_paise: 9000,
              shop_price_paise: 6000,
              selling_price_paise: 4000,
              line_total_paise: 8000,
            },
          ],
        },
        payments: {
          create: {
            gateway: 'razorpay',
            gateway_order_id: `order_rzp_${Date.now()}`,
            gateway_payment_id: `pay_rzp_cap_${Date.now()}`,
            amount_paise: totalPaise,
            status: 'SUCCESS',
          },
        },
        delivery: {
          create: { status: 'DELIVERED' },
        },
      },
      include: { items: true },
    });

    const item = order.items[0];

    // Return first unit (refunds 4000)
    const firstReturn = await processOrderReturn({
      orderId: order.id,
      actorId: adminId,
      items: [{ orderItemId: item.id, qty: 1, reasonCode: 'wrong_item' }],
    });
    expect(firstReturn.refundAmountPaise).toBe(4000);

    // Return second unit (refunds remaining 4000)
    const secondReturn = await processOrderReturn({
      orderId: order.id,
      actorId: adminId,
      items: [{ orderItemId: item.id, qty: 1, reasonCode: 'other' }],
    });
    expect(secondReturn.refundAmountPaise).toBe(4000);

    // Verify all refunds in DB sum up to exactly totalPaise (8000)
    const allRefunds = await prisma.refund.findMany({
      where: { order_id: order.id },
    });
    const totalRefunded = allRefunds.reduce((sum, r) => sum + r.amount_paise, 0);
    expect(totalRefunded).toBe(totalPaise);
    expect(totalRefunded).toBeLessThanOrEqual(order.total_paise);

    // Verify order is now marked REFUNDED and RETURNED
    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder?.payment_status).toBe('REFUNDED');
    expect(finalOrder?.status).toBe('RETURNED');

    // Attempting further return on already fully returned item is rejected
    await expect(
      processOrderReturn({
        orderId: order.id,
        actorId: adminId,
        items: [{ orderItemId: item.id, qty: 1, reasonCode: 'damaged' }],
      })
    ).rejects.toThrow();
  });

  it('5. Admin cancellation requires a non-empty cancellation reason', async () => {
    const orderNo = `PLUK-F18-REASON-${Date.now()}`;

    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        guest_name: 'Test Customer',
        guest_phone: '9822112233',
        address: { line1: 'Flat 404, Camp', pincode: '411001' },
        status: 'CONFIRMED',
        subtotal_paise: 5000,
        delivery_fee_paise: 0,
        total_paise: 5000,
        payment_method: 'COD',
        payment_status: 'PENDING_COLLECTION',
        idempotency_key: `f18-key-5-${Date.now()}`,
      },
    });

    // Attempt cancellation without reason -> rejected
    await expect(
      cancelOrderWithRefund({
        orderId: order.id,
        actorId: adminId,
        actorRole: 'ADMIN',
        reason: '   ',
      })
    ).rejects.toThrow(/cancellation reason is required/i);

    // With reason -> succeeds
    const successData = await cancelOrderWithRefund({
      orderId: order.id,
      actorId: adminId,
      actorRole: 'ADMIN',
      reason: 'Customer requested cancellation via call',
    });
    expect(successData.order.status).toBe('CANCELLED');
  });
});
