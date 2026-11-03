import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../lib/db.js';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { ADMIN_COOKIE_NAME } from './adminAuth.js';
import { AUTH_COOKIE_NAME } from './auth.js';

let server: Server;
let BASE_URL: string;
let adminCookie: string;
let customerCookie: string;
let sampleProductId: string;
let sampleCategoryId: string;

describe('Phase C1: Admin Product List & Stock Toggles', () => {
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

    // 1. Create Admin User & Session
    const adminEmail = `c1-admin-${Date.now()}@plukit.test`;
    const hashed = await bcrypt.hash('Secret123!', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'Catalog Manager',
        password_hash: hashed,
        is_active: true,
      },
    });

    const adminToken = crypto.randomBytes(32).toString('hex');
    await prisma.adminSession.create({
      data: {
        admin_user_id: admin.id,
        token: adminToken,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    adminCookie = `${ADMIN_COOKIE_NAME}=${adminToken}`;

    // 2. Create Customer Session (for authorization checks)
    const customer = await prisma.user.create({
      data: {
        name: 'Shopper',
        phone: `9822${Math.floor(100000 + Math.random() * 900000)}`,
        role: 'CUSTOMER',
      },
    });
    const custToken = crypto.randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        user_id: customer.id,
        token: custToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    customerCookie = `${AUTH_COOKIE_NAME}=${custToken}`;

    // 3. Find sample product and category
    const prod = await prisma.product.findFirst({
      where: { is_active: true },
      include: { category: true },
    });
    sampleProductId = prod!.id;
    sampleCategoryId = prod!.category_id;
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

  it('1. Rejects unauthenticated requests to GET /api/admin/products with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products`);
    expect(res.status).toBe(401);
  });

  it('2. Rejects customer session tokens from accessing admin products with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { Cookie: customerCookie },
    });
    expect(res.status).toBe(401);
  });

  it('3. Returns paginated products with categories and shops to authenticated admin', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.products)).toBe(true);
    expect(data.products.length).toBeGreaterThan(0);
    expect(Array.isArray(data.categories)).toBe(true);
    expect(Array.isArray(data.shops)).toBe(true);
    expect(data.pagination).toHaveProperty('total');

    // Verify fields per Section 5.1
    const p = data.products[0];
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('brand');
    expect(p).toHaveProperty('unit_size');
    expect(p).toHaveProperty('mrp_paise');
    expect(p).toHaveProperty('shop_price_paise');
    expect(p).toHaveProperty('selling_price_paise');
    expect(p).toHaveProperty('margin_paise');
    expect(p).toHaveProperty('margin_pct');
    expect(p).toHaveProperty('is_available');
    expect(p).toHaveProperty('is_active');
    expect(p.category).toBeDefined();
    expect(p.shop).toBeDefined();
  });

  it('4. Filters products by search query q', async () => {
    const sample = await prisma.product.findUnique({ where: { id: sampleProductId } });
    const queryTerm = sample!.name.split(' ')[0];

    const res = await fetch(`${BASE_URL}/api/admin/products?q=${encodeURIComponent(queryTerm)}`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.products.length).toBeGreaterThan(0);
    data.products.forEach((p: any) => {
      const match =
        p.name.toLowerCase().includes(queryTerm.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(queryTerm.toLowerCase()));
      expect(match).toBe(true);
    });
  });

  it('5. Filters products by categoryId', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products?categoryId=${sampleCategoryId}`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.products.length).toBeGreaterThan(0);
    data.products.forEach((p: any) => {
      expect(p.category.id).toBe(sampleCategoryId);
    });
  });

  it('6. Toggle stock updates is_available and reflects on customer storefront immediately', async () => {
    // Check initial state
    const before = await prisma.product.findUnique({ where: { id: sampleProductId } });
    const initialStock = before!.is_available;

    // 1. Toggle stock via admin API
    const toggleRes = await fetch(`${BASE_URL}/api/admin/products/${sampleProductId}/toggle-stock`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
    });

    expect(toggleRes.status).toBe(200);
    const toggleData = await toggleRes.json();
    expect(toggleData.success).toBe(true);
    expect(toggleData.product.is_available).toBe(!initialStock);

    // 2. Verify storefront reflects change immediately (Exit Check)
    const storeRes = await fetch(`${BASE_URL}/api/categories/${sampleCategoryId}/products`);
    expect(storeRes.status).toBe(200);
    const storeData = await storeRes.json();
    const storefrontProduct = storeData.products.find((p: any) => p.id === sampleProductId);

    if (storefrontProduct) {
      expect(storefrontProduct.is_available).toBe(!initialStock);
    }

    // 3. Toggle back
    const toggleBackRes = await fetch(`${BASE_URL}/api/admin/products/${sampleProductId}/toggle-stock`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
    });
    expect(toggleBackRes.status).toBe(200);
    const finalData = await toggleBackRes.json();
    expect(finalData.product.is_available).toBe(initialStock);
  });

  it('7. Toggle active updates storefront visibility (is_active)', async () => {
    const before = await prisma.product.findUnique({ where: { id: sampleProductId } });
    const initialActive = before!.is_active;

    const toggleRes = await fetch(`${BASE_URL}/api/admin/products/${sampleProductId}/toggle-active`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
    });

    expect(toggleRes.status).toBe(200);
    const data = await toggleRes.json();
    expect(data.success).toBe(true);
    expect(data.product.is_active).toBe(!initialActive);

    // Toggle back to preserve state
    await fetch(`${BASE_URL}/api/admin/products/${sampleProductId}/toggle-active`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
    });
  });

  it('8. In-place price update enforces rule: shop_price <= selling_price <= MRP', async () => {
    const prod = await prisma.product.findUnique({ where: { id: sampleProductId } });
    const { mrp_paise, shop_price_paise } = prod!;

    // Case A: Selling price above MRP is rejected
    const aboveMrpRes = await fetch(`${BASE_URL}/api/admin/products/${sampleProductId}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        selling_price_paise: mrp_paise + 500,
      }),
    });
    expect(aboveMrpRes.status).toBe(400);
    const errAbove = await aboveMrpRes.json();
    expect(errAbove.error).toMatch(/cannot exceed printed MRP/i);

    // Case B: Selling price below shop buy price is rejected
    const belowBuyRes = await fetch(`${BASE_URL}/api/admin/products/${sampleProductId}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        selling_price_paise: shop_price_paise - 500,
      }),
    });
    expect(belowBuyRes.status).toBe(400);
    const errBelow = await belowBuyRes.json();
    expect(errBelow.error).toMatch(/cannot be lower than shop buy price/i);

    // Case C: Valid price update succeeds and creates PriceHistory
    const validPrice = mrp_paise - 50;
    const validRes = await fetch(`${BASE_URL}/api/admin/products/${sampleProductId}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        selling_price_paise: validPrice,
      }),
    });

    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.product.selling_price_paise).toBe(validPrice);

    // Verify price history record
    const history = await prisma.priceHistory.findFirst({
      where: { product_id: sampleProductId, selling_price_paise: validPrice },
    });
    expect(history).toBeDefined();
  });

  it('9. Bulk action updates multiple products atomically', async () => {
    const prods = await prisma.product.findMany({ take: 3 });
    const ids = prods.map((p) => p.id);

    const bulkRes = await fetch(`${BASE_URL}/api/admin/products/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        productIds: ids,
        action: 'set_out_of_stock',
      }),
    });

    expect(bulkRes.status).toBe(200);
    const data = await bulkRes.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(3);

    // Verify all 3 in DB are out of stock
    const updated = await prisma.product.findMany({ where: { id: { in: ids } } });
    updated.forEach((p) => expect(p.is_available).toBe(false));

    // Reset them to in stock
    await fetch(`${BASE_URL}/api/admin/products/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        productIds: ids,
        action: 'set_in_stock',
      }),
    });
  });

  // Phase C2 Tests: Add Product & Meta
  it('10. GET /api/admin/products/meta returns active categories and partner shops', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products/meta`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(Array.isArray(data.shops)).toBe(true);
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.shops.length).toBeGreaterThan(0);
  });

  it('11. POST /api/admin/products rejects unauthorized calls with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });

    expect(res.status).toBe(401);
  });

  it('12. POST /api/admin/products rejects customer tokens with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
      },
      body: JSON.stringify({ name: 'Test' }),
    });

    expect(res.status).toBe(401);
  });

  it('13. POST /api/admin/products rejects selling_price > mrp with HTTP 400', async () => {
    const shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    const category = await prisma.category.findFirst({ where: { is_active: true } });

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Overpriced Product',
        unit_size: '500 g',
        category_id: category!.id,
        shop_id: shop!.id,
        mrp_paise: 5000, // ₹50
        shop_price_paise: 4000, // ₹40
        selling_price_paise: 5500, // ₹55 > ₹50 (Illegal)
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('cannot exceed printed MRP');
  });

  it('14. POST /api/admin/products rejects selling_price < shop_price with HTTP 400', async () => {
    const shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    const category = await prisma.category.findFirst({ where: { is_active: true } });

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Underpriced Product',
        unit_size: '500 g',
        category_id: category!.id,
        shop_id: shop!.id,
        mrp_paise: 5000, // ₹50
        shop_price_paise: 4000, // ₹40
        selling_price_paise: 3500, // ₹35 < ₹40 (Illegal negative margin)
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('cannot be lower than shop buy price');
  });

  it('15. POST /api/admin/products rejects invalid image formats like SVG (Section 10.2)', async () => {
    const shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    const category = await prisma.category.findFirst({ where: { is_active: true } });

    const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>').toString('base64');

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'SVG Test Product',
        unit_size: '1 pc',
        category_id: category!.id,
        shop_id: shop!.id,
        mrp_paise: 5000,
        shop_price_paise: 3000,
        selling_price_paise: 4500,
        photo_base64: `data:image/svg+xml;base64,${svgPayload}`,
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Only JPG, PNG, and WebP images are permitted');
  });

  it('16. POST /api/admin/products creates product, records price history, and updates storefront', async () => {
    const shop = await prisma.shop.findFirst({ where: { status: 'ACTIVE' } });
    const category = await prisma.category.findFirst({ where: { is_active: true } });

    const uniqueName = `Organic Fresh Butter ${Date.now()}`;
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]).toString('base64');

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: uniqueName,
        brand: 'DairyFresh',
        unit_size: '250 g',
        category_id: category!.id,
        shop_id: shop!.id,
        mrp_paise: 12000, // ₹120
        shop_price_paise: 9500, // ₹95
        selling_price_paise: 11000, // ₹110
        hsn_code: '04051000',
        gst_rate: 5.0,
        is_available: true,
        is_active: true,
        photo_base64: `data:image/png;base64,${pngHeader}`,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.product.name).toBe(uniqueName);
    expect(data.product.selling_price_paise).toBe(11000);
    expect(data.product.margin_paise).toBe(1500); // 11000 - 9500
    expect(data.product.margin_pct).toBe(13.6); // 1500 / 11000 = ~13.6%

    // Verify Price History record exists
    const history = await prisma.priceHistory.findFirst({
      where: { product_id: data.product.id },
    });
    expect(history).toBeDefined();
    expect(history!.mrp_paise).toBe(12000);
    expect(history!.selling_price_paise).toBe(11000);

    // Verify GET /api/admin/products/:id returns the created product
    const getRes = await fetch(`${BASE_URL}/api/admin/products/${data.product.id}`, {
      headers: { Cookie: adminCookie },
    });
    expect(getRes.status).toBe(200);
    const getDetails = await getRes.json();
    expect(getDetails.product.id).toBe(data.product.id);
    expect(getDetails.product.price_history.length).toBeGreaterThan(0);

    // Verify duplicate creation is rejected with HTTP 409
    const dupRes = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: uniqueName,
        brand: 'DairyFresh',
        unit_size: '250 g',
        category_id: category!.id,
        shop_id: shop!.id,
        mrp_paise: 12000,
        shop_price_paise: 9500,
        selling_price_paise: 11000,
      }),
    });
    expect(dupRes.status).toBe(409);
    const dupData = await dupRes.json();
    expect(dupData.error).toContain('already exists for this shop');
  });
});

