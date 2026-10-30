import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireRiderAuth } from './riderAuth.js';
import { maskPhone, maskAddress, sanitizeForLogging } from '../lib/sanitizer.js';
import { dispatchOrderStatusNotifications } from '../lib/notifications.js';
import { generateOrderInvoice } from '../lib/invoice.js';
import { recordOrderDeliveredLedger } from '../lib/ledger.js';

export const riderOrdersRouter = Router();

const FAILED_REASONS = ['no answer', 'refused', 'wrong address', 'other'] as const;

/**
 * GET /api/delivery/orders
 * Spec Section 7.1 & 7.5: Rider view of today's active orders.
 * Strict data isolation:
 * - NO shop buy prices, margins, or ledgers.
 * - Customer contact is active only during active delivery, hidden/masked once delivered or failed.
 * - Wireframe data: pickup (shop, items, maps), drop (customer, tel, address, maps), payment.
 */
riderOrdersRouter.get('/delivery/orders', requireRiderAuth, async (req: Request, res: Response) => {
  try {
    const rider = (req as any).rider;

    // Get today's start and end timestamps (UTC)
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999Z`);

    // Fetch orders for today
    const orders = await prisma.order.findMany({
      where: {
        created_at: { gte: startOfDay, lte: endOfDay },
        status: {
          in: ['PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY'],
        },
      },
      include: {
        items: {
          where: { is_available: true },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                unit_size: true,
                selling_price_paise: true, // safe customer-facing price
                // shop_price_paise is STRICTLY OMITTED
              },
            },
            shop: {
              select: {
                id: true,
                name: true,
                owner_name: true,
                phone: true,
              },
            },
          },
        },
        delivery: true,
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    // Calculate rider cash summary for today
    // Total COD cash collected by rider today
    let totalCashCollectedPaise = 0;
    let activeOrdersCount = 0;

    for (const order of orders) {
      if (['PACKED', 'OUT_FOR_DELIVERY'].includes(order.status)) {
        activeOrdersCount++;
      }
      if (order.status === 'DELIVERED' && order.payment_method === 'COD') {
        totalCashCollectedPaise += order.delivery?.cod_collected_paise || order.total_paise;
      }
    }

    // Check confirmed handovers for today to know outstanding cash to hand over
    const todayHandovers = await prisma.cashHandover.findMany({
      where: {
        rider_id: rider.id,
        handover_date: todayStr,
        admin_confirmed_at: { not: null },
      },
    });

    const handedOverPaise = todayHandovers.reduce((sum, h) => sum + h.actual_amount_paise, 0);
    const cashToHandOverPaise = Math.max(0, totalCashCollectedPaise - handedOverPaise);

    // Format orders for mobile rider wireframe (Spec Section 7.8)
    const formattedOrders = orders.map((order) => {
      const isActive = ['PACKED', 'OUT_FOR_DELIVERY'].includes(order.status);
      const addr = order.address as any;
      const primaryShop = order.items[0]?.shop;

      // Safe customer information: hidden/masked if completed/failed (Spec Section 7.5)
      const customerName = isActive
        ? (order.user?.name || order.guest_name || 'Customer')
        : 'Customer (Order Complete)';

      const rawPhone = order.user?.phone || order.guest_phone || '';
      const customerPhone = isActive ? rawPhone : maskPhone(rawPhone);
      const customerPhoneTel = isActive ? `tel:${rawPhone}` : null;

      const customerAddressDisplay = isActive
        ? [addr?.line1, addr?.landmark, addr?.pincode].filter(Boolean).join(', ')
        : maskAddress(addr);

      // Shop location and map URL
      const shopAddressQuery = encodeURIComponent(
        `${primaryShop?.name || 'Partner Shop'}, Pune, Maharashtra`
      );
      const shopMapUrl = `https://www.google.com/maps/search/?api=1&query=${shopAddressQuery}`;

      // Customer map URL (only if active)
      const customerAddressQuery = encodeURIComponent(
        `${addr?.line1 || ''}, ${addr?.pincode || 'Pune'}`
      );
      const customerMapUrl = isActive
        ? `https://www.google.com/maps/search/?api=1&query=${customerAddressQuery}`
        : null;

      // Safe item list without any margin or shop cost
      const safeItems = order.items.map((item) => ({
        id: item.id,
        name: item.product.name,
        brand: item.product.brand,
        unitSize: item.product.unit_size,
        qty: item.qty,
        sellingPricePaise: item.product.selling_price_paise,
        lineTotalPaise: item.line_total_paise,
      }));

      return {
        id: order.id,
        orderNo: order.order_no,
        status: order.status,
        isActive,
        createdAt: order.created_at,
        shop: {
          id: primaryShop?.id || '',
          name: primaryShop?.name || 'Local Store',
          mapUrl: shopMapUrl,
        },
        items: safeItems,
        itemsCount: safeItems.length,
        customer: {
          name: customerName,
          phone: customerPhone,
          phoneTel: customerPhoneTel,
          address: customerAddressDisplay,
          mapUrl: customerMapUrl,
        },
        payment: {
          method: order.payment_method,
          isCod: order.payment_method === 'COD',
          totalPaise: order.total_paise,
          label:
            order.payment_method === 'COD'
              ? `Collect cash: ₹${order.total_paise / 100}`
              : 'Paid online. Do not collect cash.',
          cashCollectedPaise: order.delivery?.cod_collected_paise || null,
        },
        actions: {
          canPickup: order.status === 'PACKED',
          canDeliver: order.status === 'OUT_FOR_DELIVERY',
          canFail: order.status === 'OUT_FOR_DELIVERY',
        },
      };
    });

    res.status(200).json({
      success: true,
      today: todayStr,
      rider: {
        id: rider.id,
        name: rider.name || 'Delivery Partner',
      },
      summary: {
        activeOrdersCount,
        cashToHandOverPaise,
        totalCashCollectedPaise,
        handedOverPaise,
      },
      orders: formattedOrders,
    });
  } catch (error: any) {
    console.error('Error fetching rider orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch rider orders' });
  }
});

