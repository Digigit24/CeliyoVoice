import type { RequestHandler } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import { McpServer } from './mcp.server';
import type { McpKeyContext } from './mcp.types';

const CreateKeySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  scope: z.enum(['ALL', 'AGENT', 'CUSTOM']).default('ALL'),
  agentId: z.string().uuid().optional(),
  toolIds: z.array(z.string().uuid()).optional().default([]),
}).refine((data) => {
  if (data.scope === 'AGENT' && !data.agentId) return false;
  if (data.scope === 'CUSTOM' && (!data.toolIds || data.toolIds.length === 0)) return false;
  return true;
}, { message: 'AGENT scope requires agentId. CUSTOM scope requires at least one toolId.' });

const UpdateKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
  scope: z.enum(['ALL', 'AGENT', 'CUSTOM']).optional(),
  agentId: z.string().uuid().nullable().optional(),
  toolIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
});

/** POST /api/v1/mcp/keys — create MCP API key */
export const createMcpKey: RequestHandler = async (req, res) => {
  const parsed = CreateKeySchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  const { name, description, scope, agentId, toolIds } = parsed.data;

  // Validate agentId belongs to tenant
  if (agentId) {
    const agent = await req.prisma!.agent.findFirst({ where: { id: agentId, tenantId: req.tenantId! } });
    if (!agent) return errorResponse(res, 'Agent not found', 'NOT_FOUND', 404);
  }

  // Validate all toolIds belong to tenant
  if (toolIds && toolIds.length > 0) {
    const count = await req.prisma!.tool.count({ where: { tenantId: req.tenantId!, id: { in: toolIds } } });
    if (count !== toolIds.length) return errorResponse(res, 'One or more tool IDs not found', 'NOT_FOUND', 404);
  }

  // Generate raw key
  const rawKey = `mcp_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const record = await req.prisma!.mcpApiKey.create({
    data: {
      tenantId: req.tenantId!,
      name,
      description,
      keyHash,
      scope,
      agentId: agentId ?? null,
      toolIds: toolIds ?? [],
    },
  });

  // Return raw key ONCE — it won't be shown again
  return success(res, {
    id: record.id,
    name: record.name,
    description: record.description,
    scope: record.scope,
    agentId: record.agentId,
    toolIds: record.toolIds,
    key: rawKey,
    createdAt: record.createdAt,
    warning: 'Save this key now — it will not be shown again.',
  }, 201);
};

/** GET /api/v1/mcp/keys — list MCP API keys enriched with toolCount */
export const listMcpKeys: RequestHandler = async (req, res) => {
  const keys = await req.prisma!.mcpApiKey.findMany({
    where: { tenantId: req.tenantId! },
    select: {
      id: true,
      name: true,
      description: true,
      scope: true,
      agentId: true,
      toolIds: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Enrich each key with the actual tool count it exposes
  const enriched = await Promise.all(keys.map(async (key) => {
    let toolCount = 0;

    switch (key.scope) {
      case 'ALL':
        toolCount = await req.prisma!.tool.count({
          where: { tenantId: req.tenantId!, isActive: true, inputSchema: { not: Prisma.JsonNull } },
        });
        break;

      case 'AGENT':
        if (key.agentId) {
          toolCount = await req.prisma!.agentTool.count({
            where: {
              agentId: key.agentId,
              tenantId: req.tenantId!,
              tool: { isActive: true, inputSchema: { not: Prisma.JsonNull } },
            },
          });
        }
        break;

      case 'CUSTOM': {
        const ids = Array.isArray(key.toolIds) ? (key.toolIds as string[]) : [];
        if (ids.length > 0) {
          toolCount = await req.prisma!.tool.count({
            where: { tenantId: req.tenantId!, id: { in: ids }, isActive: true, inputSchema: { not: Prisma.JsonNull } },
          });
        }
        break;
      }
    }

    // Resolve agent name for AGENT scope display
    let agentName: string | undefined;
    if (key.agentId) {
      const agent = await req.prisma!.agent.findFirst({ where: { id: key.agentId }, select: { name: true } });
      agentName = agent?.name;
    }

    return { ...key, toolCount, agentName };
  }));

  return paginated(res, enriched, enriched.length, 1, 100);
};

/** PUT /api/v1/mcp/keys/:id — update key config (not the key itself) */
export const updateMcpKey: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = UpdateKeySchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  const existing = await req.prisma!.mcpApiKey.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!existing) return errorResponse(res, 'Key not found', 'NOT_FOUND', 404);

  const newScope = parsed.data.scope ?? existing.scope;
  const newAgentId = parsed.data.agentId !== undefined ? parsed.data.agentId : existing.agentId;
  const newToolIds = parsed.data.toolIds ?? (existing.toolIds as string[]);

  if (newScope === 'AGENT' && !newAgentId) {
    return errorResponse(res, 'AGENT scope requires agentId', 'VALIDATION_ERROR', 400);
  }
  if (newScope === 'CUSTOM' && (!newToolIds || newToolIds.length === 0)) {
    return errorResponse(res, 'CUSTOM scope requires at least one toolId', 'VALIDATION_ERROR', 400);
  }

  // Validate agentId belongs to tenant
  if (newAgentId) {
    const agent = await req.prisma!.agent.findFirst({ where: { id: newAgentId, tenantId: req.tenantId! } });
    if (!agent) return errorResponse(res, 'Agent not found', 'NOT_FOUND', 404);
  }

  // Validate toolIds belong to tenant
  if (parsed.data.toolIds && parsed.data.toolIds.length > 0) {
    const count = await req.prisma!.tool.count({ where: { tenantId: req.tenantId!, id: { in: parsed.data.toolIds } } });
    if (count !== parsed.data.toolIds.length) return errorResponse(res, 'One or more tool IDs not found', 'NOT_FOUND', 404);
  }

  const updated = await req.prisma!.mcpApiKey.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.scope !== undefined && { scope: parsed.data.scope }),
      ...(parsed.data.agentId !== undefined && { agentId: parsed.data.agentId }),
      ...(parsed.data.toolIds !== undefined && { toolIds: parsed.data.toolIds }),
      ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
    },
  });

  return success(res, {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    scope: updated.scope,
    agentId: updated.agentId,
    toolIds: updated.toolIds,
    isActive: updated.isActive,
  });
};

/** GET /api/v1/mcp/keys/:id/tools — list tools this key exposes */
export const getMcpKeyTools: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const key = await req.prisma!.mcpApiKey.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!key) return errorResponse(res, 'Key not found', 'NOT_FOUND', 404);

  const ctx: McpKeyContext = {
    tenantId: req.tenantId!,
    keyId: key.id,
    keyName: key.name,
    scope: key.scope,
    agentId: key.agentId,
    toolIds: Array.isArray(key.toolIds) ? (key.toolIds as string[]) : [],
  };

  const server = new McpServer(req.prisma!);
  const tools = await server.resolveTools(ctx);

  return success(res, { tools, toolCount: tools.length });
};

/** DELETE /api/v1/mcp/keys/:id — revoke key */
export const deleteMcpKey: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const existing = await req.prisma!.mcpApiKey.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!existing) return errorResponse(res, 'Key not found', 'NOT_FOUND', 404);

  await req.prisma!.mcpApiKey.delete({ where: { id } });
  return success(res, { deleted: true });
};
