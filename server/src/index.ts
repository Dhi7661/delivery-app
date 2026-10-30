import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
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
import { reconcilePendingPayments } from './lib/reconciliation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(cookieParser());
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);

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

// API v1 Health Check with DB connectivity test
app.get('/api/v1/health', async (_req: Request, res: Response) => {
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

// Central Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
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
