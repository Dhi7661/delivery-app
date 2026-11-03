import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAdmin } from './adminAuth.js';
import { catalogCache } from '../lib/catalogCache.js';
import { validateAndParseProductCsv } from '../lib/csvParser.js';

export const adminProductsRouter = Router();

// Protect all admin product routes with requireAdmin middleware
adminProductsRouter.use(requireAdmin);

/**
 * GET /api/admin/products
 * List products with search, category/shop filters, stock & active status, and margin warnings.
 */
adminProductsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
    const shopId = typeof req.query.shopId === 'string' ? req.query.shopId.trim() : '';
    const stock = typeof req.query.stock === 'string' ? req.query.stock.trim() : '';
    const active = typeof req.query.active === 'string' ? req.query.active.trim() : '';
    const warning = typeof req.query.warning === 'string' ? req.query.warning.trim() : '';

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Search filter: name, brand, or HSN code
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { hsn_code: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (categoryId) {
      where.category_id = categoryId;
    }

    if (shopId) {
      where.shop_id = shopId;
    }

    if (stock === 'in_stock') {
      where.is_available = true;
    } else if (stock === 'out_of_stock') {
      where.is_available = false;
    }

    if (active === 'true') {
      where.is_active = true;
    } else if (active === 'false') {
      where.is_active = false;
    }

    const [total, products, categories, shops] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          shop: { select: { id: true, name: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.category.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { sort_order: 'asc' },
      }),
      prisma.shop.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Format items with margin details
    const formattedProducts = products.map((p) => {
      const marginPaise = p.selling_price_paise - p.shop_price_paise;
      const marginPct =
        p.selling_price_paise > 0
          ? Math.round((marginPaise / p.selling_price_paise) * 1000) / 10
          : 0;

      const isLowMargin = marginPct < 10;

      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        unit_size: p.unit_size,
        hsn_code: p.hsn_code,
        gst_rate: p.gst_rate,
        mrp_paise: p.mrp_paise,
        shop_price_paise: p.shop_price_paise,
        selling_price_paise: p.selling_price_paise,
        margin_paise: marginPaise,
        margin_pct: marginPct,
        is_low_margin: isLowMargin,
        is_available: p.is_available,
        is_active: p.is_active,
        category: p.category,
        shop: p.shop,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    // Optional filter by warning: low_margin
    const finalProducts =
      warning === 'low_margin'
        ? formattedProducts.filter((p) => p.is_low_margin)
        : formattedProducts;

    return res.status(200).json({
      products: finalProducts,
      categories,
      shops,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/products:', err);
    return res.status(500).json({ error: 'Failed to retrieve products' });
  }
});

/**
 * GET /api/admin/products/meta
 * Returns active categories and shops for form dropdowns.
 */
adminProductsRouter.get('/meta', async (_req: Request, res: Response) => {
  try {
    const [categories, shops] = await Promise.all([
      prisma.category.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { sort_order: 'asc' },
      }),
      prisma.shop.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return res.status(200).json({ categories, shops });
  } catch (err: any) {
    console.error('Error fetching admin products meta:', err);
    return res.status(500).json({ error: 'Failed to fetch categories and shops' });
  }
});

/**
 * GET /api/admin/products/export/csv
 * Exports catalog to CSV with standard headers.
 */
adminProductsRouter.get('/export/csv', async (_req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: { select: { name: true } },
        shop: { select: { name: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const headers = [
      'shop_name',
      'category',
      'product_name',
      'brand',
      'unit_size',
      'mrp_rupees',
      'shop_price_rupees',
      'selling_price_rupees',
      'is_available',
      'is_active',
    ];

    const escapeCsv = (str: string) => {
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [headers.join(',')];

    for (const p of products) {
      const row = [
        escapeCsv(p.shop.name),
        escapeCsv(p.category.name),
        escapeCsv(p.name),
        escapeCsv(p.brand || ''),
        escapeCsv(p.unit_size),
        (p.mrp_paise / 100).toFixed(2),
        (p.shop_price_paise / 100).toFixed(2),
        (p.selling_price_paise / 100).toFixed(2),
        p.is_available ? 'true' : 'false',
        p.is_active ? 'true' : 'false',
      ];
      lines.push(row.join(','));
    }

    const csvData = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="plukit-catalog-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.status(200).send(csvData);
  } catch (err: any) {
    console.error('Error exporting catalog CSV:', err);
    return res.status(500).json({ error: 'Failed to export catalog CSV' });
  }
});

/**
 * Helper to validate image format from binary magic bytes (Section 10.2).
 * Rejects SVG and any formats other than JPG, PNG, WebP. Enforces 5MB limit.
 */
function validateImageBuffer(buffer: Buffer): { valid: boolean; format?: string; error?: string } {
  if (buffer.length > 5 * 1024 * 1024) {
    return { valid: false, error: 'Photo must not exceed 5 MB' };
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'jpeg' };
  }

  // PNG magic bytes: 89 50 4E 47
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, format: 'png' };
  }

  // WebP magic bytes: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { valid: true, format: 'webp' };
  }

  return {
    valid: false,
    error: 'Only JPG, PNG, and WebP images are permitted. SVG and other formats are rejected.',
  };
}

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  brand: z.string().trim().optional().nullable(),
  unit_size: z.string().trim().min(1, 'Unit size is required (e.g. 500 g, 1 L)'),
  category_id: z.string().min(1, 'Category is required'),
  shop_id: z.string().min(1, 'Partner shop is required'),
  mrp_paise: z.number().int().positive('Printed MRP must be a positive integer in paise'),
  shop_price_paise: z.number().int().positive('Shop buy price must be a positive integer in paise'),
  selling_price_paise: z.number().int().positive('Selling price must be a positive integer in paise'),
  hsn_code: z.string().trim().optional().nullable(),
  gst_rate: z.number().min(0).max(100).default(0.0),
  is_available: z.boolean().default(true),
  is_active: z.boolean().default(true),
  sku: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  photo_base64: z.string().optional().nullable(),
});

