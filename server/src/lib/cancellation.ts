import { OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from './db.js';
import { createRazorpayRefund, GatewayRefundResult } from './razorpay.js';
import { generateCreditNote } from './invoice.js';
import { dispatchOrderStatusNotifications } from './notifications.js';

export type ReturnReasonCode =
  | 'damaged'
  | 'expired'
  | 'wrong_item'
  | 'customer_changed_mind'
  | 'other';

export const VALID_RETURN_REASONS: ReturnReasonCode[] = [
  'damaged',
  'expired',
  'wrong_item',
  'customer_changed_mind',
  'other',
];

export interface CancelOrderOptions {
  orderId: string;
  actorId: string;
  actorRole: 'CUSTOMER' | 'ADMIN';
  reason?: string;
}

export interface ReturnItemRequest {
  orderItemId: string;
  qty: number;
  reasonCode: ReturnReasonCode;
}

export interface ProcessReturnOptions {
  orderId: string;
  actorId: string;
  items: ReturnItemRequest[];
  notes?: string;
}

/**
 * Cancels an order with automated gateway refund for online payments and GST credit note (F18).
 *
 * Rules:
 * - Customer can cancel from the order page before the order is PACKED.
 * - Admin can cancel at any stage before DELIVERED, with a required reason.
 * - Refund through gateway refund API for online payments; COD cancellations need no refund.
 * - Total refunded never exceeds the amount paid.
 * - Credit note generated if an invoice was already issued.
 */
export async function cancelOrderWithRefund(options: CancelOrderOptions) {
  const { orderId, actorId, actorRole, reason: providedReason } = options;

  // 1. Fetch order with items, payments, refunds, delivery, and invoice
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: orderId }, { order_no: orderId }],
    },
    include: {
      items: {
        include: {
          product: true,
          shop: true,
        },
      },
      payments: true,
      refunds: true,
      delivery: true,
      invoice: {
        include: { credit_notes: true },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  // 2. Validate cancellation permissions based on actor role
  if (actorRole === 'CUSTOMER') {
    // Customer can ONLY cancel before PACKED
    const customerDisallowedStatuses: OrderStatus[] = [
      'PACKED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED_DELIVERY',
      'CANCELLED',
      'RETURNED',
      'CLOSED',
    ];

    if (customerDisallowedStatuses.includes(order.status)) {
      throw new Error('Order has already been packed and cannot be cancelled by the customer. Please contact support.');
    }
  } else if (actorRole === 'ADMIN') {
    // Admin can cancel at ANY stage before DELIVERED with a required reason
    if (order.status === 'DELIVERED') {
      throw new Error('Delivered orders cannot be cancelled. Use the returns workflow instead.');
    }

    if (order.status === 'CANCELLED' || order.status === 'RETURNED' || order.status === 'CLOSED') {
      throw new Error(`Order is already in terminal state: ${order.status}`);
    }

    if (!providedReason || providedReason.trim().length === 0) {
      throw new Error('A cancellation reason is required when an admin cancels an order.');
    }
  }

  const effectiveReason = providedReason?.trim() || 'Customer cancelled order before packing';

  // 3. Calculate refund for online payments
  let refundResult: GatewayRefundResult | null = null;
  let refundRecord: any = null;
  const isOnlinePayment = order.payment_method === 'UPI' || order.payment_method === 'CARD' || order.payment_method === 'NETBANKING' || order.payment_method === 'WALLET';
  const isPaid = order.payment_status === 'SUCCESS';

  let totalRefundablePaise = 0;
  if (isOnlinePayment && isPaid) {
    const alreadyRefundedPaise = order.refunds.reduce((sum, r) => sum + r.amount_paise, 0);
    totalRefundablePaise = Math.max(0, order.total_paise - alreadyRefundedPaise);

    if (totalRefundablePaise > 0) {
      // Find the captured payment record
      const successfulPayment =
        order.payments.find((p) => p.status === 'SUCCESS' && p.gateway_payment_id) ||
        order.payments[0];

      const gatewayPaymentId = successfulPayment?.gateway_payment_id || `pay_simulated_${Date.now()}`;

      // Call Razorpay refund API
      refundResult = await createRazorpayRefund({
        paymentId: gatewayPaymentId,
        amountPaise: totalRefundablePaise,
        notes: {
          order_no: order.order_no,
          reason: effectiveReason,
          actor_role: actorRole,
        },
      });
    }
  }

  // 4. Update order, delivery, and refunds in database transaction
  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Record refund if applicable
    if (refundResult && totalRefundablePaise > 0) {
      refundRecord = await tx.refund.create({
        data: {
          order_id: order.id,
          amount_paise: totalRefundablePaise,
          reason: effectiveReason,
          status: refundResult.status,
          gateway_refund_id: refundResult.id,
        },
      });
    }

    // Update delivery record if exists
    if (order.delivery) {
      await tx.delivery.update({
        where: { id: order.delivery.id },
        data: {
          status: 'CANCELLED',
          failure_reason: effectiveReason,
        },
      });
    }

    // Determine target payment status
    let newPaymentStatus: PaymentStatus = order.payment_status;
    if (totalRefundablePaise > 0) {
      newPaymentStatus = 'REFUNDED';
    }

    // Update order status
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        payment_status: newPaymentStatus,
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
        payments: true,
        refunds: true,
        invoice: {
          include: { credit_notes: true },
        },
      },
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        actor_id: actorId,
        action: actorRole === 'ADMIN' ? 'ADMIN_ORDER_CANCELLED' : 'CUSTOMER_ORDER_CANCELLED',
        entity: 'orders',
        entity_id: order.id,
        old_value: {
          status: order.status,
          payment_status: order.payment_status,
        },
        new_value: {
          status: 'CANCELLED',
          payment_status: newPaymentStatus,
          reason: effectiveReason,
          refund_paise: totalRefundablePaise,
          gateway_refund_id: refundResult?.id || null,
        },
      },
    });

    return updated;
  });

  // 5. Generate Credit Note if invoice exists (F15 / F18)
  let creditNote: any = null;
  if (order.invoice) {
    try {
      creditNote = await generateCreditNote(order.id, effectiveReason);
    } catch (cnErr) {
      console.error('[Cancellation] Error creating credit note:', cnErr);
    }
  }

  // 6. Dispatch automated notification to customer
  try {
    await dispatchOrderStatusNotifications(order.id, 'CANCELLED');
  } catch (notifErr) {
    console.error('[Cancellation] Error dispatching notification:', notifErr);
  }

  return {
    order: updatedOrder,
    refund: refundRecord,
    creditNote,
    refundAmountPaise: totalRefundablePaise,
  };
}

