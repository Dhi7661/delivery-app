import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { Server } from 'node:http';

let server: Server;
let BASE_URL: string;

describe('F07: Admin Product CSV Upload API', () => {
  const ADMIN_PASSWORD = 'test-admin-secret-2026';

  beforeAll(async () => {
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    await seedCatalog();

    await new Promise<void>((resolve) => {
      server = app.listen(4008, () => {
        BASE_URL = 'http://localhost:4008';
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up products and price history created during tests
    await prisma.priceHistory.deleteMany({
      where: {
        product: {
          OR: [
            { name: { contains: 'Fresh Organic Oats' } },
            { name: { contains: 'Existing Honey' } },
            { name: { contains: 'Test' } },
          ],
        },
      },
    });

    await prisma.product.deleteMany({
      where: {
        OR: [
          { name: { contains: 'Fresh Organic Oats' } },
          { name: { contains: 'Existing Honey' } },
          { name: { contains: 'Test' } },
        ],
      },
    });

    await prisma.auditLog.deleteMany({
      where: { action: 'PRODUCT_CSV_UPLOAD' },
    });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Rejects upload with missing or invalid admin password', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': 'wrong-password',
      },
      body: JSON.stringify({
        csvContent: 'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees\n',
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Invalid or missing admin password');
  });

  it('Rejects invalid rupee decimals (e.g. 12.505) and lists row number', async () => {
    const csv = [
      'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees',
      '[DUMMY] Green Valley Supermarket,Groceries,Test Decimal Flour,BrandX,1 kg,50.00,45.505',
    ].join('\n');

    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
      body: JSON.stringify({ csvContent: csv, fileName: 'invalid_decimal.csv' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.errors[0].row).toBe(2);
    expect(data.errors[0].error).toContain('at most 2 decimal places');
  });

  it('Rejects upload when shop_price exceeds printed MRP with exact row number', async () => {
    const csv = [
      'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees',
      '[DUMMY] Green Valley Supermarket,Groceries,Overpriced Rice,BrandX,1 kg,100.00,105.00',
    ].join('\n');

    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
      body: JSON.stringify({ csvContent: csv }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.errors[0].row).toBe(2);
    expect(data.errors[0].error).toContain('exceeds printed MRP');
  });

  it('All-or-nothing: A file with one bad row imports nothing', async () => {
    const uniqueGoodName = `Valid Item ${Date.now()}`;
    const csv = [
      'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees',
      `[DUMMY] Green Valley Supermarket,Groceries,${uniqueGoodName},BrandA,1 kg,50.00,40.00`,
      '[DUMMY] Green Valley Supermarket,NonExistentCategory,Bad Item,BrandB,1 kg,50.00,40.00',
    ].join('\n');

    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
      body: JSON.stringify({ csvContent: csv }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.row === 3 && e.error.includes('Unknown category'))).toBe(true);

    // Verify valid product was NOT created due to rollback
    const dbItem = await prisma.product.findFirst({ where: { name: uniqueGoodName } });
    expect(dbItem).toBeNull();
  });

  it('Successfully uploads valid CSV, creates products, records price_history and writes audit_logs', async () => {
    const productName = `Fresh Organic Oats ${Date.now()}`;
    const csv = [
      'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees',
      `[DUMMY] Green Valley Supermarket,Groceries,${productName},Quaker,1 kg,150.50,130.00`,
    ].join('\n');

    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
      body: JSON.stringify({ csvContent: csv, fileName: 'test_products.csv' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.createdCount).toBe(1);
    expect(data.totalProcessed).toBe(1);

    // 1. Check Product in DB
    const dbProduct = await prisma.product.findFirst({
      where: { name: productName },
      include: { price_history: true },
    });
    expect(dbProduct).not.toBeNull();
    expect(dbProduct!.mrp_paise).toBe(15050); // 150.50 -> 15050
    expect(dbProduct!.shop_price_paise).toBe(13000); // 130.00 -> 13000
    expect(dbProduct!.selling_price_paise).toBe(15050);

    // 2. Check Price History created
    expect(dbProduct!.price_history.length).toBeGreaterThanOrEqual(1);
    expect(dbProduct!.price_history[0].mrp_paise).toBe(15050);

    // 3. Check Audit Log written
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: 'PRODUCT_CSV_UPLOAD' },
      orderBy: { created_at: 'desc' },
    });
    expect(auditLog).not.toBeNull();
    expect((auditLog!.new_value as any).filename).toBe('test_products.csv');
    expect((auditLog!.new_value as any).created_count).toBe(1);
  });

  it('Updating an existing product updates price and creates new price_history entry', async () => {
    const productName = `Existing Honey ${Date.now()}`;
    const shop = await prisma.shop.findFirst({ where: { name: '[DUMMY] Green Valley Supermarket' } });
    const category = await prisma.category.findFirst({ where: { name: 'Groceries' } });

    // Initial product
    const product = await prisma.product.create({
      data: {
        shop_id: shop!.id,
        category_id: category!.id,
        name: productName,
        brand: 'Dabur',
        unit_size: '500 g',
        mrp_paise: 20000,
        shop_price_paise: 18000,
        selling_price_paise: 20000,
      },
    });

    // CSV with new price
    const csv = [
      'shop_name,category,product_name,brand,unit_size,mrp_rupees,shop_price_rupees',
      `[DUMMY] Green Valley Supermarket,Groceries,${productName},Dabur,500 g,220.00,190.00`,
    ].join('\n');

    const res = await fetch(`${BASE_URL}/api/admin/products/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
      body: JSON.stringify({ csvContent: csv }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updatedCount).toBe(1);

    // Verify DB updated
    const updated = await prisma.product.findUnique({
      where: { id: product.id },
      include: { price_history: true },
    });
    expect(updated!.mrp_paise).toBe(22000);
    expect(updated!.shop_price_paise).toBe(19000);
    expect(updated!.price_history.length).toBe(1);
    expect(updated!.price_history[0].mrp_paise).toBe(22000);
  });
});
