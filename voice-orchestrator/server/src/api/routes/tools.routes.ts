import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import { createTool, listTools, getTool, updateTool, deleteTool } from '../../tools/tool.controller';

export const toolRouter = Router();

toolRouter.post('/', requirePermission('voiceai.tools.create'), createTool);
toolRouter.get('/', requirePermission('voiceai.tools.view'), listTools);
toolRouter.get('/:id', requirePermission('voiceai.tools.view'), getTool);
toolRouter.put('/:id', requirePermission('voiceai.tools.edit'), updateTool);
toolRouter.delete('/:id', requirePermission('voiceai.tools.delete'), deleteTool);
