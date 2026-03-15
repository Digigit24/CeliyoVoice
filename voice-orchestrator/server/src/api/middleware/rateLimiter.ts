import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { config } from '../../core/config';
import { redisClient } from '../../db/redis';

/**
 * Generates a rate limit key per tenant (not per IP).
 */
function keyGenerator(req: Request): string {
  const tenantId = req.tenantId ?? req.ip ?? 'unknown';
  const isSuperAdmin = req.isSuperAdmin === true;
  return `ratelimit:${isSuperAdmin ? 'superadmin' : 'tenant'}:${tenantId}`;
}

function createLimiter(max: number, prefix: string) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    store: new RedisStore({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendCommand: (command: string, ...args: string[]) => redisClient.call(command, ...args) as any,
      prefix: `rl:${prefix}:`,
    }),
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please retry after the window resets.',
        },
      });
    },
    skip: (req: Request) => {
      if (prefix === 'superadmin' && !req.isSuperAdmin) return true;
      if (prefix === 'tenant' && req.isSuperAdmin) return true;
      return false;
    },
  });
}

export const tenantRateLimiter = createLimiter(config.rateLimit.defaultMax, 'tenant');
export const superAdminRateLimiter = createLimiter(config.rateLimit.superAdminMax, 'superadmin');

export { tenantRateLimiter as rateLimiter };
