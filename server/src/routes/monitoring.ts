import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { BRAND_NAME } from '../lib/brand.js';
import { catalogCache } from '../lib/catalogCache.js';
import { errorTracker } from '../lib/errorTracker.js';

export const monitoringRouter = Router();

let simulatedOutage = false;

export function setSimulatedOutage(value: boolean) {
  simulatedOutage = value;
}

export function isSimulatedOutage(): boolean {
  return simulatedOutage;
}

/**
 * GET /api/monitoring/health
 * Comprehensive uptime and telemetry status.
 */
monitoringRouter.get('/monitoring/health', async (_req: Request, res: Response) => {
  if (simulatedOutage) {
    return res.status(503).json({
      status: 'down',
      service: `${BRAND_NAME} Delivery Backend`,
      simulatedOutage: true,
      message: 'Simulated system outage for uptime alert validation.',
      timestamp: new Date().toISOString(),
    });
  }

  const startTime = Date.now();
  let dbStatus = 'connected';
  let dbLatencyMs = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - startTime;
  } catch (err: any) {
    dbStatus = 'disconnected';
    dbLatencyMs = Date.now() - startTime;
  }

  const isDegraded = dbStatus !== 'connected';
  const memUsage = process.memoryUsage();

  const responsePayload = {
    status: isDegraded ? 'degraded' : 'ok',
    service: `${BRAND_NAME} Delivery Backend`,
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    system: {
      memoryRssMb: (memUsage.rss / 1024 / 1024).toFixed(1),
      heapUsedMb: (memUsage.heapUsed / 1024 / 1024).toFixed(1),
      nodeVersion: process.version,
    },
    cache: catalogCache.getStats(),
    timestamp: new Date().toISOString(),
  };

  res.status(isDegraded ? 503 : 200).json(responsePayload);
});

/**
 * GET /api/monitoring/test-error
 * Deliberately triggers and logs an error to verify Sentry / error tracking capture.
 */
monitoringRouter.get('/monitoring/test-error', (req: Request, res: Response) => {
  const simulatedError = new Error('Test Sentry/Monitoring Exception: F20 verification');
  const eventId = errorTracker.captureException(simulatedError, {
    query: req.query,
    ip: req.ip,
    url: req.originalUrl,
  });

  res.status(200).json({
    success: true,
    message: 'Test error captured in error tracker successfully.',
    eventId,
    error: simulatedError.message,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/monitoring/simulate-outage
 * Toggle intentional downtime to test external uptime monitoring and alerting.
 */
monitoringRouter.post('/monitoring/simulate-outage', (req: Request, res: Response) => {
  const { enable } = req.body || {};
  simulatedOutage = Boolean(enable);

  res.status(200).json({
    success: true,
    simulatedOutage,
    message: simulatedOutage
      ? 'Simulated outage ENABLED. Uptime checks will now return HTTP 503.'
      : 'Simulated outage DISABLED. Uptime checks will return HTTP 200.',
  });
});

/**
 * POST /api/monitoring/client-errors
 * Ingestion endpoint for client-side React Error Boundary errors.
 */
monitoringRouter.post('/monitoring/client-errors', (req: Request, res: Response) => {
  const { message, stack, url, componentStack } = req.body || {};
  const clientError = new Error(message || 'Unknown Client Exception');
  clientError.stack = stack;

  const eventId = errorTracker.captureException(clientError, {
    clientUrl: url,
    componentStack,
    source: 'client-browser',
  });

  res.status(200).json({ success: true, eventId });
});
