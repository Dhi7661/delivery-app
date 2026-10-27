import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { Server } from 'node:http';

let server: Server;
let BASE_URL: string;

describe('F04: Cart API', () => {
  let shopAId: string;
  let shopBId: string;
  let productA1Id: string;
  let productA2Id: string;
  let productB1Id: string;
  let cartToken: string;

  beforeAll(async () => {
    // Ensure catalog is seeded
    await seedCatalog();

    // Start server on an ephemeral port if not already listening, or port 4001 for test isolation
    await new Promise<void>((resolve) => {
      server = app.listen(4001, () => {
        BASE_URL = 'http://localhost:4001';
        resolve();
      });
    });

    const shops = await prisma.shop.findMany({ take: 2 });
    shopAId = shops[0].id;
    shopBId = shops[1].id;

    const productsA = await prisma.product.findMany({
      where: { shop_id: shopAId, is_active: true, is_available: true },
      take: 2,
    });
    productA1Id = productsA[0].id;
    productA2Id = productsA[1].id;

    const productsB = await prisma.product.findMany({
      where: { shop_id: shopBId, is_active: true, is_available: true },
      take: 1,
    });
    productB1Id = productsB[0].id;
  });

  afterAll(async () => {
    // Clean up test cart
    if (cartToken) {
      await prisma.cart.deleteMany({
        where: { token: cartToken },
      });
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Cart initializes and returns empty cart state with cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/cart`);
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('cart_token=');

    const match = setCookie!.match(/cart_token=([^;]+)/);
    expect(match).toBeTruthy();
    cartToken = match![1];

    const data = await res.json();
    expect(data.items).toEqual([]);
    expect(data.item_count).toBe(0);
    expect(data.subtotal_paise).toBe(0);
    expect(data.delivery_fee_paise).toBe(0);
    expect(data.total_paise).toBe(0);
  });

  it('Cart total equals sum of line totals plus delivery fee', async () => {
    // Add product A1 (qty 2)
    const addRes1 = await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${cartToken}`,
      },
      body: JSON.stringify({ productId: productA1Id, qty: 2 }),
    });
    expect(addRes1.status).toBe(200);

    // Add product A2 (qty 1)
    const addRes2 = await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${cartToken}`,
      },
      body: JSON.stringify({ productId: productA2Id, qty: 1 }),
    });
    expect(addRes2.status).toBe(200);

    // Read cart
    const cartRes = await fetch(`${BASE_URL}/api/cart`, {
      headers: { Cookie: `cart_token=${cartToken}` },
    });
    expect(cartRes.status).toBe(200);
    const cart = await cartRes.json();

    expect(cart.items.length).toBe(2);
    expect(cart.item_count).toBe(3);

    const expectedSubtotal = cart.items.reduce(
      (sum: number, item: { line_total_paise: number }) => sum + item.line_total_paise,
      0
    );
    expect(cart.subtotal_paise).toBe(expectedSubtotal);
    expect(cart.total_paise).toBe(cart.subtotal_paise + cart.delivery_fee_paise);
  });

  it('Adding items from different shops succeeds (multi-seller cart allowed)', async () => {
    const res = await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${cartToken}`,
      },
      body: JSON.stringify({ productId: productB1Id, qty: 1 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const itemFromB = data.items.find((i: { product_id: string }) => i.product_id === productB1Id);
    expect(itemFromB).toBeDefined();
    expect(itemFromB.shop_id).toBe(shopBId);
  });


  it('Browser-sent price fields are ignored; fresh DB price is used', async () => {
    // Attempt to send a bogus 1-paisa price from browser
    const res = await fetch(`${BASE_URL}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${cartToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
        qty: 1,
        selling_price_paise: 1, // Malicious browser attempt
        mrp_paise: 1,
      }),
    });
    expect(res.status).toBe(200);

    const cart = await res.json();
    const itemA1 = cart.items.find((i: { product_id: string }) => i.product_id === productA1Id);
    expect(itemA1).toBeDefined();

    // Verify it used the real DB selling price, not the 1-paisa spoof
    const dbProduct = await prisma.product.findUnique({ where: { id: productA1Id } });
    expect(itemA1.selling_price_paise).toBe(dbProduct!.selling_price_paise);
  });

  it('A price changed in the database appears on the next cart read', async () => {
    const originalProduct = await prisma.product.findUnique({ where: { id: productA2Id } });
    const originalPrice = originalProduct!.selling_price_paise;
    const newPrice = originalPrice - 100; // Discount ₹1

    try {
      await prisma.product.update({
        where: { id: productA2Id },
        data: { selling_price_paise: newPrice },
      });

      const cartRes = await fetch(`${BASE_URL}/api/cart`, {
        headers: { Cookie: `cart_token=${cartToken}` },
      });
      const cart = await cartRes.json();
      const itemA2 = cart.items.find((i: { product_id: string }) => i.product_id === productA2Id);

      expect(itemA2.selling_price_paise).toBe(newPrice);
    } finally {
      // Restore original price
      await prisma.product.update({
        where: { id: productA2Id },
        data: { selling_price_paise: originalPrice },
      });
    }
  });

  it('Updating item qty with 0 removes the item; positive qty updates line total', async () => {
    // Set product A2 qty to 5
    const patchRes = await fetch(`${BASE_URL}/api/cart/items/${productA2Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${cartToken}`,
      },
      body: JSON.stringify({ qty: 5 }),
    });
    expect(patchRes.status).toBe(200);
    const cartAfterUpdate = await patchRes.json();
    const updatedItem = cartAfterUpdate.items.find(
      (i: { product_id: string }) => i.product_id === productA2Id
    );
    expect(updatedItem.qty).toBe(5);

    // Set product A2 qty to 0 -> item must be deleted
    const removeRes = await fetch(`${BASE_URL}/api/cart/items/${productA2Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cart_token=${cartToken}`,
      },
      body: JSON.stringify({ qty: 0 }),
    });
    expect(removeRes.status).toBe(200);
    const cartAfterRemove = await removeRes.json();
    const removedItem = cartAfterRemove.items.find(
      (i: { product_id: string }) => i.product_id === productA2Id
    );
    expect(removedItem).toBeUndefined();
  });

  it('DELETE /api/cart empties the entire cart', async () => {
    const emptyRes = await fetch(`${BASE_URL}/api/cart`, {
      method: 'DELETE',
      headers: { Cookie: `cart_token=${cartToken}` },
    });
    expect(emptyRes.status).toBe(200);
    const cart = await emptyRes.json();
    expect(cart.items).toEqual([]);
    expect(cart.item_count).toBe(0);
    expect(cart.subtotal_paise).toBe(0);
    expect(cart.total_paise).toBe(0);
  });
});
