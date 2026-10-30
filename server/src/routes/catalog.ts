import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { catalogCache } from '../lib/catalogCache.js';

export const catalogRouter = Router();

/**
 * GET /api/categories
 * Returns all active categories sorted by sort_order.
 * Cached for 1 to 5 minutes (F20 performance).
 */
catalogRouter.get('/categories', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'categories';
    const cached = catalogCache.get<{ categories: any[] }>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    const categories = await prisma.category.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        sort_order: true,
      },
      orderBy: { sort_order: 'asc' },
    });

    const responseData = { categories };
    catalogCache.set(cacheKey, responseData);
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/categories/:id/products?cursor=&limit=
 * Returns products for a category.
 * Rules:
 * - Only active products returned
 * - Default limit 20, capped at 50
 * - Sorted by name ascending
 * - Cursor-based pagination
 * - Cached for 1 to 5 minutes (F20 performance)
 */
catalogRouter.get('/categories/:id/products', async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.id;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const rawLimit = Number(req.query.limit);
    const limit = Math.min(Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 20, 50);

    const cacheKey = `category_products:${categoryId}:${limit}:${cursor || 'root'}`;
    const cached = catalogCache.get<any>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // Verify category exists
    const category = await prisma.category.findFirst({
      where: {
        OR: [{ id: categoryId }, { name: categoryId }],
        is_active: true,
      },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const products = await prisma.product.findMany({
      where: {
        category_id: category.id,
        is_active: true,
      },
      select: {
        id: true,
        shop_id: true,
        category_id: true,
        name: true,
        brand: true,
        unit_size: true,
        mrp_paise: true,
        selling_price_paise: true,
        is_available: true,
      },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const hasNextPage = products.length > limit;
    const paginatedProducts = hasNextPage ? products.slice(0, limit) : products;
    const nextCursor = hasNextPage ? paginatedProducts[paginatedProducts.length - 1]?.id : null;

    const responseData = {
      category: { id: category.id, name: category.name },
      products: paginatedProducts,
      nextCursor,
    };

    catalogCache.set(cacheKey, responseData);
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching category products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/products/search?q=
 * Rules:
 * - q must be at least 2 characters long
 * - Not case sensitive
 * - Only active products returned
 */
catalogRouter.get('/products/search', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (q.length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters long.',
      });
    }

    const products = await prisma.product.findMany({
      where: {
        name: {
          contains: q,
          mode: 'insensitive',
        },
        is_active: true,
      },
      select: {
        id: true,
        shop_id: true,
        category_id: true,
        name: true,
        brand: true,
        unit_size: true,
        mrp_paise: true,
        selling_price_paise: true,
        is_available: true,
      },
      take: 50,
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ query: q, products });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

/**
 * GET /api/products/:id
 * Single product detail with shop name.
 * Rules:
 * - Inactive product returns 404
 * - Cached for 1 to 5 minutes (F20 performance)
 */
catalogRouter.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const cacheKey = `product:${req.params.id}`;
    const cached = catalogCache.get<any>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        shop_id: true,
        category_id: true,
        name: true,
        brand: true,
        unit_size: true,
        mrp_paise: true,
        selling_price_paise: true,
        is_available: true,
        is_active: true,
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!product || !product.is_active) {
      return res.status(404).json({ error: 'Product not found or inactive.' });
    }

    const responseData = { product };
    catalogCache.set(cacheKey, responseData);
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});
