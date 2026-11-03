import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { sendOtpSms, isDevOtpEnabled } from '../lib/sms.js';

export const adminAuthRouter = Router();

export const ADMIN_COOKIE_NAME = 'plukit_admin_session';
export const ADMIN_SESSION_EXPIRY_HOURS = 12;

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: ADMIN_SESSION_EXPIRY_HOURS * 60 * 60 * 1000,
};

// In-memory rate limiting for failed admin logins: 5 failed attempts per 15 minutes
interface FailedAttemptRecord {
  count: number;
  resetAt: number;
}
const failedLoginAttempts = new Map<string, FailedAttemptRecord>();

export function resetAdminRateLimits() {
  failedLoginAttempts.clear();
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = failedLoginAttempts.get(key);
  if (!record) return false;
  if (now > record.resetAt) {
    failedLoginAttempts.delete(key);
    return false;
  }
  return record.count >= 5;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const record = failedLoginAttempts.get(key);
  if (!record || now > record.resetAt) {
    failedLoginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    record.count += 1;
  }
}

function clearFailedAttempts(key: string) {
  failedLoginAttempts.delete(key);
}

// Temporary 2FA storage (in-memory sliding cache, expires in 5 minutes)
interface TwoFactorPending {
  adminUserId: string;
  email: string;
  codeHash: string;
  expiresAt: number;
}
const pendingTwoFactors = new Map<string, TwoFactorPending>();

function hashOtp(adminId: string, code: string): string {
  const secret = process.env.OTP_SECRET || 'plukit-admin-2fa-secret-2026';
  return crypto
    .createHmac('sha256', secret)
    .update(`${adminId}:${code}`)
    .digest('hex');
}

/**
 * Validates request cookie and returns authenticated AdminUser if session is valid.
 */
export async function getAuthenticatedAdmin(req: Request) {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token || typeof token !== 'string') {
    return null;
  }

  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: {
      admin_user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          is_active: true,
          last_login_at: true,
          created_at: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  // 12-hour expiration or inactivity check
  const now = new Date();
  if (session.expires_at < now) {
    // Delete expired session
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }

  if (!session.admin_user || !session.admin_user.is_active) {
    return null;
  }

  return {
    ...session.admin_user,
    role: 'OWNER', // Founder pilot role
    sessionId: session.id,
  };
}

/**
 * Middleware: Requires authenticated admin session. Rejects customer tokens and unauthenticated calls.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return res.status(401).json({
      error: 'Admin authentication required. Please log in at /admin/login.',
    });
  }
  (req as any).admin = admin;
  next();
}

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const verifyTwoFactorSchema = z.object({
  tempToken: z.string().min(1, 'Temporary token is required'),
  code: z.string().regex(/^\d{6}$/, 'Verification code must be exactly 6 digits'),
});

/**
 * Step 1: POST /api/admin/auth/login
 * Verifies email & password, triggers 2FA code.
 */
adminAuthRouter.post('/login', async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: parseResult.error.errors[0]?.message || 'Invalid login request',
    });
  }

  const { email, password } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();
  const ip = getClientIp(req);
  const rateLimitKey = `${ip}:${normalizedEmail}`;

  // Rate-limiting check: 5 failed attempts per 15 min
  if (isRateLimited(rateLimitKey) || isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many failed login attempts. Please try again in 15 minutes.',
    });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: normalizedEmail },
  });

  if (!admin || !admin.is_active) {
    recordFailedAttempt(rateLimitKey);
    recordFailedAttempt(ip);

    // Write failed login to audit log
    await prisma.auditLog.create({
      data: {
        actor_id: admin?.id || 'anonymous',
        action: 'ADMIN_LOGIN_FAILED',
        entity: 'admin_user',
        entity_id: admin?.id || 'unknown',
        new_value: { email: normalizedEmail, reason: !admin ? 'User not found' : 'Account inactive', ip },
      },
    }).catch(() => null);

    return res.status(401).json({
      error: 'Invalid email or password.',
    });
  }

  const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
  if (!isPasswordValid) {
    recordFailedAttempt(rateLimitKey);
    recordFailedAttempt(ip);

    await prisma.auditLog.create({
      data: {
        actor_id: admin.id,
        action: 'ADMIN_LOGIN_FAILED',
        entity: 'admin_user',
        entity_id: admin.id,
        new_value: { email: normalizedEmail, reason: 'Invalid password', ip },
      },
    }).catch(() => null);

    return res.status(401).json({
      error: 'Invalid email or password.',
    });
  }

  // Password correct: Generate 6-digit 2FA code
  const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
  const tempToken = crypto.randomBytes(24).toString('hex');
  const codeHash = hashOtp(admin.id, twoFactorCode);

  pendingTwoFactors.set(tempToken, {
    adminUserId: admin.id,
    email: admin.email,
    codeHash,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes validity
  });

  // If admin has phone, send SMS
  if (admin.phone) {
    await sendOtpSms(admin.phone, twoFactorCode);
  } else {
    // Log to console in dev mode
    console.log(`[PlukIt Admin 2FA Dev Service] 🔐 2FA Code for ${admin.email}: ${twoFactorCode}`);
  }

  return res.status(200).json({
    requiresTwoFactor: true,
    tempToken,
    message: 'Verification code sent.',
    phoneLast4: admin.phone ? admin.phone.slice(-4) : undefined,
    debugOtp: isDevOtpEnabled() ? twoFactorCode : undefined,
  });
});

