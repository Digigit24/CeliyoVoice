import { Router, type Request, type Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse';
import { mcpAuth } from './mcp.auth';
import { createMcpServer, resolveToolsForContext } from './mcp.server';
import { defaultPrismaClient } from '../db/client';
import type { McpKeyContext } from './mcp.types';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'mcp-routes' });

export const mcpRouter = Router();

// ── Session store ─────────────────────────────────────────────────────────────

interface ActiveSession {
  transport: SSEServerTransport;
  tenantId: string;
  keyId: string;
  connectedAt: Date;
}

/** In-memory session registry — keyed by transport.sessionId (UUID) */
const activeSessions = new Map<string, ActiveSession>();

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /mcp/sse — opens an authenticated SSE connection */
mcpRouter.get('/sse', mcpAuth, async (req: Request, res: Response) => {
  const ctx = (req as unknown as { mcpKeyContext: McpKeyContext }).mcpKeyContext;

  const transport = new SSEServerTransport('/mcp/messages', res);
  const server = createMcpServer(ctx, defaultPrismaClient);

  // Connect SDK server to this transport — this also starts the SSE stream
  await server.connect(transport);

  const connectedAt = new Date();
  const sessionId = transport.sessionId;

  activeSessions.set(sessionId, {
    transport,
    tenantId: ctx.tenantId,
    keyId: ctx.keyId,
    connectedAt,
  });

  // Persist McpSession to DB for monitoring dashboards (only for API key sessions).
  // Cast needed until `npm run db:generate` is run after migration.
  if (ctx.keyId !== 'jwt-session') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (defaultPrismaClient as any).mcpSession.create({
      data: {
        id: sessionId,
        tenantId: ctx.tenantId,
        keyId: ctx.keyId,
        clientIp: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        connectedAt,
        lastPingAt: connectedAt,
      },
    }).catch((err: unknown) => log.warn({ err, sessionId }, 'Failed to persist McpSession'));
  }

  log.info(
    { sessionId, tenantId: ctx.tenantId, keyId: ctx.keyId, scope: ctx.scope },
    'MCP SSE connection opened',
  );

  // Cleanup on disconnect
  server.onclose = async () => {
    activeSessions.delete(sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (defaultPrismaClient as any).mcpSession
      .deleteMany({ where: { id: sessionId } })
      .catch(() => {});
    log.debug({ sessionId }, 'MCP SSE connection closed');
  };
});

/**
 * POST /mcp/messages — accepts JSON-RPC messages for an existing session.
 *
 * Auth is implicit: the sessionId is a cryptographically random UUID issued
 * at SSE connect time, so knowledge of it proves prior authentication.
 */
mcpRouter.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;

  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId query parameter' });
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'MCP session not found or expired — reconnect via GET /mcp/sse' });
    return;
  }

  // Update lastPingAt (fire-and-forget)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (defaultPrismaClient as any).mcpSession
    .updateMany({ where: { id: sessionId }, data: { lastPingAt: new Date() } })
    .catch(() => {});

  await session.transport.handlePostMessage(req, res, req.body);
});

/** GET /mcp/health — liveness probe (no auth) */
mcpRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    server: 'celiyo-mcp',
    version: '1.0.0',
    protocol: '2024-11-05',
    activeSessions: activeSessions.size,
  });
});

/** GET /mcp/stats — active connection stats for the calling tenant */
mcpRouter.get('/stats', mcpAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const perKey: Record<string, number> = {};
  let total = 0;

  for (const [, session] of activeSessions) {
    if (session.tenantId === tenantId) {
      total++;
      perKey[session.keyId] = (perKey[session.keyId] ?? 0) + 1;
    }
  }

  res.json({ totalConnections: total, perKey });
});

/** GET /mcp/keys/:keyId/tools — preview the tools exposed by a given key */
mcpRouter.get('/keys/:keyId/tools', mcpAuth, async (req: Request, res: Response) => {
  const ctx = (req as unknown as { mcpKeyContext: McpKeyContext }).mcpKeyContext;
  const tools = await resolveToolsForContext(ctx, defaultPrismaClient);
  res.json({ tools, count: tools.length });
});
