import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from './db.js';
import { seedCatalog } from '../../prisma/seed.js';
import { getNextOrderNumber, generateOrderNumber } from './order.js';

describe('F05: Order Data Model', () => {
  let testShopId: string;
  let testProduct1: { id: string; selling_price_paise: number; shop_price_paise: number; mrp_paise: number };
  let testProduct2: { id: string; selling_price_paise: number; shop_price_paise: number; mrp_paise: number };
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    await seedCatalog();

    const shop = await prisma.shop.findFirst({ where: { name: '[DUMMY] Green Valley Supermarket' } });
    testShopId = shop!.id;

    const products = await prisma.product.findMany({
      where: { shop_id: testShopId, is_active: true, is_available: true },
      take: 2,
    });
    testProduct1 = products[0];
    testProduct2 = products[1];
  });

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('Two orders created at the same moment get different sequence-based order numbers', async () => {
    // Invoke concurrent sequence calls simultaneously
    const results = await Promise.all([
      getNextOrderNumber(),
      getNextOrderNumber(),
      getNextOrderNumber(),
      getNextOrderNumber(),
      getNextOrderNumber(),
    ]);

    // Every order number must match the format PLUK-YYYY-000000
    const currentYear = new Date().getFullYear();
    const orderNoRegex = new RegExp(`^PLUK-${currentYear}-\\d{6}$`);
    for (const no of results) {
      expect(no).toMatch(orderNoRegex);
    }

    // Every order number generated concurrently must be distinct (no duplicates)
    const uniqueOrderNos = new Set(results);
    expect(uniqueOrderNos.size).toBe(results.length);
  });

  it('total_paise equals the sum of line totals plus the delivery fee', async () => {
    const orderNo = await getNextOrderNumber();
    const idempotencyKey = crypto.randomUUID();

    const qty1 = 2;
    const qty2 = 1;
    const lineTotal1 = qty1 * testProduct1.selling_price_paise;
    const lineTotal2 = qty2 * testProduct2.selling_price_paise;
    const subtotalPaise = lineTotal1 + lineTotal2;
    const deliveryFeePaise = 2000; // ₹20
    const totalPaise = subtotalPaise + deliveryFeePaise;

    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        idempotency_key: idempotencyKey,
        guest_name: 'Dhiraj Sharma',
        guest_phone: '9876543210',
        address: {
          line1: 'Flat 402, Sunshine Apts',
          landmark: 'Near City Mall',
          pincode: '411001',
        },
        status: 'PLACED',
        subtotal_paise: subtotalPaise,
        delivery_fee_paise: deliveryFeePaise,
        total_paise: totalPaise,
        payment_method: 'COD',
        payment_status: 'PENDING',
        items: {
          create: [
            {
              product_id: testProduct1.id,
              shop_id: testShopId,
              qty: qty1,
              mrp_paise: testProduct1.mrp_paise,
              shop_price_paise: testProduct1.shop_price_paise,
              selling_price_paise: testProduct1.selling_price_paise,
              line_total_paise: lineTotal1,
            },
            {
              product_id: testProduct2.id,
              shop_id: testShopId,
              qty: qty2,
              mrp_paise: testProduct2.mrp_paise,
              shop_price_paise: testProduct2.shop_price_paise,
              selling_price_paise: testProduct2.selling_price_paise,
              line_total_paise: lineTotal2,
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
      include: {
        items: true,
        delivery: true,
      },
    });

    createdOrderIds.push(order.id);

    const sumLineTotals = order.items.reduce((acc, item) => acc + item.line_total_paise, 0);
    expect(order.subtotal_paise).toBe(sumLineTotals);
    expect(order.total_paise).toBe(order.subtotal_paise + order.delivery_fee_paise);
    expect(order.delivery?.status).toBe('PENDING');
    expect(order.user_id).toBeNull(); // Guest order supported
  });

  it('Duplicate idempotency_key is rejected by the database', async () => {
    const duplicateKey = crypto.randomUUID();
    const orderNo1 = await getNextOrderNumber();

    const firstOrder = await prisma.order.create({
      data: {
        order_no: orderNo1,
        idempotency_key: duplicateKey,
        guest_name: 'First User',
        guest_phone: '9999999999',
        address: { pincode: '411001' },
        status: 'PLACED',
        subtotal_paise: 10000,
        delivery_fee_paise: 2000,
        total_paise: 12000,
      },
    });
    createdOrderIds.push(firstOrder.id);

    const orderNo2 = await getNextOrderNumber();

    // Second order with same idempotency key must fail with unique constraint violation
    await expect(
      prisma.order.create({
        data: {
          order_no: orderNo2,
          idempotency_key: duplicateKey, // Duplicate!
          guest_name: 'Second User',
          guest_phone: '8888888888',
          address: { pincode: '411001' },
          status: 'PLACED',
          subtotal_paise: 15000,
          delivery_fee_paise: 0,
          total_paise: 15000,
        },
      })
    ).rejects.toThrow();
  });

  it('Prices are copied into OrderItem at creation and later price changes never change an existing order', async () => {
    const orderNo = await getNextOrderNumber();
    const originalSellingPrice = testProduct1.selling_price_paise;

    const order = await prisma.order.create({
      data: {
        order_no: orderNo,
        idempotency_key: crypto.randomUUID(),
        address: { pincode: '411001' },
        subtotal_paise: originalSellingPrice,
        delivery_fee_paise: 0,
        total_paise: originalSellingPrice,
        items: {
          create: {
            product_id: testProduct1.id,
            shop_id: testShopId,
            qty: 1,
            mrp_paise: testProduct1.mrp_paise,
            shop_price_paise: testProduct1.shop_price_paise,
            selling_price_paise: originalSellingPrice,
            line_total_paise: originalSellingPrice,
          },
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    const orderItemId = order.items[0].id;

    // Simulate price increase in Product table
    const increasedPrice = originalSellingPrice + 5000;
    await prisma.product.update({
      where: { id: testProduct1.id },
      data: { selling_price_paise: increasedPrice },
    });

    try {
      // Re-read OrderItem from DB
      const existingOrderItem = await prisma.orderItem.findUnique({
        where: { id: orderItemId },
      });

      // Price in OrderItem must be unchanged
      expect(existingOrderItem!.selling_price_paise).toBe(originalSellingPrice);
      expect(existingOrderItem!.selling_price_paise).not.toBe(increasedPrice);
    } finally {
      // Restore original price
      await prisma.product.update({
        where: { id: testProduct1.id },
        data: { selling_price_paise: originalSellingPrice },
      });
    }
  });
});
