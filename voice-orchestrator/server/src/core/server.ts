import express, { type Application } from 'express';
import cors from 'cors';
import { config } from './config';
import { requestIdMiddleware } from '../api/middleware/requestId';
import { httpLogger } from '../utils/logger';
import { globalErrorHandler } from '../api/middleware/errorHandler';
import { apiRouter } from '../api/routes/index';
import { jwtMiddleware } from '../common/jwtMiddleware';

export function createApp(): Application {
  const app = express();

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.cors.allowedOrigins,
      credentials: true,
      allowedHeaders: [
        'content-type',
        'authorization',
        'x-tenant-id',
        'x-tenant-slug',
        'tenanttoken',
        'x-request-id',
      ],
      exposedHeaders: ['x-tenant-id', 'x-tenant-slug', 'x-request-id'],
    }),
  );

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Request tracing ────────────────────────────────────────────────────────
  app.use(requestIdMiddleware);

  // ── HTTP request logging ───────────────────────────────────────────────────
  app.use(httpLogger);

  // ── Public health check (no auth) ─────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '1.0.0',
    });
  });

  // ── JWT authentication (skips public paths internally) ────────────────────
  app.use(jwtMiddleware);

  // ── API routes ─────────────────────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ── Global error handler ───────────────────────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}
