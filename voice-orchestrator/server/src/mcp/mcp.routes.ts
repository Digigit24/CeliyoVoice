import { Router, type Request, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import { mcpAuth } from './mcp.auth';
import { McpServer } from './mcp.server';
import { defaultPrismaClient } from '../db/client';
import type { JsonRpcRequest } from './mcp.types';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'mcp-routes' });

export const mcpRouter = Router();

// ── SSE connections ──────────────────────────────────────────────────────────

const sseConnections = new Map<string, Response>();

/** GET /mcp/sse — SSE connection endpoint */
mcpRouter.get('/sse', mcpAuth, (req: Request, res: Response) => {
  const sessionId = uuid();
  const messagesUrl = `/mcp/messages?sessionId=${sessionId}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send the messages endpoint URL
  res.write(`event: endpoint\ndata: ${messagesUrl}\n\n`);

  sseConnections.set(sessionId, res);

  // Attach tenant context to session
  (res as unknown as { mcpTenantId: string }).mcpTenantId = req.tenantId!;
  (res as unknown as { mcpAgentId?: string | null }).mcpAgentId =
    (req as unknown as { mcpAgentId?: string | null }).mcpAgentId ?? null;

  // Keepalive ping
  const interval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
    sseConnections.delete(sessionId);
    log.debug({ sessionId }, 'MCP SSE connection closed');
  });

  log.info({ sessionId, tenantId: req.tenantId }, 'MCP SSE connection opened');
});

/** POST /mcp/messages — JSON-RPC request endpoint */
mcpRouter.post('/messages', mcpAuth, async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const body = req.body as JsonRpcRequest;

  if (!body?.jsonrpc || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC request' },
    });
  }

  const tenantId = req.tenantId!;
  const agentId = (req as unknown as { mcpAgentId?: string | null }).mcpAgentId;

  const server = new McpServer(defaultPrismaClient);
  const response = await server.handleRequest(body, tenantId, agentId);

  // If SSE session exists, also send through SSE
  if (sessionId && sseConnections.has(sessionId)) {
    const sseRes = sseConnections.get(sessionId)!;
    sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }

  // Always respond in the POST body too (for compatibility)
  return res.json(response);
});

/** GET /mcp/health — MCP server health (no auth) */
mcpRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    server: 'celiyo-mcp',
    version: '1.0.0',
    protocol: '2024-11-05',
    activeSessions: sseConnections.size,
  });
});
