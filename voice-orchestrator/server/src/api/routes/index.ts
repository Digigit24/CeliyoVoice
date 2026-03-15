import { Router } from 'express';
import { healthRouter } from './health.routes';
import { agentRouter } from './agents.routes';
import { callRouter } from './calls.routes';
import { toolRouter } from './tools.routes';
import { providerRouter } from './providers.routes';
import { authRouter } from '../../auth/auth.routes';
import { dashboardRouter } from '../../dashboard/dashboard.routes';
import { devRouter } from './dev.routes';
import { tenantRateLimiter, superAdminRateLimiter } from '../middleware/rateLimiter';

export const apiRouter = Router();

// Apply dual rate limiters (each skips for the other user type internally)
apiRouter.use(tenantRateLimiter);
apiRouter.use(superAdminRateLimiter);

// Routes
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/agents', agentRouter);
apiRouter.use('/calls', callRouter);
apiRouter.use('/tools', toolRouter);
apiRouter.use('/providers', providerRouter);
apiRouter.use('/dev', devRouter);
