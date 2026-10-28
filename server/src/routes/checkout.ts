import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { CART_COOKIE_NAME } from './cart.js';
import { calculateDeliveryFee, isCodAllowed } from '../lib/pricing.js';
import { getNextOrderNumber } from '../lib/order.js';
import { getAuthenticatedUser } from './auth.js';
import { dispatchOrderStatusNotifications, normalizePhone, maskPhone } from '../lib/notifications.js';
import { createRazorpayGatewayOrder, getRazorpayKeyId } from '../lib/razorpay.js';

type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        product: {
          include: { shop: true };
        };
      };
    };
  };
}>;

export const checkoutRouter = Router();

const CheckoutSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
  address: z.string().trim().min(5, 'Address line must be at least 5 characters').optional(),
  landmark: z.string().trim().optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits').optional(),
  addressId: z.string().uuid().optional(),
  paymentMethod: z.enum(['COD', 'UPI']).default('COD'),
  idempotencyKey: z.string().min(5, 'idempotencyKey is required'),
});

/**
 * POST /api/checkout
 * Guest checkout or Authenticated checkout with Cash on Delivery (F06 & F11)
 *
 * Rules:
 * - One database transaction
 * - Idempotency: repeated request with same key returns same order
 * - Validates serviceable pincode
 * - Reads prices authority-side from DB; browser prices ignored
 * - Enforces COD limit
 * - If failure occurs, nothing is saved and cart is preserved
 */
