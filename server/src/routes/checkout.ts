import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { CART_COOKIE_NAME } from './cart.js';
import { calculateDeliveryFee, isCodAllowed } from '../lib/pricing.js';
import { getNextOrderNumber } from '../lib/order.js';
import { getAuthenticatedUser } from './auth.js';

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

    const { name, phone, address, landmark, pincode, addressId, idempotencyKey } = parseResult.data;

    // Check for existing order with same idempotency key
    const existingOrder = await prisma.order.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: { items: true },
    });

    if (existingOrder) {
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

    // 4. Check total against COD limit
    const codAllowed = await isCodAllowed(total_paise);
    if (!codAllowed) {
      return res.status(400).json({
        error: 'Order total exceeds Cash on Delivery limit (₹1,000). Please adjust items.',
      });
    }

    // 5 & 6. Transaction: Generate order number, create Order + OrderItems + Delivery, and empty Cart
    const orderNo = await getNextOrderNumber();

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
          status: 'CONFIRMED',
          subtotal_paise,
          delivery_fee_paise,
          total_paise,
          payment_method: 'COD',
          payment_status: 'PENDING_COLLECTION',
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

      // Empty cart
      await tx.cartItem.deleteMany({
        where: { cart_id: cart.id },
      });

      return order;
    });

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
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

/**
 * GET /api/orders/:orderNo
 * Order confirmation and tracking summary.
 */
checkoutRouter.get('/orders/:orderNo', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;

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
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.status(200).json({ order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});
