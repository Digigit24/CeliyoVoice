import type { RequestHandler } from 'express';
import { ToolService } from './tool.service';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import {
  CreateToolSchema,
  UpdateToolSchema,
  ListToolsQuerySchema,
} from './validators/tool.validators';

type IdParam = { id: string };

/** POST /api/v1/tools */
export const createTool: RequestHandler = async (req, res) => {
  const parsed = CreateToolSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new ToolService(req.prisma!);
  const tool = await svc.create(req.tenantId!, req.userId!, parsed.data);
  return success(res, tool, 201);
};

/** GET /api/v1/tools */
export const listTools: RequestHandler = async (req, res) => {
  const q = ListToolsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return errorResponse(res, 'Invalid query params', 'VALIDATION_ERROR', 400);
  }

  const svc = new ToolService(req.prisma!);
  const { tools, total } = await svc.list({
    tenantId: req.tenantId!,
    page: q.data.page,
    limit: q.data.limit,
    search: q.data.search,
    isActive: q.data.isActive,
    category: q.data.category,
    toolType: q.data.toolType,
    tags: q.data.tags,
  });

  return paginated(res, tools, total, q.data.page, q.data.limit);
};

/** GET /api/v1/tools/:id */
export const getTool: RequestHandler<IdParam> = async (req, res) => {
  const svc = new ToolService(req.prisma!);
  const tool = await svc.findById(req.params.id, req.tenantId!);
  if (!tool) return errorResponse(res, 'Tool not found', 'NOT_FOUND', 404);
  return success(res, tool);
};

/** PUT /api/v1/tools/:id */
export const updateTool: RequestHandler<IdParam> = async (req, res) => {
  const parsed = UpdateToolSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new ToolService(req.prisma!);
  const tool = await svc.update(req.params.id, req.tenantId!, parsed.data);
  if (!tool) return errorResponse(res, 'Tool not found', 'NOT_FOUND', 404);
  return success(res, tool);
};

/** DELETE /api/v1/tools/:id */
export const deleteTool: RequestHandler<IdParam> = async (req, res) => {
  const svc = new ToolService(req.prisma!);
  const deleted = await svc.delete(req.params.id, req.tenantId!);
  if (!deleted) return errorResponse(res, 'Tool not found', 'NOT_FOUND', 404);
  return success(res, { deleted: true });
};
