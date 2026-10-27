import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { validateAndParseProductCsv } from '../lib/csvParser.js';

export const adminRouter = Router();

export const ADMIN_COOKIE_NAME = 'admin_token';
export const MAX_FAILED_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Check if the IP or email has reached the max failed attempts in the rate limit window.
 */
export async function checkAdminLoginRateLimit(ip: string, email: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const count = await prisma.auditLog.count({
    where: {
      action: 'ADMIN_LOGIN_FAILED',
      created_at: { gte: windowStart },
      OR: [
        { actor_id: ip },
        { entity_id: email.toLowerCase() },
      ],
    },
  });
  return count >= MAX_FAILED_ATTEMPTS;
}

/**
 * Middleware: Verify admin session token from cookie or Authorization header.
 * Rejects customer sessions and unauthenticated requests.
 */
export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token =
      req.cookies?.[ADMIN_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null) ||
      (typeof req.headers['x-admin-token'] === 'string' ? req.headers['x-admin-token'] : null);

    if (!token) {
      return res.status(401).json({ error: 'Admin authentication required. Please log in.' });
    }

    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: { admin_user: true },
    });

    if (!session || session.expires_at < new Date()) {
      return res.status(401).json({ error: 'Admin session is invalid or expired. Please log in.' });
    }

    if (!session.admin_user.is_active) {
      return res.status(403).json({ error: 'Admin account is inactive. Please contact support.' });
    }

    (req as any).adminUser = session.admin_user;
    next();
  } catch (error) {
    console.error('requireAdminAuth error:', error);
    return res.status(500).json({ error: 'Authentication verification failed' });
  }
}

const AdminLoginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/admin/auth/login
 * Authenticates admin credentials, checks rate limits, writes audit logs,
 * and sets an httpOnly, Secure, SameSite=Strict cookie.
 */
adminRouter.post('/admin/auth/login', async (req: Request, res: Response) => {
  try {
    const parseResult = AdminLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase();
    const clientIp = getClientIp(req);

    // 1. Check rate limit: 5 failed attempts per 15 minutes per IP or email
    const isRateLimited = await checkAdminLoginRateLimit(clientIp, normalizedEmail);
    if (isRateLimited) {
      return res.status(429).json({
        error: 'Too many failed login attempts. Please try again after 15 minutes.',
      });
    }

    // 2. Find admin user
    const adminUser = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    // 3. Verify password hash using bcrypt
    const isValidPassword = adminUser
      ? await bcrypt.compare(password, adminUser.password_hash)
      : false;

    if (!adminUser || !isValidPassword || !adminUser.is_active) {
      // Record failed attempt in audit_logs (never log the password!)
      await prisma.auditLog.create({
        data: {
          actor_id: clientIp,
          action: 'ADMIN_LOGIN_FAILED',
          entity: 'admin_users',
          entity_id: normalizedEmail,
          old_value: { ip: clientIp, email: normalizedEmail },
          new_value: { reason: 'invalid_credentials' },
        },
      });

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 4. Update last login timestamp
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { last_login_at: new Date() },
    });

    // 5. Create secure session token
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.adminSession.create({
      data: {
        admin_user_id: adminUser.id,
        token,
        expires_at,
      },
    });

    // 6. Record successful login in audit_logs
    await prisma.auditLog.create({
      data: {
        actor_id: adminUser.id,
        action: 'ADMIN_LOGIN_SUCCESS',
        entity: 'admin_users',
        entity_id: adminUser.id,
        new_value: { ip: clientIp, email: adminUser.email },
      },
    });

    // 7. Set strict session cookie
    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.status(200).json({
      success: true,
      token, // also return token for clients using Authorization header
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: 'Failed to process admin login' });
  }
});

/**
 * POST /api/admin/auth/logout
 * Destroys session in DB, records audit log, and clears cookie.
 */
adminRouter.post('/admin/auth/logout', async (req: Request, res: Response) => {
  try {
    const token =
      req.cookies?.[ADMIN_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null) ||
      (typeof req.headers['x-admin-token'] === 'string' ? req.headers['x-admin-token'] : null);

    if (token) {
      const session = await prisma.adminSession.findUnique({
        where: { token },
        select: { admin_user_id: true },
      });

      if (session) {
        await prisma.adminSession.deleteMany({ where: { token } });
        await prisma.auditLog.create({
          data: {
            actor_id: session.admin_user_id,
            action: 'ADMIN_LOGOUT',
            entity: 'admin_users',
            entity_id: session.admin_user_id,
            new_value: { ip: getClientIp(req) },
          },
        });
      }
    }

    res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Admin logout error:', error);
    return res.status(500).json({ error: 'Failed to process logout' });
  }
});

/**
 * GET /api/admin/auth/me
 * Returns current authenticated admin profile.
 */
adminRouter.get('/admin/auth/me', requireAdminAuth, async (req: Request, res: Response) => {
  const admin = (req as any).adminUser;
  return res.status(200).json({
    success: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });
});

/**
 * POST /api/admin/products/upload
 * Validates and imports a product CSV with strict all-or-nothing semantics.
 * Requires active admin session.
 */
adminRouter.post('/admin/products/upload', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser;
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

        // Check for existing product by composite identity (shop_id, name, unit_size)
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
          // If price changed, record in price_history
          if (
            existing.mrp_paise !== row.mrpPaise ||
            existing.shop_price_paise !== row.shopPricePaise ||
            existing.selling_price_paise !== row.sellingPricePaise
          ) {
            await tx.priceHistory.create({
              data: {
                product_id: existing.id,
                mrp_paise: row.mrpPaise,
                shop_price_paise: row.shopPricePaise,
                selling_price_paise: row.sellingPricePaise,
              },
            });
          }

          const updated = await tx.product.update({
            where: { id: existing.id },
            data: {
              brand: row.brand,
              category_id: categoryId,
              mrp_paise: row.mrpPaise,
              shop_price_paise: row.shopPricePaise,
              selling_price_paise: row.sellingPricePaise,
            },
          });

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
          // Create new product
          const created = await tx.product.create({
            data: {
              shop_id: shopId,
              category_id: categoryId,
              name: row.productName,
              brand: row.brand,
              unit_size: row.unitSize,
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

      // Write audit log with authenticated admin actor ID
      await tx.auditLog.create({
        data: {
          actor_id: adminUser?.id || 'admin',
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
