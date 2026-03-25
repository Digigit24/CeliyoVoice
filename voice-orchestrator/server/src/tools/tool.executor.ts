import axios from 'axios';
import crypto from 'crypto';
import type { PrismaClient, HttpMethod, Tool } from '@prisma/client';
import { getToolForExecution } from './tool.registry';
import { getBuiltInFunction } from './functions';
import { resolveToolAuth, type ToolWithCredential } from './credentialResolver';
import { logToolExecution, type ExecutionSource } from './toolExecution.service';
import { redisClient } from '../db/redis';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'tool-executor' });

export interface ExecutionContext {
  tenantId: string;
  // Voice context (optional)
  callId?: string;
  providerCallId?: string;
  // Chat context (optional)
  conversationId?: string;
  agentId?: string;
  // MCP context
  mcpKeyId?: string;
  // User context (for TEST/DRY_RUN)
  userId?: string;
  // Execution source
  source?: ExecutionSource;
}

/** Backward-compatible alias for the voice tool worker */
export type CallContext = ExecutionContext;

/**
 * Interpolates {{variableName}} placeholders in a value with inputData.
 * Works recursively on objects and arrays.
 */
function interpolate(template: unknown, data: Record<string, unknown>): unknown {
  if (typeof template === 'string') {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const val = data[key];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }
  if (Array.isArray(template)) {
    return template.map((item) => interpolate(item, data));
  }
  if (template !== null && typeof template === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      out[k] = interpolate(v, data);
    }
    return out;
  }
  return template;
}

