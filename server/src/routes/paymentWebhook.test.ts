import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import {
  generateRazorpayWebhookSignature,
  registerSimulatedGatewayPayment,
  clearSimulatedGatewayPayments,
} from '../lib/razorpay.js';
import { reconcilePendingPayments } from '../lib/reconciliation.js';

let server: Server;
let BASE_URL: string;

describe('F17: Payment Webhooks & Reconciliation', () => {
  let product: { id: string; selling_price_paise: number };

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

    const products = await prisma.product.findMany({
      where: { is_active: true, is_available: true },
      take: 1,
    });
    product = products[0];
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

  const createPendingUpiOrder = async (): Promise<{
    orderNumber: string;
    orderId: string;
    totalPaise: number;
    gatewayOrderId: string;
  }> => {
    const initRes = await fetch(`${BASE_URL}/api/cart`);
    const setCookie = initRes.headers.get('set-cookie');
    const match = setCookie!.match(/cart_token=([^;]+)/);
    const token = match![1];

    await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({ productId: product.id, qty: 1 }),
    });

    const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Pooja Sharma',
        phone: '9822001122',
        address: 'FC Road, Deccan',
        pincode: '411001',
        paymentMethod: 'UPI',
        idempotencyKey: `f17-order-${Date.now()}-${Math.random()}`,
      }),
    });

    const body = await checkoutRes.json();
    return {
      orderNumber: body.orderNumber,
      orderId: body.orderId,
      totalPaise: body.totalPaise,
      gatewayOrderId: body.razorpay.orderId,
    };
  };

  it('1. Valid signature: order is confirmed and automated notification is queued', async () => {
    const orderData = await createPendingUpiOrder();
    const paymentId = `pay_f17_test_${Date.now()}`;
    const eventId = `evt_valid_${Date.now()}`;

    const webhookPayload = {
      id: eventId,
      event: 'payment.captured',
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderData.gatewayOrderId,
            amount: orderData.totalPaise,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            notes: {
              order_no: orderData.orderNumber,
            },
          },
        },
      },
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateRazorpayWebhookSignature(payloadString);

    const res = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
      },
      body: payloadString,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('confirmed');
    expect(body.orderNo).toBe(orderData.orderNumber);

    // Verify DB state: Order must be CONFIRMED with payment_status SUCCESS
    const updatedOrder = await prisma.order.findUnique({
      where: { order_no: orderData.orderNumber },
      include: { payments: true, notifications: true },
    });

    expect(updatedOrder).not.toBeNull();
    expect(updatedOrder!.status).toBe('CONFIRMED');
    expect(updatedOrder!.payment_status).toBe('SUCCESS');

    // Payment record must be SUCCESS with gateway_payment_id
    const payment = updatedOrder!.payments.find((p) => p.gateway_payment_id === paymentId);
    expect(payment).toBeDefined();
    expect(payment!.status).toBe('SUCCESS');

    // Automated order confirmation notification must exist
    const confirmedNotif = updatedOrder!.notifications.find(
      (n) => n.order_status === 'CONFIRMED' && n.recipient_type === 'CUSTOMER'
    );
    expect(confirmedNotif).toBeDefined();

    // Event must be stored in ProcessedEvent table
    const processed = await prisma.processedEvent.findUnique({
      where: { event_id: eventId },
    });
    expect(processed).not.toBeNull();
  });

  it('2. Invalid signature: refused with 401 Unauthorized', async () => {
    const orderData = await createPendingUpiOrder();
    const webhookPayload = {
      id: `evt_invalid_${Date.now()}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_fake_${Date.now()}`,
            order_id: orderData.gatewayOrderId,
            amount: orderData.totalPaise,
          },
        },
      },
    };

    const res = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'invalid_forged_hmac_signature_hex',
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Invalid webhook signature');

    // Order must remain PAYMENT_PENDING
    const order = await prisma.order.findUnique({
      where: { order_no: orderData.orderNumber },
    });
    expect(order!.status).toBe('PAYMENT_PENDING');
  });

  it('3. Same event twice: processed once (duplicate event ignored)', async () => {
    const orderData = await createPendingUpiOrder();
    const paymentId = `pay_dup_${Date.now()}`;
    const eventId = `evt_duplicate_${Date.now()}`;

    const webhookPayload = {
      id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderData.gatewayOrderId,
            amount: orderData.totalPaise,
            status: 'captured',
            notes: { order_no: orderData.orderNumber },
          },
        },
      },
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateRazorpayWebhookSignature(payloadString);

    // First delivery
    const res1 = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
      },
      body: payloadString,
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.status).toBe('confirmed');

    // Second delivery (duplicate event)
    const res2 = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
      },
      body: payloadString,
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.status).toBe('ignored');
    expect(body2.message).toContain('Duplicate event already processed');
  });

  it('4. Amount mismatch: flagged, not confirmed', async () => {
    const orderData = await createPendingUpiOrder();
    const paymentId = `pay_mismatch_${Date.now()}`;
    const eventId = `evt_mismatch_${Date.now()}`;

    // Payload has different amount (e.g. ₹10 less)
    const tamperedAmount = orderData.totalPaise - 1000;

    const webhookPayload = {
      id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderData.gatewayOrderId,
            amount: tamperedAmount,
            status: 'captured',
            notes: { order_no: orderData.orderNumber },
          },
        },
      },
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateRazorpayWebhookSignature(payloadString);

    const res = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
      },
      body: payloadString,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('flagged');
    expect(body.message).toContain('Amount mismatch');

    // Order must NOT be confirmed; remains in PAYMENT_PENDING
    const order = await prisma.order.findUnique({
      where: { order_no: orderData.orderNumber },
    });
    expect(order!.status).toBe('PAYMENT_PENDING');

    // Audit log must record mismatch
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity_id: orderData.orderId,
        action: 'PAYMENT_AMOUNT_MISMATCH',
      },
    });
    expect(auditLogs.length).toBeGreaterThan(0);
  });

  it('5. Missed webhook: recovered by reconciliation', async () => {
    clearSimulatedGatewayPayments();

    const orderData = await createPendingUpiOrder();
    const simulatedPaymentId = `pay_recon_${Date.now()}`;

    // Backdate the order to 15 minutes ago (simulating order created earlier whose webhook was missed)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    await prisma.order.update({
      where: { id: orderData.orderId },
      data: { created_at: fifteenMinutesAgo },
    });

    // Register captured payment in simulated gateway registry
    registerSimulatedGatewayPayment({
      id: simulatedPaymentId,
      order_id: orderData.gatewayOrderId,
      amount: orderData.totalPaise,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
    });

    // Run reconciliation for orders older than 10 minutes
    const summary = await reconcilePendingPayments({ olderThanMinutes: 10 });

    expect(summary.checked).toBeGreaterThanOrEqual(1);
    expect(summary.confirmed).toBeGreaterThanOrEqual(1);

    const recoveredRecord = summary.orders.find((o) => o.orderNo === orderData.orderNumber);
    expect(recoveredRecord).toBeDefined();
    expect(recoveredRecord!.action).toBe('CONFIRMED');

    // Verify order in database is now CONFIRMED
    const reconciledOrder = await prisma.order.findUnique({
      where: { id: orderData.orderId },
      include: { payments: true },
    });

    expect(reconciledOrder!.status).toBe('CONFIRMED');
    expect(reconciledOrder!.payment_status).toBe('SUCCESS');
    expect(reconciledOrder!.payments[0].status).toBe('SUCCESS');
    expect(reconciledOrder!.payments[0].gateway_payment_id).toBe(simulatedPaymentId);
  });
});