/**
 * POST /api/admin/products
 * Creates a new product with full validation, legal pricing rules, and initial price history.
 */
adminProductsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const parseResult = createProductSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error.errors[0]?.message || 'Invalid product data',
      });
    }

    const {
      name,
      brand,
      unit_size,
      category_id,
      shop_id,
      mrp_paise,
      shop_price_paise,
      selling_price_paise,
      hsn_code,
      gst_rate,
      is_available,
      is_active,
      sku,
      barcode,
      photo_base64,
    } = parseResult.data;

    // Validate photo content if provided
    if (photo_base64) {
      const cleanBase64 = photo_base64.replace(/^data:image\/[a-z0-9+]+;base64,/, '');
      const photoBuffer = Buffer.from(cleanBase64, 'base64');
      const imgValidation = validateImageBuffer(photoBuffer);
      if (!imgValidation.valid) {
        return res.status(400).json({ error: imgValidation.error });
      }
    }

    // Business rule: Selling price cannot exceed MRP
    if (selling_price_paise > mrp_paise) {
      return res.status(400).json({
        error: `Selling price (₹${(selling_price_paise / 100).toFixed(2)}) cannot exceed printed MRP (₹${(mrp_paise / 100).toFixed(2)}).`,
      });
    }

    // Business rule: Selling price cannot be lower than buy price
    if (selling_price_paise < shop_price_paise) {
      return res.status(400).json({
        error: `Selling price (₹${(selling_price_paise / 100).toFixed(2)}) cannot be lower than shop buy price (₹${(shop_price_paise / 100).toFixed(2)}).`,
      });
    }

    // Foreign key check: Category
    const category = await prisma.category.findUnique({
      where: { id: category_id },
    });
    if (!category) {
      return res.status(400).json({ error: 'Selected category does not exist' });
    }

    // Foreign key check: Partner Shop
    const shop = await prisma.shop.findUnique({
      where: { id: shop_id },
    });
    if (!shop) {
      return res.status(400).json({ error: 'Selected partner shop does not exist' });
    }

    // Uniqueness check: [shop_id, name, unit_size]
    const existing = await prisma.product.findUnique({
      where: {
        shop_id_name_unit_size: {
          shop_id,
          name,
          unit_size,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: `A product named "${name}" with unit size "${unit_size}" already exists for this shop.`,
      });
    }

    const codeValue = hsn_code || sku || barcode || null;

    // Execute product creation and price history atomically
    const [newProduct] = await prisma.$transaction([
      prisma.product.create({
        data: {
          shop_id,
          category_id,
          name,
          brand: brand || null,
          unit_size,
          hsn_code: codeValue,
          gst_rate: gst_rate || 0.0,
          mrp_paise,
          shop_price_paise,
          selling_price_paise,
          is_available: is_available ?? true,
          is_active: is_active ?? true,
        },
        include: {
          category: { select: { id: true, name: true } },
          shop: { select: { id: true, name: true } },
        },
      }),
      // We will create priceHistory in the second step after product creation
    ]);

    // Create initial price history
    await prisma.priceHistory.create({
      data: {
        product_id: newProduct.id,
        mrp_paise,
        shop_price_paise,
        selling_price_paise,
      },
    });

    // Invalidate customer storefront cache immediately
    catalogCache.invalidate();

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'PRODUCT_CREATE',
        entity: 'product',
        entity_id: newProduct.id,
        new_value: {
          name: newProduct.name,
          shop_id: newProduct.shop_id,
          mrp_paise,
          shop_price_paise,
          selling_price_paise,
        },
      },
    }).catch(() => null);

    const marginPaise = newProduct.selling_price_paise - newProduct.shop_price_paise;
    const marginPct =
      newProduct.selling_price_paise > 0
        ? Math.round((marginPaise / newProduct.selling_price_paise) * 1000) / 10
        : 0;

    return res.status(201).json({
      success: true,
      product: {
        ...newProduct,
        margin_paise: marginPaise,
        margin_pct: marginPct,
        is_low_margin: marginPct < 10,
      },
    });
  } catch (err: any) {
    console.error('Error creating product:', err);
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * GET /api/admin/products/:id
 * Retrieve single product details with price history.
 */
adminProductsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        shop: { select: { id: true, name: true } },
        price_history: {
          orderBy: { effective_from: 'desc' },
          take: 20,
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const marginPaise = product.selling_price_paise - product.shop_price_paise;
    const marginPct =
      product.selling_price_paise > 0
        ? Math.round((marginPaise / product.selling_price_paise) * 1000) / 10
        : 0;

    return res.status(200).json({
      product: {
        ...product,
        margin_paise: marginPaise,
        margin_pct: marginPct,
        is_low_margin: marginPct < 10,
      },
    });
  } catch (err: any) {
    console.error('Error fetching product by id:', err);
    return res.status(500).json({ error: 'Failed to retrieve product' });
  }
});

