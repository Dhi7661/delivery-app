import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { getAuthenticatedUser } from './auth.js';
import { dispatchOrderStatusNotifications } from '../lib/notifications.js';
import { verifyRazorpayWebhookSignature } from '../lib/razorpay.js';
import { reconcilePendingPayments } from '../lib/reconciliation.js';

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
paymentRouter.post('/confirm', (_req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Browser cannot mark an order as paid. Payment confirmation requires gateway webhook (F17).',
  });
});

/**
 * POST /api/payments/mark-paid
 * Alternative endpoint security safeguard.
 */
paymentRouter.post('/mark-paid', (_req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Browser cannot mark an order as paid. Payment confirmation requires gateway webhook (F17).',
  });
});

/**
 * POST /api/payments/razorpay/webhook
 * Receives Razorpay webhook events.
 * Rules (F17):
 * - Verify the signature with the webhook secret from .env. Reject unsigned or wrongly signed requests with 401.
 * - ProcessedEvent table with a unique event ID, so each event is handled once.
 * - Captured payment with correct amount: order becomes CONFIRMED + automated notification sent.
 * - Captured payment with different amount: order is flagged for review and is not confirmed.
 * - Duplicate event: ignored after the first.
 * - Payment records are never deleted.
 */
paymentRouter.post('/razorpay/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;

  if (!signature) {
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  // Obtain raw body buffer or string for HMAC-SHA256 verification
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const payload = req.body;
  const eventType = payload.event as string | undefined;

  // Derive unique event ID
  const eventId: string =
    payload.id ||
    (req.headers['x-razorpay-event-id'] as string) ||
    (payload.payload?.payment?.entity?.id
      ? `evt_${payload.payload.payment.entity.id}_${eventType}`
      : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

  // Idempotency check: ProcessedEvent table
  try {
    const alreadyProcessed = await prisma.processedEvent.findUnique({
      where: { event_id: eventId },
    });

    if (alreadyProcessed) {
      return res.status(200).json({
        status: 'ignored',
        message: 'Duplicate event already processed',
        eventId,
      });
    }

    // Record event as processed
    await prisma.processedEvent.create({
      data: {
        event_id: eventId,
        event_type: eventType || 'unknown',
        payload: payload,
      },
    });
  } catch (err: any) {
    // Unique constraint violation on race condition
    if (err.code === 'P2002') {
      return res.status(200).json({
        status: 'ignored',
        message: 'Duplicate event already processed',
        eventId,
      });
    }
    console.error('[Webhook] Error recording processed event:', err);
    return res.status(500).json({ error: 'Internal server error recording webhook event' });
  }

  // Handle payment.captured or order.paid
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const paymentEntity = payload.payload?.payment?.entity;
    if (!paymentEntity) {
      return res.status(200).json({ status: 'ignored', message: 'No payment entity in payload' });
    }

    const gatewayOrderId: string = paymentEntity.order_id;
    const gatewayPaymentId: string = paymentEntity.id;
    const amountPaise: number = Number(paymentEntity.amount);
    const orderNo: string | undefined = paymentEntity.notes?.order_no || paymentEntity.notes?.orderNo;

    // Locate the order in our database
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          ...(gatewayOrderId
            ? [{ payments: { some: { gateway_order_id: gatewayOrderId } } }]
            : []),
          ...(orderNo ? [{ order_no: orderNo }] : []),
        ],
      },
      include: {
        payments: true,
      },
    });

    if (!order) {
      console.warn(`[Webhook] Order not found for gateway order ${gatewayOrderId} / receipt ${orderNo}`);
      return res.status(200).json({
        status: 'ignored',
        message: 'Order not found for payment entity',
      });
    }

    // Rule: Compare amounts
    if (order.total_paise === amountPaise) {
      // Correct amount: Order becomes CONFIRMED if pending
      if (order.status === 'PAYMENT_PENDING' || order.status === 'PLACED') {
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CONFIRMED',
              payment_status: 'SUCCESS',
            },
          });

          // Update existing pending payment or create new success record
          const existingPayment = order.payments.find(
            (p) => p.gateway === 'razorpay' && p.gateway_order_id === gatewayOrderId
          );

          if (existingPayment) {
            await tx.payment.update({
              where: { id: existingPayment.id },
              data: {
                status: 'SUCCESS',
                gateway_payment_id: gatewayPaymentId,
              },
            });
          } else {
            await tx.payment.create({
              data: {
                order_id: order.id,
                gateway: 'razorpay',
                gateway_order_id: gatewayOrderId,
                gateway_payment_id: gatewayPaymentId,
                amount_paise: amountPaise,
                status: 'SUCCESS',
              },
            });
          }

          // Record audit log
          await tx.auditLog.create({
            data: {
              entity: 'orders',
              entity_id: order.id,
              action: 'PAYMENT_CONFIRMED',
              actor_id: 'razorpay_webhook',
              old_value: { status: order.status, payment_status: order.payment_status },
              new_value: {
                status: 'CONFIRMED',
                payment_status: 'SUCCESS',
                gateway_payment_id: gatewayPaymentId,
                amount_paise: amountPaise,
              },
            },
          });
        });

        // Trigger automated order confirmation notification
        try {
          await dispatchOrderStatusNotifications(order.id, 'CONFIRMED');
        } catch (notifErr) {
          console.error('[Webhook] Failed to dispatch CONFIRMED notification:', notifErr);
        }

        return res.status(200).json({
          status: 'confirmed',
          orderNo: order.order_no,
          gatewayPaymentId,
          message: 'Payment confirmed successfully',
        });
      }

      return res.status(200).json({
        status: 'noop',
        orderNo: order.order_no,
        message: `Order already in status ${order.status}`,
      });
    } else {
      // Amount mismatch: Flag for review, DO NOT confirm
      await prisma.auditLog.create({
        data: {
          entity: 'orders',
          entity_id: order.id,
          action: 'PAYMENT_AMOUNT_MISMATCH',
          actor_id: 'razorpay_webhook',
          old_value: { status: order.status, total_paise: order.total_paise },
          new_value: {
            expected_paise: order.total_paise,
            received_paise: amountPaise,
            gateway_payment_id: gatewayPaymentId,
            flagged: true,
            note: 'Captured amount differs from order total. Order is flagged and not confirmed.',
          },
        },
      });

      return res.status(200).json({
        status: 'flagged',
        orderNo: order.order_no,
        message: 'Amount mismatch: order flagged for review and not confirmed',
      });
    }
  }

  // Handle payment.failed
  if (eventType === 'payment.failed') {
    const paymentEntity = payload.payload?.payment?.entity;
    if (paymentEntity) {
      const gatewayOrderId = paymentEntity.order_id;
      const orderNo = paymentEntity.notes?.order_no || paymentEntity.notes?.orderNo;

      const order = await prisma.order.findFirst({
        where: {
          OR: [
            ...(gatewayOrderId
              ? [{ payments: { some: { gateway_order_id: gatewayOrderId } } }]
              : []),
            ...(orderNo ? [{ order_no: orderNo }] : []),
          ],
        },
        include: { payments: true },
      });

      if (order && (order.status === 'PAYMENT_PENDING' || order.status === 'PLACED')) {
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'PAYMENT_FAILED',
              payment_status: 'FAILED',
            },
          });

          await tx.payment.updateMany({
            where: { order_id: order.id, status: 'PENDING' },
            data: { status: 'FAILED' },
          });

          await tx.auditLog.create({
            data: {
              entity: 'orders',
              entity_id: order.id,
              action: 'PAYMENT_FAILED',
              actor_id: 'razorpay_webhook',
              old_value: { status: order.status, payment_status: order.payment_status },
              new_value: {
                status: 'PAYMENT_FAILED',
                payment_status: 'FAILED',
                gateway_payment_id: paymentEntity.id,
                error_description: paymentEntity.error_description || 'Payment failed',
              },
            },
          });
        });
      }
    }

    return res.status(200).json({ status: 'recorded_failure' });
  }

  return res.status(200).json({ status: 'unhandled_event', eventType });
});

/**
 * POST /api/payments/razorpay/reconcile
 * Trigger periodic or on-demand reconciliation of pending payments older than specified minutes.
 */
paymentRouter.post('/razorpay/reconcile', async (req: Request, res: Response) => {
  try {
    const olderThanMinutes =
      typeof req.query.olderThanMinutes === 'string'
        ? Number(req.query.olderThanMinutes)
        : typeof req.body.olderThanMinutes === 'number'
        ? req.body.olderThanMinutes
        : 10;

    const summary = await reconcilePendingPayments({ olderThanMinutes });
    return res.status(200).json({ success: true, summary });
  } catch (err: any) {
    console.error('[Reconciliation API] Error:', err);
    return res.status(500).json({ error: 'Reconciliation failed', details: err.message });
  }
});