checkoutRouter.post('/checkout', async (req: Request, res: Response) => {
  try {
    // 1. Validate request body
    const parseResult = CheckoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { name, phone, address, landmark, pincode, addressId, paymentMethod, idempotencyKey } = parseResult.data;

    // Check for existing order with same idempotency key
    const existingOrder = await prisma.order.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: { items: true, payments: true },
    });

    if (existingOrder) {
      const upiPayment = existingOrder.payments.find((p) => p.gateway === 'razorpay');
      return res.status(200).json({
        success: true,
        orderNumber: existingOrder.order_no,
        orderId: existingOrder.id,
        totalPaise: existingOrder.total_paise,
        subtotalPaise: existingOrder.subtotal_paise,
        deliveryFeePaise: existingOrder.delivery_fee_paise,
        status: existingOrder.status,
        paymentMethod: existingOrder.payment_method,
        paymentStatus: existingOrder.payment_status,
        isIdempotentReplay: true,
        ...(existingOrder.payment_method === 'UPI' && upiPayment
          ? {
              razorpay: {
                keyId: getRazorpayKeyId(),
                orderId: upiPayment.gateway_order_id,
                amountPaise: existingOrder.total_paise,
                currency: 'INR',
                method: 'upi',
              },
            }
          : {}),
      });
    }

    // 2. Resolve delivery address (saved addressId, default saved address, or direct entry)
    const authUser = await getAuthenticatedUser(req);
    let finalAddress = address;
    let finalLandmark = landmark;
    let finalPincode = pincode;

    if (addressId) {
      if (!authUser) {
        return res.status(401).json({ error: 'You must be logged in to use a saved address' });
      }
      const savedAddress = await prisma.address.findUnique({
        where: { id: addressId },
      });
      if (!savedAddress || savedAddress.user_id !== authUser.id) {
        return res.status(404).json({ error: 'Selected address not found or unauthorized' });
      }
      finalAddress = savedAddress.line1;
      finalLandmark = savedAddress.landmark || undefined;
      finalPincode = savedAddress.pincode;
    } else if (!finalAddress || !finalPincode) {
      if (authUser) {
        const defaultAddr = await prisma.address.findFirst({
          where: { user_id: authUser.id, is_default: true },
        });
        if (defaultAddr) {
          finalAddress = defaultAddr.line1;
          finalLandmark = defaultAddr.landmark || undefined;
          finalPincode = defaultAddr.pincode;
        }
      }
    }

    if (!finalAddress || finalAddress.length < 5) {
      return res.status(400).json({ error: 'Address line must be at least 5 characters' });
    }
    if (!finalPincode || !/^\d{6}$/.test(finalPincode)) {
      return res.status(400).json({ error: 'Pincode must be exactly 6 digits' });
    }

    // 3. Check pincode against serviceable_pincodes (must be active)
    const serviceablePincode = await prisma.serviceablePincode.findUnique({
      where: { pincode: finalPincode },
    });

    if (!serviceablePincode || !serviceablePincode.is_active) {
      return res.status(400).json({
        error: `Sorry, we do not deliver to pincode ${finalPincode} yet. PlukIt is currently serving pincode 411001.`,
      });
    }

    // 4. Read cart (by authenticated user or cookie token)
    let cart: CartWithItems | null = null;

    if (authUser) {
      cart = await prisma.cart.findUnique({
        where: { user_id: authUser.id },
        include: {
          items: {
            include: {
              product: {
                include: { shop: true },
              },
            },
          },
        },
      });
    }

    if (!cart) {
      const token = req.cookies?.[CART_COOKIE_NAME];
      if (token) {
        cart = await prisma.cart.findUnique({
          where: { token },
          include: {
            items: {
              include: {
                product: {
                  include: { shop: true },
                },
              },
            },
          },
        });
      }
    }

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        error: 'Your cart is empty. Please add items before checking out.',
      });
    }

    // Check for any unavailable or inactive products
    const unavailableItems = cart.items.filter(
      (item) => !item.product.is_active || !item.product.is_available
    );

    if (unavailableItems.length > 0) {
      return res.status(400).json({
        error: 'Some items in your cart became unavailable or out of stock.',
        unavailableProducts: unavailableItems.map((i) => i.product.name),
      });
    }

    // Recalculate prices and line totals authority-side from DB
    let subtotal_paise = 0;
    const orderItemsData = cart.items.map((item) => {
      const line_total_paise = item.qty * item.product.selling_price_paise;
      subtotal_paise += line_total_paise;
      return {
        product_id: item.product_id,
        shop_id: item.product.shop_id,
        qty: item.qty,
        mrp_paise: item.product.mrp_paise,
        shop_price_paise: item.product.shop_price_paise,
        selling_price_paise: item.product.selling_price_paise,
        line_total_paise,
      };
    });

    const delivery_fee_paise = await calculateDeliveryFee(subtotal_paise);
    const total_paise = subtotal_paise + delivery_fee_paise;

    // 4. Check total against COD limit ONLY if payment method is COD
    if (paymentMethod === 'COD') {
      const codAllowed = await isCodAllowed(total_paise);
      if (!codAllowed) {
        return res.status(400).json({
          error: 'Order total exceeds Cash on Delivery limit (₹1,000). Please adjust items or pay online with UPI.',
        });
      }
    }

    // 5. Generate order number
    const orderNo = await getNextOrderNumber();

    // For UPI: create gateway order before saving to DB
    let gatewayOrder: any = null;
    if (paymentMethod === 'UPI') {
      gatewayOrder = await createRazorpayGatewayOrder({
        amountPaise: total_paise,
        orderNo,
        notes: {
          guest_phone: phone,
          guest_name: name,
        },
      });
    }

    const orderStatus = paymentMethod === 'UPI' ? 'PAYMENT_PENDING' : 'CONFIRMED';
    const paymentStatus = paymentMethod === 'UPI' ? 'PENDING' : 'PENDING_COLLECTION';

    // 6. Transaction: create Order + OrderItems + Delivery/Payment, and empty Cart
    const createdOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          order_no: orderNo,
          user_id: authUser?.id || null,
          guest_name: name,
          guest_phone: phone,
          address: {
            line1: finalAddress,
            landmark: finalLandmark || null,
            pincode: finalPincode,
          },
          status: orderStatus,
          subtotal_paise,
          delivery_fee_paise,
          total_paise,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          idempotency_key: idempotencyKey,
          items: {
            create: orderItemsData,
          },
          delivery: {
            create: {
              status: 'PENDING',
              cod_collected_paise: 0,
            },
          },
        },
      });

      // If UPI, create initial Payment record
      if (paymentMethod === 'UPI' && gatewayOrder) {
        await tx.payment.create({
          data: {
            order_id: order.id,
            gateway: 'razorpay',
            gateway_order_id: gatewayOrder.id,
            amount_paise: total_paise,
            status: 'PENDING',
          },
        });
      }

      // Empty cart
      await tx.cartItem.deleteMany({
        where: { cart_id: cart.id },
      });

      return order;
    });

    // F14: Dispatch automated confirmation notification ONLY when confirmed (COD)
    // F16: UPI orders remain PAYMENT_PENDING until signed webhook confirms in F17
    if (createdOrder.status === 'CONFIRMED') {
      try {
        await dispatchOrderStatusNotifications(createdOrder.id, 'CONFIRMED');
      } catch (notifErr) {
        console.error('[Notification] Failed to trigger CONFIRMED notification:', notifErr);
      }
    }

    // 7. Return the order details
    res.status(201).json({
      success: true,
      orderNumber: createdOrder.order_no,
      orderId: createdOrder.id,
      totalPaise: createdOrder.total_paise,
      subtotalPaise: createdOrder.subtotal_paise,
      deliveryFeePaise: createdOrder.delivery_fee_paise,
      status: createdOrder.status,
      paymentMethod: createdOrder.payment_method,
      paymentStatus: createdOrder.payment_status,
      ...(paymentMethod === 'UPI' && gatewayOrder
        ? {
            razorpay: {
              keyId: getRazorpayKeyId(),
              orderId: gatewayOrder.id,
              amountPaise: total_paise,
              currency: 'INR',
              method: 'upi',
              isSimulated: gatewayOrder.isSimulated || false,
            },
          }
        : {}),
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

/**
 * Helper to construct an interactive status timeline for order tracking (F14)
 */
async function buildOrderTimeline(order: any) {
  // Fetch audit logs for this order
  const logs = await prisma.auditLog.findMany({
    where: {
      entity: { in: ['orders', 'deliveries'] },
      entity_id: order.id,
    },
    orderBy: { created_at: 'asc' },
  });

  const stageOrder = ['CONFIRMED', 'SENT_TO_SHOP', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const labels: Record<string, string> = {
    CONFIRMED: 'Order Confirmed',
    SENT_TO_SHOP: 'Sent to Shop',
    PACKED: 'Packed & Ready',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    FAILED_DELIVERY: 'Delivery Attempt Failed',
    CANCELLED: 'Order Cancelled',
  };

  const descriptions: Record<string, string> = {
    CONFIRMED: 'Your fresh order has been received and confirmed.',
    SENT_TO_SHOP: 'Order details sent to local partner shop for preparation.',
    PACKED: 'Items have been freshly packed and are ready for pickup.',
    OUT_FOR_DELIVERY: 'Our delivery partner is on the way to your address.',
    DELIVERED: 'Package successfully delivered and handed over.',
    FAILED_DELIVERY: 'Delivery was attempted but could not be completed.',
    CANCELLED: 'This order has been cancelled.',
  };

  const currentStatus = order.status;
  const isCancelled = currentStatus === 'CANCELLED';
  const isFailed = currentStatus === 'FAILED_DELIVERY';
  const isPaymentPending = currentStatus === 'PAYMENT_PENDING';
  const isPaymentFailed = currentStatus === 'PAYMENT_FAILED';

  if (isPaymentFailed) {
    return [
      {
        status: 'PAYMENT_FAILED',
        label: 'Payment Failed',
        description: 'UPI payment could not be processed. Please retry payment to place your order.',
        timestamp: order.updated_at ? order.updated_at.toISOString() : new Date().toISOString(),
        completed: true,
        current: true,
      },
    ];
  }

  if (isPaymentPending) {
    return [
      {
        status: 'PAYMENT_PENDING',
        label: 'Payment Pending',
        description: 'Awaiting UPI payment verification. Your order will be confirmed once payment is confirmed.',
        timestamp: order.created_at ? order.created_at.toISOString() : new Date().toISOString(),
        completed: true,
        current: true,
      },
      ...stageOrder.map((stage) => ({
        status: stage,
        label: labels[stage] || stage,
        description: descriptions[stage] || '',
        timestamp: null,
        completed: false,
        current: false,
      })),
    ];
  }

  const timestamps: Record<string, Date> = {
    CONFIRMED: order.created_at,
  };

  for (const log of logs) {
    const newVal = log.new_value as any;
    if (newVal?.status && typeof newVal.status === 'string') {
      timestamps[newVal.status] = log.created_at;
    }
  }

  if (order.delivery?.delivered_at) {
    timestamps['DELIVERED'] = order.delivery.delivered_at;
  }

  const currentIndex = stageOrder.indexOf(currentStatus);

  const timeline = stageOrder.map((stage, idx) => {
    const isCompleted = currentIndex >= 0 ? idx <= currentIndex : false;
    const isCurrent = currentStatus === stage;
    return {
      status: stage,
      label: labels[stage] || stage,
      description: descriptions[stage] || '',
      timestamp: timestamps[stage] ? timestamps[stage].toISOString() : null,
      completed: isCancelled ? false : isCompleted,
      current: isCurrent,
    };
  });

  if (isFailed) {
    timeline.push({
      status: 'FAILED_DELIVERY',
      label: labels.FAILED_DELIVERY,
      description: order.delivery?.failure_reason || descriptions.FAILED_DELIVERY,
      timestamp: timestamps.FAILED_DELIVERY ? timestamps.FAILED_DELIVERY.toISOString() : new Date().toISOString(),
      completed: true,
      current: true,
    });
  }

  if (isCancelled) {
    timeline.push({
      status: 'CANCELLED',
      label: labels.CANCELLED,
      description: descriptions.CANCELLED,
      timestamp: timestamps.CANCELLED ? timestamps.CANCELLED.toISOString() : new Date().toISOString(),
      completed: true,
      current: true,
    });
  }

  return timeline;
}

/**
 * GET /api/orders/:orderNo
 * Order confirmation and tracking summary with phone verification and status timeline.
 * Rules:
 * - Guests enter order number and phone to view it.
 * - Guest cannot see another guest's order with a wrong phone number.
 * - Logged-in customers see it in their history.
 */
checkoutRouter.get('/orders/:orderNo', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const queryPhone = req.query.phone as string | undefined;

    const order = await prisma.order.findUnique({
      where: { order_no: orderNo },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                unit_size: true,
              },
            },
            shop: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        delivery: true,
        payments: true,
        invoice: {
          include: {
            credit_notes: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderPhone = normalizePhone(order.guest_phone || order.user?.phone || '');
    const authUser = await getAuthenticatedUser(req);

    // 1. If user is logged in as a customer: strictly verify they own the order
    let isVerified = false;
    if (authUser) {
      const isOwner = (order.user_id && order.user_id === authUser.id) || (orderPhone && normalizePhone(authUser.phone) === orderPhone);
      if (!isOwner) {
        return res.status(403).json({ error: 'You do not have permission to view this order.' });
      }
      isVerified = true;
    } else if (queryPhone) {
      // 2. If guest verifies with phone query parameter
      const cleanQuery = normalizePhone(queryPhone);
      if (cleanQuery !== orderPhone) {
        return res.status(403).json({ error: 'Phone number does not match this order.' });
      }
      isVerified = true;
    }

    const sanitizedOrder = {
      ...order,
      guest_phone: order.guest_phone,
    };

    const timeline = await buildOrderTimeline(order);

    res.status(200).json({
      order: sanitizedOrder,
      timeline,
      isVerified,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

