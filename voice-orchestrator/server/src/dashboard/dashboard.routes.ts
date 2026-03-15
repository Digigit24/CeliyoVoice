import { Router } from 'express';
import { getStats } from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', getStats);