export class ToolExecutor {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Executes a tool by type — routes to the appropriate executor.
   * Always loads the tool fresh with credential relation for correct auth resolution.
   */
  async executeTool(
    toolId: string,
    context: ExecutionContext,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const tool = await getToolForExecution(toolId, context.tenantId, this.prisma);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found for tenant ${context.tenantId}`);
    }

    const toolType = (tool as Tool & { toolType?: string }).toolType ?? 'HTTP';

    switch (toolType) {
      case 'HTTP':
        return this.executeHttpTool(tool, context, inputData);
      case 'FUNCTION':
        return this.executeFunctionTool(tool, context, inputData);
      case 'COMPOSITE':
        throw new Error('Composite tools not yet supported');
      default:
        return this.executeHttpTool(tool, context, inputData);
    }
  }

  /**
   * Executes an HTTP tool call with credential resolution, rate limiting,
   * response caching, and execution logging.
   */
  private async executeHttpTool(
    tool: Tool,
    context: ExecutionContext,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!tool.endpoint) {
      throw new Error(`HTTP tool "${tool.name}" has no endpoint configured`);
    }

    const startTime = Date.now();
    const source: ExecutionSource = context.source ?? 'CHAT';

    const interpolationData = {
      ...inputData,
      ...(context.callId ? { callId: context.callId } : {}),
      tenantId: context.tenantId,
      ...(context.providerCallId ? { providerCallId: context.providerCallId } : {}),
      ...(context.conversationId ? { conversationId: context.conversationId } : {}),
      ...(context.agentId ? { agentId: context.agentId } : {}),
    };

    const endpoint = interpolate(tool.endpoint, interpolationData) as string;

    const body = tool.bodyTemplate
      ? interpolate(tool.bodyTemplate, interpolationData)
      : inputData;

    // ── Rate limit check ──
    await this.checkRateLimit(tool);

    // ── Cache check ──
    const cacheKey = this.buildCacheKey(tool, inputData);
    if (cacheKey) {
      const cached = await this.getCachedResponse(cacheKey);
      if (cached) {
        logToolExecution(this.prisma, {
          tenantId: context.tenantId,
          toolId: tool.id,
          toolName: tool.name,
          agentId: context.agentId,
          conversationId: context.conversationId,
          mcpKeyId: context.mcpKeyId,
          userId: context.userId,
          source,
          requestUrl: endpoint,
          requestMethod: tool.method,
          latencyMs: Date.now() - startTime,
          success: true,
          cached: true,
        });
        return cached;
      }
    }

    // ── Resolve auth via credential resolver ──
    const resolvedAuth = await resolveToolAuth(tool as ToolWithCredential, this.prisma);
    // Extract credential metadata for logging
    const credentialMeta = this.extractCredentialMeta(tool as ToolWithCredential);

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(tool.headers as Record<string, string>),
      ...resolvedAuth,
    };

    // ── HTTP call with retries ──
    let lastError: Error | null = null;
    let lastStatus: number | undefined;
    let lastResponseBody: unknown;
    const maxAttempts = tool.retries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios({
          method: tool.method as HttpMethod,
          url: endpoint,
          headers: requestHeaders,
          data: ['GET', 'DELETE'].includes(tool.method) ? undefined : body,
          params: ['GET'].includes(tool.method) ? (body as Record<string, unknown>) : undefined,
          timeout: tool.timeout * 1000,
          validateStatus: (s) => s < 500,
        });

        lastStatus = response.status;
        lastResponseBody = response.data;

        if (response.status >= 400) {
          throw new Error(`Tool responded with ${response.status}: ${JSON.stringify(response.data)}`);
        }

        log.debug(
          { toolId: tool.id, toolName: tool.name, status: response.status, attempt },
          'HTTP tool executed',
        );

        // ── Log success ──
        logToolExecution(this.prisma, {
          tenantId: context.tenantId,
          toolId: tool.id,
          toolName: tool.name,
          agentId: context.agentId,
          conversationId: context.conversationId,
          mcpKeyId: context.mcpKeyId,
          userId: context.userId,
          source,
          requestUrl: endpoint,
          requestMethod: tool.method,
          requestHeaders,
          requestBody: body as Record<string, unknown>,
          responseStatus: response.status,
          responseBody: JSON.stringify(response.data),
          latencyMs: Date.now() - startTime,
          success: true,
          retryCount: attempt - 1,
          ...credentialMeta,
        });

        // ── Cache response if configured ──
        const cacheTtl = (tool as Tool & { cacheTtlSeconds?: number | null }).cacheTtlSeconds;
        if (cacheKey && cacheTtl) {
          await this.setCachedResponse(cacheKey, response.data as Record<string, unknown>, cacheTtl);
        }

        return response.data as Record<string, unknown>;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxAttempts) {
          const delay = 500 * attempt;
          log.warn({ toolId: tool.id, attempt, delay, err: lastError.message }, 'Tool retry');
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // ── Log failure ──
    logToolExecution(this.prisma, {
      tenantId: context.tenantId,
      toolId: tool.id,
      toolName: tool.name,
      agentId: context.agentId,
      conversationId: context.conversationId,
      mcpKeyId: context.mcpKeyId,
      userId: context.userId,
      source,
      requestUrl: endpoint,
      requestMethod: tool.method,
      requestHeaders,
      requestBody: body as Record<string, unknown>,
      responseStatus: lastStatus,
      responseBody: lastResponseBody ? JSON.stringify(lastResponseBody) : undefined,
      latencyMs: Date.now() - startTime,
      success: false,
      errorMessage: lastError?.message,
      retryCount: maxAttempts - 1,
      ...credentialMeta,
    });

    throw lastError ?? new Error('Tool execution failed after retries');
  }

  /**
   * Executes a FUNCTION type tool using the built-in function registry.
   */
  private async executeFunctionTool(
    tool: Tool,
    context: ExecutionContext,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const functionName = (tool as Tool & { functionName?: string }).functionName;
    if (!functionName) {
      throw new Error(`Function tool "${tool.name}" has no functionName configured`);
    }

    const fn = getBuiltInFunction(functionName);
    if (!fn) {
      throw new Error(`Built-in function "${functionName}" not registered`);
    }

    log.debug({ toolId: tool.id, toolName: tool.name, functionName }, 'Executing function tool');
    return fn(inputData, context);
  }

  // ── Rate Limiting ─────────────────────────────────────────────────────────

  /**
   * Checks if the tool has exceeded its rate limit.
   * Uses Redis INCR + EXPIRE for a sliding window counter.
   */
  private async checkRateLimit(tool: Tool): Promise<void> {
    const limit = (tool as Tool & { rateLimitPerMinute?: number | null }).rateLimitPerMinute;
    if (!limit) return;

    const key = `ratelimit:${tool.tenantId}:${tool.id}`;

    try {
      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, 60);
      }

      if (current > limit) {
        throw Object.assign(
          new Error(`Tool "${tool.name}" rate limit exceeded (${limit}/min). Try again shortly.`),
          { code: 'TOOL_RATE_LIMITED', statusCode: 429 },
        );
      }
    } catch (err) {
      // Re-throw rate limit errors, swallow Redis failures
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'TOOL_RATE_LIMITED') {
        throw err;
      }
      log.warn({ err, toolId: tool.id }, 'Rate limit check failed — proceeding without limit');
    }
  }

  // ── Response Caching ──────────────────────────────────────────────────────

  /**
   * Builds a cache key from tool ID + sorted input hash.
   * Returns null if caching is not configured for this tool.
   */
  private buildCacheKey(tool: Tool, inputData: Record<string, unknown>): string | null {
    const ttl = (tool as Tool & { cacheTtlSeconds?: number | null }).cacheTtlSeconds;
    if (!ttl) return null;

    const sortedInput = JSON.stringify(inputData, Object.keys(inputData).sort());
    const inputHash = crypto.createHash('sha256').update(sortedInput).digest('hex').slice(0, 16);
    return `toolcache:${tool.tenantId}:${tool.id}:${inputHash}`;
  }

  /**
   * Gets a cached response. Returns null on miss.
   */
  private async getCachedResponse(cacheKey: string): Promise<Record<string, unknown> | null> {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        log.debug({ cacheKey }, 'Tool response served from cache');
        return JSON.parse(cached) as Record<string, unknown>;
      }
    } catch (err) {
      log.warn({ err, cacheKey }, 'Cache read failed — proceeding without cache');
    }
    return null;
  }

  /**
   * Stores a response in cache with the configured TTL.
   */
  private async setCachedResponse(
    cacheKey: string,
    data: Record<string, unknown>,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await redisClient.set(cacheKey, JSON.stringify(data), 'EX', ttlSeconds);
      log.debug({ cacheKey, ttlSeconds }, 'Tool response cached');
    } catch (err) {
      log.warn({ err, cacheKey }, 'Cache write failed');
    }
  }

  /**
   * Extracts credential metadata from a tool for logging purposes.
   */
  private extractCredentialMeta(tool: ToolWithCredential): {
    credentialId?: string;
    credentialName?: string;
    authType?: string;
  } {
    if (tool.credentialId && tool.credential?.isActive) {
      return {
        credentialId: tool.credential.id,
        credentialName: tool.credential.name,
        authType: tool.credential.authType,
      };
    }
    return { authType: tool.authType };
  }
}
