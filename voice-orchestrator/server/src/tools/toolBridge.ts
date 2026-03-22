import type { PrismaClient } from '@prisma/client';
import _get from 'lodash/get';
import type { ToolDefinition, ToolCall } from '../llm/interfaces/llmProvider.interface';
import { ToolExecutor, type ExecutionContext } from './tool.executor';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'tool-bridge' });

/**
 * Load tools attached to an agent and convert to LLM ToolDefinition[].
 */
export async function getToolDefinitionsForAgent(
  agentId: string,
  tenantId: string,
  prisma: PrismaClient,
): Promise<ToolDefinition[]> {
  const agentTools = await prisma.agentTool.findMany({
    where: { agentId, tenantId },
    include: { tool: true },
    orderBy: { priority: 'asc' },
  });

  return agentTools
    .filter((at) => at.tool.isActive && at.tool.inputSchema)
    .map((at) => ({
      name: at.tool.name,
      description: at.whenToUse
        ? `${at.tool.description}\n\nWhen to use: ${at.whenToUse}`
        : at.tool.description,
      inputSchema: (at.tool.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    }));
}

export interface ToolCallResult {
  toolCallId: string;
  name: string;
  result: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Execute a tool call from the LLM and return the result as a string.
 */
export async function executeToolCall(
  toolCall: ToolCall,
  agentId: string,
  tenantId: string,
  prisma: PrismaClient,
  context?: { conversationId?: string },
): Promise<ToolCallResult> {
  const startTime = Date.now();

  try {
    // Find the AgentTool junction by tool name + agentId
    const agentTool = await prisma.agentTool.findFirst({
      where: {
        agentId,
        tenantId,
        tool: { name: toolCall.name },
      },
      include: { tool: true },
    });

    if (!agentTool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: JSON.stringify({ error: `Tool "${toolCall.name}" is not attached to this agent` }),
        success: false,
        error: 'Tool not attached',
        durationMs: Date.now() - startTime,
      };
    }

    const tool = agentTool.tool;

    // Basic required-field validation against inputSchema
    const schema = tool.inputSchema as { required?: string[] } | null;
    if (schema?.required) {
      for (const field of schema.required) {
        if (toolCall.arguments[field] === undefined || toolCall.arguments[field] === null) {
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: JSON.stringify({ error: `Missing required field: ${field}` }),
            success: false,
            error: `Missing required field: ${field}`,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }

    // Execute the tool
    const executor = new ToolExecutor(prisma);
    const execContext: ExecutionContext = {
      tenantId,
      agentId,
      conversationId: context?.conversationId,
    };

    const rawResult = await executor.executeTool(tool.id, execContext, toolCall.arguments);

    // Apply responseMapping from importMeta if present
    const importMeta = tool.importMeta as {
      responseMapping?: {
        extractFields?: string[];
        summaryTemplate?: string;
      };
    } | null;

    let resultString: string;

    if (importMeta?.responseMapping?.summaryTemplate) {
      // Interpolate template with response data
      resultString = importMeta.responseMapping.summaryTemplate.replace(
        /\{\{([^}]+)\}\}/g,
        (_, path: string) => {
          const val = _get(rawResult, path.trim());
          return val !== undefined ? String(val) : `{{${path}}}`;
        },
      );
    } else if (importMeta?.responseMapping?.extractFields?.length) {
      // Pick only specified fields
      const extracted: Record<string, unknown> = {};
      for (const field of importMeta.responseMapping.extractFields) {
        extracted[field] = _get(rawResult, field);
      }
      resultString = JSON.stringify(extracted);
    } else {
      resultString = JSON.stringify(rawResult);
    }

    const durationMs = Date.now() - startTime;
    log.info(
      { toolName: toolCall.name, toolCallId: toolCall.id, durationMs, success: true },
      'Tool call executed',
    );

    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      result: resultString,
      success: true,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    log.error(
      { toolName: toolCall.name, toolCallId: toolCall.id, durationMs, error: errorMsg },
      'Tool call failed',
    );

    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      result: JSON.stringify({ error: errorMsg }),
      success: false,
      error: errorMsg,
      durationMs,
    };
  }
}
