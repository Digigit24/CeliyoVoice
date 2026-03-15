import type { RequestHandler } from 'express';
import { PostCallService, CreatePostCallActionSchema, UpdatePostCallActionSchema } from './postCall.service';
import { success, errorResponse } from '../utils/apiResponse';

type AgentParam = { agentId: string };
type ActionParam = { agentId: string; actionId: string };

function svc(req: Parameters<RequestHandler>[0]) {
  return new PostCallService(req.prisma!);
}

/** GET /agents/:agentId/post-call-actions */
export const listActions: RequestHandler<AgentParam> = async (req, res) => {
  const actions = await svc(req).listActions(req.tenantId!, req.params.agentId);
  return success(res, actions);
};

/** POST /agents/:agentId/post-call-actions */
export const createAction: RequestHandler<AgentParam> = async (req, res) => {
  const parsed = CreatePostCallActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }
  try {
    const action = await svc(req).createAction(req.tenantId!, req.params.agentId, parsed.data);
    return success(res, action, 201);
  } catch (err) {
    const e = err as { statusCode?: number; message: string };
    return errorResponse(res, e.message, 'ERROR', e.statusCode ?? 500);
  }
};

/** PUT /agents/:agentId/post-call-actions/:actionId */
export const updateAction: RequestHandler<ActionParam> = async (req, res) => {
  const parsed = UpdatePostCallActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }
  try {
    const action = await svc(req).updateAction(req.params.actionId, req.tenantId!, parsed.data);
    return success(res, action);
  } catch (err) {
    const e = err as { statusCode?: number; message: string };
    return errorResponse(res, e.message, 'ERROR', e.statusCode ?? 500);
  }
};

/** DELETE /agents/:agentId/post-call-actions/:actionId */
export const deleteAction: RequestHandler<ActionParam> = async (req, res) => {
  try {
    await svc(req).deleteAction(req.params.actionId, req.tenantId!);
    return success(res, { deleted: true });
  } catch (err) {
    const e = err as { statusCode?: number; message: string };
    return errorResponse(res, e.message, 'ERROR', e.statusCode ?? 500);
  }
};

/** GET /agents/:agentId/post-call-actions/executions */
export const listExecutions: RequestHandler<AgentParam> = async (req, res) => {
  const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '50'), 10));
  const executions = await svc(req).listExecutions(req.tenantId!, req.params.agentId, limit);
  return success(res, executions);
};

/**
 * GET /agents/:agentId/post-call-actions/webhook-url
 * Returns the webhook URL the user should paste into their Omnidim dashboard.
 */
export const getWebhookUrl: RequestHandler<AgentParam> = async (req, res) => {
  const serverUrl =
    process.env['PUBLIC_SERVER_URL'] ??
    `${req.protocol}://${req.get('host')}`;
  const url = `${serverUrl}/api/v1/webhooks/omnidim`;
  return success(res, { url });
};
