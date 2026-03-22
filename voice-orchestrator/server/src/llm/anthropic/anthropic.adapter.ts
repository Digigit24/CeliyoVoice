import Anthropic from '@anthropic-ai/sdk';
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
import { ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_DEFAULT_MAX_TOKENS } from './anthropic.types';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger({ component: 'anthropic-adapter' });

export class AnthropicAdapter implements ILLMProvider {
  readonly providerType = 'ANTHROPIC';
  private readonly client: Anthropic;

  constructor(credentials: LLMCredentials) {
    this.client = new Anthropic({
      apiKey: credentials.apiKey,
      ...(credentials.apiUrl ? { baseURL: credentials.apiUrl } : {}),
    });
  }

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    const model = request.model ?? ANTHROPIC_DEFAULT_MODEL;
    const { systemMessage, messages } = this.splitSystem(request.messages);
    const tools = request.tools ? this.mapTools(request.tools) : undefined;

    log.debug({ model, messageCount: messages.length, hasTools: !!tools }, 'Anthropic chat request');

    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      ...(systemMessage ? { system: systemMessage } : {}),
      messages: this.mapMessages(messages),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    });

    const content = this.extractTextContent(response.content);
    const toolCalls = this.extractToolCalls(response.content);

    return {
      content,
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: this.mapStopReason(response.stop_reason),
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async *chatStream(request: LLMChatRequest): AsyncIterable<LLMStreamEvent> {
    const model = request.model ?? ANTHROPIC_DEFAULT_MODEL;
    const { systemMessage, messages } = this.splitSystem(request.messages);
    const tools = request.tools ? this.mapTools(request.tools) : undefined;

    const stream = this.client.messages.stream({
      model,
      max_tokens: request.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      ...(systemMessage ? { system: systemMessage } : {}),
      messages: this.mapMessages(messages),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start': {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            yield {
              type: 'tool_call_start',
              toolCall: { id: block.id, name: block.name },
            };
          }
          break;
        }

        case 'content_block_delta': {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            yield { type: 'text_delta', content: delta.text };
          } else if (delta.type === 'input_json_delta') {
            yield {
              type: 'tool_call_delta',
              content: delta.partial_json,
            };
          }
          break;
        }

        case 'content_block_stop': {
          // We don't have enough context here to know if it was a tool_use block,
          // but we can emit tool_call_end when we see the final message
          break;
        }

        case 'message_delta': {
          if (event.usage) {
            // Anthropic streams output_tokens in message_delta
          }
          break;
        }

        case 'message_stop':
          break;
      }
    }

    // Emit final usage from the accumulated message
    const finalMessage = await stream.finalMessage();
    const toolCalls = this.extractToolCalls(finalMessage.content);

    for (const tc of toolCalls) {
      yield { type: 'tool_call_end', toolCall: tc };
    }

    yield {
      type: 'done',
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      },
    };
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  /**
   * Anthropic requires system messages to be passed separately, not in the messages array.
   */
  private splitSystem(messages: LLMMessage[]): {
    systemMessage: string | undefined;
    messages: LLMMessage[];
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const systemMessage = systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join('\n\n')
      : undefined;
    return { systemMessage, messages: nonSystemMessages };
  }

  private mapMessages(messages: LLMMessage[]): Anthropic.Messages.MessageParam[] {
    return messages.map((msg): Anthropic.Messages.MessageParam => {
      switch (msg.role) {
        case 'user':
          return { role: 'user', content: msg.content };
        case 'assistant':
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const content: Anthropic.Messages.ContentBlockParam[] = [];
            if (msg.content) {
              content.push({ type: 'text', text: msg.content });
            }
            for (const tc of msg.toolCalls) {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.arguments,
              });
            }
            return { role: 'assistant', content };
          }
          return { role: 'assistant', content: msg.content };
        case 'tool':
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.toolCallId!,
                content: msg.content,
              },
            ],
          };
        default:
          return { role: 'user', content: msg.content };
      }
    });
  }

  private mapTools(tools: ToolDefinition[]): Anthropic.Messages.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Messages.Tool['input_schema'],
    }));
  }

  private extractTextContent(content: Anthropic.Messages.ContentBlock[]): string | null {
    const textBlocks = content.filter((b) => b.type === 'text');
    if (textBlocks.length === 0) return null;
    return textBlocks.map((b) => (b as Anthropic.Messages.TextBlock).text).join('');
  }

  private extractToolCalls(content: Anthropic.Messages.ContentBlock[]): ToolCall[] {
    return content
      .filter((b) => b.type === 'tool_use')
      .map((b) => {
        const block = b as Anthropic.Messages.ToolUseBlock;
        return {
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        };
      });
  }

  private mapStopReason(
    reason: string | null,
  ): LLMChatResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }
}
