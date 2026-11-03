import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { requireAdmin } from './adminAuth.js';
import { dispatchOrderStatusNotifications } from '../lib/notifications.js';
import { cancelOrderWithRefund } from '../lib/cancellation.js';
import { calculateDeliveryFee } from '../lib/pricing.js';

export const adminOrdersRouter = Router();

// Protect all admin order routes with requireAdmin middleware
adminOrdersRouter.use(requireAdmin);

function getNextAction(order: {
  status: OrderStatus;
  payment_method: string;
  confirmed_with_customer_at: Date | null;
}): string {
  switch (order.status) {
    case 'PLACED':
      return order.payment_method === 'COD' && !order.confirmed_with_customer_at
        ? 'CONFIRM_COD'
        : 'CONFIRM_ORDER';
    case 'CONFIRMED':
      return 'SEND_TO_SHOP';
    case 'SENT_TO_SHOP':
      return 'MARK_PACKED';
    case 'PACKED':
      return 'OUT_FOR_DELIVERY';
    case 'OUT_FOR_DELIVERY':
      return 'MARK_DELIVERED';
    case 'FAILED_DELIVERY':
      return 'RESCHEDULE';
    default:
      return 'VIEW_ONLY';
  }
}

/**
 * GET /api/admin/orders
 * Returns orders grouped by Kanban board columns and summary counts.
 */
adminOrdersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const shopId = typeof req.query.shopId === 'string' ? req.query.shopId.trim() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const where: any = {};

    if (search) {
      where.OR = [
        { order_no: { contains: search, mode: 'insensitive' } },
        { guest_name: { contains: search, mode: 'insensitive' } },
        { guest_phone: { contains: search } },
      ];
    }

    if (shopId) {
      where.items = { some: { shop_id: shopId } };
    }

    if (statusFilter) {
      where.status = statusFilter;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, unit_size: true, brand: true } },
            shop: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    // Format orders with next action and clean customer details
    const formattedOrders = orders.map((o) => ({
      id: o.id,
      order_no: o.order_no,
      status: o.status,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      subtotal_paise: o.subtotal_paise,
      delivery_fee_paise: o.delivery_fee_paise,
      total_paise: o.total_paise,
      customer_name: o.guest_name || o.user?.name || 'Customer',
      customer_phone: o.guest_phone || o.user?.phone || '',
      address: o.address,
      confirmed_with_customer_at: o.confirmed_with_customer_at,
      customer_confirmation_method: o.customer_confirmation_method,
      customer_accepted_changes_at: o.customer_accepted_changes_at,
      shop_packing_note: o.shop_packing_note,
      created_at: o.created_at,
      updated_at: o.updated_at,
      items: o.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product?.name || 'Product',
        unit_size: item.product?.unit_size || '',
        brand: item.product?.brand || '',
        shop_name: item.shop?.name || '',
        qty: item.qty,
        mrp_paise: item.mrp_paise,
        shop_price_paise: item.shop_price_paise,
        selling_price_paise: item.selling_price_paise,
        line_total_paise: item.line_total_paise,
        is_available: item.is_available,
        unavailable_noted_at: item.unavailable_noted_at,
      })),
      next_action: getNextAction(o),
    }));

    // Grouping by Kanban board columns
    const columns = {
      PLACED: formattedOrders.filter((o) => o.status === 'PLACED' || o.status === 'PAYMENT_PENDING'),
      CONFIRMED: formattedOrders.filter((o) => o.status === 'CONFIRMED'),
      SENT_TO_SHOP: formattedOrders.filter((o) => o.status === 'SENT_TO_SHOP'),
      PACKED: formattedOrders.filter((o) => o.status === 'PACKED'),
      OUT_FOR_DELIVERY: formattedOrders.filter((o) => o.status === 'OUT_FOR_DELIVERY'),
      DELIVERED: formattedOrders.filter((o) => o.status === 'DELIVERED'),
      ISSUES: formattedOrders.filter((o) =>
        ['FAILED_DELIVERY', 'CANCELLED', 'PAYMENT_FAILED'].includes(o.status)
      ),
    };

    const counts = {
      PLACED: columns.PLACED.length,
      CONFIRMED: columns.CONFIRMED.length,
      SENT_TO_SHOP: columns.SENT_TO_SHOP.length,
      PACKED: columns.PACKED.length,
      OUT_FOR_DELIVERY: columns.OUT_FOR_DELIVERY.length,
      DELIVERED: columns.DELIVERED.length,
      ISSUES: columns.ISSUES.length,
      TOTAL: formattedOrders.length,
    };

    return res.status(200).json({
      orders: formattedOrders,
      columns,
      counts,
    });
  } catch (err: any) {
    console.error('Error fetching admin orders:', err);
    return res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

/**
 * GET /api/admin/orders/:orderNo
 * Single order details with item breakdown, customer details, and audit history.
 */
adminOrdersRouter.get('/:orderNo', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;

    const order = await prisma.order.findUnique({
      where: { order_no: orderNo },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, unit_size: true, brand: true } },
            shop: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true, phone: true } },
        payments: true,
        refunds: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Retrieve order audit history
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entity_id: order.id },
          { entity_id: order.order_no },
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return res.status(200).json({
      order: {
        ...order,
        customer_name: order.guest_name || order.user?.name || 'Customer',
        customer_phone: order.guest_phone || order.user?.phone || '',
        next_action: getNextAction(order),
      },
      auditLogs,
    });
  } catch (err: any) {
    console.error('Error fetching admin order detail:', err);
    return res.status(500).json({ error: 'Failed to retrieve order details' });
  }
});

