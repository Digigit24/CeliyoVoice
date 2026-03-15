import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import {
  createAgent,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  importSingleOmnidim,
  importAllOmnidim,
  listRemoteOmnidim,
  listRemoteBolna,
  syncAgent,
} from '../../agents/agent.controller';
import {
  listActions,
  createAction,
  updateAction,
  deleteAction,
  listExecutions,
  getWebhookUrl,
} from '../../postCall/postCallAction.controller';

export const agentRouter = Router();

// ── Import routes (MUST come before /:id to avoid "import" being treated as an id) ──
agentRouter.post('/import/omnidim', requirePermission('voiceai.agents.create'), importSingleOmnidim);
agentRouter.post('/import/omnidim/all', requirePermission('voiceai.agents.create'), importAllOmnidim);

// ── Remote listing routes ─────────────────────────────────────────────────────
agentRouter.get('/remote/omnidim', requirePermission('voiceai.agents.view'), listRemoteOmnidim);
agentRouter.get('/remote/bolna', requirePermission('voiceai.agents.view'), listRemoteBolna);

// ── Standard CRUD routes ──────────────────────────────────────────────────────
agentRouter.post('/', requirePermission('voiceai.agents.create'), createAgent);
agentRouter.get('/', requirePermission('voiceai.agents.view'), listAgents);
agentRouter.get('/:id', requirePermission('voiceai.agents.view'), getAgent);
agentRouter.put('/:id', requirePermission('voiceai.agents.edit'), updateAgent);
agentRouter.delete('/:id', requirePermission('voiceai.agents.delete'), deleteAgent);

// ── Sync route ────────────────────────────────────────────────────────────────
agentRouter.post('/:id/sync', requirePermission('voiceai.agents.edit'), syncAgent);

// ── Post-call action routes (must come before /:id to avoid conflicts) ────────
// Static sub-routes first
agentRouter.get('/:agentId/post-call-actions/webhook-url', requirePermission('voiceai.agents.view'), getWebhookUrl);
agentRouter.get('/:agentId/post-call-actions/executions', requirePermission('voiceai.agents.view'), listExecutions);
// CRUD
agentRouter.get('/:agentId/post-call-actions', requirePermission('voiceai.agents.view'), listActions);
agentRouter.post('/:agentId/post-call-actions', requirePermission('voiceai.agents.edit'), createAction);
agentRouter.put('/:agentId/post-call-actions/:actionId', requirePermission('voiceai.agents.edit'), updateAction);
agentRouter.delete('/:agentId/post-call-actions/:actionId', requirePermission('voiceai.agents.edit'), deleteAction);
