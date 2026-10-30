import { prisma } from './db.js';
import { fetchGatewayPaymentsForOrder } from './razorpay.js';
import { dispatchOrderStatusNotifications } from './notifications.js';

export interface ReconciliationOptions {
  olderThanMinutes?: number;
}

export interface ReconciliationSummary {
  checked: number;
  confirmed: number;
  failed: number;
  flagged: number;
  orders: Array<{
    orderNo: string;
    action: 'CONFIRMED' | 'FAILED' | 'FLAGGED' | 'STILL_PENDING';
    reason?: string;
  }>;
}

/**
 * Reconciles PAYMENT_PENDING orders older than a specified duration (default 10 mins).
 * Checks gateway payments and updates order status.
 * Rules:
 * - Captured payment with correct amount: order becomes CONFIRMED + sends confirmation SMS
 * - Captured payment with different amount: order is flagged for review and is not confirmed
 * - Failed gateway payment: order becomes PAYMENT_FAILED
 * - Payment records are never deleted
 */
export async function reconcilePendingPayments(
  options: ReconciliationOptions = {}
): Promise<ReconciliationSummary> {
  const olderThanMinutes = options.olderThanMinutes ?? 10;
  const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const pendingOrders = await prisma.order.findMany({
    where: {
      status: 'PAYMENT_PENDING',
      payment_method: 'UPI',
      created_at: { lte: cutoffDate },
    },
    include: {
      payments: true,
    },
    orderBy: { created_at: 'asc' },
  });

  const summary: ReconciliationSummary = {
    checked: pendingOrders.length,
    confirmed: 0,
    failed: 0,
    flagged: 0,
    orders: [],
  };

  for (const order of pendingOrders) {
    // Find payment with gateway_order_id
    const payment = order.payments.find(
      (p) => p.gateway === 'razorpay' && Boolean(p.gateway_order_id)
    );

    if (!payment || !payment.gateway_order_id) {
      summary.orders.push({
        orderNo: order.order_no,
        action: 'STILL_PENDING',
        reason: 'No gateway order ID found',
      });
      continue;
    }

    try {
      const gatewayPayments = await fetchGatewayPaymentsForOrder(payment.gateway_order_id);

      if (!gatewayPayments || gatewayPayments.length === 0) {
        summary.orders.push({
          orderNo: order.order_no,
          action: 'STILL_PENDING',
          reason: 'No payments found at gateway yet',
        });
        continue;
      }

      // Check if any payment was captured
      const capturedPayment = gatewayPayments.find((p) => p.status === 'captured');

      if (capturedPayment) {
        // Compare amounts
        if (capturedPayment.amount === order.total_paise) {
          // Amount matches: Confirm order
          await prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: 'CONFIRMED',
                payment_status: 'SUCCESS',
              },
            });

            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'SUCCESS',
                gateway_payment_id: capturedPayment.id,
              },
            });

            await tx.auditLog.create({
              data: {
                entity: 'orders',
                entity_id: order.id,
                action: 'PAYMENT_CONFIRMED',
                actor_id: 'reconciliation_service',
                old_value: { status: order.status, payment_status: order.payment_status },
                new_value: {
                  status: 'CONFIRMED',
                  payment_status: 'SUCCESS',
                  gateway_payment_id: capturedPayment.id,
                  recovered_by: 'reconciliation',
                },
              },
            });
          });

          try {
            await dispatchOrderStatusNotifications(order.id, 'CONFIRMED');
          } catch (notifErr) {
            console.error('[Reconciliation] Failed to send confirmation notification:', notifErr);
          }

          summary.confirmed++;
          summary.orders.push({
            orderNo: order.order_no,
            action: 'CONFIRMED',
            reason: `Recovered captured payment ${capturedPayment.id}`,
          });
        } else {
          // Amount mismatch: Flag for review, DO NOT confirm
          await prisma.auditLog.create({
            data: {
              entity: 'orders',
              entity_id: order.id,
              action: 'PAYMENT_AMOUNT_MISMATCH',
              actor_id: 'reconciliation_service',
              old_value: { status: order.status, total_paise: order.total_paise },
              new_value: {
                expected_paise: order.total_paise,
                received_paise: capturedPayment.amount,
                gateway_payment_id: capturedPayment.id,
                flagged: true,
                note: 'Captured amount differs from order total. Requires manual review.',
              },
            },
          });

          summary.flagged++;
          summary.orders.push({
            orderNo: order.order_no,
            action: 'FLAGGED',
            reason: `Amount mismatch (expected: ${order.total_paise}, received: ${capturedPayment.amount})`,
          });
        }
      } else {
        // Check if all payments are failed
        const allFailed = gatewayPayments.every((p) => p.status === 'failed');
        if (allFailed) {
          const lastFailed = gatewayPayments[gatewayPayments.length - 1];
          await prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: 'PAYMENT_FAILED',
                payment_status: 'FAILED',
              },
            });

            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'FAILED',
                gateway_payment_id: lastFailed.id,
              },
            });

            await tx.auditLog.create({
              data: {
                entity: 'orders',
                entity_id: order.id,
                action: 'PAYMENT_FAILED',
                actor_id: 'reconciliation_service',
                old_value: { status: order.status, payment_status: order.payment_status },
                new_value: {
                  status: 'PAYMENT_FAILED',
                  payment_status: 'FAILED',
                  gateway_payment_id: lastFailed.id,
                },
              },
            });
          });

          summary.failed++;
          summary.orders.push({
            orderNo: order.order_no,
            action: 'FAILED',
            reason: 'Gateway confirmed payment failure',
          });
        } else {
          summary.orders.push({
            orderNo: order.order_no,
            action: 'STILL_PENDING',
            reason: 'Payment status pending at gateway',
          });
        }
      }
    } catch (err: any) {
      console.error(`[Reconciliation] Error checking order ${order.order_no}:`, err.message);
      summary.orders.push({
        orderNo: order.order_no,
        action: 'STILL_PENDING',
        reason: err.message,
      });
    }
  }

  return summary;
}
