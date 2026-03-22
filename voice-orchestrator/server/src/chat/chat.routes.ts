import { Router } from 'express';
import { requirePermission } from '../common/permissionMiddleware';
import {
  listConversations,
  getConversation,
  listConversationMessages,
  updateConversation,
  deleteConversation,
} from './chat.controller';

export const conversationRouter = Router();

conversationRouter.get('/', requirePermission('voiceai.conversations.view'), listConversations);
conversationRouter.get('/:id', requirePermission('voiceai.conversations.view'), getConversation);
conversationRouter.get('/:id/messages', requirePermission('voiceai.conversations.view'), listConversationMessages);
conversationRouter.patch('/:id', requirePermission('voiceai.conversations.edit'), updateConversation);
conversationRouter.delete('/:id', requirePermission('voiceai.conversations.delete'), deleteConversation);
