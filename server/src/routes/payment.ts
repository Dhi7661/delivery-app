import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { getAuthenticatedUser } from './auth.js';
import { normalizePhone } from '../lib/notifications.js';

export const paymentRouter = Router();

const PaymentFailureSchema = z.object({
  orderNo: z.string().min(1, 'Order number is required'),
  reason: z.string().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
});

/**
 * POST /api/payments/razorpay/fail
 * Records a payment failure from checkout (e.g. cancelled UPI app, timeout, or bank decline).
 * Updates order status to PAYMENT_FAILED and payment_status to FAILED.
 */
paymentRouter.post('/razorpay/fail', async (req: Request, res: Response) => {
  try {
    const parseResult = PaymentFailureSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { orderNo, reason, description } = parseResult.data;

    const order = await prisma.order.findUnique({
      where: { order_no: orderNo },
      include: { payments: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only allow updating if currently PAYMENT_PENDING or PLACED
    if (order.status !== 'PAYMENT_PENDING' && order.status !== 'PLACED') {
      return res.status(400).json({
        error: `Cannot mark payment as failed. Order status is ${order.status}.`,
      });
    }

    const authUser = await getAuthenticatedUser(req);
    // Security check: if user is logged in, ensure they own the order
    if (authUser && order.user_id && order.user_id !== authUser.id) {
      return res.status(403).json({ error: 'Unauthorized to update this order' });
    }

    const failureReason = description || reason || 'Payment cancelled or declined by user';

    // Update order and payment records
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PAYMENT_FAILED',
          payment_status: 'FAILED',
        },
      });

      // Update associated payment record
      if (order.payments && order.payments.length > 0) {
        await tx.payment.updateMany({
          where: { order_id: order.id, status: 'PENDING' },
          data: {
            status: 'FAILED',
          },
        });
      }

      // Record audit log
      await tx.auditLog.create({
        data: {
          entity: 'orders',
          entity_id: order.id,
          action: 'PAYMENT_FAILED',
          actor_id: authUser?.id || order.user_id || order.guest_phone || 'system',
          old_value: { status: order.status, payment_status: order.payment_status },
          new_value: { status: 'PAYMENT_FAILED', payment_status: 'FAILED', reason: failureReason },
        },
      });
    });

    return res.status(200).json({
      success: true,
      orderNumber: order.order_no,
      status: 'PAYMENT_FAILED',
      paymentStatus: 'FAILED',
      message: 'Payment marked as failed',
    });
  } catch (err: any) {
    console.error('Payment failure recording error:', err);
    return res.status(500).json({ error: 'Failed to record payment failure' });
  }
});

/**
 * POST /api/payments/confirm
 * Security barrier: explicitly reject any client-side attempt to confirm payment.
 * Per F16 specification: "Browser cannot mark an order as paid."
 * Payment confirmation must only happen via signed webhook in F17.
 */
paymentRouter.post('/confirm', (req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Browser cannot mark an order as paid. Payment confirmation requires gateway webhook (F17).',
  });
});

/**
 * POST /api/payments/mark-paid
 * Alternative endpoint security safeguard.
 */
paymentRouter.post('/mark-paid', (req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Browser cannot mark an order as paid. Payment confirmation requires gateway webhook (F17).',
  });
});
