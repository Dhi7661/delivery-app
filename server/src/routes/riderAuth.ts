import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { sendOtpSms } from '../lib/sms.js';
import { maskPhone, sanitizeForLogging } from '../lib/sanitizer.js';

export const riderAuthRouter = Router();

export const RIDER_COOKIE_NAME = 'rider_token';
export const INACTIVITY_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours of inactivity (Spec Section 2)
const OTP_SECRET = process.env.OTP_SECRET || 'plukit-otp-secret-key-2026';

function hashOtp(phone: string, otp: string): string {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(`rider:${phone}:${otp}`)
    .digest('hex');
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Middleware: Verify rider session token with 12-hour inactivity sliding window.
 * Strictly verifies role is RIDER (or ADMIN acting as rider during founder pilot).
 */
export async function requireRiderAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token =
      req.cookies?.[RIDER_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null) ||
      (typeof req.headers['x-rider-token'] === 'string' ? req.headers['x-rider-token'] : null);

    if (!token) {
      return res.status(401).json({ error: 'Rider authentication required. Please log in.' });
    }

    const session = await prisma.riderSession.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!session || !session.is_active || session.expires_at < new Date()) {
      return res.status(401).json({ error: 'Rider session is invalid or expired. Please log in.' });
    }

    // 12-hour inactivity check (Spec Section 2 & 8.3)
    const now = new Date();
    if (session.last_active_at) {
      const elapsed = now.getTime() - new Date(session.last_active_at).getTime();
      if (elapsed > INACTIVITY_TIMEOUT_MS) {
        await prisma.riderSession.update({
          where: { id: session.id },
          data: { is_active: false },
        });
        res.clearCookie(RIDER_COOKIE_NAME, { path: '/' });
        return res.status(401).json({
          error: 'Rider session has expired due to 12 hours of inactivity. Please log in again.',
        });
      }
    }

    // Check role: must be RIDER or ADMIN (founder pilot)
    if (session.user.role !== 'RIDER' && session.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied: Rider credentials required.' });
    }

    // Debounce updating last_active_at (once per minute)
    if (
      !session.last_active_at ||
      now.getTime() - new Date(session.last_active_at).getTime() > 60 * 1000
    ) {
      await prisma.riderSession.update({
        where: { id: session.id },
        data: { last_active_at: now },
      });
    }

    (req as any).rider = session.user;
    (req as any).riderSession = session;
    next();
  } catch (error) {
    console.error('requireRiderAuth error:', error);
    return res.status(500).json({ error: 'Authentication verification failed' });
  }
}

const SendOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
});

/**
 * POST /api/delivery/auth/otp/send
 * Sends OTP to rider's mobile phone (rate-limited, audit logged).
 */
