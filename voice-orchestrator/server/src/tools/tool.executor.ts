import axios from 'axios';
import type { PrismaClient, HttpMethod, ToolAuthType } from '@prisma/client';
import { getToolById } from './tool.registry';
import { logger } from '../utils/logger';

export interface CallContext {
  callId: string;
  tenantId: string;
  providerCallId: string;
}

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

function buildAuthHeaders(authType: ToolAuthType, authConfig: Record<string, unknown>): Record<string, string> {
  switch (authType) {
    case 'API_KEY': {
      const headerName = String(authConfig['headerName'] ?? 'X-API-Key');
      const key = String(authConfig['apiKey'] ?? '');
      return { [headerName]: key };
    }
    case 'BEARER': {
      const token = String(authConfig['token'] ?? '');
      return { Authorization: `Bearer ${token}` };
    }
    case 'NONE':
    case 'OAUTH':
    default:
      return {};
  }
}

export class ToolExecutor {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Executes a tool HTTP call.
   *
   * 1. Fetches tool definition from DB (via registry cache).
   * 2. Builds the request headers (including auth).
   * 3. Interpolates the body template with input data.
   * 4. Makes the HTTP request with timeout + retries.
   * 5. Returns the response data.
   */
  async executeTool(
    toolId: string,
    context: CallContext,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const tool = await getToolById(toolId, context.tenantId, this.prisma);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found for tenant ${context.tenantId}`);
    }

    const interpolationData = {
      ...inputData,
      callId: context.callId,
      tenantId: context.tenantId,
      providerCallId: context.providerCallId,
    };

    const body = tool.bodyTemplate
      ? interpolate(tool.bodyTemplate, interpolationData)
      : inputData;

    const authHeaders = buildAuthHeaders(
      tool.authType as ToolAuthType,
      tool.authConfig as Record<string, unknown>,
    );

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(tool.headers as Record<string, string>),
      ...authHeaders,
    };

    let lastError: Error | null = null;
    const maxAttempts = tool.retries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios({
          method: tool.method as HttpMethod,
          url: tool.endpoint,
          headers: requestHeaders,
          data: ['GET', 'DELETE'].includes(tool.method) ? undefined : body,
          params: ['GET'].includes(tool.method) ? (body as Record<string, unknown>) : undefined,
          timeout: tool.timeout * 1000,
          validateStatus: (s) => s < 500,
        });

        if (response.status >= 400) {
          throw new Error(`Tool responded with ${response.status}: ${JSON.stringify(response.data)}`);
        }

        logger.debug(
          { toolId, toolName: tool.name, status: response.status, attempt },
          'Tool executed',
        );

        return response.data as Record<string, unknown>;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxAttempts) {
          const delay = 500 * attempt;
          logger.warn({ toolId, attempt, delay, err: lastError.message }, 'Tool retry');
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error('Tool execution failed after retries');
  }
}
