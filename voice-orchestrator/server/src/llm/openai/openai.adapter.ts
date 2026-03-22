import OpenAI from 'openai';
import type {
  ILLMProvider,
  LLMChatRequest,
  LLMChatResponse,
  LLMStreamEvent,
  LLMCredentials,
  LLMMessage,
  ToolCall,
  ToolDefinition,
} from '../interfaces/llmProvider.interface';
import { OPENAI_DEFAULT_MODEL, OPENAI_DEFAULT_MAX_TOKENS } from './openai.types';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger({ component: 'openai-adapter' });

export class OpenAIAdapter implements ILLMProvider {
  readonly providerType = 'OPENAI';
  private readonly client: OpenAI;

  constructor(credentials: LLMCredentials) {
    this.client = new OpenAI({
      apiKey: credentials.apiKey,
      ...(credentials.apiUrl ? { baseURL: credentials.apiUrl } : {}),
    });
  }

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    const model = request.model ?? OPENAI_DEFAULT_MODEL;
    const messages = this.mapMessages(request.messages);
    const tools = request.tools ? this.mapTools(request.tools) : undefined;

    log.debug({ model, messageCount: messages.length, hasTools: !!tools }, 'OpenAI chat request');

    const response = await this.client.chat.completions.create({
      model,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      temperature: request.temperature,
      max_tokens: request.maxTokens ?? OPENAI_DEFAULT_MAX_TOKENS,
    });

    const choice = response.choices[0]!;
    const toolCalls = this.extractToolCalls(choice.message.tool_calls);

    return {
      content: choice.message.content,
      toolCalls,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
      finishReason: this.mapFinishReason(choice.finish_reason),
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async *chatStream(request: LLMChatRequest): AsyncIterable<LLMStreamEvent> {
    const model = request.model ?? OPENAI_DEFAULT_MODEL;
    const messages = this.mapMessages(request.messages);
    const tools = request.tools ? this.mapTools(request.tools) : undefined;

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      temperature: request.temperature,
      max_tokens: request.maxTokens ?? OPENAI_DEFAULT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    });

    // Track tool calls being accumulated across deltas
    const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Text content delta
      if (delta?.content) {
        yield { type: 'text_delta', content: delta.content };
      }

      // Tool call deltas
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;

          if (tc.id) {
            // New tool call starting
            pendingToolCalls.set(idx, { id: tc.id, name: tc.function?.name ?? '', args: '' });
            yield {
              type: 'tool_call_start',
              toolCall: { id: tc.id, name: tc.function?.name ?? '' },
            };
          }

          const pending = pendingToolCalls.get(idx);
          if (pending && tc.function?.arguments) {
            pending.args += tc.function.arguments;
            if (!tc.id && tc.function.name) {
              pending.name = tc.function.name;
            }
            yield {
              type: 'tool_call_delta',
              toolCall: { id: pending.id, name: pending.name },
              content: tc.function.arguments,
            };
          }
        }
      }

      // Check for finish
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === 'tool_calls') {
        // Emit tool_call_end for each pending
        for (const [, tc] of pendingToolCalls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.args) as Record<string, unknown>;
          } catch { /* keep empty */ }
          yield {
            type: 'tool_call_end',
            toolCall: { id: tc.id, name: tc.name, arguments: parsedArgs },
          };
        }
      }

      // Usage in final chunk
      if (chunk.usage) {
        yield {
          type: 'done',
          usage: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          },
        };
      }
    }
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private mapMessages(
    messages: LLMMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
      switch (msg.role) {
        case 'system':
          return { role: 'system', content: msg.content };
        case 'user':
          return { role: 'user', content: msg.content };
        case 'assistant':
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            return {
              role: 'assistant',
              content: msg.content || null,
              tool_calls: msg.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            };
          }
          return { role: 'assistant', content: msg.content };
        case 'tool':
          return {
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.toolCallId!,
          };
        default:
          return { role: 'user', content: msg.content };
      }
    });
  }

  private mapTools(
    tools: ToolDefinition[],
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  private extractToolCalls(
    toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  ): ToolCall[] {
    if (!toolCalls) return [];
    return toolCalls
      .filter((tc) => tc.type === 'function')
      .map((tc) => {
        const fn = (tc as { function: { name: string; arguments: string } }).function;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn.arguments) as Record<string, unknown>;
        } catch { /* keep empty */ }
        return { id: tc.id, name: fn.name, arguments: args };
      });
  }

  private mapFinishReason(
    reason: string | null,
  ): LLMChatResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      default:
        return 'stop';
    }
  }
}
