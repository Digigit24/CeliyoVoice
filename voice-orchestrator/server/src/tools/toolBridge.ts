import type { PrismaClient } from '@prisma/client';
import _get from 'lodash/get';
import type { ToolDefinition, ToolCall } from '../llm/interfaces/llmProvider.interface';
import { ToolExecutor, type ExecutionContext } from './tool.executor';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'tool-bridge' });

/**
 * Load tools for an agent — merges individual AgentTool bindings and
 * toolkit (AgentToolkit) subscriptions. Deduplicates by tool name;
 * explicit AgentTool bindings take priority (carry whenToUse/priority).
 */
export async function getToolDefinitionsForAgent(
  agentId: string,
  tenantId: string,
  prisma: PrismaClient,
): Promise<ToolDefinition[]> {
  // Individual tool bindings
  const agentTools = await prisma.agentTool.findMany({
    where: { agentId, tenantId },
    include: { tool: true },
    orderBy: { priority: 'asc' },
  });

  // Toolkit subscriptions
  const toolkitSubs = await prisma.agentToolkit.findMany({
    where: { agentId, tenantId },
    include: {
      tag: {
        include: {
          tools: { include: { tool: true } },
        },
      },
    },
  });

  // Build merged map (by tool name, individual binding wins)
  const toolMap = new Map<string, { tool: typeof agentTools[0]['tool']; whenToUse: string | null }>();

  // First pass: individual bindings (ordered by priority)
  for (const at of agentTools) {
    if (!at.tool.isActive || !at.tool.inputSchema) continue;
    toolMap.set(at.tool.name, { tool: at.tool, whenToUse: at.whenToUse });
  }

  // Second pass: toolkit tools (only if name not already present)
  for (const sub of toolkitSubs) {
    for (const assignment of sub.tag.tools) {
      const t = assignment.tool;
      if (!t.isActive || !t.inputSchema) continue;
      if (!toolMap.has(t.name)) {
        toolMap.set(t.name, { tool: t, whenToUse: null });
      }
    }
  }

  return Array.from(toolMap.values()).map(({ tool, whenToUse }) => ({
    name: tool.name,
    description: whenToUse
      ? `${tool.description}\n\nWhen to use: ${whenToUse}`
      : tool.description,
    inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
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
 * Resolves the tool from both AgentTool and AgentToolkit subscriptions.
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
    // Try to find via AgentTool junction first (explicit binding with whenToUse metadata)
    let tool = await prisma.agentTool.findFirst({
      where: { agentId, tenantId, tool: { name: toolCall.name } },
      include: { tool: true },
    }).then((at) => at?.tool ?? null);

    // Fall back to toolkit-sourced tools
    if (!tool) {
      const toolkitSubs = await prisma.agentToolkit.findMany({
        where: { agentId, tenantId },
        include: {
          tag: {
            include: { tools: { include: { tool: true } } },
          },
        },
      });
      for (const sub of toolkitSubs) {
        const found = sub.tag.tools.find((a) => a.tool.name === toolCall.name);
        if (found) { tool = found.tool; break; }
      }
    }

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: JSON.stringify({ error: `Tool "${toolCall.name}" is not attached to this agent` }),
        success: false,
        error: 'Tool not attached',
        durationMs: Date.now() - startTime,
      };
    }

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
      source: 'CHAT',
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
      resultString = importMeta.responseMapping.summaryTemplate.replace(
        /\{\{([^}]+)\}\}/g,
        (_, path: string) => {
          const val = _get(rawResult, path.trim());
          return val !== undefined ? String(val) : `{{${path}}}`;
        },
      );
    } else if (importMeta?.responseMapping?.extractFields?.length) {
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
