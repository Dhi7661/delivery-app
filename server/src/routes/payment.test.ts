import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';

let server: Server;
let BASE_URL: string;

describe('F16: Online Payment (UPI test mode)', () => {
  let product1: { id: string; selling_price_paise: number };
  let product2: { id: string; selling_price_paise: number };

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
      take: 2,
    });
    product1 = products[0];
    product2 = products[1];
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  const createCartWithItem = async (productId: string, qty: number): Promise<string> => {
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
      body: JSON.stringify({ productId, qty }),
    });

    return token;
  };

  it('Creates UPI payment order where gateway order amount equals server total authority-side', async () => {
    const token = await createCartWithItem(product1.id, 2);
    const idempotencyKey = `upi-test-${Date.now()}`;

    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Dhiraj Patil',
        phone: '9876543210',
        address: 'MG Road, Camp Area',
        pincode: '411001',
        paymentMethod: 'UPI',
        idempotencyKey,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.status).toBe('PAYMENT_PENDING');
    expect(body.paymentMethod).toBe('UPI');
    expect(body.paymentStatus).toBe('PENDING');

    // Rule: Gateway order amount equals the server total
    expect(body.razorpay).toBeDefined();
    expect(body.razorpay.keyId).toBeDefined();
    expect(body.razorpay.orderId).toBeDefined();
    expect(body.razorpay.method).toBe('upi');
    expect(body.razorpay.amountPaise).toBe(body.totalPaise);

    // Verify DB state
    const orderInDb = await prisma.order.findUnique({
      where: { order_no: body.orderNumber },
      include: { payments: true },
    });

    expect(orderInDb).not.toBeNull();
    expect(orderInDb?.status).toBe('PAYMENT_PENDING');
    expect(orderInDb?.payment_method).toBe('UPI');
    expect(orderInDb?.payment_status).toBe('PENDING');
    expect(orderInDb?.total_paise).toBe(body.totalPaise);

    // Rule: Order is NOT marked CONFIRMED in this feature
    expect(orderInDb?.status).not.toBe('CONFIRMED');

    // Payment record check
    expect(orderInDb?.payments.length).toBe(1);
    const payment = orderInDb!.payments[0];
    expect(payment.gateway).toBe('razorpay');
    expect(payment.gateway_order_id).toBe(body.razorpay.orderId);
    expect(payment.amount_paise).toBe(body.totalPaise);
    expect(payment.status).toBe('PENDING');
  });

  it('Failed test payment leaves the order in PAYMENT_FAILED', async () => {
    const token = await createCartWithItem(product1.id, 1);
    const idempotencyKey = `upi-fail-test-${Date.now()}`;

    const createRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Rahul Sharma',
        phone: '9822114455',
        address: 'FC Road, Shivaji Nagar',
        pincode: '411001',
        paymentMethod: 'UPI',
        idempotencyKey,
      }),
    });

    const createBody = await createRes.json();
    const orderNo = createBody.orderNumber;

    // Simulate failure reported from gateway or dismissed checkout
    const failRes = await fetch(`${BASE_URL}/api/payments/razorpay/fail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderNo,
        reason: 'Payment cancelled by user in UPI app',
        description: 'Customer closed PhonePe payment screen without entering PIN',
      }),
    });

    expect(failRes.status).toBe(200);
    const failBody = await failRes.json();
    expect(failBody.success).toBe(true);
    expect(failBody.status).toBe('PAYMENT_FAILED');
    expect(failBody.paymentStatus).toBe('FAILED');

    // Verify order in DB is PAYMENT_FAILED
    const updatedOrder = await prisma.order.findUnique({
      where: { order_no: orderNo },
      include: { payments: true },
    });

    expect(updatedOrder?.status).toBe('PAYMENT_FAILED');
    expect(updatedOrder?.payment_status).toBe('FAILED');
    expect(updatedOrder?.payments[0]?.status).toBe('FAILED');

    // Timeline on GET /api/orders/:orderNo shows PAYMENT_FAILED
    const getRes = await fetch(`${BASE_URL}/api/orders/${orderNo}?phone=9822114455`);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.order.status).toBe('PAYMENT_FAILED');
    expect(getBody.timeline[0].status).toBe('PAYMENT_FAILED');
  });

  it('Security check: Browser cannot mark an order as paid', async () => {
    // Attempting direct confirmation via browser endpoints is rejected
    const confirmRes = await fetch(`${BASE_URL}/api/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo: 'PLUK-2026-000001', paymentId: 'pay_test123' }),
    });

    expect(confirmRes.status).toBe(403);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.error).toContain('Browser cannot mark an order as paid');

    const markPaidRes = await fetch(`${BASE_URL}/api/payments/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo: 'PLUK-2026-000001' }),
    });

    expect(markPaidRes.status).toBe(403);
  });

  it('Allows UPI orders exceeding the ₹1,000 COD limit', async () => {
    // Add large quantity exceeding ₹1,000
    const token = await createCartWithItem(product1.id, 10);
    const idempotencyKey = `upi-large-${Date.now()}`;

    // 1. COD request is rejected
    const codRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Big Spender',
        phone: '9890123456',
        address: 'Koregaon Park Road',
        pincode: '411001',
        paymentMethod: 'COD',
        idempotencyKey: `cod-large-${Date.now()}`,
      }),
    });

    expect(codRes.status).toBe(400);
    const codBody = await codRes.json();
    expect(codBody.error).toContain('Order total exceeds Cash on Delivery limit');

    // 2. UPI request succeeds even when > ₹1,000
    const upiRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Big Spender',
        phone: '9890123456',
        address: 'Koregaon Park Road',
        pincode: '411001',
        paymentMethod: 'UPI',
        idempotencyKey,
      }),
    });

    expect(upiRes.status).toBe(201);
    const upiBody = await upiRes.json();
    expect(upiBody.totalPaise).toBeGreaterThan(100000); // > ₹1,000
    expect(upiBody.status).toBe('PAYMENT_PENDING');
    expect(upiBody.paymentMethod).toBe('UPI');
    expect(upiBody.razorpay.amountPaise).toBe(upiBody.totalPaise);
  });
});
