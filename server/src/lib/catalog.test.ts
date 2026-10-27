import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from './db.js';
import { seedCatalog, validateProductRow } from '../../prisma/seed.js';
import { DUMMY_PRODUCTS, type DummyProduct } from '../../prisma/seedData.js';

describe('F02: Catalog data', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Seed runs twice with the same result (no duplicates).', async () => {
    // Run seed first time
    await seedCatalog();
    const shopCountFirst = await prisma.shop.count();
    const categoryCountFirst = await prisma.category.count();
    const productCountFirst = await prisma.product.count();

    expect(shopCountFirst).toBe(2);
    expect(categoryCountFirst).toBe(5);
    expect(productCountFirst).toBe(30);

    // Run seed second time
    await seedCatalog();
    const shopCountSecond = await prisma.shop.count();
    const categoryCountSecond = await prisma.category.count();
    const productCountSecond = await prisma.product.count();

    // Verify exact same counts, no duplicates created
    expect(shopCountSecond).toBe(shopCountFirst);
    expect(categoryCountSecond).toBe(categoryCountFirst);
    expect(productCountSecond).toBe(productCountFirst);
  });

  it('A product with shop price above MRP makes the seed fail.', async () => {
    const invalidProduct: DummyProduct = {
      shopName: '[DUMMY] Green Valley Supermarket',
      categoryName: 'Groceries',
      name: '[DUMMY] Invalid Premium Rice',
      brand: 'TestBrand',
      unit_size: '1 kg',
      mrp_paise: 10000, // ₹100
      shop_price_paise: 12000, // ₹120 (Exceeds MRP!)
      selling_price_paise: 10000,
      is_active: true,
      is_available: true,
    };

    // 1. Direct row validation fails
    expect(() => validateProductRow(invalidProduct)).toThrow(
      /exceeding printed MRP/
    );

    // 2. Seeding with this invalid product aborts
    await expect(seedCatalog([invalidProduct])).rejects.toThrow(
      /exceeding printed MRP/
    );
  });

  it('Every product has a valid shop and category.', async () => {
    const products = await prisma.product.findMany({
      include: {
        shop: true,
        category: true,
      },
    });

    expect(products.length).toBe(30);

    for (const prod of products) {
      // Validate shop relation
      expect(prod.shop).toBeDefined();
      expect(prod.shop.id).toBe(prod.shop_id);
      expect(prod.shop.status).toBe('ACTIVE');
      expect(prod.shop.name).toContain('[DUMMY]');

      // Validate category relation
      expect(prod.category).toBeDefined();
      expect(prod.category.id).toBe(prod.category_id);
      expect(prod.category.is_active).toBe(true);

      // Validate Legal Metrology pricing rules
      expect(prod.shop_price_paise).toBeLessThanOrEqual(prod.mrp_paise);
      expect(prod.selling_price_paise).toBeLessThanOrEqual(prod.mrp_paise);
    }
  });
});
