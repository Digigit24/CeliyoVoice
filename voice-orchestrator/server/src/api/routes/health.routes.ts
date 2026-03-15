import { Router, type Request, type Response } from 'express';
import { success } from '../../utils/apiResponse';
import { defaultPrismaClient } from '../../db/client';
import { redisClient } from '../../db/redis';
import { logger } from '../../utils/logger';

export const healthRouter = Router();

/**
 * GET /api/v1/health
 *
 * Authenticated health endpoint. Returns service status plus tenant context
 * extracted from the JWT. DB and Redis connectivity are checked live.
 */
healthRouter.get('/', async (req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // Check default DB
  try {
    await defaultPrismaClient.$queryRaw`SELECT 1`;
    checks['database'] = 'ok';
  } catch (err) {
    logger.error({ err }, 'Health check: database unreachable');
    checks['database'] = 'error';
  }

  // Check Redis
  try {
    await redisClient.ping();
    checks['redis'] = 'ok';
  } catch (err) {
    logger.error({ err }, 'Health check: redis unreachable');
    checks['redis'] = 'error';
  }

  const allHealthy = Object.values(checks).every((v) => v === 'ok');
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    success: allHealthy,
    data: {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '1.0.0',
      tenant: {
        id: req.tenantId,
        slug: req.tenantSlug,
        isSuperAdmin: req.isSuperAdmin,
      },
      checks,
    },
  });
});

/**
 * GET /api/v1/me
 *
 * Returns the authenticated user's identity extracted from the JWT.
 * Useful for frontend to confirm auth state and tenant context.
 */
healthRouter.get('/me', (req: Request, res: Response) => {
  success(res, {
    userId: req.userId,
    email: req.email,
    tenantId: req.tenantId,
    tenantSlug: req.tenantSlug,
    isSuperAdmin: req.isSuperAdmin,
    enabledModules: req.enabledModules,
    fullName: req.tenantUser?.fullName,
  });
});