/**
 * Processes item return, calculates partial refund, logs shop ledger deduction for damaged/expired items,
 * and creates GST Credit Note (F18).
 *
 * Rules:
 * - Order must be in DELIVERED or RETURNED state.
 * - Total refunded never exceeds the amount paid.
 * - Returns for damaged or expired goods create a shop ledger deduction.
 * - Credit note is created for the returned amount if invoice exists.
 */
export async function processOrderReturn(options: ProcessReturnOptions) {
  const { orderId, actorId, items, notes } = options;

  if (!items || items.length === 0) {
    throw new Error('At least one item must be selected for return');
  }

  // 1. Fetch order with items, payments, refunds, and invoice
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: orderId }, { order_no: orderId }],
    },
    include: {
      items: {
        include: {
          product: true,
          shop: true,
          returns: true,
        },
      },
      payments: true,
      refunds: true,
      invoice: {
        include: { credit_notes: true },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.status !== 'DELIVERED' && order.status !== 'RETURNED') {
    throw new Error(`Only delivered orders can have items returned. Current status: ${order.status}`);
  }

  // 2. Validate return items and calculate totals
  let totalReturnPaise = 0;
  let totalTaxableReturnPaise = 0;
  let totalGstReturnPaise = 0;
  const processedReturnItems: Array<{
    orderItem: typeof order.items[0];
    qty: number;
    reasonCode: ReturnReasonCode;
    shopCostPaise: number;
    sellingPaise: number;
  }> = [];

  for (const reqItem of items) {
    if (!VALID_RETURN_REASONS.includes(reqItem.reasonCode)) {
      throw new Error(`Invalid return reason code: ${reqItem.reasonCode}. Allowed: ${VALID_RETURN_REASONS.join(', ')}`);
    }

    const orderItem = order.items.find((i) => i.id === reqItem.orderItemId);
    if (!orderItem) {
      throw new Error(`Order item ${reqItem.orderItemId} does not belong to this order.`);
    }

    const alreadyReturnedQty = orderItem.returns.reduce((sum, r) => sum + r.qty, 0);
    const availableQty = orderItem.qty - alreadyReturnedQty;

    if (reqItem.qty <= 0 || reqItem.qty > availableQty) {
      throw new Error(
        `Cannot return ${reqItem.qty} of "${orderItem.product.name}". Available for return: ${availableQty}.`
      );
    }

    const itemSellingTotal = reqItem.qty * orderItem.selling_price_paise;
    const itemShopCost = reqItem.qty * orderItem.shop_price_paise;

    // GST breakdown based on product gst_rate
    const gstRate = orderItem.product.gst_rate || 0.0;
    const itemTaxable = Math.round(itemSellingTotal / (1 + gstRate));
    const itemGst = itemSellingTotal - itemTaxable;

    totalReturnPaise += itemSellingTotal;
    totalTaxableReturnPaise += itemTaxable;
    totalGstReturnPaise += itemGst;

    processedReturnItems.push({
      orderItem,
      qty: reqItem.qty,
      reasonCode: reqItem.reasonCode,
      shopCostPaise: itemShopCost,
      sellingPaise: itemSellingTotal,
    });
  }

  // 3. Rule: Total refunded never exceeds the amount paid
  const isOnlinePayment = order.payment_method === 'UPI' || order.payment_method === 'CARD' || order.payment_method === 'NETBANKING' || order.payment_method === 'WALLET';
  const totalPaidPaise = order.payment_status === 'SUCCESS' || order.payment_status === 'REFUNDED' ? order.total_paise : 0;
  const alreadyRefundedPaise = order.refunds.reduce((sum, r) => sum + r.amount_paise, 0);
  const maxRefundablePaise = Math.max(0, totalPaidPaise - alreadyRefundedPaise);

  const actualRefundPaise = isOnlinePayment ? Math.min(totalReturnPaise, maxRefundablePaise) : 0;

  // 4. Trigger gateway refund if online payment and refund amount > 0
  let refundResult: GatewayRefundResult | null = null;
  let refundRecord: any = null;

  if (isOnlinePayment && actualRefundPaise > 0) {
    const successfulPayment =
      order.payments.find((p) => p.status === 'SUCCESS' && p.gateway_payment_id) ||
      order.payments[0];

    const gatewayPaymentId = successfulPayment?.gateway_payment_id || `pay_simulated_${Date.now()}`;

    refundResult = await createRazorpayRefund({
      paymentId: gatewayPaymentId,
      amountPaise: actualRefundPaise,
      notes: {
        order_no: order.order_no,
        type: 'partial_return',
        items_count: String(items.length),
      },
    });
  }

  // 5. Database transaction: Returns, ShopLedger deductions, Refund, Order updates, AuditLog
  const transactionResult = await prisma.$transaction(async (tx) => {
    // 5a. Create Return records & ShopLedger deductions
    const createdReturns = [];
    for (const pItem of processedReturnItems) {
      const returnRec = await tx.return.create({
        data: {
          order_item_id: pItem.orderItem.id,
          qty: pItem.qty,
          reason_code: pItem.reasonCode,
          shop_cost_paise: pItem.shopCostPaise,
          status: 'PROCESSED',
        },
      });
      createdReturns.push(returnRec);

      // Rule: Returns for damaged or expired goods create a shop ledger deduction (F18 & F23)
      if (pItem.reasonCode === 'damaged' || pItem.reasonCode === 'expired') {
        await tx.shopLedger.create({
          data: {
            shop_id: pItem.orderItem.shop_id,
            order_item_id: pItem.orderItem.id,
            amount_paise: pItem.shopCostPaise,
            entry_type: 'RETURN_DEDUCTION',
          },
        });
      }
    }

    // 5b. Create Refund record if online refunded
    if (refundResult && actualRefundPaise > 0) {
      refundRecord = await tx.refund.create({
        data: {
          order_id: order.id,
          amount_paise: actualRefundPaise,
          reason: `Return refund for: ${processedReturnItems.map((i) => `${i.qty}x ${i.orderItem.product.name} (${i.reasonCode})`).join(', ')}`,
          status: refundResult.status,
          gateway_refund_id: refundResult.id,
        },
      });
    }

    // 5c. Check if all items in order are now returned
    const allOrderItems = await tx.orderItem.findMany({
      where: { order_id: order.id },
      include: { returns: true },
    });

    const isFullyReturned = allOrderItems.every((item) => {
      const returnedCount = item.returns.reduce((sum, r) => sum + r.qty, 0);
      return returnedCount >= item.qty;
    });

    const newOrderStatus = isFullyReturned ? 'RETURNED' : order.status;
    const newPaymentStatus =
      alreadyRefundedPaise + actualRefundPaise >= order.total_paise
        ? 'REFUNDED'
        : order.payment_status;

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: newOrderStatus,
        payment_status: newPaymentStatus,
      },
      include: {
        items: {
          include: {
            product: true,
            shop: true,
            returns: true,
          },
        },
        payments: true,
        refunds: true,
        delivery: true,
        invoice: {
          include: { credit_notes: true },
        },
      },
    });

    // 5d. Audit Log
    await tx.auditLog.create({
      data: {
        actor_id: actorId,
        action: 'ORDER_RETURN_PROCESSED',
        entity: 'orders',
        entity_id: order.id,
        new_value: {
          returned_items: processedReturnItems.map((i) => ({
            name: i.orderItem.product.name,
            qty: i.qty,
            reason: i.reasonCode,
            refund_paise: i.sellingPaise,
            shop_deduction_paise: (i.reasonCode === 'damaged' || i.reasonCode === 'expired') ? i.shopCostPaise : 0,
          })),
          total_returned_paise: totalReturnPaise,
          actual_refund_paise: actualRefundPaise,
          gateway_refund_id: refundResult?.id || null,
          is_fully_returned: isFullyReturned,
          notes: notes || null,
        },
      },
    });

    return { updatedOrder, createdReturns };
  });

  // 6. Generate Credit Note for returned items if invoice exists (F15 / F18)
  let creditNote: any = null;
  if (order.invoice && actualRefundPaise > 0) {
    try {
      creditNote = await generateCreditNote(
        order.id,
        `Item return: ${processedReturnItems.map((i) => `${i.qty}x ${i.orderItem.product.name} (${i.reasonCode})`).join(', ')}`,
        {
          taxableAmountPaise: totalTaxableReturnPaise,
          gstAmountPaise: totalGstReturnPaise,
          totalPaise: actualRefundPaise,
        }
      );
    } catch (cnErr) {
      console.error('[Return] Error creating credit note for return:', cnErr);
    }
  }

  return {
    order: transactionResult.updatedOrder,
    returns: transactionResult.createdReturns,
    refund: refundRecord,
    creditNote,
    refundAmountPaise: actualRefundPaise,
    totalReturnPaise,
  };
}
