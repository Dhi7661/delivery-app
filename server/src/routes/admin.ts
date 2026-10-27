import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/db.js';
import { validateAndParseProductCsv } from '../lib/csvParser.js';

export const adminRouter = Router();

/**
 * Middleware: Verify temporary ADMIN_PASSWORD from header or body
 */
export function requireAdminPassword(req: Request, res: Response, next: NextFunction) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is not configured on the server' });
  }

  const providedPassword =
    req.headers['x-admin-password'] ||
    req.body?.adminPassword ||
    req.body?.password;

  if (typeof providedPassword !== 'string' || providedPassword !== configuredPassword) {
    return res.status(401).json({ error: 'Invalid or missing admin password' });
  }

  next();
}

/**
 * POST /api/admin/products/upload
 * Validates and imports a product CSV with strict all-or-nothing semantics.
 */
adminRouter.post('/admin/products/upload', requireAdminPassword, async (req: Request, res: Response) => {
  try {
    const csvContent = req.body?.csvContent || (typeof req.body === 'string' ? req.body : null);
    const fileName = req.body?.fileName || 'products.csv';

    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ error: 'Missing csvContent in request body' });
    }

    // 1. Fetch existing shops & categories
    const shops = await prisma.shop.findMany({ select: { id: true, name: true } });
    const categories = await prisma.category.findMany({ select: { id: true, name: true } });

    const shopMap = new Map(shops.map((s) => [s.name, s.id]));
    const categoryMap = new Map(categories.map((c) => [c.name, c.id]));

    // 2. Parse and validate CSV with all-or-nothing rules
    const parseResult = validateAndParseProductCsv(
      csvContent,
      new Set(shopMap.keys()),
      new Set(categoryMap.keys())
    );

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'CSV validation failed. No products were imported.',
        errors: parseResult.errors,
      });
    }

    // 3. Execute all updates and creations in a single atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;
      const processed: Array<{
        id: string;
        action: 'CREATED' | 'UPDATED';
        name: string;
        shopName: string;
        unitSize: string;
        mrpPaise: number;
        shopPricePaise: number;
      }> = [];

      for (const row of parseResult.rows) {
        const shopId = shopMap.get(row.shopName)!;
        const categoryId = categoryMap.get(row.categoryName)!;

        const existing = await tx.product.findUnique({
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

          const updated = await tx.product.update({
            where: { id: existing.id },
            data: {
              category_id: categoryId,
              brand: row.brand || null,
              mrp_paise: row.mrpPaise,
              shop_price_paise: row.shopPricePaise,
              selling_price_paise: row.sellingPricePaise,
              is_available: true,
              is_active: true,
            },
          });

          if (priceChanged) {
            await tx.priceHistory.create({
              data: {
                product_id: updated.id,
                mrp_paise: row.mrpPaise,
                shop_price_paise: row.shopPricePaise,
                selling_price_paise: row.sellingPricePaise,
              },
            });
          }

          updatedCount++;
          processed.push({
            id: updated.id,
            action: 'UPDATED',
            name: updated.name,
            shopName: row.shopName,
            unitSize: row.unitSize,
            mrpPaise: updated.mrp_paise,
            shopPricePaise: updated.shop_price_paise,
          });
        } else {
          const created = await tx.product.create({
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

          await tx.priceHistory.create({
            data: {
              product_id: created.id,
              mrp_paise: row.mrpPaise,
              shop_price_paise: row.shopPricePaise,
              selling_price_paise: row.sellingPricePaise,
            },
          });

          createdCount++;
          processed.push({
            id: created.id,
            action: 'CREATED',
            name: created.name,
            shopName: row.shopName,
            unitSize: row.unitSize,
            mrpPaise: created.mrp_paise,
            shopPricePaise: created.shop_price_paise,
          });
        }
      }

      // Write audit log
      await tx.auditLog.create({
        data: {
          actor_id: 'admin',
          action: 'PRODUCT_CSV_UPLOAD',
          entity: 'products',
          entity_id: 'batch',
          new_value: {
            filename: fileName,
            total_rows: parseResult.rows.length,
            created_count: createdCount,
            updated_count: updatedCount,
          },
        },
      });

      return {
        totalProcessed: parseResult.rows.length,
        createdCount,
        updatedCount,
        products: processed,
      };
    });

    res.status(200).json({
      success: true,
      message: `Successfully processed ${result.totalProcessed} products (${result.createdCount} created, ${result.updatedCount} updated)`,
      ...result,
    });
  } catch (error: any) {
    console.error('CSV Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload and process product CSV' });
  }
});
