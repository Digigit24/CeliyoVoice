import type { RequestHandler } from 'express';
import { z } from 'zod';
import { success, errorResponse } from '../utils/apiResponse';

type AgentParam = { id: string };
type AgentTagParam = { id: string; tagId: string };

const SubscribeSchema = z.object({
  tagId: z.string().uuid(),
});

/** POST /api/v1/agents/:id/toolkits — subscribe agent to a toolkit */
export const subscribeToolkit: RequestHandler<AgentParam> = async (req, res) => {
  const parsed = SubscribeSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  const prisma = req.prisma!;
  const tenantId = req.tenantId!;
  const agentId = req.params.id;

  // Verify agent belongs to tenant
  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!agent) return errorResponse(res, 'Agent not found', 'NOT_FOUND', 404);

  // Verify tag belongs to tenant and is a toolkit
  const tag = await prisma.toolTag.findFirst({ where: { id: parsed.data.tagId, tenantId } });
  if (!tag) return errorResponse(res, 'Tag not found', 'NOT_FOUND', 404);
  if (!tag.isToolkit) return errorResponse(res, 'Tag is not a toolkit. Promote it first.', 'NOT_TOOLKIT', 400);

  try {
    const record = await prisma.agentToolkit.create({
      data: { tenantId, agentId, tagId: parsed.data.tagId },
      include: {
        tag: { include: { _count: { select: { tools: true } }, tools: { include: { tool: { select: { id: true, name: true, description: true, isActive: true } } } } } },
      },
    });
    return success(res, record, 201);
  } catch {
    return errorResponse(res, 'Already subscribed to this toolkit', 'CONFLICT', 409);
  }
};

/** DELETE /api/v1/agents/:id/toolkits/:tagId — unsubscribe from toolkit */
export const unsubscribeToolkit: RequestHandler<AgentTagParam> = async (req, res) => {
  const prisma = req.prisma!;
  const { id: agentId, tagId } = req.params;

  const record = await prisma.agentToolkit.findFirst({ where: { agentId, tagId } });
  if (!record) return errorResponse(res, 'Toolkit subscription not found', 'NOT_FOUND', 404);

  await prisma.agentToolkit.delete({ where: { id: record.id } });
  return success(res, { deleted: true });
};

/** GET /api/v1/agents/:id/toolkits — list agent's toolkit subscriptions */
export const listAgentToolkits: RequestHandler<AgentParam> = async (req, res) => {
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;
  const agentId = req.params.id;

  const toolkits = await prisma.agentToolkit.findMany({
    where: { agentId, tenantId },
    include: {
      tag: {
        include: {
          _count: { select: { tools: true } },
          tools: {
            include: {
              tool: {
                select: { id: true, name: true, description: true, toolType: true, isActive: true, category: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return success(res, toolkits);
};

/** GET /api/v1/agents/:id/tools/effective — merged deduplicated tool list */
export const getEffectiveTools: RequestHandler<AgentParam> = async (req, res) => {
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;
  const agentId = req.params.id;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!agent) return errorResponse(res, 'Agent not found', 'NOT_FOUND', 404);

  // Individual bindings (AgentTool)
  const agentTools = await prisma.agentTool.findMany({
    where: { agentId, tenantId },
    include: { tool: { select: { id: true, name: true, description: true, toolType: true, endpoint: true, method: true, isActive: true, category: true, source: true } } },
    orderBy: { priority: 'asc' },
  });

  // Toolkit subscriptions (AgentToolkit → ToolTag → Tools)
  const toolkitSubs = await prisma.agentToolkit.findMany({
    where: { agentId, tenantId },
    include: {
      tag: {
        include: {
          tools: {
            include: {
              tool: { select: { id: true, name: true, description: true, toolType: true, endpoint: true, method: true, isActive: true, category: true, source: true } },
            },
          },
        },
      },
    },
  });

  // Build effective list — AgentTool explicit binding takes priority (dedup by name)
  const seen = new Map<string, {
    tool: typeof agentTools[0]['tool'];
    source: 'individual' | 'toolkit';
    toolkitName?: string;
    whenToUse?: string | null;
    priority?: number;
    isRequired?: boolean;
  }>();

  // First pass: individual tools (higher priority)
  for (const at of agentTools) {
    if (!at.tool.isActive) continue;
    seen.set(at.tool.name, {
      tool: at.tool,
      source: 'individual',
      whenToUse: at.whenToUse,
      priority: at.priority,
      isRequired: at.isRequired,
    });
  }

  // Second pass: toolkit tools (only if name not already in seen)
  for (const sub of toolkitSubs) {
    for (const assignment of sub.tag.tools) {
      const t = assignment.tool;
      if (!t.isActive) continue;
      if (!seen.has(t.name)) {
        seen.set(t.name, {
          tool: t,
          source: 'toolkit',
          toolkitName: sub.tag.name,
        });
      }
    }
  }

  const effective = Array.from(seen.values());
  return success(res, {
    total: effective.length,
    individual: effective.filter((e) => e.source === 'individual').length,
    fromToolkits: effective.filter((e) => e.source === 'toolkit').length,
    tools: effective,
  });
};