const confirmCustomerSchema = z.object({
  method: z.enum(['PHONE', 'WHATSAPP', 'CALL']).default('PHONE'),
  note: z.string().optional(),
});

/**
 * POST /api/admin/orders/:orderNo/confirm-customer
 * Customer confirmation for COD orders (Section 4).
 * Transitions PLACED -> CONFIRMED.
 */
adminOrdersRouter.post('/:orderNo/confirm-customer', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;
    const { method, note } = confirmCustomerSchema.parse(req.body || {});

    const order = await prisma.order.findUnique({ where: { order_no: orderNo } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updated = await prisma.order.update({
      where: { order_no: orderNo },
      data: {
        confirmed_with_customer_at: new Date(),
        customer_confirmation_method: method,
        status: order.status === 'PLACED' ? 'CONFIRMED' : order.status,
      },
    });

    if (order.status === 'PLACED') {
      await dispatchOrderStatusNotifications(order.id, 'CONFIRMED').catch(() => null);
    }

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ORDER_CUSTOMER_CONFIRMED',
        entity: 'order',
        entity_id: order.id,
        old_value: { status: order.status, confirmed_with_customer_at: null },
        new_value: { status: updated.status, method, note },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      order: updated,
    });
  } catch (err: any) {
    console.error('Error confirming customer:', err);
    return res.status(500).json({ error: 'Failed to confirm customer order' });
  }
});

/**
 * POST /api/admin/orders/:orderNo/send-to-shop
 * Moves CONFIRMED -> SENT_TO_SHOP.
 * Enforces rule: COD orders cannot move to SENT_TO_SHOP without customer confirmation (Section 4).
 */
adminOrdersRouter.post('/:orderNo/send-to-shop', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;

    const order = await prisma.order.findUnique({ where: { order_no: orderNo } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'CONFIRMED' && order.status !== 'PLACED') {
      return res.status(400).json({
        error: `Cannot send order to shop from status '${order.status}'. Must be CONFIRMED.`,
      });
    }

    // COD Confirmation rule (Section 4 & Section 13.2)
    if (order.payment_method === 'COD' && !order.confirmed_with_customer_at) {
      return res.status(400).json({
        error: 'A COD order cannot move to SENT_TO_SHOP without customer confirmation. Confirm with customer first.',
      });
    }

    const updated = await prisma.order.update({
      where: { order_no: orderNo },
      data: { status: 'SENT_TO_SHOP' },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ORDER_SENT_TO_SHOP',
        entity: 'order',
        entity_id: order.id,
        old_value: { status: order.status },
        new_value: { status: 'SENT_TO_SHOP' },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      order: updated,
    });
  } catch (err: any) {
    console.error('Error sending order to shop:', err);
    return res.status(500).json({ error: 'Failed to send order to shop' });
  }
});

