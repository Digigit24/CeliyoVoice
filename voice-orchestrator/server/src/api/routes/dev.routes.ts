import { Router } from 'express';
import { omnidimProxy } from '../../dev/dev.controller';

export const devRouter = Router();

/** POST /api/v1/dev/omnidim — proxy any Omnidim API call for debugging */
devRouter.post('/omnidim', omnidimProxy);
