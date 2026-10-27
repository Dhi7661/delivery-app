import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';

let server: Server;
let BASE_URL = 'http://localhost:4002';

describe('F03: Catalog API', () => {
  let activeCategoryId: string;
  let inactiveProductId: string;

  beforeAll(async () => {
    // Start test server
    await new Promise<void>((resolve) => {
      server = app.listen(4002, () => resolve());
    });

    // Seed initial catalog data
    await seedCatalog();

    const category = await prisma.category.findFirst({
      where: { name: 'Groceries' },
    });
    activeCategoryId = category!.id;

    const shop = await prisma.shop.findFirst();

    // Create a temporary inactive product to test filtering
    const inactive = await prisma.product.upsert({
      where: {
        shop_id_name_unit_size: {
          shop_id: shop!.id,
          name: '[DUMMY] Inactive Secret Product Test',
          unit_size: '500 g',
        },
      },
      update: {
        is_active: false,
      },
      create: {
        shop_id: shop!.id,
        category_id: activeCategoryId,
        name: '[DUMMY] Inactive Secret Product Test',
        brand: 'HiddenBrand',
        unit_size: '500 g',
        mrp_paise: 5000,
        shop_price_paise: 4000,
        selling_price_paise: 5000,
        is_active: false,
        is_available: true,
      },
    });
    inactiveProductId = inactive.id;
  });

  afterAll(async () => {
    // Clean up test inactive product
    await prisma.product.deleteMany({
      where: { id: inactiveProductId },
    });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Inactive products never appear in lists or search.', async () => {
    // 1. List by category must NOT contain inactive product
    const listRes = await fetch(`${BASE_URL}/api/categories/${activeCategoryId}/products?limit=50`);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    const listedIds = listData.products.map((p: { id: string }) => p.id);
    expect(listedIds).not.toContain(inactiveProductId);

    // 2. Search must NOT return inactive product
    const searchRes = await fetch(`${BASE_URL}/api/products/search?q=Inactive`);
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    const searchIds = searchData.products.map((p: { id: string }) => p.id);
    expect(searchIds).not.toContain(inactiveProductId);

    // 3. Direct GET by ID on inactive product must return 404
    const directRes = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`);
    expect(directRes.status).toBe(404);
    const directData = await directRes.json();
    expect(directData.error).toContain('inactive');
  });

  it('Limit above 50 is rejected or capped.', async () => {
    // Request with limit 100 should be capped at 50
    const res = await fetch(`${BASE_URL}/api/categories/${activeCategoryId}/products?limit=100`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.products.length).toBeLessThanOrEqual(50);
  });

  it('Search with fewer than 2 characters returns a clear error.', async () => {
    // Search with 1 character
    const resSingle = await fetch(`${BASE_URL}/api/products/search?q=a`);
    expect(resSingle.status).toBe(400);
    const dataSingle = await resSingle.json();
    expect(dataSingle.error).toContain('at least 2 characters');

    // Search with empty query
    const resEmpty = await fetch(`${BASE_URL}/api/products/search?q=`);
    expect(resEmpty.status).toBe(400);
    const dataEmpty = await resEmpty.json();
    expect(dataEmpty.error).toContain('at least 2 characters');
  });

  it('GET /api/categories returns active categories list', async () => {
    const res = await fetch(`${BASE_URL}/api/categories`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories).toBeDefined();
    expect(data.categories.length).toBeGreaterThanOrEqual(5);
  });
});
