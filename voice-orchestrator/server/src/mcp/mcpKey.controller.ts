import type { RequestHandler } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { success, errorResponse, paginated } from '../utils/apiResponse';

const CreateKeySchema = z.object({
  name: z.string().min(1).max(255),
  agentId: z.string().uuid().optional(),
});

/** POST /api/v1/mcp/keys — create MCP API key */
export const createMcpKey: RequestHandler = async (req, res) => {
  const parsed = CreateKeySchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  // Generate raw key
  const rawKey = `mcp_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const record = await req.prisma!.mcpApiKey.create({
    data: {
      tenantId: req.tenantId!,
      name: parsed.data.name,
      keyHash,
      agentId: parsed.data.agentId,
    },
  });

  // Return raw key ONCE — it won't be shown again
  return success(res, {
    id: record.id,
    name: record.name,
    key: rawKey,
    agentId: record.agentId,
    createdAt: record.createdAt,
    warning: 'Save this key now — it will not be shown again.',
  }, 201);
};

/** GET /api/v1/mcp/keys — list MCP API keys (masked) */
export const listMcpKeys: RequestHandler = async (req, res) => {
  const keys = await req.prisma!.mcpApiKey.findMany({
    where: { tenantId: req.tenantId! },
    select: {
      id: true,
      name: true,
      agentId: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return paginated(res, keys, keys.length, 1, 100);
};

/** DELETE /api/v1/mcp/keys/:id — revoke key */
export const deleteMcpKey: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const existing = await req.prisma!.mcpApiKey.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!existing) return errorResponse(res, 'Key not found', 'NOT_FOUND', 404);

  await req.prisma!.mcpApiKey.delete({ where: { id } });
  return success(res, { deleted: true });
};
