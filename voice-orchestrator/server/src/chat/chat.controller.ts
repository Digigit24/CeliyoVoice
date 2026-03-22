import type { RequestHandler } from 'express';
import { ChatService } from './chat.service';
import { ConversationService } from './conversation.service';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import {
  ChatMessageSchema,
  ListConversationsQuerySchema,
  ListMessagesQuerySchema,
  UpdateConversationSchema,
} from './chat.validators';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'chat-controller' });

type AgentIdParam = { id: string };
type ConversationIdParam = { id: string };

// ── Chat endpoint ────────────────────────────────────────────────────────────

/** POST /api/v1/agents/:id/chat */
export const chatWithAgent: RequestHandler<AgentIdParam> = async (req, res) => {
  const parsed = ChatMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new ChatService(req.prisma!);
  const { id: agentId } = req.params;
  const tenantId = req.tenantId!;
  const userId = req.userId!;

  // Streaming response
  if (parsed.data.stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    try {
      const stream = svc.handleMessageStream(tenantId, agentId, userId, parsed.data);

      for await (const { event, data } of stream) {
        if (closed) break;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    } catch (err) {
      const appErr = err as { statusCode?: number; code?: string; message: string };
      if (!closed) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: appErr.message, code: appErr.code ?? 'INTERNAL_ERROR' })}\n\n`,
        );
      }
      log.error({ err, agentId, tenantId }, 'Chat stream error');
    }

    if (!closed) {
      res.end();
    }
    return;
  }

  // Non-streaming response
  try {
    const result = await svc.handleMessage(tenantId, agentId, userId, parsed.data);
    return success(res, result);
  } catch (err) {
    const appErr = err as { statusCode?: number; code?: string; message: string };
    const status = appErr.statusCode ?? 500;
    const code = appErr.code ?? 'INTERNAL_ERROR';
    return errorResponse(res, appErr.message, code, status);
  }
};

// ── Conversation endpoints ───────────────────────────────────────────────────

/** GET /api/v1/conversations */
export const listConversations: RequestHandler = async (req, res) => {
  const q = ListConversationsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return errorResponse(res, 'Invalid query params', 'VALIDATION_ERROR', 400);
  }

  const svc = new ConversationService(req.prisma!);
  const { conversations, total } = await svc.list({
    tenantId: req.tenantId!,
    page: q.data.page,
    limit: q.data.limit,
    agentId: q.data.agentId,
    status: q.data.status,
    search: q.data.search,
    sortBy: q.data.sortBy,
    sortOrder: q.data.sortOrder,
  });

  return paginated(res, conversations, total, q.data.page, q.data.limit);
};

/** GET /api/v1/conversations/:id */
export const getConversation: RequestHandler<ConversationIdParam> = async (req, res) => {
  const svc = new ConversationService(req.prisma!);
  const conversation = await svc.findByIdWithMessages(req.params.id, req.tenantId!);

  if (!conversation) return errorResponse(res, 'Conversation not found', 'NOT_FOUND', 404);
  return success(res, conversation);
};

/** GET /api/v1/conversations/:id/messages */
export const listConversationMessages: RequestHandler<ConversationIdParam> = async (req, res) => {
  const q = ListMessagesQuerySchema.safeParse(req.query);
  if (!q.success) {
    return errorResponse(res, 'Invalid query params', 'VALIDATION_ERROR', 400);
  }

  const convSvc = new ConversationService(req.prisma!);
  const conversation = await convSvc.findById(req.params.id, req.tenantId!);
  if (!conversation) return errorResponse(res, 'Conversation not found', 'NOT_FOUND', 404);

  const { messages, total } = await convSvc.listMessages(
    req.params.id,
    req.tenantId!,
    q.data.page,
    q.data.limit,
  );

  return paginated(res, messages, total, q.data.page, q.data.limit);
};

/** PATCH /api/v1/conversations/:id */
export const updateConversation: RequestHandler<ConversationIdParam> = async (req, res) => {
  const parsed = UpdateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new ConversationService(req.prisma!);
  const updated = await svc.update(req.params.id, req.tenantId!, parsed.data);

  if (!updated) return errorResponse(res, 'Conversation not found', 'NOT_FOUND', 404);
  return success(res, updated);
};

/** DELETE /api/v1/conversations/:id */
export const deleteConversation: RequestHandler<ConversationIdParam> = async (req, res) => {
  const svc = new ConversationService(req.prisma!);
  const deleted = await svc.softDelete(req.params.id, req.tenantId!);

  if (!deleted) return errorResponse(res, 'Conversation not found', 'NOT_FOUND', 404);
  return success(res, { deleted: true });
};
