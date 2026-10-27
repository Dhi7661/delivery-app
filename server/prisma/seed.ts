import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  DUMMY_SHOPS,
  DUMMY_CATEGORIES,
  DUMMY_PRODUCTS,
  type DummyProduct,
} from './seedData.js';

const prisma = new PrismaClient();

export const INITIAL_SETTINGS = [
  {
    key: 'DELIVERY_FEE_PAISE',
    value_paise: 2000, // ₹20
    is_dummy: true,
  },
  {
    key: 'FREE_DELIVERY_THRESHOLD_PAISE',
    value_paise: 30000, // ₹300
    is_dummy: true,
  },
  {
    key: 'COD_LIMIT_PAISE',
    value_paise: 100000, // ₹1,000
    is_dummy: true,
  },
];

/**
 * Validate a catalog product row before database insertion.
 * Rules:
 * - shop_price_paise <= mrp_paise
 * - selling_price_paise <= mrp_paise
 * - All prices must be positive integer paise
 */
export function validateProductRow(product: DummyProduct): void {
  if (!Number.isInteger(product.mrp_paise) || product.mrp_paise <= 0) {
    throw new Error(`Product '${product.name}' has invalid MRP: ${product.mrp_paise}`);
  }

  if (!Number.isInteger(product.shop_price_paise) || product.shop_price_paise <= 0) {
    throw new Error(`Product '${product.name}' has invalid shop price: ${product.shop_price_paise}`);
  }

  if (product.shop_price_paise > product.mrp_paise) {
    throw new Error(
      `Product '${product.name}' has shop price (${product.shop_price_paise} paise) exceeding printed MRP (${product.mrp_paise} paise). Seeding aborted.`
    );
  }

  if (product.selling_price_paise > product.mrp_paise) {
    throw new Error(
      `Product '${product.name}' has selling price (${product.selling_price_paise} paise) exceeding printed MRP (${product.mrp_paise} paise). Violation of Legal Metrology.`
    );
  }
}

export async function seedCatalog(customProducts?: DummyProduct[]) {
  console.log('[Seed] Seeding settings...');
  for (const setting of INITIAL_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {
        value_paise: setting.value_paise,
        is_dummy: setting.is_dummy,
      },
      create: {
        key: setting.key,
        value_paise: setting.value_paise,
        is_dummy: setting.is_dummy,
      },
    });
  }

  console.log('[Seed] Seeding serviceable pincodes...');
  await prisma.serviceablePincode.upsert({
    where: { pincode: '411001' },
    update: { is_active: true },
    create: {
      pincode: '411001',
      is_active: true,
      delivery_fee_paise: 2000,
      free_threshold_paise: 30000,
    },
  });

  console.log('[Seed] Seeding shops...');
  const shopMap = new Map<string, string>();
  for (const shop of DUMMY_SHOPS) {
    const record = await prisma.shop.upsert({
      where: { name: shop.name },
      update: {
        owner_name: shop.owner_name,
        phone: shop.phone,
        status: shop.status,
        commission_rate: shop.commission_rate,
      },
      create: {
        name: shop.name,
        owner_name: shop.owner_name,
        phone: shop.phone,
        status: shop.status,
        commission_rate: shop.commission_rate,
      },
    });
    shopMap.set(shop.name, record.id);
  }

  console.log('[Seed] Seeding categories...');
  const categoryMap = new Map<string, string>();
  for (const cat of DUMMY_CATEGORIES) {
    const record = await prisma.category.upsert({
      where: { name: cat.name },
      update: {
        sort_order: cat.sort_order,
      },
      create: {
        name: cat.name,
        sort_order: cat.sort_order,
      },
    });
    categoryMap.set(cat.name, record.id);
  }

  console.log('[Seed] Validating and seeding products...');
  const productsToSeed = customProducts || DUMMY_PRODUCTS;

  for (const prod of productsToSeed) {
    // 1. Strict validation
    validateProductRow(prod);

    // 2. Validate shop exists
    const shopId = shopMap.get(prod.shopName);
    if (!shopId) {
      throw new Error(`Product '${prod.name}' specifies unknown shop '${prod.shopName}'`);
    }

    // 3. Validate category exists
    const categoryId = categoryMap.get(prod.categoryName);
    if (!categoryId) {
      throw new Error(`Product '${prod.name}' specifies unknown category '${prod.categoryName}'`);
    }

    // 4. Idempotent upsert
    await prisma.product.upsert({
      where: {
        shop_id_name_unit_size: {
          shop_id: shopId,
          name: prod.name,
          unit_size: prod.unit_size,
        },
      },
      update: {
        category_id: categoryId,
        brand: prod.brand,
        mrp_paise: prod.mrp_paise,
        shop_price_paise: prod.shop_price_paise,
        selling_price_paise: prod.selling_price_paise,
        is_active: prod.is_active,
        is_available: prod.is_available,
      },
      create: {
        shop_id: shopId,
        category_id: categoryId,
        name: prod.name,
        brand: prod.brand,
        unit_size: prod.unit_size,
        mrp_paise: prod.mrp_paise,
        shop_price_paise: prod.shop_price_paise,
        selling_price_paise: prod.selling_price_paise,
        is_active: prod.is_active,
        is_available: prod.is_available,
      },
    });
  }

  console.log(`[Seed] Seeded ${shopMap.size} shops, ${categoryMap.size} categories, and ${productsToSeed.length} products.`);
}

export async function seedAdminUser() {
  console.log('[Seed] Seeding admin user...');
  const email = (process.env.ADMIN_DEFAULT_EMAIL || 'admin@plukit.in').toLowerCase().trim();
  const rawPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@Plukit2026!';
  const password_hash = await bcrypt.hash(rawPassword, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      password_hash,
      is_active: true,
    },
    create: {
      email,
      name: 'PlukIt Administrator',
      password_hash,
      is_active: true,
    },
  });

  console.log(`[Seed] Seeded admin user: ${admin.email}`);
  return admin;
}

export async function main() {
  await seedCatalog();
  await seedAdminUser();
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
