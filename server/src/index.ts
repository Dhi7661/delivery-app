import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './lib/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());

// API v1 Health Check with DB connectivity test
app.get('/api/v1/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: 'Dashly Delivery Backend',
      version: '1.0.0',
      database: 'connected (PostgreSQL)',
      timestamp: new Date().toISOString(),
    });
  } catch (dbError) {
    res.status(503).json({
      status: 'degraded',
      service: 'Dashly Delivery Backend',
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

app.listen(PORT, () => {
  console.log(`[Dashly Backend] Server running on port ${PORT}`);
  console.log(`[Dashly Backend] Health check available at http://localhost:${PORT}/api/v1/health`);
});

export default app;