const markPackedSchema = z.object({
  shop_packing_note: z.string().optional(),
});

/**
 * POST /api/admin/orders/:orderNo/mark-packed
 * Moves SENT_TO_SHOP -> PACKED. Records shop packing note.
 */
adminOrdersRouter.post('/:orderNo/mark-packed', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;
    const { shop_packing_note } = markPackedSchema.parse(req.body || {});

    const order = await prisma.order.findUnique({ where: { order_no: orderNo } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'SENT_TO_SHOP') {
      return res.status(400).json({
        error: `Cannot mark packed from status '${order.status}'. Order must be SENT_TO_SHOP.`,
      });
    }

    const updated = await prisma.order.update({
      where: { order_no: orderNo },
      data: {
        status: 'PACKED',
        shop_packing_note: shop_packing_note || 'Shop confirmed items packed via WhatsApp',
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ORDER_PACKED',
        entity: 'order',
        entity_id: order.id,
        old_value: { status: order.status },
        new_value: { status: 'PACKED', shop_packing_note },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      order: updated,
    });
  } catch (err: any) {
    console.error('Error marking order packed:', err);
    return res.status(500).json({ error: 'Failed to mark order packed' });
  }
});

/**
 * POST /api/admin/orders/:orderNo/out-for-delivery
 * Moves PACKED -> OUT_FOR_DELIVERY. Dispatches customer notification.
 */
adminOrdersRouter.post('/:orderNo/out-for-delivery', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;

    const order = await prisma.order.findUnique({ where: { order_no: orderNo } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'PACKED' && order.status !== 'FAILED_DELIVERY') {
      return res.status(400).json({
        error: `Cannot dispatch to out for delivery from status '${order.status}'. Order must be PACKED or FAILED_DELIVERY.`,
      });
    }

    const updated = await prisma.order.update({
      where: { order_no: orderNo },
      data: { status: 'OUT_FOR_DELIVERY' },
    });

    await dispatchOrderStatusNotifications(order.id, 'OUT_FOR_DELIVERY').catch(() => null);

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ORDER_OUT_FOR_DELIVERY',
        entity: 'order',
        entity_id: order.id,
        old_value: { status: order.status },
        new_value: { status: 'OUT_FOR_DELIVERY' },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      order: updated,
    });
  } catch (err: any) {
    console.error('Error dispatching order:', err);
    return res.status(500).json({ error: 'Failed to dispatch order' });
  }
});

const markDeliveredSchema = z.object({
  cash_collected_paise: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
});

/**
 * POST /api/admin/orders/:orderNo/mark-delivered
 * Moves OUT_FOR_DELIVERY -> DELIVERED. Updates payment status to PAID and logs COD cash.
 */
adminOrdersRouter.post('/:orderNo/mark-delivered', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;
    const { cash_collected_paise, note } = markDeliveredSchema.parse(req.body || {});

    const order = await prisma.order.findUnique({ where: { order_no: orderNo } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({
        error: `Cannot mark delivered from status '${order.status}'. Order must be OUT_FOR_DELIVERY.`,
      });
    }

    const updated = await prisma.order.update({
      where: { order_no: orderNo },
      data: {
        status: 'DELIVERED',
        payment_status: 'SUCCESS',
      },
    });

    await dispatchOrderStatusNotifications(order.id, 'DELIVERED').catch(() => null);

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ORDER_DELIVERED',
        entity: 'order',
        entity_id: order.id,
        old_value: { status: order.status, payment_status: order.payment_status },
        new_value: {
          status: 'DELIVERED',
          payment_status: 'SUCCESS',
          cash_collected_paise: cash_collected_paise ?? order.total_paise,
          note,
        },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      order: updated,
    });
  } catch (err: any) {
    console.error('Error delivering order:', err);
    return res.status(500).json({ error: 'Failed to mark order delivered' });
  }
});

const markFailedSchema = z.object({
  reason: z.enum(['no_answer', 'wrong_address', 'customer_refused', 'other']),
  note: z.string().optional(),
});