/**
 * PUT /api/admin/products/:id
 * Full product edit with price rule enforcement and audit history.
 */
adminProductsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;

    const existing = await prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const parseResult = createProductSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error.errors[0]?.message || 'Invalid product update data',
      });
    }

    const {
      name,
      brand,
      unit_size,
      category_id,
      shop_id,
      mrp_paise,
      shop_price_paise,
      selling_price_paise,
      hsn_code,
      gst_rate,
      is_available,
      is_active,
      sku,
      barcode,
      photo_base64,
    } = parseResult.data;

    // Validate photo content if provided
    if (photo_base64) {
      const cleanBase64 = photo_base64.replace(/^data:image\/[a-z0-9+]+;base64,/, '');
      const photoBuffer = Buffer.from(cleanBase64, 'base64');
      const imgValidation = validateImageBuffer(photoBuffer);
      if (!imgValidation.valid) {
        return res.status(400).json({ error: imgValidation.error });
      }
    }

    // Business rule: Selling price cannot exceed MRP
    if (selling_price_paise > mrp_paise) {
      return res.status(400).json({
        error: `Selling price (₹${(selling_price_paise / 100).toFixed(2)}) cannot exceed printed MRP (₹${(mrp_paise / 100).toFixed(2)}).`,
      });
    }

    // Business rule: Selling price cannot be lower than buy price
    if (selling_price_paise < shop_price_paise) {
      return res.status(400).json({
        error: `Selling price (₹${(selling_price_paise / 100).toFixed(2)}) cannot be lower than shop buy price (₹${(shop_price_paise / 100).toFixed(2)}).`,
      });
    }

    // Check category exists
    const category = await prisma.category.findUnique({ where: { id: category_id } });
    if (!category) {
      return res.status(400).json({ error: 'Selected category does not exist' });
    }

    // Check shop exists
    const shop = await prisma.shop.findUnique({ where: { id: shop_id } });
    if (!shop) {
      return res.status(400).json({ error: 'Selected partner shop does not exist' });
    }

    // Conflict check excluding current product
    const conflict = await prisma.product.findFirst({
      where: {
        shop_id,
        name,
        unit_size,
        NOT: { id },
      },
    });

    if (conflict) {
      return res.status(409).json({
        error: `Another product named "${name}" with unit size "${unit_size}" already exists for this shop.`,
      });
    }

    const priceChanged =
      existing.mrp_paise !== mrp_paise ||
      existing.shop_price_paise !== shop_price_paise ||
      existing.selling_price_paise !== selling_price_paise;

    const codeValue = hsn_code || sku || barcode || null;

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name,
        brand: brand || null,
        unit_size,
        category_id,
        shop_id,
        mrp_paise,
        shop_price_paise,
        selling_price_paise,
        hsn_code: codeValue,
        gst_rate: gst_rate || 0.0,
        is_available: is_available ?? existing.is_available,
        is_active: is_active ?? existing.is_active,
      },
      include: {
        category: { select: { id: true, name: true } },
        shop: { select: { id: true, name: true } },
        price_history: {
          orderBy: { effective_from: 'desc' },
          take: 20,
        },
      },
    });

    // Record price change if any price parameter moved
    if (priceChanged) {
      await prisma.priceHistory.create({
        data: {
          product_id: id,
          mrp_paise,
          shop_price_paise,
          selling_price_paise,
        },
      });
    }

    // Immediately invalidate customer storefront catalog cache
    catalogCache.invalidate();

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'PRODUCT_UPDATE',
        entity: 'product',
        entity_id: id,
        old_value: {
          name: existing.name,
          selling_price_paise: existing.selling_price_paise,
          shop_price_paise: existing.shop_price_paise,
          mrp_paise: existing.mrp_paise,
        },
        new_value: {
          name,
          selling_price_paise,
          shop_price_paise,
          mrp_paise,
          priceChanged,
        },
      },
    }).catch(() => null);

    const marginPaise = updated.selling_price_paise - updated.shop_price_paise;
    const marginPct =
      updated.selling_price_paise > 0
        ? Math.round((marginPaise / updated.selling_price_paise) * 1000) / 10
        : 0;

    return res.status(200).json({
      success: true,
      product: {
        ...updated,
        margin_paise: marginPaise,
        margin_pct: marginPct,
        is_low_margin: marginPct < 10,
      },
    });
  } catch (err: any) {
    console.error('Error updating product:', err);
    return res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * PATCH /api/admin/products/:id/toggle-stock
 * Toggles product stock availability (is_available).
 */
adminProductsRouter.patch('/:id/toggle-stock', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const nextStock = !product.is_available;

    const updated = await prisma.product.update({
      where: { id },
      data: { is_available: nextStock },
      include: {
        category: { select: { id: true, name: true } },
        shop: { select: { id: true, name: true } },
      },
    });

    // Immediately invalidate customer storefront catalog cache
    catalogCache.invalidate();

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'PRODUCT_STOCK_TOGGLE',
        entity: 'product',
        entity_id: id,
        old_value: { is_available: product.is_available },
        new_value: { is_available: nextStock },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      product: {
        ...updated,
        margin_paise: updated.selling_price_paise - updated.shop_price_paise,
      },
    });
  } catch (err: any) {
    console.error('Error toggling product stock:', err);
    return res.status(500).json({ error: 'Failed to toggle product stock' });
  }
});