riderAuthRouter.post('/delivery/auth/otp/send', async (req: Request, res: Response) => {
  try {
    const parseResult = SendOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { phone } = parseResult.data;
    const clientIp = getClientIp(req);

    // Rate limit: At most 5 requests per 15 minutes (Spec Section 2)
    const windowStart = new Date(Date.now() - 15 * 60 * 1000);
    const recentCount = await prisma.auditLog.count({
      where: {
        action: 'RIDER_OTP_REQUESTED',
        entity: 'rider_auth',
        entity_id: phone,
        created_at: { gte: windowStart },
      },
    });

    if (recentCount >= 5) {
      return res.status(429).json({
        error: 'Too many OTP requests. Maximum 5 requests allowed every 15 minutes.',
      });
    }

    // Generate 6-digit OTP
    let otp: string;
    if (process.env.NODE_ENV === 'test' && req.body.mockOtp) {
      otp = String(req.body.mockOtp);
    } else {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const otp_hash = hashOtp(phone, otp);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in OtpVerification
    await prisma.otpVerification.upsert({
      where: { phone: `rider:${phone}` },
      create: {
        phone: `rider:${phone}`,
        otp_hash,
        expires_at,
        attempts: 0,
      },
      update: {
        otp_hash,
        expires_at,
        attempts: 0,
        updated_at: new Date(),
      },
    });

    // Write audit log (with masked phone per DPDP Act 2023)
    await prisma.auditLog.create({
      data: {
        actor_id: clientIp,
        action: 'RIDER_OTP_REQUESTED',
        entity: 'rider_auth',
        entity_id: phone,
        new_value: sanitizeForLogging({ ip: clientIp, phone: maskPhone(phone) }),
      },
    });

    // Send SMS
    const smsResult = await sendOtpSms(phone, otp);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully to rider',
      phone: maskPhone(phone),
      ...(smsResult.debugOtp ? { debugOtp: smsResult.debugOtp } : {}),
    });
  } catch (error: any) {
    console.error('Rider OTP send error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

const VerifyOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
  otp: z
    .string()
    .trim()
    .length(6, 'OTP must be exactly 6 digits'),
});

/**
 * POST /api/delivery/auth/otp/verify
 * Verifies OTP, establishes RiderSession (12h sliding window), sets cookie.
 */
riderAuthRouter.post('/delivery/auth/otp/verify', async (req: Request, res: Response) => {
  try {
    const parseResult = VerifyOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0]?.message });
    }

    const { phone, otp } = parseResult.data;
    const clientIp = getClientIp(req);

    const record = await prisma.otpVerification.findUnique({
      where: { phone: `rider:${phone}` },
    });

    if (!record) {
      return res.status(400).json({ error: 'No OTP requested for this phone number' });
    }

    if (record.expires_at < new Date()) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({
        error: 'Too many incorrect attempts. Please request a new OTP.',
      });
    }

    const expectedHash = hashOtp(phone, otp);
    if (record.otp_hash !== expectedHash) {
      await prisma.otpVerification.update({
        where: { phone: `rider:${phone}` },
        data: { attempts: { increment: 1 } },
      });

      await prisma.auditLog.create({
        data: {
          actor_id: clientIp,
          action: 'RIDER_LOGIN_FAILED',
          entity: 'rider_auth',
          entity_id: phone,
          new_value: sanitizeForLogging({ ip: clientIp, phone: maskPhone(phone), reason: 'invalid_otp' }),
        },
      });

      return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' });
    }

    // Ensure User exists with role RIDER
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: 'Delivery Partner',
          role: 'RIDER',
        },
      });
    } else if (user.role !== 'RIDER' && user.role !== 'ADMIN') {
      // During pilot: upgrade user to RIDER role if requested
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'RIDER' },
      });
    }

    // Delete verified OTP
    await prisma.otpVerification.delete({ where: { phone: `rider:${phone}` } });

    // Create RiderSession (12 hours)
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + INACTIVITY_TIMEOUT_MS);

    await prisma.riderSession.create({
      data: {
        user_id: user.id,
        token,
        last_active_at: new Date(),
        expires_at,
        is_active: true,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        action: 'RIDER_LOGIN_SUCCESS',
        entity: 'rider_auth',
        entity_id: user.id,
        new_value: sanitizeForLogging({ ip: clientIp, phone: maskPhone(phone), role: user.role }),
      },
    });

    // Set cookie
    res.cookie(RIDER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: INACTIVITY_TIMEOUT_MS,
      path: '/',
    });

    return res.status(200).json({
      success: true,
      token,
      rider: {
        id: user.id,
        name: user.name,
        phone: maskPhone(user.phone),
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Rider OTP verify error:', error);
    return res.status(500).json({ error: error.message || 'Failed to verify OTP' });
  }
});

/**
 * GET /api/delivery/auth/me
 * Returns current authenticated rider profile.
 */
riderAuthRouter.get('/delivery/auth/me', requireRiderAuth, async (req: Request, res: Response) => {
  const rider = (req as any).rider;
  return res.status(200).json({
    success: true,
    rider: {
      id: rider.id,
      name: rider.name,
      phone: maskPhone(rider.phone),
      role: rider.role,
    },
  });
});

/**
 * POST /api/delivery/auth/logout
 * Destroys rider session and clears cookie.
 */
riderAuthRouter.post('/delivery/auth/logout', async (req: Request, res: Response) => {
  try {
    const token =
      req.cookies?.[RIDER_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null) ||
      (typeof req.headers['x-rider-token'] === 'string' ? req.headers['x-rider-token'] : null);

    if (token) {
      const session = await prisma.riderSession.findUnique({
        where: { token },
        select: { user_id: true },
      });

      if (session) {
        await prisma.riderSession.deleteMany({ where: { token } });
        await prisma.auditLog.create({
          data: {
            actor_id: session.user_id,
            action: 'RIDER_LOGOUT',
            entity: 'rider_auth',
            entity_id: session.user_id,
            new_value: sanitizeForLogging({ ip: getClientIp(req) }),
          },
        });
      }
    }

    res.clearCookie(RIDER_COOKIE_NAME, { path: '/' });
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Rider logout error:', error);
    return res.status(500).json({ error: 'Failed to process logout' });
  }
});

