import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { sendOtpSms } from '../lib/sms.js';

export const authRouter = Router();

export const AUTH_COOKIE_NAME = 'auth_token';

const OTP_SECRET = process.env.OTP_SECRET || 'plukit-otp-secret-key-2026';

function hashOtp(phone: string, otp: string): string {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(`${phone}:${otp}`)
    .digest('hex');
}

/**
 * Retrieve authenticated user from session cookie if valid.
 */
export async function getAuthenticatedUser(req: Request) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token || typeof token !== 'string') {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          role: true,
          created_at: true,
        },
      },
    },
  });

  if (!session || session.expires_at < new Date()) {
    return null;
  }

  return session.user;
}

/**
 * Express middleware requiring authenticated user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  (req as any).user = user;
  next();
}

const SendOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
});

/**
 * POST /api/auth/otp/send
 * Sends a 6-digit OTP to the phone number.
 */
authRouter.post('/auth/otp/send', async (req: Request, res: Response) => {
  try {
    const parseResult = SendOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { phone } = parseResult.data;

    // Check rate limit: 60s cooldown between requests
    const existingOtp = await prisma.otpVerification.findUnique({
      where: { phone },
    });

    if (existingOtp) {
      const timeSinceLastUpdate = Date.now() - existingOtp.updated_at.getTime();
      if (timeSinceLastUpdate < 30 * 1000) {
        // Less than 30 seconds
        return res.status(429).json({
          error: 'Please wait a few seconds before requesting another OTP.',
        });
      }
    }

    // Generate 6-digit numeric OTP
    let otp: string;
    if (process.env.NODE_ENV === 'test' && req.body.mockOtp) {
      otp = String(req.body.mockOtp);
    } else {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const otp_hash = hashOtp(phone, otp);
    const expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.otpVerification.upsert({
      where: { phone },
      update: {
        otp_hash,
        attempts: 0,
        expires_at,
      },
      create: {
        phone,
        otp_hash,
        attempts: 0,
        expires_at,
      },
    });

    // Dispatch OTP via isolated SMS service
    const smsResult = await sendOtpSms(phone, otp);
    if (!smsResult.success) {
      return res.status(500).json({ error: smsResult.error || 'Failed to send OTP. Please try again.' });
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully to your mobile number.',
      expiresInSeconds: 300,
      ...(smsResult.debugOtp ? { debugOtp: smsResult.debugOtp } : {}),
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

const VerifyOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
  otp: z.string().trim().length(6, 'OTP must be 6 digits'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
});

/**
 * POST /api/auth/otp/verify
 * Verifies the 6-digit OTP, creates or retrieves user, links guest orders,
 * and sets an httpOnly session cookie.
 */
authRouter.post('/auth/otp/verify', async (req: Request, res: Response) => {
  try {
    const parseResult = VerifyOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { phone, otp, name } = parseResult.data;

    const record = await prisma.otpVerification.findUnique({
      where: { phone },
    });

    if (!record) {
      return res.status(400).json({
        error: 'No OTP requested for this phone number. Please request a new code.',
      });
    }

    if (record.expires_at < new Date()) {
      return res.status(400).json({
        error: 'OTP has expired. Please request a new code.',
      });
    }

    if (record.attempts >= 5) {
      return res.status(400).json({
        error: 'Too many incorrect attempts. Please request a new code.',
      });
    }

    const expectedHash = hashOtp(phone, otp);
    if (record.otp_hash !== expectedHash) {
      await prisma.otpVerification.update({
        where: { phone },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({
        error: 'Invalid verification code. Please check and try again.',
      });
    }

    // OTP verified successfully. Delete verification record
    await prisma.otpVerification.delete({
      where: { phone },
    });

    // Upsert User
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: name || null,
          role: 'CUSTOMER',
        },
      });
    } else if (name && !user.name) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
    }

    // Automatically link any past guest orders placed with this phone number
    await prisma.order.updateMany({
      where: {
        guest_phone: phone,
        user_id: null,
      },
      data: {
        user_id: user.id,
      },
    });

    // Create persistent session (30 days)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        user_id: user.id,
        token: sessionToken,
        expires_at: sessionExpiry,
      },
    });

    // Set secure httpOnly auth cookie
    res.cookie(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Synchronize / isolate user cart
    const cookieCartToken = req.cookies?.['cart_token'];
    let userCart = await prisma.cart.findUnique({
      where: { user_id: user.id },
      include: { items: true },
    });

    if (cookieCartToken) {
      const guestCart = await prisma.cart.findUnique({
        where: { token: cookieCartToken },
        include: { items: true },
      });

      if (guestCart && !guestCart.user_id) {
        if (!userCart) {
          // Claim guest cart for this user
          userCart = await prisma.cart.update({
            where: { id: guestCart.id },
            data: { user_id: user.id },
            include: { items: true },
          });
        } else if (guestCart.id !== userCart.id) {
          // Merge guest cart items into existing user cart
          for (const gItem of guestCart.items) {
            const existingItem = userCart.items.find((i) => i.product_id === gItem.product_id);
            if (existingItem) {
              await prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { qty: existingItem.qty + gItem.qty },
              });
            } else {
              await prisma.cartItem.create({
                data: {
                  cart_id: userCart.id,
                  product_id: gItem.product_id,
                  qty: gItem.qty,
                },
              });
            }
          }
          await prisma.cart.delete({ where: { id: guestCart.id } });
        }
      }
    }

    if (userCart) {
      res.cookie('cart_token', userCart.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } else {
      // Clear previous user's cart cookie so new user starts with their own fresh cart
      res.clearCookie('cart_token', { path: '/' });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP. Please try again.' });
  }
});

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile.
 */
authRouter.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

/**
 * GET /api/auth/orders
 * Returns order history for the logged-in customer.
 */
authRouter.get('/auth/orders', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const orders = await prisma.order.findMany({
      where: { user_id: user.id },
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
      orderBy: { created_at: 'desc' },
    });

    res.status(200).json({ orders });
  } catch (error) {
    console.error('User orders error:', error);
    res.status(500).json({ error: 'Failed to load user orders' });
  }
});

/**
 * POST /api/auth/logout
 * Destroys session in DB and clears auth cookie.
 */
authRouter.post('/auth/logout', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (token) {
      await prisma.session.deleteMany({
        where: { token },
      });
    }

    res.clearCookie(AUTH_COOKIE_NAME, {
      path: '/',
    });
    res.clearCookie('cart_token', {
      path: '/',
    });

    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});
