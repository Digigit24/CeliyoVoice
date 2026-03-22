import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import {
  createLLMCredential,
  listLLMCredentials,
  updateLLMCredential,
  deleteLLMCredential,
} from '../../llm/llmCredential.controller';

export const llmRouter = Router();

llmRouter.post('/credentials', requirePermission('voiceai.llm.create'), createLLMCredential);
llmRouter.get('/credentials', requirePermission('voiceai.llm.view'), listLLMCredentials);
llmRouter.put('/credentials/:id', requirePermission('voiceai.llm.edit'), updateLLMCredential);
llmRouter.delete('/credentials/:id', requirePermission('voiceai.llm.delete'), deleteLLMCredential);
