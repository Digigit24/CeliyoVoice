import type { PrismaClient } from '@prisma/client';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'tool-execution-log' });

const MAX_RESPONSE_BODY_LENGTH = 10 * 1024; // 10KB

export type ExecutionSource = 'CHAT' | 'MCP' | 'VOICE' | 'TEST' | 'DRY_RUN';

export interface ExecutionLogEntry {
  tenantId: string;
  toolId: string;
  toolName: string;
  agentId?: string;
  conversationId?: string;
  mcpKeyId?: string;
  userId?: string;
  source: ExecutionSource;

  requestUrl?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;

  responseStatus?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;

  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  cached?: boolean;
  retryCount?: number;

  credentialId?: string;
  credentialName?: string;
  authType?: string;
}

/**
 * Masks sensitive headers before storing in the log.
 */
function maskHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const masked: Record<string, string> = {};
  const sensitiveKeys = ['authorization', 'x-api-key', 'cookie', 'set-cookie'];

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.includes(key.toLowerCase()) && value.length > 8) {
      masked[key] = value.slice(0, 8) + '****';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * Truncates response body to prevent DB bloat.
 */
function truncateBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  if (str.length > MAX_RESPONSE_BODY_LENGTH) {
    return str.slice(0, MAX_RESPONSE_BODY_LENGTH) + '\n... [truncated]';
  }
  return str;
}

/**
 * Logs a tool execution. Fire-and-forget — does not block the caller.
 */
export function logToolExecution(prisma: PrismaClient, entry: ExecutionLogEntry): void {
  prisma.toolExecution.create({
    data: {
      tenantId: entry.tenantId,
      toolId: entry.toolId,
      toolName: entry.toolName,
      agentId: entry.agentId,
      conversationId: entry.conversationId,
      mcpKeyId: entry.mcpKeyId,
      userId: entry.userId,
      source: entry.source,
      requestUrl: entry.requestUrl,
      requestMethod: entry.requestMethod,
      requestHeaders: maskHeaders(entry.requestHeaders) as object | undefined,
      requestBody: entry.requestBody as object | undefined,
      responseStatus: entry.responseStatus,
      responseBody: truncateBody(entry.responseBody),
      responseHeaders: entry.responseHeaders as object | undefined,
      latencyMs: entry.latencyMs,
      success: entry.success,
      errorMessage: entry.errorMessage,
      cached: entry.cached ?? false,
      retryCount: entry.retryCount ?? 0,
      credentialId: entry.credentialId,
      credentialName: entry.credentialName,
      authType: entry.authType,
    },
  }).catch((err) => {
    log.error({ err, toolName: entry.toolName }, 'Failed to log tool execution');
  });
}
