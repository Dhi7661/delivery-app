import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { Server } from 'node:http';

let server: Server;
let BASE_URL: string;

describe('F06: Checkout & Order API', () => {
  let product1: { id: string; selling_price_paise: number };
  let product2: { id: string; selling_price_paise: number };
  let cartToken: string;

  beforeAll(async () => {
    await seedCatalog();

    await new Promise<void>((resolve) => {
      server = app.listen(4004, () => {
        BASE_URL = 'http://localhost:4004';
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

  it('Rejects checkout if required guest fields are missing or invalid', async () => {
    const token = await createCartWithItem(product1.id, 1);

    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'A', // too short (< 2)
        phone: '123', // invalid phone
        address: 'MG', // too short (< 5)
        pincode: '411', // invalid pincode (< 6)
        idempotencyKey: 'test-key-invalid',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('Non-serviceable pincode is rejected, no order created', async () => {
    const token = await createCartWithItem(product1.id, 1);
    const key = `test-key-unserviceable-${Date.now()}`;

    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Rahul Sharma',
        phone: '9876543210',
        address: '123 MG Road, Camp',
        landmark: 'Opposite Plaza',
        pincode: '999999', // non-serviceable pincode
        idempotencyKey: key,
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('999999');

    // Confirm no order exists with this key
    const order = await prisma.order.findUnique({
      where: { idempotency_key: key },
    });
    expect(order).toBeNull();
  });

  it('Total above COD limit (₹1,000 / 100,000 paise) is rejected', async () => {
    // Add 1 unit of product1 and then update qty in DB to exceed ₹1,000 limit
    const token = await createCartWithItem(product1.id, 1);
    const cart = await prisma.cart.findUnique({ where: { token } });
    await prisma.cartItem.updateMany({
      where: { cart_id: cart!.id },
      data: { qty: 100 }, // 100 * product price >= 100000 paise
    });

    const key = `test-key-over-limit-${Date.now()}`;

    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Rahul Sharma',
        phone: '9876543210',
        address: '123 MG Road, Camp',
        landmark: 'Near Station',
        pincode: '411001',
        idempotencyKey: key,
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Cash on Delivery limit');

    // Verify no order created
    const order = await prisma.order.findUnique({
      where: { idempotency_key: key },
    });
    expect(order).toBeNull();
  });

  it('Client-sent prices are ignored; totals calculated authority-side from DB', async () => {
    const token = await createCartWithItem(product1.id, 2);
    const key = `test-key-authority-${Date.now()}`;

    // Attempt to pass malicious prices in request payload
    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Rahul Sharma',
        phone: '9876543210',
        address: '123 MG Road, Camp',
        pincode: '411001',
        idempotencyKey: key,
        // Malicious client tampering:
        selling_price_paise: 1,
        total_paise: 1,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.orderNumber).toMatch(/^PLUK-\d{4}-\d{6}$/);

    // Authority-calculated subtotal: 2 * product1.selling_price_paise
    const expectedSubtotal = 2 * product1.selling_price_paise;
    expect(data.subtotalPaise).toBe(expectedSubtotal);
    expect(data.paymentMethod).toBe('COD');
    expect(data.paymentStatus).toBe('PENDING_COLLECTION');
    expect(data.status).toBe('CONFIRMED');

    // Database check
    const orderInDb = await prisma.order.findUnique({
      where: { idempotency_key: key },
      include: { items: true, delivery: true },
    });
    expect(orderInDb).not.toBeNull();
    expect(orderInDb!.subtotal_paise).toBe(expectedSubtotal);
    expect(orderInDb!.items[0].selling_price_paise).toBe(product1.selling_price_paise);
    expect(orderInDb!.delivery?.status).toBe('PENDING');
  });

  it('Duplicate idempotency key replays same order without duplication', async () => {
    const token = await createCartWithItem(product1.id, 1);
    const key = `test-key-idempotent-${Date.now()}`;

    const payload = {
      name: 'Pooja Patel',
      phone: '9822001122',
      address: 'Shop 4, Camp Market',
      pincode: '411001',
      idempotencyKey: key,
    };

    // First request -> 201 Created
    const res1 = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(201);
    const data1 = await res1.json();
    const orderNo = data1.orderNumber;

    // Second request with SAME idempotency key -> 200 OK (idempotent replay)
    const res2 = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.orderNumber).toBe(orderNo);
    expect(data2.isIdempotentReplay).toBe(true);

    // Verify only ONE order exists in the DB with this key
    const matchingOrders = await prisma.order.findMany({
      where: { idempotency_key: key },
    });
    expect(matchingOrders.length).toBe(1);
  });

  it('Emptying cart occurs atomically upon successful checkout', async () => {
    const token = await createCartWithItem(product1.id, 1);
    const key = `test-key-cart-empty-${Date.now()}`;

    // Verify cart has item before checkout
    const beforeCartRes = await fetch(`${BASE_URL}/api/cart`, {
      headers: { Cookie: `cart_token=${token}` },
    });
    const beforeCart = await beforeCartRes.json();
    expect(beforeCart.items.length).toBe(1);

    // Checkout
    const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Amit Deshmukh',
        phone: '9823456789',
        address: '45 East Street, Pune Camp',
        pincode: '411001',
        idempotencyKey: key,
      }),
    });
    expect(checkoutRes.status).toBe(201);

    // Verify cart is now completely empty
    const afterCartRes = await fetch(`${BASE_URL}/api/cart`, {
      headers: { Cookie: `cart_token=${token}` },
    });
    const afterCart = await afterCartRes.json();
    expect(afterCart.items.length).toBe(0);
    expect(afterCart.item_count).toBe(0);
    expect(afterCart.subtotal_paise).toBe(0);
  });

  it('GET /api/orders/:orderNo returns order details and items', async () => {
    const token = await createCartWithItem(product2.id, 1);
    const key = `test-key-lookup-${Date.now()}`;

    const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${token}`,
      },
      body: JSON.stringify({
        name: 'Karan Mehra',
        phone: '9123456780',
        address: 'Bungalow 7, Camp',
        pincode: '411001',
        idempotencyKey: key,
      }),
    });
    expect(checkoutRes.status).toBe(201);
    const checkoutData = await checkoutRes.json();
    const orderNo = checkoutData.orderNumber;

    // Fetch order details
    const orderRes = await fetch(`${BASE_URL}/api/orders/${orderNo}`);
    expect(orderRes.status).toBe(200);
    const { order } = await orderRes.json();

    expect(order.order_no).toBe(orderNo);
    expect(order.guest_name).toBe('Karan Mehra');
    expect(order.guest_phone).toBe('9123456780');
    expect(order.payment_method).toBe('COD');
    expect(order.payment_status).toBe('PENDING_COLLECTION');
    expect(order.status).toBe('CONFIRMED');
    expect(order.items.length).toBe(1);
    expect(order.items[0].product.name).toBeDefined();
    expect(order.delivery.status).toBe('PENDING');

    // 404 for unknown order
    const notFoundRes = await fetch(`${BASE_URL}/api/orders/PLUK-9999-999999`);
    expect(notFoundRes.status).toBe(404);
  });

  it('Transaction rollback preserves cart and leaves no partial order if an error occurs', async () => {
    const token = await createCartWithItem(product1.id, 1);
    const key = `test-key-rollback-${Date.now()}`;
    const cart = await prisma.cart.findUnique({ where: { token }, include: { items: true } });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.order.create({
          data: {
            order_no: `PLUK-9999-ROLLBK`,
            guest_name: 'Rollback User',
            guest_phone: '9876543210',
            address: { line1: 'Test St', pincode: '411001' },
            status: 'CONFIRMED',
            subtotal_paise: 1000,
            delivery_fee_paise: 2000,
            total_paise: 3000,
            payment_method: 'COD',
            payment_status: 'PENDING_COLLECTION',
            idempotency_key: key,
          },
        });
        await tx.cartItem.deleteMany({
          where: { cart_id: cart!.id },
        });
        throw new Error('Simulated mid-checkout failure');
      })
    ).rejects.toThrow('Simulated mid-checkout failure');

    // Confirm no order exists
    const order = await prisma.order.findUnique({
      where: { idempotency_key: key },
    });
    expect(order).toBeNull();

    // Confirm cart item was preserved
    const cartItems = await prisma.cartItem.findMany({
      where: { cart_id: cart!.id },
    });
    expect(cartItems.length).toBe(1);
  });
});

