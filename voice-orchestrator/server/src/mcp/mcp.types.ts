// JSON-RPC 2.0
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// MCP protocol types
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Full context extracted from a verified MCP API key (or JWT session).
 * Passed through the request lifecycle so the MCP server can resolve
 * the correct tool set and personalize the initialize response.
 */
export interface McpKeyContext {
  tenantId: string;
  /** The McpApiKey.id, or 'jwt-session' for JWT-authenticated requests. */
  keyId: string;
  /** Display name of this virtual MCP server. */
  keyName: string;
  /** Optional description returned in the initialize response. */
  keyDescription?: string;
  /** Tool access scope: "ALL" | "AGENT" | "CUSTOM" */
  scope: string;
  /** If scope=AGENT, the target agent's ID. */
  agentId?: string | null;
  /** If scope=CUSTOM, the explicit list of tool IDs to expose. */
  toolIds: string[];
}