/**
 * POST /api/admin/orders/:orderNo/mark-failed
 * Moves OUT_FOR_DELIVERY -> FAILED_DELIVERY with reason code.
 */
adminOrdersRouter.post('/:orderNo/mark-failed', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;
    const { reason, note } = markFailedSchema.parse(req.body || {});

    const order = await prisma.order.findUnique({ where: { order_no: orderNo } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({
        error: `Cannot mark delivery failed from status '${order.status}'. Order must be OUT_FOR_DELIVERY.`,
      });
    }

    const updated = await prisma.order.update({
      where: { order_no: orderNo },
      data: { status: 'FAILED_DELIVERY' },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ORDER_FAILED_DELIVERY',
        entity: 'order',
        entity_id: order.id,
        old_value: { status: order.status },
        new_value: { status: 'FAILED_DELIVERY', reason, note },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      order: updated,
    });
  } catch (err: any) {
    console.error('Error marking delivery failed:', err);
    return res.status(500).json({ error: 'Failed to mark delivery failed' });
  }
});

const cancelOrderSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required for admin cancellation'),
});

/**
 * POST /api/admin/orders/:orderNo/cancel
 * Admin cancellation endpoint with automated refund and GST credit note (F18).
 */
adminOrdersRouter.post('/:orderNo/cancel', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;
    const parseResult = cancelOrderSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error.errors[0]?.message || 'Cancellation reason is required',
      });
    }

    const order = await prisma.order.findUnique({ where: { order_no: orderNo } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const result = await cancelOrderWithRefund({
      orderId: order.id,
      actorId: admin.id,
      actorRole: 'ADMIN',
      reason: parseResult.data.reason,
    });

    return res.status(200).json({
      success: true,
      order: result.order,
      refund: result.refund,
      creditNote: result.creditNote,
    });
  } catch (err: any) {
    console.error('Error cancelling order:', err);
    return res.status(500).json({ error: err.message || 'Failed to cancel order' });
  }
});

const itemUnavailableSchema = z.object({
  orderItemId: z.string().uuid('Invalid order item id'),
  note: z.string().optional(),
});

/**
 * POST /api/admin/orders/:orderNo/item-unavailable
 * Partial availability: Marks item unavailable and recalculates totals authority-side (Section 5).
 */
adminOrdersRouter.post('/:orderNo/item-unavailable', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const admin = (req as any).admin;
    const { orderItemId, note } = itemUnavailableSchema.parse(req.body);

    const order = await prisma.order.findUnique({
      where: { order_no: orderNo },
      include: { items: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const targetItem = order.items.find((i) => i.id === orderItemId);
    if (!targetItem) {
      return res.status(404).json({ error: 'Order item not found on this order' });
    }

    // Update item availability
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: {
        is_available: false,
        unavailable_noted_at: new Date(),
      },
    });

    // Recalculate subtotal authority-side from all remaining available items
    const remainingItems = await prisma.orderItem.findMany({
      where: { order_id: order.id, is_available: true },
    });

    const newSubtotalPaise = remainingItems.reduce((acc, i) => acc + i.line_total_paise, 0);

    // Recalculate delivery fee based on new subtotal
    const deliveryFeePaise = await calculateDeliveryFee(newSubtotalPaise);
    const newTotalPaise = newSubtotalPaise + deliveryFeePaise;

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        subtotal_paise: newSubtotalPaise,
        delivery_fee_paise: deliveryFeePaise,
        total_paise: newTotalPaise,
      },
      include: { items: true },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ORDER_ITEM_UNAVAILABLE',
        entity: 'order_item',
        entity_id: orderItemId,
        old_value: {
          is_available: true,
          subtotal_paise: order.subtotal_paise,
          total_paise: order.total_paise,
        },
        new_value: {
          is_available: false,
          subtotal_paise: newSubtotalPaise,
          total_paise: newTotalPaise,
          note,
        },
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      order: updatedOrder,
    });
  } catch (err: any) {
    console.error('Error marking item unavailable:', err);
    return res.status(500).json({ error: 'Failed to mark item unavailable' });
  }
});
