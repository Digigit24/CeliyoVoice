// ── Shared LLM types ──────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;     // for role: 'tool'
  toolCalls?: ToolCall[];   // for role: 'assistant' when LLM wants to call tools
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>; // parsed JSON
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface LLMChatRequest {
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  model?: string;           // override the default model
  stream?: boolean;
}

export interface LLMChatResponse {
  content: string | null;
  toolCalls: ToolCall[];    // empty array if no tool calls
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;            // actual model used
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  raw: Record<string, unknown>; // raw provider response
}

export interface LLMStreamEvent {
  type: 'text_delta' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done' | 'error';
  content?: string;
  toolCall?: Partial<ToolCall>;
  usage?: LLMChatResponse['usage'];
  error?: string;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface ILLMProvider {
  readonly providerType: string; // "OPENAI" | "ANTHROPIC" etc.

  chat(request: LLMChatRequest): Promise<LLMChatResponse>;

  chatStream(request: LLMChatRequest): AsyncIterable<LLMStreamEvent>;
}

export interface LLMCredentials {
  apiKey: string;
  apiUrl?: string;
}
