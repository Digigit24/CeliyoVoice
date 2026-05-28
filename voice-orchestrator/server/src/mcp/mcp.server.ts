import { Server } from '@modelcontextprotocol/sdk/server';
import { ListToolsRequestSchema, CallToolRequestSchema, type CallToolRequest } from '@modelcontextprotocol/sdk/types';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { McpKeyContext, McpToolDef } from './mcp.types';
import { ToolExecutor, type ExecutionContext } from '../tools/tool.executor';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'mcp-server' });

// ── Tool resolver ─────────────────────────────────────────────────────────────

/**
 * Resolves the visible tool list for a given MCP key context.
 * Exported for use by the key-tools API endpoint.
 */
export async function resolveToolsForContext(ctx: McpKeyContext, prisma: PrismaClient): Promise<McpToolDef[]> {
  const { tenantId, scope, agentId, toolIds } = ctx;

  switch (scope) {
    case 'AGENT': {
      if (!agentId) return [];
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
          inputSchema: (at.tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
        }));
    }

    case 'CUSTOM': {
      if (!toolIds || toolIds.length === 0) return [];
      const selectedTools = await prisma.tool.findMany({
        where: {
          tenantId,
          id: { in: toolIds },
          isActive: true,
          inputSchema: { not: Prisma.JsonNull },
        },
        orderBy: { name: 'asc' },
      });
      return selectedTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      }));
    }

    case 'ALL':
    default: {
      const allTools = await prisma.tool.findMany({
        where: {
          tenantId,
          isActive: true,
          inputSchema: { not: Prisma.JsonNull },
        },
        orderBy: { name: 'asc' },
      });
      return allTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      }));
    }
  }
}

// ── Server factory ────────────────────────────────────────────────────────────

/**
 * Creates a new MCP SDK `Server` instance pre-wired with dynamic tool handlers
 * for the given tenant context.
 *
 * One server instance is created per SSE connection so each connection gets
 * its own isolated, context-aware tool scope.
 */
export function createMcpServer(ctx: McpKeyContext, prisma: PrismaClient): Server {
  const serverName = ctx.keyName
    ? `celiyo-${ctx.keyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    : 'celiyo-mcp';

  const server = new Server(
    { name: serverName, version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ── tools/list ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await resolveToolsForContext(ctx, prisma);
    log.debug({ tenantId: ctx.tenantId, scope: ctx.scope, toolCount: tools.length }, 'MCP tools/list');
    return { tools };
  });

  // ── tools/call ──────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name: toolName, arguments: args = {} } = request.params;
    const { tenantId, scope, agentId, toolIds, keyId } = ctx;

    // Resolve tool by name, scoped to tenant
    const tool = await prisma.tool.findFirst({
      where: { tenantId, name: toolName, isActive: true },
    });

    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Error: Tool "${toolName}" not found or inactive.` }],
        isError: true,
      };
    }

    // Scope gate — ensure key is allowed to call this tool
    if (scope === 'AGENT' && agentId) {
      const attached = await prisma.agentTool.findFirst({
        where: { agentId, toolId: tool.id, tenantId },
      });
      if (!attached) {
        return {
          content: [{ type: 'text' as const, text: `Error: Tool "${toolName}" is not attached to this agent.` }],
          isError: true,
        };
      }
    } else if (scope === 'CUSTOM') {
      if (!toolIds.includes(tool.id)) {
        return {
          content: [{ type: 'text' as const, text: `Error: Tool "${toolName}" is not in this server's allowed tool set.` }],
          isError: true,
        };
      }
    }

    const startTime = Date.now();
    try {
      const executor = new ToolExecutor(prisma);
      const execCtx: ExecutionContext = {
        tenantId,
        agentId: agentId ?? undefined,
        mcpKeyId: keyId,
        source: 'MCP',
      };
      const result = await executor.executeTool(tool.id, execCtx, args as Record<string, unknown>);
      const durationMs = Date.now() - startTime;
      log.info({ toolName, tenantId, durationMs, success: true }, 'MCP tool executed');

      const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text: resultText }] };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Tool execution failed';
      log.error({ toolName, tenantId, durationMs, error: message }, 'MCP tool execution failed');

      // Return a structured, LLM-friendly error
      return {
        content: [{
          type: 'text' as const,
          text: `Error from CRM: ${message}. Please verify the input and try again, or contact support if the issue persists.`,
        }],
        isError: true,
      };
    }
  });

  return server;
}