/**
 * Step 2: POST /api/admin/auth/verify-2fa
 * Verifies 2FA code and issues secure admin session cookie.
 */
adminAuthRouter.post('/verify-2fa', async (req: Request, res: Response) => {
  const parseResult = verifyTwoFactorSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: parseResult.error.errors[0]?.message || 'Invalid verification request',
    });
  }

  const { tempToken, code } = parseResult.data;
  const pending = pendingTwoFactors.get(tempToken);

  if (!pending || Date.now() > pending.expiresAt) {
    pendingTwoFactors.delete(tempToken);
    return res.status(401).json({
      error: 'Verification session expired or invalid. Please log in again.',
    });
  }

  const expectedHash = hashOtp(pending.adminUserId, code);
  if (expectedHash !== pending.codeHash) {
    return res.status(401).json({
      error: 'Invalid verification code. Please check and try again.',
    });
  }

  // Valid 2FA! Remove pending record
  pendingTwoFactors.delete(tempToken);

  // Clear failed login records on success
  const ip = getClientIp(req);
  clearFailedAttempts(`${ip}:${pending.email}`);
  clearFailedAttempts(ip);

  // Create persistent session
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  const session = await prisma.adminSession.create({
    data: {
      admin_user_id: pending.adminUserId,
      token: sessionToken,
      expires_at: expiresAt,
    },
  });

  // Update last login timestamp
  await prisma.adminUser.update({
    where: { id: pending.adminUserId },
    data: { last_login_at: new Date() },
  });

  // Record login success in audit log
  await prisma.auditLog.create({
    data: {
      actor_id: pending.adminUserId,
      action: 'ADMIN_LOGIN_SUCCESS',
      entity: 'admin_user',
      entity_id: pending.adminUserId,
      new_value: { email: pending.email, ip, sessionId: session.id },
    },
  }).catch(() => null);

  // Set HTTP-only cookie
  res.cookie(ADMIN_COOKIE_NAME, sessionToken, ADMIN_COOKIE_OPTIONS);

  const admin = await prisma.adminUser.findUnique({
    where: { id: pending.adminUserId },
    select: { id: true, email: true, name: true, phone: true },
  });

  return res.status(200).json({
    success: true,
    admin: {
      id: admin?.id,
      email: admin?.email,
      name: admin?.name || 'Owner',
      role: 'OWNER',
    },
  });
});

/**
 * GET /api/admin/auth/me
 * Retrieves current admin profile if session is active.
 */
adminAuthRouter.get('/me', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  return res.status(200).json({
    authenticated: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name || 'Owner',
      role: admin.role,
      lastLoginAt: admin.last_login_at,
    },
  });
});

/**
 * POST /api/admin/auth/logout
 * Destroys session and clears cookie.
 */
adminAuthRouter.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (token && typeof token === 'string') {
    const session = await prisma.adminSession.findUnique({ where: { token } });
    if (session) {
      await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => null);
      await prisma.auditLog.create({
        data: {
          actor_id: session.admin_user_id,
          action: 'ADMIN_LOGOUT',
          entity: 'admin_session',
          entity_id: session.id,
          new_value: { ip: getClientIp(req) },
        },
      }).catch(() => null);
    }
  }

  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
});
