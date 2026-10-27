import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { requireAdminAuth } from './admin.js';
import { dispatchOrderStatusNotifications } from '../lib/notifications.js';

export const deliveryRouter = Router();

const FAILED_REASONS = ['no answer', 'refused', 'wrong address', 'other'] as const;

/**
 * GET /api/admin/deliveries
 * Today's deliveries with daily COD cash summary.
 * Sorted by pincode ascending, then by order time ascending.
 */
deliveryRouter.get('/admin/deliveries', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { date, status } = req.query;

    // Calculate target date range (YYYY-MM-DD or today)
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr;

    const startOfDay = new Date(`${targetDateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${targetDateStr}T23:59:59.999Z`);

    // Fetch all orders for target date to compute accurate daily COD cash summary
    const todayOrders = await prisma.order.findMany({
      where: {
        created_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        delivery: true,
        items: {
          include: {
            product: { select: { id: true, name: true, brand: true, unit_size: true } },
            shop: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    // Compute Daily COD Summary (per F13: expected cash, collected cash, and difference)
    let expectedCashPaise = 0;
    let collectedCashPaise = 0;
    let pendingCashPaise = 0;
    let deliveredCount = 0;
    let pendingDeliveryCount = 0;

    for (const order of todayOrders) {
      const isCod = order.payment_method === 'COD';
      if (order.status === 'DELIVERED') {
        deliveredCount++;
        if (isCod) {
          expectedCashPaise += order.total_paise;
          collectedCashPaise += order.delivery?.cod_collected_paise || 0;
        }
      } else if (order.status === 'SENT_TO_SHOP' || order.status === 'PACKED' || order.status === 'OUT_FOR_DELIVERY') {
        pendingDeliveryCount++;
        if (isCod) {
          pendingCashPaise += order.total_paise;
        }
      }
    }

    const differencePaise = collectedCashPaise - expectedCashPaise;

    // Filter deliveries based on status query
    // Default ('ACTIVE'): SENT_TO_SHOP, PACKED, or OUT_FOR_DELIVERY per spec
    let filteredOrders = todayOrders;
    const filterStatus = typeof status === 'string' ? status : 'ACTIVE';

    if (filterStatus === 'ACTIVE') {
      filteredOrders = todayOrders.filter((o) =>
        ['SENT_TO_SHOP', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status)
      );
    } else if (filterStatus === 'DELIVERED') {
      filteredOrders = todayOrders.filter((o) => o.status === 'DELIVERED');
    } else if (filterStatus === 'OUT_FOR_DELIVERY') {
      filteredOrders = todayOrders.filter((o) => o.status === 'OUT_FOR_DELIVERY');
    } else if (filterStatus !== 'ALL') {
      filteredOrders = todayOrders.filter((o) => o.status === filterStatus);
    }

    // Sort by pincode ascending, then by order creation time ascending
    filteredOrders.sort((a, b) => {
      const pinA = (a.address as any)?.pincode || '411001';
      const pinB = (b.address as any)?.pincode || '411001';
      const pinCompare = pinA.localeCompare(pinB);
      if (pinCompare !== 0) return pinCompare;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    res.status(200).json({
      success: true,
      date: targetDateStr,
      summary: {
        expectedCashPaise,
        collectedCashPaise,
        differencePaise,
        pendingCashPaise,
        deliveredCount,
        pendingDeliveryCount,
        totalTodayOrders: todayOrders.length,
      },
      deliveries: filteredOrders,
    });
  } catch (error: any) {
    console.error('Error in GET /admin/deliveries:', error);
    res.status(500).json({ error: error.message || 'Failed to load deliveries' });
  }
});

/**
 * POST /api/admin/deliveries/:orderId/start
 * Start delivery: PACKED → OUT_FOR_DELIVERY
 */
deliveryRouter.post('/admin/deliveries/:orderId/start', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const adminUser = (req as any).adminUser;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { order_no: orderId }],
      },
      include: { delivery: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'PACKED') {
      return res.status(400).json({
        error: `Cannot start delivery: order is in status ${order.status}. Order must be in PACKED status.`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update delivery record
      if (order.delivery) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: 'OUT_FOR_DELIVERY',
            assigned_to: adminUser.id,
          },
        });
      } else {
        await tx.delivery.create({
          data: {
            order_id: order.id,
            status: 'OUT_FOR_DELIVERY',
            assigned_to: adminUser.id,
          },
        });
      }

      // 2. Update order status
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { status: 'OUT_FOR_DELIVERY' },
        include: { delivery: true },
      });

      // 3. Write audit log
      await tx.auditLog.create({
        data: {
          actor_id: adminUser.id,
          action: 'DELIVERY_STARTED',
          entity: 'deliveries',
          entity_id: order.id,
          old_value: { status: order.status },
          new_value: { status: 'OUT_FOR_DELIVERY' },
        },
      });

      return updatedOrder;
    });

    // F14: Dispatch OUT_FOR_DELIVERY notification
    try {
      await dispatchOrderStatusNotifications(order.id, 'OUT_FOR_DELIVERY');
    } catch (notifErr) {
      console.error('[Notification] Error dispatching OUT_FOR_DELIVERY notification:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: `Delivery started for order ${order.order_no}`,
      order: updated,
    });
  } catch (error: any) {
    console.error('Error starting delivery:', error);
    res.status(500).json({ error: error.message || 'Failed to start delivery' });
  }
});

