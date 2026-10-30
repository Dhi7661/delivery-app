import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const activeLimiters: Array<Map<string, RateLimitRecord>> = [];

export function resetAllRateLimits() {
  for (const map of activeLimiters) {
    map.clear();
  }
}

/**
 * Creates an in-memory sliding-window rate limiter middleware (F19).
 * Returns HTTP 429 Too Many Requests when threshold is exceeded.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip =
        typeof forwarded === 'string'
          ? forwarded.split(',')[0].trim()
          : req.ip || req.socket.remoteAddress || '127.0.0.1';
      return ip;
    },
  } = options;

  const hits = new Map<string, RateLimitRecord>();
  activeLimiters.push(hits);

  // Periodic cleanup
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, Math.max(windowMs, 30000));
  if (timer.unref) timer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    // In automated unit tests, skip rate limiting unless explicitly requested by test
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    let record = hits.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        error: message,
        retryAfter: resetSeconds,
      });
    }

    next();
  };
}

// 1. Rate limiter for customer login and OTP requests: 5 per 15 mins
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

// 2. Rate limiter for customer checkout: 10 per 10 mins
export const checkoutRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Too many checkout attempts. Please try again in a few minutes.',
});

// 3. Rate limiter for product search: 60 per minute
export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many search queries. Please slow down.',
});

// 4. Rate limiter for payment webhooks: 120 per minute
export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Rate limit exceeded for webhook events.',
});
