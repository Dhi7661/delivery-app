import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { prisma } from './lib/db.js';
import { BRAND_NAME } from './lib/brand.js';
import { catalogRouter } from './routes/catalog.js';
import { cartRouter } from './routes/cart.js';
import { checkoutRouter } from './routes/checkout.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { addressRouter } from './routes/address.js';
import { deliveryRouter } from './routes/delivery.js';
import { invoiceRouter } from './routes/invoice.js';
import { paymentRouter } from './routes/payment.js';
import { monitoringRouter, isSimulatedOutage } from './routes/monitoring.js';
import { operationsRouter } from './routes/operations.js';
import { payoutsRouter } from './routes/payouts.js';
import { reconcilePendingPayments } from './lib/reconciliation.js';
import { errorTracker } from './lib/errorTracker.js';
import {
  authRateLimiter,
  checkoutRateLimiter,
  searchRateLimiter,
  webhookRateLimiter,
} from './lib/rateLimit.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// F19: Security Hardening with Helmet (CSP, HSTS, X-Content-Type-Options, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com'],
        connectSrc: ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// F19: Restrict CORS to allowed client domains
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);

// F19: Rate limiters on sensitive endpoints
app.use('/api/products/search', searchRateLimiter);
app.use('/api/checkout', checkoutRateLimiter);
app.use('/api/auth/otp', authRateLimiter);
app.use('/api/admin/auth/login', authRateLimiter);
app.use('/api/payments/razorpay/webhook', webhookRateLimiter);

// API routes
app.use('/api', catalogRouter);
app.use('/api', cartRouter);
app.use('/api', checkoutRouter);
app.use('/api', authRouter);
app.use('/api', adminRouter);
app.use('/api', addressRouter);
app.use('/api', deliveryRouter);
app.use('/api', invoiceRouter);
app.use('/api/payments', paymentRouter);
app.use('/api', monitoringRouter);
app.use('/api', operationsRouter);
app.use('/api', payoutsRouter);

// API v1 Health Check with DB connectivity test and simulated downtime support (F20)
app.get('/api/v1/health', async (_req: Request, res: Response) => {
  if (isSimulatedOutage()) {
    return res.status(503).json({
      status: 'down',
      service: `${BRAND_NAME} Delivery Backend`,
      simulatedOutage: true,
      message: 'Simulated system outage for uptime alert validation.',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: `${BRAND_NAME} Delivery Backend`,
      version: '1.0.0',
      database: 'connected (PostgreSQL)',
      timestamp: new Date().toISOString(),
    });
  } catch (dbError) {
    res.status(503).json({
      status: 'degraded',
      service: `${BRAND_NAME} Delivery Backend`,
      version: '1.0.0',
      database: 'disconnected',
      error: dbError instanceof Error ? dbError.message : 'Unknown database error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Central Error Handler with Sentry/ErrorTracker integration (F20)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }

  // F20: Capture unhandled server exceptions
  const eventId = errorTracker.captureException(err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    eventId,
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[${BRAND_NAME} Backend] Server running on port ${PORT}`);
    console.log(`[${BRAND_NAME} Backend] Health check available at http://localhost:${PORT}/api/v1/health`);

    // F17: Periodic payment reconciliation job every 5 minutes
    const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;
    setInterval(async () => {
      try {
        const summary = await reconcilePendingPayments({ olderThanMinutes: 10 });
        if (summary.checked > 0) {
          console.log('[Reconciliation] Swept pending payments:', summary);
        }
      } catch (err: any) {
        console.error('[Reconciliation] Periodic job error:', err.message);
      }
    }, RECONCILIATION_INTERVAL_MS);
  });
}

export default app;
