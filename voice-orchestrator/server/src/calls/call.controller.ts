import type { RequestHandler } from 'express';
import { CallService } from './call.service';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import { StartCallSchema, ListCallsQuerySchema } from './validators/call.validators';
import type { CallStatus, VoiceProvider } from '@prisma/client';

type IdParam = { id: string };

/** POST /api/v1/calls/start */
export const startCall: RequestHandler = async (req, res) => {
  const parsed = StartCallSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new CallService(req.prisma!);
  try {
    const call = await svc.startCall(req.tenantId!, req.userId!, parsed.data);
    return success(res, call, 202);
  } catch (err) {
    const appErr = err as { statusCode?: number; message: string };
    return errorResponse(res, appErr.message, 'ERROR', appErr.statusCode ?? 500);
  }
};

/** POST /api/v1/calls/:id/end */
export const endCall: RequestHandler<IdParam> = async (req, res) => {
  const svc = new CallService(req.prisma!);
  const call = await svc.endCall(req.params.id, req.tenantId!);
  if (!call) return errorResponse(res, 'Call not found', 'NOT_FOUND', 404);
  return success(res, call);
};

/** GET /api/v1/calls */
export const listCalls: RequestHandler = async (req, res) => {
  const q = ListCallsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return errorResponse(res, 'Invalid query params', 'VALIDATION_ERROR', 400);
  }

  const svc = new CallService(req.prisma!);
  const { calls, total } = await svc.list({
    tenantId: req.tenantId!,
    page: q.data.page,
    limit: q.data.limit,
    status: q.data.status as CallStatus | undefined,
    agentId: q.data.agentId,
    provider: q.data.provider as VoiceProvider | undefined,
    phone: q.data.phone,
    dateFrom: q.data.dateFrom,
    dateTo: q.data.dateTo,
    sortBy: q.data.sortBy,
    sortOrder: q.data.sortOrder,
  });

  return paginated(res, calls, total, q.data.page, q.data.limit);
};

/** GET /api/v1/calls/:id */
export const getCall: RequestHandler<IdParam> = async (req, res) => {
  const svc = new CallService(req.prisma!);
  const call = await svc.findById(req.params.id, req.tenantId!);
  if (!call) return errorResponse(res, 'Call not found', 'NOT_FOUND', 404);
  return success(res, call);
};

/**
 * GET /api/v1/calls/logs/remote
 * Fetch call logs directly from Omnidim.
 * Query params: agentId (our UUID), page, pageSize, call_status
 */
export const listRemoteLogs: RequestHandler = async (req, res) => {
  const { agentId, page, pageSize, call_status } = req.query as Record<string, string | undefined>;

  try {
    const svc = new CallService(req.prisma!);

    // If agentId (our UUID) provided, look up its providerAgentId
    let agentProviderAgentId: string | undefined;
    if (agentId) {
      const agent = await req.prisma!.agent.findFirst({
        where: { id: agentId, tenantId: req.tenantId! },
        select: { providerAgentId: true },
      });
      agentProviderAgentId = agent?.providerAgentId ?? undefined;
    }

    const result = await svc.listOmnidimLogs(req.tenantId!, {
      agentProviderAgentId,
      call_status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });

    return success(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch remote logs';
    if (message.includes('No credentials')) {
      return errorResponse(res, message, 'CREDENTIALS_MISSING', 400);
    }
    return errorResponse(res, 'Failed to fetch call logs from provider', 'PROVIDER_ERROR', 502);
  }
};