const DeliveredSchema = z.object({
  cashCollectedPaise: z.number().int().min(0, 'Cash collected must be non-negative'),
  cashNote: z.string().trim().optional(),
});

/**
 * POST /api/admin/deliveries/:orderId/delivered
 * Marks order as Delivered and records cash collected.
 * Rules:
 * - Can be marked Delivered only from OUT_FOR_DELIVERY.
 * - Cash collected must equal total. A difference requires a note.
 */
deliveryRouter.post('/admin/deliveries/:orderId/delivered', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const adminUser = (req as any).adminUser;

    const parseResult = DeliveredSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { cashCollectedPaise, cashNote } = parseResult.data;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { order_no: orderId }],
      },
      include: { delivery: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Rule: A delivery can be marked Delivered only from OUT_FOR_DELIVERY
    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({
        error: `A delivery can be marked Delivered only from OUT_FOR_DELIVERY (current status is ${order.status})`,
      });
    }

    // Rule: Cash collected must equal total. A difference requires a note.
    const differencePaise = cashCollectedPaise - order.total_paise;
    if (order.payment_method === 'COD' && differencePaise !== 0) {
      if (!cashNote || cashNote.trim().length === 0) {
        return res.status(400).json({
          error: `Cash collected does not equal the order total (${differencePaise > 0 ? '+' : ''}${differencePaise / 100} difference). A note explaining the difference is required.`,
          expectedPaise: order.total_paise,
          collectedPaise: cashCollectedPaise,
          differencePaise,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update delivery record
      if (order.delivery) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: 'DELIVERED',
            delivered_at: new Date(),
            cod_collected_paise: cashCollectedPaise,
            cash_note: cashNote || null,
          },
        });
      } else {
        await tx.delivery.create({
          data: {
            order_id: order.id,
            status: 'DELIVERED',
            assigned_to: adminUser.id,
            delivered_at: new Date(),
            cod_collected_paise: cashCollectedPaise,
            cash_note: cashNote || null,
          },
        });
      }

      // 2. Update order status and payment status
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'DELIVERED',
          payment_status: 'SUCCESS',
        },
        include: { delivery: true },
      });

      // 3. Write audit log with cash details
      await tx.auditLog.create({
        data: {
          actor_id: adminUser.id,
          action: 'DELIVERY_DELIVERED',
          entity: 'deliveries',
          entity_id: order.id,
          old_value: { status: order.status },
          new_value: {
            status: 'DELIVERED',
            cod_collected_paise: cashCollectedPaise,
            difference_paise: differencePaise,
            cash_note: cashNote || null,
          },
        },
      });

      return updatedOrder;
    });

    // F14: Dispatch DELIVERED notification
    try {
      await dispatchOrderStatusNotifications(order.id, 'DELIVERED');
    } catch (notifErr) {
      console.error('[Notification] Error dispatching DELIVERED notification:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: `Order ${order.order_no} marked as DELIVERED`,
      order: updated,
    });
  } catch (error: any) {
    console.error('Error marking delivered:', error);
    res.status(500).json({ error: error.message || 'Failed to mark delivery as delivered' });
  }
});

const FailedSchema = z.object({
  reason: z.enum(FAILED_REASONS, {
    errorMap: () => ({ message: 'Reason must be one of: no answer, refused, wrong address, other' }),
  }),
  note: z.string().trim().optional(),
});

/**
 * POST /api/admin/deliveries/:orderId/failed
 * Marks delivery as Failed with reason (no answer, refused, wrong address, other).
 */
deliveryRouter.post('/admin/deliveries/:orderId/failed', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const adminUser = (req as any).adminUser;

    const parseResult = FailedSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { reason, note } = parseResult.data;
    const failureReason = `${reason}${note ? ': ' + note : ''}`;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { order_no: orderId }],
      },
      include: { delivery: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({
        error: `Delivery can only fail from OUT_FOR_DELIVERY (current status is ${order.status})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update delivery record
      if (order.delivery) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: 'FAILED',
            failure_reason: failureReason,
          },
        });
      } else {
        await tx.delivery.create({
          data: {
            order_id: order.id,
            status: 'FAILED',
            failure_reason: failureReason,
            assigned_to: adminUser.id,
          },
        });
      }

      // 2. Update order status
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { status: 'FAILED_DELIVERY' },
        include: { delivery: true },
      });

      // 3. Write audit log
      await tx.auditLog.create({
        data: {
          actor_id: adminUser.id,
          action: 'DELIVERY_FAILED',
          entity: 'deliveries',
          entity_id: order.id,
          old_value: { status: order.status },
          new_value: {
            status: 'FAILED_DELIVERY',
            failure_reason: failureReason,
          },
        },
      });

      return updatedOrder;
    });

    res.status(200).json({
      success: true,
      message: `Order ${order.order_no} delivery marked as failed`,
      order: updated,
    });
  } catch (error: any) {
    console.error('Error marking delivery failed:', error);
    res.status(500).json({ error: error.message || 'Failed to record delivery failure' });
  }
});
