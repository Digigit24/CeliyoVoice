import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import { createMcpKey, listMcpKeys, deleteMcpKey } from '../../mcp/mcpKey.controller';

export const mcpApiRouter = Router();

mcpApiRouter.post('/keys', requirePermission('voiceai.mcp.create'), createMcpKey);
mcpApiRouter.get('/keys', requirePermission('voiceai.mcp.view'), listMcpKeys);
mcpApiRouter.delete('/keys/:id', requirePermission('voiceai.mcp.create'), deleteMcpKey);
