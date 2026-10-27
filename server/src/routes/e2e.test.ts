import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { Server } from 'node:http';

let server: Server;
let BASE_URL: string;

describe('F08: Phase 1 End-to-End Customer Journey & Pincode Validation', () => {
  const TEST_PHONE = '9876543210';
  const createdOrderNos: string[] = [];

  beforeAll(async () => {
    await seedCatalog();

    await new Promise<void>((resolve) => {
      server = app.listen(4009, () => {
        BASE_URL = 'http://localhost:4009';
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up created orders
    if (createdOrderNos.length > 0) {
      await prisma.delivery.deleteMany({
        where: { order: { order_no: { in: createdOrderNos } } },
      });
      await prisma.orderItem.deleteMany({
        where: { order: { order_no: { in: createdOrderNos } } },
      });
      await prisma.order.deleteMany({
        where: { order_no: { in: createdOrderNos } },
      });
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Executes the full Phase 1 customer flow: Browse -> Add 2 Items -> Cart Check -> COD Checkout -> Order Confirmation', async () => {
    let cartCookie = '';

    // 1. Browse Home / Categories
    const catRes = await fetch(`${BASE_URL}/api/categories`);
    expect(catRes.status).toBe(200);
    const catData = await catRes.json();
    expect(Array.isArray(catData.categories)).toBe(true);
    expect(catData.categories.length).toBeGreaterThan(0);
    const chosenCategory = catData.categories[0];

    // 2. Open Category page -> fetch products
    const prodRes = await fetch(`${BASE_URL}/api/categories/${chosenCategory.id}/products`);
    expect(prodRes.status).toBe(200);
    const prodData = await prodRes.json();
    expect(Array.isArray(prodData.products)).toBe(true);
    expect(prodData.products.length).toBeGreaterThanOrEqual(2);

    const product1 = prodData.products[0];
    const product2 = prodData.products[1];

    // 3. Open Product 1 detail page
    const detailRes = await fetch(`${BASE_URL}/api/products/${product1.id}`);
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.product.id).toBe(product1.id);
    expect(detailData.product.is_available).toBe(true);

    // 4. Add 2 units of Product 1 to cart
    const add1Res = await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product1.id, qty: 2 }),
    });
    expect(add1Res.status).toBe(200);
    const setCookie = add1Res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    cartCookie = setCookie!.match(/cart_token=([^;]+)/)![0];

    const cart1 = await add1Res.json();
    expect(cart1.item_count).toBe(2);
    expect(cart1.items.length).toBe(1);

    // 5. Add 1 unit of Product 2 to cart using same cart cookie
    const add2Res = await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cartCookie,
      },
      body: JSON.stringify({ productId: product2.id, qty: 1 }),
    });
    expect(add2Res.status).toBe(200);
    const cart2 = await add2Res.json();
    expect(cart2.item_count).toBe(3);
    expect(cart2.items.length).toBe(2);

    // 6. View Cart page -> verify calculations authority-side
    const viewCartRes = await fetch(`${BASE_URL}/api/cart`, {
      headers: { Cookie: cartCookie },
    });
    expect(viewCartRes.status).toBe(200);
    const cartView = await viewCartRes.json();

    const expectedSubtotal =
      product1.selling_price_paise * 2 + product2.selling_price_paise * 1;
    expect(cartView.subtotal_paise).toBe(expectedSubtotal);
    expect(cartView.total_paise).toBe(
      expectedSubtotal + cartView.delivery_fee_paise
    );
    expect(typeof cartView.free_delivery_message).toBe('string');

    // 7. Attempt Checkout with NON-SERVICEABLE pincode (411002)
    const badCheckoutRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cartCookie,
      },
      body: JSON.stringify({
        name: 'Rohan Sharma',
        phone: TEST_PHONE,
        address: '123 Sinhagad Road',
        pincode: '411002', // non-serviceable
        idempotencyKey: `e2e-bad-${Date.now()}`,
      }),
    });
    expect(badCheckoutRes.status).toBe(400);
    const badCheckoutData = await badCheckoutRes.json();
    expect(badCheckoutData.error).toContain('do not deliver to pincode 411002');

    // 8. Place order with SERVICEABLE pincode (411001) using COD
    const goodCheckoutRes = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cartCookie,
      },
      body: JSON.stringify({
        name: 'Rohan Sharma',
        phone: TEST_PHONE,
        address: 'Flat 402, MG Road Residency',
        landmark: 'Opposite Central Mall',
        pincode: '411001', // serviceable
        idempotencyKey: `e2e-good-${Date.now()}`,
      }),
    });

    expect(goodCheckoutRes.status).toBe(201);
    const checkoutResult = await goodCheckoutRes.json();
    expect(checkoutResult.success).toBe(true);
    expect(checkoutResult.orderNumber).toMatch(/^PLUK-\d{4}-\d{6}$/);
    expect(checkoutResult.paymentMethod).toBe('COD');
    expect(checkoutResult.status).toBe('CONFIRMED');

    const createdOrderNo = checkoutResult.orderNumber;
    createdOrderNos.push(createdOrderNo);

    // 9. Verify Order & Delivery record in Database
    const dbOrder = await prisma.order.findUnique({
      where: { order_no: createdOrderNo },
      include: {
        items: true,
        delivery: true,
      },
    });

    expect(dbOrder).not.toBeNull();
    expect(dbOrder!.guest_name).toBe('Rohan Sharma');
    expect(dbOrder!.guest_phone).toBe(TEST_PHONE);
    expect(dbOrder!.status).toBe('CONFIRMED');
    expect(dbOrder!.items.length).toBe(2);
    expect(dbOrder!.delivery).not.toBeNull();
    expect(dbOrder!.delivery!.status).toBe('PENDING');

    // 10. Verify Cart was automatically emptied after checkout
    const postCheckoutCartRes = await fetch(`${BASE_URL}/api/cart`, {
      headers: { Cookie: cartCookie },
    });
    const postCheckoutCart = await postCheckoutCartRes.json();
    expect(postCheckoutCart.items.length).toBe(0);
    expect(postCheckoutCart.item_count).toBe(0);

    // 11. View Order Confirmation page (/api/orders/:orderNo)
    const orderDetailsRes = await fetch(`${BASE_URL}/api/orders/${createdOrderNo}`);
    expect(orderDetailsRes.status).toBe(200);
    const orderDetails = await orderDetailsRes.json();
    expect(orderDetails.order.order_no).toBe(createdOrderNo);
    expect(orderDetails.order.subtotal_paise).toBe(expectedSubtotal);
    expect(orderDetails.order.items.length).toBe(2);
  });

  it('Second test: Non-serviceable pincode is strictly rejected and no order record is created in database', async () => {
    // 1. Create a fresh cart
    const cartRes = await fetch(`${BASE_URL}/api/cart`);
    const setCookie = cartRes.headers.get('set-cookie')!;
    const cartCookie = setCookie.match(/cart_token=([^;]+)/)![0];

    // 2. Add an available product
    const product = await prisma.product.findFirst({
      where: { is_active: true, is_available: true },
    });

    await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cartCookie,
      },
      body: JSON.stringify({ productId: product!.id, qty: 1 }),
    });

    const initialOrderCount = await prisma.order.count();

    // 3. Attempt checkout with unserviceable pincode 560001 (Bengaluru)
    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cartCookie,
      },
      body: JSON.stringify({
        name: 'Anita Verma',
        phone: '9812345678',
        address: 'MG Road, Indiranagar',
        pincode: '560001',
        idempotencyKey: `e2e-unserviceable-${Date.now()}`,
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('do not deliver to pincode 560001');

    // 4. Verify order count did not increase
    const finalOrderCount = await prisma.order.count();
    expect(finalOrderCount).toBe(initialOrderCount);
  });
});
