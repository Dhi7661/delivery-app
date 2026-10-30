import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { seedCatalog } from '../../prisma/seed.js';
import app from '../index.js';
import { catalogCache } from '../lib/catalogCache.js';
import { errorTracker } from '../lib/errorTracker.js';
import { setSimulatedOutage } from './monitoring.js';

let server: Server;
let BASE_URL: string;

describe('F20: Performance and Monitoring', () => {
  beforeAll(async () => {
    await seedCatalog();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          BASE_URL = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    setSimulatedOutage(false);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Catalog Caching (1 to 5 Minutes TTL & Invalidation)', () => {
    it('returns X-Cache: MISS on cold request and X-Cache: HIT on subsequent request', async () => {
      catalogCache.invalidate();

      // First call: Cold cache
      const res1 = await fetch(`${BASE_URL}/api/categories`);
      expect(res1.status).toBe(200);
      expect(res1.headers.get('x-cache')).toBe('MISS');
      const data1 = await res1.json();
      expect(data1.categories.length).toBeGreaterThan(0);

      // Second call: Warm cache
      const res2 = await fetch(`${BASE_URL}/api/categories`);
      expect(res2.status).toBe(200);
      expect(res2.headers.get('x-cache')).toBe('HIT');
      const data2 = await res2.json();
      expect(data2.categories).toEqual(data1.categories);
    });

    it('clears cached catalog entries upon invalidation', async () => {
      // Warm the cache
      await fetch(`${BASE_URL}/api/categories`);
      expect(catalogCache.get('categories')).toBeTruthy();

      // Invalidate
      catalogCache.invalidate();
      expect(catalogCache.get('categories')).toBeNull();

      // Next request must be a MISS
      const resAfter = await fetch(`${BASE_URL}/api/categories`);
      expect(resAfter.status).toBe(200);
      expect(resAfter.headers.get('x-cache')).toBe('MISS');
    });

    it('caches category products pagination requests', async () => {
      const catRes = await fetch(`${BASE_URL}/api/categories`);
      const catData = await catRes.json();
      const firstCatId = catData.categories[0].id;

      catalogCache.invalidate();

      // Cold request
      const r1 = await fetch(`${BASE_URL}/api/categories/${firstCatId}/products?limit=5`);
      expect(r1.status).toBe(200);
      expect(r1.headers.get('x-cache')).toBe('MISS');

      // Warm request
      const r2 = await fetch(`${BASE_URL}/api/categories/${firstCatId}/products?limit=5`);
      expect(r2.status).toBe(200);
      expect(r2.headers.get('x-cache')).toBe('HIT');
    });
  });

  describe('2. Error Tracking & Sentry Ingestion', () => {
    it('captures test error and returns unique event ID', async () => {
      errorTracker.clearErrors();

      const res = await fetch(`${BASE_URL}/api/monitoring/test-error`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.eventId).toMatch(/^err_/);
      expect(data.error).toContain('Test Sentry/Monitoring Exception');

      // Verify stored in error tracker memory
      const recent = errorTracker.getRecentErrors();
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[recent.length - 1].eventId).toBe(data.eventId);
    });

    it('accepts and logs client-side React error reports', async () => {
      const payload = {
        message: 'Client UI Render Error: Minified React error #31',
        stack: 'Error: Minified React error\n    at ProductCard.tsx:45',
        url: 'http://localhost:3000/product/123',
        componentStack: 'in ProductCard\n    in div',
      };

      const res = await fetch(`${BASE_URL}/api/monitoring/client-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.eventId).toMatch(/^err_/);
    });
  });

  describe('3. Uptime Monitoring & Intentional Outage Testing', () => {
    it('reports comprehensive system telemetry under normal conditions', async () => {
      setSimulatedOutage(false);

      const res = await fetch(`${BASE_URL}/api/monitoring/health`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('ok');
      expect(data.database.status).toBe('connected');
      expect(typeof data.database.latencyMs).toBe('number');
      expect(typeof data.uptimeSeconds).toBe('number');
      expect(data.system.nodeVersion).toBe(process.version);
      expect(data.cache).toBeDefined();
    });

    it('returns HTTP 503 degraded/down when simulated outage is enabled for alert testing', async () => {
      // 1. Enable simulated outage
      const toggleRes = await fetch(`${BASE_URL}/api/monitoring/simulate-outage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: true }),
      });
      expect(toggleRes.status).toBe(200);
      const toggleData = await toggleRes.json();
      expect(toggleData.simulatedOutage).toBe(true);

      // 2. Both health endpoints must now return HTTP 503 so uptime monitors fire
      const v1Res = await fetch(`${BASE_URL}/api/v1/health`);
      expect(v1Res.status).toBe(503);
      const v1Data = await v1Res.json();
      expect(v1Data.status).toBe('down');
      expect(v1Data.simulatedOutage).toBe(true);

      const monRes = await fetch(`${BASE_URL}/api/monitoring/health`);
      expect(monRes.status).toBe(503);

      // 3. Disable outage and verify recovery to HTTP 200
      await fetch(`${BASE_URL}/api/monitoring/simulate-outage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: false }),
      });

      const recoveredRes = await fetch(`${BASE_URL}/api/v1/health`);
      expect(recoveredRes.status).toBe(200);
    });
  });

  describe('4. Architecture, Indexing, and Code Splitting Verification', () => {
    it('verifies performance indexes exist in Prisma schema', () => {
      const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      expect(schema).toContain('@@index([category_id, is_available])');
      expect(schema).toContain('@@index([order_id])');
      expect(schema).toContain('@@index([entity, entity_id])');
    });

    it('verifies client ErrorBoundary and Next.js Image Optimization config', () => {
      const errorBoundaryPath = path.resolve(__dirname, '../../../client/components/ErrorBoundary.tsx');
      const nextConfigPath = path.resolve(__dirname, '../../../client/next.config.ts');

      expect(fs.existsSync(errorBoundaryPath)).toBe(true);
      expect(fs.existsSync(nextConfigPath)).toBe(true);

      const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
      expect(nextConfig).toContain('image/avif');
      expect(nextConfig).toContain('image/webp');
    });
  });
});
