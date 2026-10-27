import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { calculateDeliveryFee, getSetting } from '../lib/pricing.js';

export const cartRouter = Router();

export const CART_COOKIE_NAME = 'cart_token';

/**
 * Retrieve or initialize a Cart using httpOnly cookie.
 */
export async function getOrCreateCart(req: Request, res: Response) {
  let token = req.cookies?.[CART_COOKIE_NAME];

  if (typeof token === 'string' && token.length > 0) {
    const existing = await prisma.cart.findUnique({
      where: { token },
    });
    if (existing) {
      return existing;
    }
  }

  // Generate new token & cart
  token = crypto.randomUUID();
  const newCart = await prisma.cart.create({
    data: { token },
  });

  res.cookie(CART_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });

  return newCart;
}

/**
 * Format cart details and calculate line totals, delivery fee, and thresholds
 * using fresh product data from the database.
 */
export async function buildCartResponse(cartId: string) {
  const items = await prisma.cartItem.findMany({
    where: { cart_id: cartId },
    include: {
      product: {
        include: {
          shop: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  let subtotal_paise = 0;
  const formattedItems = items.map((item) => {
    const line_total_paise = item.qty * item.product.selling_price_paise;
    subtotal_paise += line_total_paise;
    return {
      id: item.id,
      product_id: item.product_id,
      qty: item.qty,
      name: item.product.name,
      brand: item.product.brand,
      unit_size: item.product.unit_size,
      mrp_paise: item.product.mrp_paise,
      selling_price_paise: item.product.selling_price_paise,
      line_total_paise,
      is_available: item.product.is_available && item.product.is_active,
      shop_id: item.product.shop_id,
      shop_name: item.product.shop.name,
    };
  });

  const delivery_fee_paise =
    subtotal_paise > 0 ? await calculateDeliveryFee(subtotal_paise) : 0;
  const freeThreshold = await getSetting('FREE_DELIVERY_THRESHOLD_PAISE');
  const total_paise = subtotal_paise + delivery_fee_paise;
  const gap_paise = Math.max(0, freeThreshold - subtotal_paise);

  let free_delivery_message = '';
  if (subtotal_paise === 0) {
    free_delivery_message = 'Your cart is empty';
  } else if (gap_paise > 0) {
    const gapRupees = gap_paise / 100;
    free_delivery_message = `Add ₹${gapRupees % 1 === 0 ? gapRupees : gapRupees.toFixed(2)} more for free delivery`;
  } else {
    free_delivery_message = 'Free delivery unlocked!';
  }

  const primaryShopId = items[0]?.product.shop_id || null;
  const primaryShopName = items[0]?.product.shop.name || null;

  return {
    id: cartId,
    shop_id: primaryShopId,
    shop_name: primaryShopName,
    items: formattedItems,
    item_count: items.reduce((acc, i) => acc + i.qty, 0),
    subtotal_paise,
    delivery_fee_paise,
    free_delivery_threshold_paise: freeThreshold,
    free_delivery_gap_paise: gap_paise,
    free_delivery_message,
    total_paise,
  };
}

/**
 * GET /api/cart
 * Returns full cart breakdown.
 */
cartRouter.get('/cart', async (req: Request, res: Response) => {
  try {
    const cart = await getOrCreateCart(req, res);
    const cartData = await buildCartResponse(cart.id);
    res.status(200).json(cartData);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

const AddItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  qty: z.number().int().min(1).max(10).default(1),
});

/**
 * POST /api/cart/items
 * Adds an item to the cart.
 * Rules:
 * - Single-shop constraint: if adding from a second shop, return 409 conflict
 * - Only active & available products can be added
 * - Browser price fields are completely ignored
 */
cartRouter.post('/cart/items', async (req: Request, res: Response) => {
  try {
    const parseResult = AddItemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { productId, qty } = parseResult.data;

    // Check product in DB
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: true },
    });

    if (!product || !product.is_active || !product.is_available) {
      return res.status(400).json({
        error: 'Product is currently unavailable or out of stock.',
      });
    }

    const cart = await getOrCreateCart(req, res);

    // Single shop rule: check existing items in this cart
    const existingItemFromOtherShop = await prisma.cartItem.findFirst({
      where: {
        cart_id: cart.id,
        product: {
          shop_id: { not: product.shop_id },
        },
      },
      include: {
        product: {
          include: { shop: true },
        },
      },
    });

    if (existingItemFromOtherShop) {
      return res.status(409).json({
        error: 'Your cart has items from another shop. Empty the cart?',
        conflictShopId: product.shop_id,
        newShopName: product.shop.name,
        existingShopId: existingItemFromOtherShop.product.shop_id,
        existingShopName: existingItemFromOtherShop.product.shop.name,
      });
    }

    // Upsert cart item
    const existingCartItem = await prisma.cartItem.findUnique({
      where: {
        cart_id_product_id: {
          cart_id: cart.id,
          product_id: product.id,
        },
      },
    });

    if (existingCartItem) {
      const newQty = Math.min(10, existingCartItem.qty + qty);
      await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: { qty: newQty },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cart_id: cart.id,
          product_id: product.id,
          qty: Math.min(10, qty),
        },
      });
    }

    const updatedCart = await buildCartResponse(cart.id);
    res.status(200).json(updatedCart);
  } catch (error) {
    console.error('Error adding item to cart:', error);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

const UpdateItemSchema = z.object({
  qty: z.number().int(),
});

/**
 * PATCH /api/cart/items/:productId
 * Updates quantity. If qty <= 0, deletes item. Max qty is 10.
 */
cartRouter.patch('/cart/items/:productId', async (req: Request, res: Response) => {
  try {
    const parseResult = UpdateItemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { qty } = parseResult.data;
    const productId = req.params.productId;
    const cart = await getOrCreateCart(req, res);

    if (qty <= 0) {
      await prisma.cartItem.deleteMany({
        where: {
          cart_id: cart.id,
          product_id: productId,
        },
      });
    } else {
      const finalQty = Math.min(10, qty);
      await prisma.cartItem.upsert({
        where: {
          cart_id_product_id: {
            cart_id: cart.id,
            product_id: productId,
          },
        },
        update: { qty: finalQty },
        create: {
          cart_id: cart.id,
          product_id: productId,
          qty: finalQty,
        },
      });
    }

    const updatedCart = await buildCartResponse(cart.id);
    res.status(200).json(updatedCart);
  } catch (error) {
    console.error('Error updating cart item:', error);
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

/**
 * DELETE /api/cart/items/:productId
 * Removes single product from cart.
 */
cartRouter.delete('/cart/items/:productId', async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const cart = await getOrCreateCart(req, res);

    await prisma.cartItem.deleteMany({
      where: {
        cart_id: cart.id,
        product_id: productId,
      },
    });

    const updatedCart = await buildCartResponse(cart.id);
    res.status(200).json(updatedCart);
  } catch (error) {
    console.error('Error deleting cart item:', error);
    res.status(500).json({ error: 'Failed to delete cart item' });
  }
});

/**
 * DELETE /api/cart
 * Empties all items in the cart.
 */
cartRouter.delete('/cart', async (req: Request, res: Response) => {
  try {
    const cart = await getOrCreateCart(req, res);

    await prisma.cartItem.deleteMany({
      where: { cart_id: cart.id },
    });

    const updatedCart = await buildCartResponse(cart.id);
    res.status(200).json(updatedCart);
  } catch (error) {
    console.error('Error emptying cart:', error);
    res.status(500).json({ error: 'Failed to empty cart' });
  }
});
