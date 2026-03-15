import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import {
  createCredential,
  listCredentials,
  updateCredential,
  deleteCredential,
  listAvailableProviders,
} from '../../providers/provider.controller';

export const providerRouter = Router();

// No permission needed — just requires authentication (handled by JWT middleware)
providerRouter.get('/available', listAvailableProviders);

providerRouter.post('/credentials', requirePermission('voiceai.providers.create'), createCredential);
providerRouter.get('/credentials', requirePermission('voiceai.providers.view'), listCredentials);
providerRouter.put('/credentials/:id', requirePermission('voiceai.providers.edit'), updateCredential);
providerRouter.delete('/credentials/:id', requirePermission('voiceai.providers.delete'), deleteCredential);
