import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AgentService } from './agent.service';
import { AgentImportService } from './agentImport.service';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  ListAgentsQuerySchema,
} from './validators/agent.validators';
import { logger } from '../utils/logger';

type IdParam = { id: string };

const ImportSingleSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
});

// ── Existing CRUD handlers ────────────────────────────────────────────────────

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
  const agent = await svc.getAgentWithStats(req.params.id, req.tenantId!);
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

// ── Import handlers ───────────────────────────────────────────────────────────

/** POST /api/v1/agents/import/omnidim */
export const importSingleOmnidim: RequestHandler = async (req, res) => {
  logger.info({ body: req.body }, 'importSingleOmnidim: received request body');
  const parsed = ImportSingleSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ validationErrors: parsed.error.flatten() }, 'importSingleOmnidim: validation failed');
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  try {
    const svc = new AgentImportService(req.prisma!);
    const { agent, action } = await svc.importFromOmnidim(
      req.tenantId!,
      req.userId!,
      parsed.data.agentId,
    );
    return success(res, { agent, action }, action === 'created' ? 201 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    logger.warn({ err, tenantId: req.tenantId }, 'importSingleOmnidim failed');
    if (message.includes('No credentials configured')) {
      return errorResponse(res, message, 'CREDENTIALS_MISSING', 400);
    }
    if (message.includes('Authentication failed')) {
      return errorResponse(res, message, 'PROVIDER_AUTH_ERROR', 401);
    }
    return errorResponse(res, 'Provider temporarily unavailable', 'PROVIDER_ERROR', 502);
  }
};

/** POST /api/v1/agents/import/omnidim/all */
export const importAllOmnidim: RequestHandler = async (req, res) => {
  try {
    const svc = new AgentImportService(req.prisma!);
    const result = await svc.importAllFromOmnidim(req.tenantId!, req.userId!);
    return success(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    logger.warn({ err, tenantId: req.tenantId }, 'importAllOmnidim failed');
    if (message.includes('No credentials configured')) {
      return errorResponse(res, message, 'CREDENTIALS_MISSING', 400);
    }
    if (message.includes('Authentication failed')) {
      return errorResponse(res, message, 'PROVIDER_AUTH_ERROR', 401);
    }
    return errorResponse(res, 'Provider temporarily unavailable', 'PROVIDER_ERROR', 502);
  }
};

// ── Remote listing handlers ───────────────────────────────────────────────────

/** GET /api/v1/agents/remote/omnidim */
export const listRemoteOmnidim: RequestHandler = async (req, res) => {
  try {
    const svc = new AgentImportService(req.prisma!);
    const agents = await svc.listRemoteAgents(req.tenantId!, 'OMNIDIM');
    return success(res, agents);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list remote agents';
    logger.warn({ err, tenantId: req.tenantId }, 'listRemoteOmnidim failed');
    if (message.includes('No credentials configured')) {
      return errorResponse(res, message, 'CREDENTIALS_MISSING', 400);
    }
    if (message.includes('Authentication failed')) {
      return errorResponse(res, message, 'PROVIDER_AUTH_ERROR', 401);
    }
    return errorResponse(res, 'Provider temporarily unavailable', 'PROVIDER_ERROR', 502);
  }
};

/** GET /api/v1/agents/remote/bolna */
export const listRemoteBolna: RequestHandler = async (_req, res) => {
  return success(res, {
    agents: [],
    message: 'Bolna import coming soon',
  });
};

// ── Sync handler ──────────────────────────────────────────────────────────────

/** POST /api/v1/agents/:id/sync */
export const syncAgent: RequestHandler<IdParam> = async (req, res) => {
  try {
    const svc = new AgentImportService(req.prisma!);
    const agent = await svc.syncAgent(req.params.id, req.tenantId!);
    return success(res, agent);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    logger.warn({ err, agentId: req.params.id, tenantId: req.tenantId }, 'syncAgent failed');
    if (message === 'Agent not found') {
      return errorResponse(res, message, 'NOT_FOUND', 404);
    }
    if (message.includes('No credentials configured')) {
      return errorResponse(res, message, 'CREDENTIALS_MISSING', 400);
    }
    if (message.includes('Authentication failed')) {
      return errorResponse(res, message, 'PROVIDER_AUTH_ERROR', 401);
    }
    return errorResponse(res, message, 'PROVIDER_ERROR', 502);
  }
};