/**
 * PATCH /api/admin/products/:id/toggle-active
 * Toggles product storefront visibility (is_active).
 */
adminProductsRouter.patch('/:id/toggle-active', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const nextActive = !product.is_active;

    const updated = await prisma.product.update({
      where: { id },
      data: { is_active: nextActive },
      include: {
        category: { select: { id: true, name: true } },
        shop: { select: { id: true, name: true } },
      },
    });

    // Immediately invalidate customer storefront catalog cache
    catalogCache.invalidate();

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'PRODUCT_ACTIVE_TOGGLE',
        entity: 'product',
        entity_id: id,
        old_value: { is_active: product.is_active },
        new_value: { is_active: nextActive },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      product: {
        ...updated,
        margin_paise: updated.selling_price_paise - updated.shop_price_paise,
      },
    });
  } catch (err: any) {
    console.error('Error toggling product active visibility:', err);
    return res.status(500).json({ error: 'Failed to toggle product active visibility' });
  }
});

const updatePriceSchema = z.object({
  selling_price_paise: z.number().int().positive('Selling price must be a positive integer in paise'),
});

/**
 * PATCH /api/admin/products/:id/price
 * In-place quick update of selling price on desktop.
 * Enforces rule: shop_price_paise <= selling_price_paise <= mrp_paise.
 */
