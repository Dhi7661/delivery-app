import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { validateAndParseProductCsv } from '../lib/csvParser.js';
import {
  isValidStatusTransition,
  getNextAllowedStatuses,
  requiresCancellationReason,
  STATUS_LABELS,
} from '../lib/orderStatus.js';
import { dispatchOrderStatusNotifications, retryNotification } from '../lib/notifications.js';
import { generateOrderInvoice, generateCreditNote } from '../lib/invoice.js';
import { cancelOrderWithRefund, processOrderReturn } from '../lib/cancellation.js';

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

/**
 * Helper to retrieve currently authenticated admin user if valid session exists.
 */
export async function getAuthenticatedAdmin(req: Request) {
  try {
    const token =
      req.cookies?.[ADMIN_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null) ||
      (typeof req.headers['x-admin-token'] === 'string' ? req.headers['x-admin-token'] : null);

    if (!token) return null;

    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: { admin_user: true },
    });

    if (!session || session.expires_at < new Date() || !session.admin_user.is_active) {
      return null;
    }

    return session.admin_user;
  } catch {
    return null;
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

// ==========================================
// F12: Admin Order Board & Status Rules
// ==========================================

/**
 * GET /api/admin/orders
 * Returns orders with counts grouped by status, with date and search filtering.
 */
adminRouter.get('/admin/orders', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { status, date, search } = req.query;

    const where: Prisma.OrderWhereInput = {};

    // 1. Status Filter
    if (status && typeof status === 'string' && status !== 'ALL' && Object.values(OrderStatus).includes(status as OrderStatus)) {
      where.status = status as OrderStatus;
    }

    // 2. Date Filter (YYYY-MM-DD)
    if (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      where.created_at = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    // 3. Search Filter (order_no, phone, name)
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { order_no: { contains: q, mode: 'insensitive' } },
        { guest_phone: { contains: q } },
        { guest_name: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Fetch filtered orders
    const orders = await prisma.order.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, brand: true, unit_size: true } },
            shop: { select: { id: true, name: true } },
          },
        },
        delivery: true,
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    // Compute status counts (using date filter if provided, for board accuracy)
    const countWhere: Prisma.OrderWhereInput = {};
    if (where.created_at) countWhere.created_at = where.created_at;

    const allCounts = await prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
      where: countWhere,
    });

    const counts: Record<string, number> = { total: 0 };
    for (const s of Object.values(OrderStatus)) {
      counts[s] = 0;
    }

    for (const group of allCounts) {
      counts[group.status] = group._count.id;
      counts.total += group._count.id;
    }

    // Attach allowed transitions to each order
    const enrichedOrders = orders.map((order) => ({
      ...order,
      allowedTransitions: getNextAllowedStatuses(order.status),
    }));

    res.status(200).json({
      success: true,
      orders: enrichedOrders,
      counts,
      statuses: Object.keys(STATUS_LABELS),
    });
  } catch (error: any) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch admin orders' });
  }
});

/**
 * GET /api/admin/orders/:id
 * Returns single order detail, full items, delivery info, allowed transitions, and audit history.
 */
adminRouter.get('/admin/orders/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id }, { order_no: id }],
      },
      include: {
        items: {
          include: {
            product: true,
            shop: true,
            returns: true,
          },
        },
        delivery: true,
        user: true,
        payments: true,
        refunds: true,
        invoice: {
          include: {
            credit_notes: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch audit history for this order
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'orders',
        entity_id: order.id,
      },
      orderBy: { created_at: 'desc' },
    });

    // Fetch notification records for this order (F14)
    const notifications = await prisma.orderNotification.findMany({
      where: { order_id: order.id },
      orderBy: { created_at: 'desc' },
    });

    res.status(200).json({
      success: true,
      order: {
        ...order,
        allowedTransitions: getNextAllowedStatuses(order.status),
      },
      auditLogs,
      notifications,
    });
  } catch (error: any) {
    console.error('Error fetching admin order detail:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch order details' });
  }
});

const UpdateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus, { errorMap: () => ({ message: 'Invalid order status' }) }),
  reason: z.string().trim().optional(),
});

/**
 * PATCH /api/admin/orders/:id/status
 * Transitions an order to a new status obeying the strict state machine rules.
 * Records every status change into audit_logs.
 */
adminRouter.patch('/admin/orders/:id/status', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminUser = (req as any).adminUser;

    const parseResult = UpdateOrderStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { status: targetStatus, reason } = parseResult.data;

    // 1. Fetch current order
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id }, { order_no: id }],
      },
      include: { delivery: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // 2. State Machine Validation (Admin can cancel at any stage before DELIVERED per F18)
    const isCancelBeforeDelivered =
      targetStatus === 'CANCELLED' &&
      order.status !== 'DELIVERED' &&
      order.status !== 'CANCELLED' &&
      order.status !== 'RETURNED' &&
      order.status !== 'CLOSED';

    if (!isCancelBeforeDelivered && !isValidStatusTransition(order.status, targetStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from ${order.status} to ${targetStatus}`,
        currentStatus: order.status,
        targetStatus,
        allowedTransitions: getNextAllowedStatuses(order.status),
      });
    }

    // 3. Admin Cancellation with automated refund and credit note (F18)
    if (targetStatus === 'CANCELLED') {
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({
          error: `A cancellation reason is required when cancelling an order in status ${order.status}`,
        });
      }

      const result = await cancelOrderWithRefund({
        orderId: order.id,
        actorId: adminUser?.id || 'admin',
        actorRole: 'ADMIN',
        reason,
      });

      return res.status(200).json({
        success: true,
        message: `Order ${order.order_no} status updated to CANCELLED`,
        order: {
          ...result.order,
          allowedTransitions: getNextAllowedStatuses(result.order.status),
        },
        refund: result.refund,
        creditNote: result.creditNote,
      });
    }

    // 4. Update in database transaction with audit log
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update delivery record if applicable
      if (order.delivery) {
        if (targetStatus === 'OUT_FOR_DELIVERY') {
          await tx.delivery.update({
            where: { id: order.delivery.id },
            data: { status: 'OUT_FOR_DELIVERY' },
          });
        } else if (targetStatus === 'DELIVERED') {
          await tx.delivery.update({
            where: { id: order.delivery.id },
            data: {
              status: 'DELIVERED',
              delivered_at: new Date(),
              cod_collected_paise: order.total_paise,
            },
          });
        } else if (targetStatus === 'FAILED_DELIVERY') {
          await tx.delivery.update({
            where: { id: order.delivery.id },
            data: {
              status: 'FAILED',
              failure_reason: reason || 'Delivery Failed',
            },
          });
        }
      }

      // Update order status and fetch with updated delivery
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: targetStatus,
          payment_status: targetStatus === 'DELIVERED' ? 'SUCCESS' : order.payment_status,
        },
        include: {
          items: {
            include: {
              product: true,
              shop: true,
            },
          },
          delivery: true,
          user: true,
        },
      });


      // Record audit log
      await tx.auditLog.create({
        data: {
          actor_id: adminUser?.id || 'admin',
          action: 'ORDER_STATUS_UPDATE',
          entity: 'orders',
          entity_id: order.id,
          old_value: { status: order.status },
          new_value: {
            status: targetStatus,
            reason: reason || null,
          },
        },
      });

      return updated;
    });

    // F14: Dispatch status notifications (SMS / WhatsApp)
    try {
      await dispatchOrderStatusNotifications(updatedOrder.id, targetStatus);
    } catch (notifErr) {
      console.error('[Notification] Error dispatching status notifications:', notifErr);
    }

    // F15: Automatically generate GST Invoice when DELIVERED
    if (targetStatus === 'DELIVERED') {
      try {
        await generateOrderInvoice(updatedOrder.id);
      } catch (invErr) {
        console.error('[Invoice] Error generating GST invoice upon DELIVERED:', invErr);
      }
    }

    // F15: Automatically generate Credit Note when CANCELLED if invoice exists
    if (targetStatus === 'CANCELLED') {
      try {
        await generateCreditNote(updatedOrder.id, reason || 'Order Cancelled');
      } catch (cnErr) {
        console.error('[Invoice] Error generating Credit Note upon CANCELLED:', cnErr);
      }
    }

    res.status(200).json({
      success: true,
      message: `Order ${order.order_no} status updated to ${targetStatus}`,
      order: {
        ...updatedOrder,
        allowedTransitions: getNextAllowedStatuses(updatedOrder.status),
      },
    });
  } catch (error: any) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message || 'Failed to update order status' });
  }
});

/**
 * POST /api/admin/orders/:id/cancel
 * Admin cancellation endpoint with mandatory reason (F18).
 * Allowed at any stage before DELIVERED.
 */
adminRouter.post('/admin/orders/:id/cancel', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminUser = (req as any).adminUser;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'A cancellation reason is required.' });
    }

    const result = await cancelOrderWithRefund({
      orderId: id,
      actorId: adminUser?.id || 'admin',
      actorRole: 'ADMIN',
      reason,
    });

    return res.status(200).json({
      success: true,
      message: `Order ${result.order.order_no} cancelled successfully`,
      order: result.order,
      refund: result.refund,
      creditNote: result.creditNote,
      refundAmountPaise: result.refundAmountPaise,
    });
  } catch (error: any) {
    console.error('Admin order cancellation error:', error);
    return res.status(400).json({ error: error.message || 'Failed to cancel order' });
  }
});

/**
 * POST /api/admin/orders/:id/returns
 * Admin return and partial refund processing endpoint (F18).
 * Processes item return, creates ShopLedger deduction for damaged/expired items,
 * and issues gateway refund and credit note.
 */
adminRouter.post('/admin/orders/:id/returns', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { items, notes } = req.body;
    const adminUser = (req as any).adminUser;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item must be specified for return.' });
    }

    const result = await processOrderReturn({
      orderId: id,
      actorId: adminUser?.id || 'admin',
      items,
      notes,
    });

    return res.status(200).json({
      success: true,
      message: 'Return processed successfully',
      order: result.order,
      returns: result.returns,
      refund: result.refund,
      creditNote: result.creditNote,
      refundAmountPaise: result.refundAmountPaise,
      totalReturnPaise: result.totalReturnPaise,
    });
  } catch (error: any) {
    console.error('Admin order return error:', error);
    return res.status(400).json({ error: error.message || 'Failed to process return' });
  }
});

/**
 * GET /api/admin/notifications
 * Log of notifications visible in admin (F14 acceptance check).
 */
adminRouter.get('/admin/notifications', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { status, limit } = req.query;
    const take = typeof limit === 'string' ? Math.min(parseInt(limit, 10) || 50, 100) : 50;

    const where: Prisma.OrderNotificationWhereInput = {};
    if (status && typeof status === 'string' && ['PENDING', 'SENT', 'FAILED'].includes(status)) {
      where.status = status as any;
    }

    const notifications = await prisma.orderNotification.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take,
      include: {
        order: {
          select: {
            id: true,
            order_no: true,
            guest_name: true,
            total_paise: true,
            payment_method: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error: any) {
    console.error('Error fetching admin notifications:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
});

/**
 * POST /api/admin/notifications/:id/retry
 * Manually retry a failed notification.
 */
adminRouter.post('/admin/notifications/:id/retry', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await retryNotification(id);
    res.status(200).json({
      success: true,
      message: `Notification retry processed. Current status: ${updated.status}`,
      notification: updated,
    });
  } catch (error: any) {
    console.error('Error retrying notification:', error);
    res.status(500).json({ error: error.message || 'Failed to retry notification' });
  }
});

