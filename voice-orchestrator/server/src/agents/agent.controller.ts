import type { RequestHandler } from 'express';
import { AgentService } from './agent.service';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  ListAgentsQuerySchema,
} from './validators/agent.validators';

type IdParam = { id: string };

/** POST /api/v1/agents */
export const createAgent: RequestHandler = async (req, res) => {
  const parsed = CreateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new AgentService(req.prisma!);
  const { agent, warning } = await svc.create(req.tenantId!, req.userId!, parsed.data);

  if (warning) {
    return res.status(201).json({ success: true, data: agent, warning });
  }
  return success(res, agent, 201);
};

/** GET /api/v1/agents */
export const listAgents: RequestHandler = async (req, res) => {
  const q = ListAgentsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return errorResponse(res, 'Invalid query params', 'VALIDATION_ERROR', 400);
  }

  const svc = new AgentService(req.prisma!);
  const { agents, total } = await svc.list({
    tenantId: req.tenantId!,
    page: q.data.page,
    limit: q.data.limit,
    provider: q.data.provider,
    isActive: q.data.isActive,
    search: q.data.search,
    sortBy: q.data.sortBy,
    sortOrder: q.data.sortOrder,
  });

  return paginated(res, agents, total, q.data.page, q.data.limit);
};

/** GET /api/v1/agents/:id */
export const getAgent: RequestHandler<IdParam> = async (req, res) => {
  const svc = new AgentService(req.prisma!);
  const agent = await svc.findById(req.params.id, req.tenantId!);
  if (!agent) return errorResponse(res, 'Agent not found', 'NOT_FOUND', 404);
  return success(res, agent);
};

/** PUT /api/v1/agents/:id */
export const updateAgent: RequestHandler<IdParam> = async (req, res) => {
  const parsed = UpdateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new AgentService(req.prisma!);
  const result = await svc.update(req.params.id, req.tenantId!, parsed.data);

  if (!result) return errorResponse(res, 'Agent not found', 'NOT_FOUND', 404);

  if (result.warning) {
    return res.status(200).json({ success: true, data: result.agent, warning: result.warning });
  }
  return success(res, result.agent);
};

/** DELETE /api/v1/agents/:id */
export const deleteAgent: RequestHandler<IdParam> = async (req, res) => {
  const svc = new AgentService(req.prisma!);
  const result = await svc.delete(req.params.id, req.tenantId!);

  if (!result.deleted) return errorResponse(res, 'Agent not found', 'NOT_FOUND', 404);
  if (result.warning) {
    return res.status(200).json({ success: true, data: { deleted: true }, warning: result.warning });
  }
  return success(res, { deleted: true });
};
