import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import { createMcpKey, listMcpKeys, updateMcpKey, deleteMcpKey, getMcpKeyTools } from '../../mcp/mcpKey.controller';

export const mcpApiRouter = Router();

mcpApiRouter.post('/keys', requirePermission('voiceai.mcp.create'), createMcpKey);
mcpApiRouter.get('/keys', requirePermission('voiceai.mcp.view'), listMcpKeys);
mcpApiRouter.put('/keys/:id', requirePermission('voiceai.mcp.create'), updateMcpKey);
mcpApiRouter.delete('/keys/:id', requirePermission('voiceai.mcp.create'), deleteMcpKey);
mcpApiRouter.get('/keys/:id/tools', requirePermission('voiceai.mcp.view'), getMcpKeyTools);
