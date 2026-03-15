import { Router } from 'express';
import { healthRouter } from './health.routes';
import { tenantRateLimiter, superAdminRateLimiter } from '../middleware/rateLimiter';

export const apiRouter = Router();

// Apply dual rate limiters (each skips for the other user type internally)
apiRouter.use(tenantRateLimiter);
apiRouter.use(superAdminRateLimiter);

// Health + identity routes
apiRouter.use('/health', healthRouter);

// Future feature routes will be added here in subsequent prompts:
// apiRouter.use('/agents', agentRouter);
// apiRouter.use('/calls', callRouter);
// apiRouter.use('/providers', providerRouter);
// apiRouter.use('/tools', toolRouter);