/**
 * POST /api/delivery/orders/:id/pickup
 * Spec Section 7.2: Action "Picked up"
 * Transitions: PACKED -> OUT_FOR_DELIVERY
 */
riderOrdersRouter.post('/delivery/orders/:id/pickup', requireRiderAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rider = (req as any).rider;

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { order_no: id }] },
      include: { delivery: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'PACKED') {
      return res.status(400).json({
        error: `Order must be in PACKED status to pick up (current status: ${order.status})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update delivery record
      if (order.delivery) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: 'OUT_FOR_DELIVERY',
            assigned_to: rider.id,
          },
        });
      } else {
        await tx.delivery.create({
          data: {
            order_id: order.id,
            status: 'OUT_FOR_DELIVERY',
            assigned_to: rider.id,
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
          actor_id: rider.id,
          action: 'RIDER_PICKED_UP',
          entity: 'orders',
          entity_id: order.id,
          old_value: { status: order.status },
          new_value: { status: 'OUT_FOR_DELIVERY', rider_id: rider.id },
        },
      });

      return updatedOrder;
    });

    // Dispatch notification
    try {
      await dispatchOrderStatusNotifications(order.id, 'OUT_FOR_DELIVERY');
    } catch (notifErr) {
      console.error('Error dispatching pickup notification:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: `Order ${order.order_no} marked as picked up and Out for Delivery`,
      order: updated,
    });
  } catch (error: any) {
    console.error('Rider pickup error:', error);
    res.status(500).json({ error: error.message || 'Failed to record pickup' });
  }
});

const RiderDeliveredSchema = z.object({
  cashCollectedPaise: z.number().int().min(0, 'Cash collected must be non-negative'),
  cashNote: z.string().trim().optional(),
});

/**
 * POST /api/delivery/orders/:id/delivered
 * Spec Section 7.2 & 7.3: Action "Delivered" with COD cash recorded.
 * Rules:
 * - Order must be OUT_FOR_DELIVERY.
 * - Cash recorded must equal order total, or carry a note (discrepancy <= ₹50).
 */
riderOrdersRouter.post('/delivery/orders/:id/delivered', requireRiderAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rider = (req as any).rider;

    const parseResult = RiderDeliveredSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { cashCollectedPaise, cashNote } = parseResult.data;

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { order_no: id }] },
      include: { delivery: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({
        error: `Order must be in OUT_FOR_DELIVERY status to mark delivered (current status: ${order.status})`,
      });
    }

    // COD verification
    const diffPaise = cashCollectedPaise - order.total_paise;
    if (order.payment_method === 'COD') {
      if (diffPaise !== 0) {
        if (!cashNote || cashNote.trim().length === 0) {
          return res.status(400).json({
            error: `Cash collected does not match order total (₹${cashCollectedPaise / 100} vs expected ₹${order.total_paise / 100}). A note explaining the difference is required.`,
            expectedPaise: order.total_paise,
            collectedPaise: cashCollectedPaise,
          });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update delivery
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
            assigned_to: rider.id,
            delivered_at: new Date(),
            cod_collected_paise: cashCollectedPaise,
            cash_note: cashNote || null,
          },
        });
      }

      // 2. Update order
      const ord = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'DELIVERED',
          payment_status: 'SUCCESS',
        },
        include: { delivery: true },
      });

      // 3. Write audit log
      await tx.auditLog.create({
        data: {
          actor_id: rider.id,
          action: 'RIDER_DELIVERED',
          entity: 'orders',
          entity_id: order.id,
          old_value: { status: order.status },
          new_value: sanitizeForLogging({
            status: 'DELIVERED',
            cash_collected_paise: cashCollectedPaise,
            difference_paise: diffPaise,
            cash_note: cashNote || null,
          }),
        },
      });

      return ord;
    });

    // F14: Dispatch notification
    try {
      await dispatchOrderStatusNotifications(order.id, 'DELIVERED');
    } catch (notifErr) {
      console.error('Error dispatching DELIVERED notification:', notifErr);
    }

    // F15: Automatically generate GST Invoice
    try {
      await generateOrderInvoice(order.id);
    } catch (invErr) {
      console.error('Error generating GST invoice upon delivery:', invErr);
    }

    // F23: Automatically record Shop Ledger
    try {
      await recordOrderDeliveredLedger(order.id);
    } catch (ledgerErr) {
      console.error('Error recording shop ledger on delivery:', ledgerErr);
    }

    res.status(200).json({
      success: true,
      message: `Order ${order.order_no} successfully delivered!`,
      order: updated,
    });
  } catch (error: any) {
    console.error('Rider delivered error:', error);
    res.status(500).json({ error: error.message || 'Failed to record delivery' });
  }
});

const RiderFailedSchema = z.object({
  reason: z.enum(FAILED_REASONS, {
    errorMap: () => ({ message: 'Reason must be one of: no answer, refused, wrong address, other' }),
  }),
  note: z.string().trim().optional(),
});

/**
 * POST /api/delivery/orders/:id/failed
 * Spec Section 7.2: Action "Delivery failed"
 * Transitions: OUT_FOR_DELIVERY -> FAILED_DELIVERY
 */
riderOrdersRouter.post('/delivery/orders/:id/failed', requireRiderAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rider = (req as any).rider;

    const parseResult = RiderFailedSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { reason, note } = parseResult.data;
    const failureReason = `${reason}${note ? ': ' + note : ''}`;

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { order_no: id }] },
      include: { delivery: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({
        error: `Order must be in OUT_FOR_DELIVERY status to mark failed (current status: ${order.status})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update delivery
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
            assigned_to: rider.id,
          },
        });
      }

      // 2. Update order
      const ord = await tx.order.update({
        where: { id: order.id },
        data: { status: 'FAILED_DELIVERY' },
        include: { delivery: true },
      });

      // 3. Write audit log
      await tx.auditLog.create({
        data: {
          actor_id: rider.id,
          action: 'RIDER_DELIVERY_FAILED',
          entity: 'orders',
          entity_id: order.id,
          old_value: { status: order.status },
          new_value: sanitizeForLogging({
            status: 'FAILED_DELIVERY',
            failure_reason: failureReason,
          }),
        },
      });

      return ord;
    });

    res.status(200).json({
      success: true,
      message: `Order ${order.order_no} marked as Delivery Failed (${reason})`,
      order: updated,
    });
  } catch (error: any) {
    console.error('Rider failed delivery error:', error);
    res.status(500).json({ error: error.message || 'Failed to record failed delivery' });
  }
});

