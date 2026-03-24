import axios from 'axios';
import type { PrismaClient, HttpMethod, Tool } from '@prisma/client';
import { getToolForExecution } from './tool.registry';
import { getBuiltInFunction } from './functions';
import { resolveToolAuth, type ToolWithCredential } from './credentialResolver';
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
   * Executes an HTTP tool call (the original implementation).
   */
  private async executeHttpTool(
    tool: Tool,
    context: ExecutionContext,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!tool.endpoint) {
      throw new Error(`HTTP tool "${tool.name}" has no endpoint configured`);
    }

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

    const authHeaders = await resolveToolAuth(tool as ToolWithCredential, this.prisma);

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
          url: endpoint,
          headers: requestHeaders,
          data: ['GET', 'DELETE'].includes(tool.method) ? undefined : body,
          params: ['GET'].includes(tool.method) ? (body as Record<string, unknown>) : undefined,
          timeout: tool.timeout * 1000,
          validateStatus: (s) => s < 500,
        });

        if (response.status >= 400) {
          throw new Error(`Tool responded with ${response.status}: ${JSON.stringify(response.data)}`);
        }

        log.debug(
          { toolId: tool.id, toolName: tool.name, status: response.status, attempt },
          'HTTP tool executed',
        );

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
}
