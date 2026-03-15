import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import {
  createAgent,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent,
} from '../../agents/agent.controller';

export const agentRouter = Router();

agentRouter.post('/', requirePermission('voiceai.agents.create'), createAgent);
agentRouter.get('/', requirePermission('voiceai.agents.view'), listAgents);
agentRouter.get('/:id', requirePermission('voiceai.agents.view'), getAgent);
agentRouter.put('/:id', requirePermission('voiceai.agents.edit'), updateAgent);
agentRouter.delete('/:id', requirePermission('voiceai.agents.delete'), deleteAgent);