adminProductsRouter.patch('/:id/price', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const admin = (req as any).admin;

    const parseResult = updatePriceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error.errors[0]?.message || 'Invalid price update data',
      });
    }

    const { selling_price_paise } = parseResult.data;

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Business rule: Selling price cannot exceed MRP
    if (selling_price_paise > product.mrp_paise) {
      return res.status(400).json({
        error: `Selling price (₹${(selling_price_paise / 100).toFixed(2)}) cannot exceed printed MRP (₹${(product.mrp_paise / 100).toFixed(2)}).`,
      });
    }

    // Business rule: Selling price cannot be lower than buy price
    if (selling_price_paise < product.shop_price_paise) {
      return res.status(400).json({
        error: `Selling price (₹${(selling_price_paise / 100).toFixed(2)}) cannot be lower than shop buy price (₹${(product.shop_price_paise / 100).toFixed(2)}).`,
      });
    }

    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id },
        data: { selling_price_paise },
        include: {
          category: { select: { id: true, name: true } },
          shop: { select: { id: true, name: true } },
        },
      }),
      prisma.priceHistory.create({
        data: {
          product_id: id,
          mrp_paise: product.mrp_paise,
          shop_price_paise: product.shop_price_paise,
          selling_price_paise,
        },
      }),
    ]);

    // Invalidate customer catalog cache
    catalogCache.invalidate();

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'PRODUCT_PRICE_UPDATE',
        entity: 'product',
        entity_id: id,
        old_value: { selling_price_paise: product.selling_price_paise },
        new_value: { selling_price_paise },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      product: {
        ...updated,
        margin_paise: updated.selling_price_paise - updated.shop_price_paise,
        margin_pct:
          Math.round(
            ((updated.selling_price_paise - updated.shop_price_paise) /
              updated.selling_price_paise) *
              1000
          ) / 10,
      },
    });
  } catch (err: any) {
    console.error('Error updating product price:', err);
    return res.status(500).json({ error: 'Failed to update product price' });
  }
});

const bulkActionSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1, 'Select at least one product'),
  action: z.enum(['set_in_stock', 'set_out_of_stock', 'show', 'hide']),
});

/**
 * POST /api/admin/products/bulk
 * Bulk action on selected products (set in stock, out of stock, show, hide).
 */
adminProductsRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const parseResult = bulkActionSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error.errors[0]?.message || 'Invalid bulk action data',
      });
    }

    const { productIds, action } = parseResult.data;

    let updateData: any = {};
    if (action === 'set_in_stock') updateData.is_available = true;
    if (action === 'set_out_of_stock') updateData.is_available = false;
    if (action === 'show') updateData.is_active = true;
    if (action === 'hide') updateData.is_active = false;

    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: updateData,
    });

    // Invalidate customer catalog cache
    catalogCache.invalidate();

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'PRODUCT_BULK_ACTION',
        entity: 'product',
        entity_id: 'multiple',
        new_value: { action, count: result.count, productIds },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      count: result.count,
    });
  } catch (err: any) {
    console.error('Error in bulk product action:', err);
    return res.status(500).json({ error: 'Failed to perform bulk action' });
  }
});

