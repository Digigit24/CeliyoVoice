import type { RequestHandler } from 'express';
import { CallService } from './call.service';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import { callDispatchLogger } from '../utils/logger';
import { StartCallSchema, ListCallsQuerySchema } from './validators/call.validators';
import type { CallStatus, VoiceProvider } from '@prisma/client';

type IdParam = { id: string };

// Duck-typed provider error shape — both Omnidim and Bolna use these names/fields
type ProviderError = Error & { statusCode?: number; raw?: unknown };

function isProviderAuthError(err: unknown): err is ProviderError {
  return err instanceof Error && err.name === 'ProviderAuthError';
}

function isProviderApiError(err: unknown): err is ProviderError {
  return err instanceof Error && err.name === 'ProviderApiError';
}

/** POST /api/v1/calls/start */
export const startCall: RequestHandler = async (req, res) => {
  const parsed = StartCallSchema.safeParse(req.body);
  if (!parsed.success) {
    callDispatchLogger.warn(
      { tenantId: req.tenantId, userId: req.userId, validationErrors: parsed.error.flatten() },
      'dispatch-call: validation failed',
    );
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const { agentId, phone } = parsed.data;

  callDispatchLogger.info(
    { tenantId: req.tenantId, userId: req.userId, agentId, phone },
    'dispatch-call: request received',
  );

  const svc = new CallService(req.prisma!);
  try {
    const call = await svc.startCall(req.tenantId!, req.userId!, parsed.data);

    callDispatchLogger.info(
      { tenantId: req.tenantId, callId: call.id, provider: call.provider, status: call.status, providerCallId: call.providerCallId },
      'dispatch-call: success',
    );

    return success(res, call, 202);
  } catch (err) {
    // Provider authentication failure (bad/expired API key)
    if (isProviderAuthError(err)) {
      callDispatchLogger.error(
        { tenantId: req.tenantId, agentId, phone, message: err.message },
        'dispatch-call: provider authentication failed',
      );
      return errorResponse(res, err.message, 'PROVIDER_AUTH_ERROR', 401);
    }

    // Provider returned a non-2xx HTTP response — surface its status and body
    if (isProviderApiError(err)) {
      const providerStatus = (err as ProviderError).statusCode ?? 502;
      // Map provider 5xx → 502 Bad Gateway; pass provider 4xx through as-is
      const httpStatus = providerStatus >= 500 ? 502 : providerStatus;

      callDispatchLogger.error(
        {
          tenantId: req.tenantId,
          agentId,
          phone,
          providerStatus,
          providerRaw: (err as ProviderError).raw,
          message: err.message,
        },
        'dispatch-call: provider API error',
      );

      return errorResponse(
        res,
        err.message,
        'PROVIDER_API_ERROR',
        httpStatus,
        (err as ProviderError).raw ?? undefined,
      );
    }

    // Application-level errors (agent not found, missing providerAgentId, etc.)
    const appErr = err as Error & { statusCode?: number };
    callDispatchLogger.error(
      { tenantId: req.tenantId, agentId, phone, message: appErr.message, statusCode: appErr.statusCode },
      'dispatch-call: error',
    );
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
 * GET /api/v1/calls/logs/bolna
 * Fetch execution logs from Bolna for an agent.
 * Query params: agentId (our UUID), page, pageSize
 */
export const listBolnaLogs: RequestHandler = async (req, res) => {
  const { agentId, page, pageSize } = req.query as Record<string, string | undefined>;

  try {
    const svc = new CallService(req.prisma!);

    let agentProviderAgentId: string | undefined;
    if (agentId) {
      const agent = await req.prisma!.agent.findFirst({
        where: { id: agentId, tenantId: req.tenantId! },
        select: { providerAgentId: true },
      });
      agentProviderAgentId = agent?.providerAgentId ?? undefined;
    }

    const result = await svc.listBolnaExecutions(req.tenantId!, {
      agentProviderAgentId,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });

    return success(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Bolna logs';
    if (message.includes('No credentials')) {
      return errorResponse(res, message, 'CREDENTIALS_MISSING', 400);
    }
    return errorResponse(res, 'Failed to fetch call logs from Bolna', 'PROVIDER_ERROR', 502);
  }
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
