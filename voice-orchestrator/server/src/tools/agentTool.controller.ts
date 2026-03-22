import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AgentToolService } from './agentTool.service';
import { success, errorResponse } from '../utils/apiResponse';

type AgentIdParam = { id: string };
type AgentToolParam = { id: string; toolId: string };

const AttachToolSchema = z.object({
  toolId: z.string().uuid(),
  whenToUse: z.string().optional(),
  isRequired: z.boolean().optional().default(false),
  priority: z.number().int().min(0).optional().default(0),
});

const UpdateAgentToolSchema = z.object({
  whenToUse: z.string().optional(),
  isRequired: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});

const BulkAttachSchema = z.object({
  toolIds: z.array(z.string().uuid()).min(1),
});

/** POST /api/v1/agents/:id/tools */
export const attachTool: RequestHandler<AgentIdParam> = async (req, res) => {
  const parsed = AttachToolSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new AgentToolService(req.prisma!);
  try {
    const result = await svc.attachTool(req.tenantId!, req.params.id, parsed.data);
    return success(res, result, 201);
  } catch (err) {
    const appErr = err as { statusCode?: number; code?: string; message: string };
    return errorResponse(res, appErr.message, appErr.code ?? 'INTERNAL_ERROR', appErr.statusCode ?? 500);
  }
};

/** GET /api/v1/agents/:id/tools */
export const listAgentTools: RequestHandler<AgentIdParam> = async (req, res) => {
  const svc = new AgentToolService(req.prisma!);
  const tools = await svc.listAgentTools(req.tenantId!, req.params.id);
  return success(res, tools);
};

/** PUT /api/v1/agents/:id/tools/:toolId */
export const updateAgentTool: RequestHandler<AgentToolParam> = async (req, res) => {
  const parsed = UpdateAgentToolSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new AgentToolService(req.prisma!);
  const result = await svc.updateAgentTool(req.tenantId!, req.params.id, req.params.toolId, parsed.data);
  if (!result) return errorResponse(res, 'Agent-tool link not found', 'NOT_FOUND', 404);
  return success(res, result);
};

/** DELETE /api/v1/agents/:id/tools/:toolId */
export const detachTool: RequestHandler<AgentToolParam> = async (req, res) => {
  const svc = new AgentToolService(req.prisma!);
  const deleted = await svc.detachTool(req.tenantId!, req.params.id, req.params.toolId);
  if (!deleted) return errorResponse(res, 'Agent-tool link not found', 'NOT_FOUND', 404);
  return success(res, { deleted: true });
};

/** POST /api/v1/agents/:id/tools/bulk */
export const bulkAttachTools: RequestHandler<AgentIdParam> = async (req, res) => {
  const parsed = BulkAttachSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new AgentToolService(req.prisma!);
  try {
    const result = await svc.bulkAttach(req.tenantId!, req.params.id, parsed.data.toolIds);
    return success(res, result);
  } catch (err) {
    const appErr = err as { statusCode?: number; code?: string; message: string };
    return errorResponse(res, appErr.message, appErr.code ?? 'INTERNAL_ERROR', appErr.statusCode ?? 500);
  }
};