const importCsvSchema = z.object({
  csvText: z.string().min(1, 'CSV content is required'),
  dryRun: z.boolean().default(false),
});

/**
 * POST /api/admin/products/import/csv
 * Bulk import or price update with dry run validation and row-level error reporting.
 */
adminProductsRouter.post('/import/csv', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const parseResult = importCsvSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error.errors[0]?.message || 'Invalid CSV import request',
      });
    }

    const { csvText, dryRun } = parseResult.data;

    const [shops, categories] = await Promise.all([
      prisma.shop.findMany({ select: { id: true, name: true } }),
      prisma.category.findMany({ select: { id: true, name: true } }),
    ]);

    const shopMap = new Map<string, string>();
    shops.forEach((s) => shopMap.set(s.name, s.id));

    const categoryMap = new Map<string, string>();
    categories.forEach((c) => categoryMap.set(c.name, c.id));

    const csvValidation = validateAndParseProductCsv(
      csvText,
      new Set(shopMap.keys()),
      new Set(categoryMap.keys())
    );

    if (!csvValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'CSV validation failed with row-level errors',
        errors: csvValidation.errors,
      });
    }

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        count: csvValidation.rows.length,
        preview: csvValidation.rows.slice(0, 10),
      });
    }

    // Apply import
    let updatedCount = 0;
    let createdCount = 0;

    for (const row of csvValidation.rows) {
      const shopId = shopMap.get(row.shopName)!;
      const categoryId = categoryMap.get(row.categoryName)!;

      const existing = await prisma.product.findUnique({
        where: {
          shop_id_name_unit_size: {
            shop_id: shopId,
            name: row.productName,
            unit_size: row.unitSize,
          },
        },
      });

      if (existing) {
        const priceChanged =
          existing.mrp_paise !== row.mrpPaise ||
          existing.shop_price_paise !== row.shopPricePaise ||
          existing.selling_price_paise !== row.sellingPricePaise;

        await prisma.product.update({
          where: { id: existing.id },
          data: {
            brand: row.brand || null,
            category_id: categoryId,
            mrp_paise: row.mrpPaise,
            shop_price_paise: row.shopPricePaise,
            selling_price_paise: row.sellingPricePaise,
          },
        });

        if (priceChanged) {
          await prisma.priceHistory.create({
            data: {
              product_id: existing.id,
              mrp_paise: row.mrpPaise,
              shop_price_paise: row.shopPricePaise,
              selling_price_paise: row.sellingPricePaise,
            },
          });
        }
        updatedCount++;
      } else {
        const created = await prisma.product.create({
          data: {
            shop_id: shopId,
            category_id: categoryId,
            name: row.productName,
            brand: row.brand || null,
            unit_size: row.unitSize,
            mrp_paise: row.mrpPaise,
            shop_price_paise: row.shopPricePaise,
            selling_price_paise: row.sellingPricePaise,
            is_available: true,
            is_active: true,
          },
        });

        await prisma.priceHistory.create({
          data: {
            product_id: created.id,
            mrp_paise: row.mrpPaise,
            shop_price_paise: row.shopPricePaise,
            selling_price_paise: row.sellingPricePaise,
          },
        });
        createdCount++;
      }
    }

    catalogCache.invalidate();

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'PRODUCT_CSV_IMPORT',
        entity: 'catalog',
        entity_id: 'bulk',
        new_value: { total: csvValidation.rows.length, createdCount, updatedCount },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      total: csvValidation.rows.length,
      createdCount,
      updatedCount,
    });
  } catch (err: any) {
    console.error('Error importing catalog CSV:', err);
    return res.status(500).json({ error: 'Failed to import catalog CSV' });
  }
});

