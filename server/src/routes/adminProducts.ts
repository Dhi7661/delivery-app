import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAdmin } from './adminAuth.js';
import { catalogCache } from '../lib/catalogCache.js';

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

