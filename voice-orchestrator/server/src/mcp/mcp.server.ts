import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { JsonRpcRequest, JsonRpcResponse, McpToolDef, McpToolCallResult } from './mcp.types';
import { ToolExecutor, type ExecutionContext } from '../tools/tool.executor';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'mcp-server' });

export class McpServer {
  constructor(private readonly prisma: PrismaClient) {}

  async handleRequest(
    request: JsonRpcRequest,
    tenantId: string,
    agentId?: string | null,
  ): Promise<JsonRpcResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        case 'notifications/initialized':
          return { jsonrpc: '2.0', id: request.id, result: {} };
        case 'tools/list':
          return this.handleToolsList(request, tenantId, agentId);
        case 'tools/call':
          return this.handleToolsCall(request, tenantId, agentId);
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

  private handleInitialize(req: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'celiyo-mcp', version: '1.0.0' },
      },
    };
  }

  private async handleToolsList(
    req: JsonRpcRequest,
    tenantId: string,
    agentId?: string | null,
  ): Promise<JsonRpcResponse> {
    let tools: McpToolDef[];

    if (agentId) {
      // Scoped to agent — only tools attached via AgentTool
      const agentTools = await this.prisma.agentTool.findMany({
        where: { agentId, tenantId },
        include: { tool: true },
        orderBy: { priority: 'asc' },
      });
      tools = agentTools
        .filter((at) => at.tool.isActive && at.tool.inputSchema)
        .map((at) => ({
          name: at.tool.name,
          description: at.whenToUse
            ? `${at.tool.description}\n\nWhen to use: ${at.whenToUse}`
            : at.tool.description,
          inputSchema: (at.tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
        }));
    } else {
      // All active tools for tenant with inputSchema
      const allTools = await this.prisma.tool.findMany({
        where: {
          tenantId,
          isActive: true,
          inputSchema: { not: Prisma.JsonNull },
        },
        orderBy: { name: 'asc' },
      });
      tools = allTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      }));
    }

    log.debug({ tenantId, agentId, toolCount: tools.length }, 'MCP tools/list');

    return {
      jsonrpc: '2.0',
      id: req.id,
      result: { tools },
    };
  }

  private async handleToolsCall(
    req: JsonRpcRequest,
    tenantId: string,
    agentId?: string | null,
  ): Promise<JsonRpcResponse> {
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

    // Find tool by name
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

    // If scoped to agent, verify tool is attached
    if (agentId) {
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
