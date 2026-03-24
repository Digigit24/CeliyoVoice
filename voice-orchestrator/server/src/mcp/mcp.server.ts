import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { JsonRpcRequest, JsonRpcResponse, McpToolDef, McpToolCallResult, McpKeyContext } from './mcp.types';
import { ToolExecutor, type ExecutionContext } from '../tools/tool.executor';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'mcp-server' });

export class McpServer {
  constructor(private readonly prisma: PrismaClient) {}

  async handleRequest(
    request: JsonRpcRequest,
    ctx: McpKeyContext,
  ): Promise<JsonRpcResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request, ctx.keyName, ctx.keyDescription);
        case 'notifications/initialized':
          return { jsonrpc: '2.0', id: request.id, result: {} };
        case 'tools/list':
          return this.handleToolsList(request, ctx);
        case 'tools/call':
          return this.handleToolsCall(request, ctx);
        case 'ping':
          return { jsonrpc: '2.0', id: request.id, result: {} };
        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      log.error({ err, method: request.method }, 'MCP request error');
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32603, message },
      };
    }
  }

  private handleInitialize(
    req: JsonRpcRequest,
    keyName?: string,
    keyDescription?: string,
  ): JsonRpcResponse {
    const serverSlug = keyName
      ? `celiyo-${keyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
      : 'celiyo-mcp';
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: serverSlug,
          version: '1.0.0',
          ...(keyDescription ? { description: keyDescription } : {}),
        },
      },
    };
  }

  /**
   * Resolve tools for the given key context. Public so the key-tools API
   * endpoint can reuse the same logic.
   */
  async resolveTools(ctx: McpKeyContext): Promise<McpToolDef[]> {
    const { tenantId, scope, agentId, toolIds } = ctx;

    switch (scope) {
      case 'AGENT': {
        if (!agentId) return [];
        const agentTools = await this.prisma.agentTool.findMany({
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
        const selectedTools = await this.prisma.tool.findMany({
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
        const allTools = await this.prisma.tool.findMany({
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

  private async handleToolsList(
    req: JsonRpcRequest,
    ctx: McpKeyContext,
  ): Promise<JsonRpcResponse> {
    const tools = await this.resolveTools(ctx);
    log.debug({ tenantId: ctx.tenantId, scope: ctx.scope, toolCount: tools.length }, 'MCP tools/list');
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: { tools },
    };
  }

  private async handleToolsCall(
    req: JsonRpcRequest,
    ctx: McpKeyContext,
  ): Promise<JsonRpcResponse> {
    const { tenantId, scope, agentId, toolIds } = ctx;
    const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    const toolName = params?.name;
    const args = params?.arguments ?? {};

    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32602, message: 'Missing tool name' },
      };
    }

    // Find tool by name, scoped to tenant
    const tool = await this.prisma.tool.findFirst({
      where: { tenantId, name: toolName, isActive: true },
    });

    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32602, message: `Tool "${toolName}" not found` },
      };
    }

    // Scope validation: ensure the tool is within this key's allowed set
    if (scope === 'AGENT' && agentId) {
      const attached = await this.prisma.agentTool.findFirst({
        where: { agentId, toolId: tool.id, tenantId },
      });
      if (!attached) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32602, message: `Tool "${toolName}" is not attached to this agent` },
        };
      }
    } else if (scope === 'CUSTOM') {
      if (!toolIds.includes(tool.id)) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32602, message: `Tool "${toolName}" is not in this server's allowed tool set` },
        };
      }
    }

    // Execute
    const startTime = Date.now();
    try {
      const executor = new ToolExecutor(this.prisma);
      const context: ExecutionContext = { tenantId, agentId: agentId ?? undefined };
      const result = await executor.executeTool(tool.id, context, args);

      const durationMs = Date.now() - startTime;
      log.info({ toolName, durationMs, success: true }, 'MCP tool executed');

      const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const mcpResult: McpToolCallResult = {
        content: [{ type: 'text', text: resultText }],
      };

      return { jsonrpc: '2.0', id: req.id, result: mcpResult };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Tool execution failed';
      log.error({ toolName, durationMs, error: message }, 'MCP tool execution failed');

      const mcpResult: McpToolCallResult = {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };

      return { jsonrpc: '2.0', id: req.id, result: mcpResult };
    }
  }
}
