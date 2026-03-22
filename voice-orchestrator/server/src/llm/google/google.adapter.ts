import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse, type Part } from '@google/genai';
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
import { GOOGLE_DEFAULT_MODEL, GOOGLE_DEFAULT_MAX_TOKENS } from './google.types';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger({ component: 'google-adapter' });

export class GoogleAdapter implements ILLMProvider {
  readonly providerType = 'GOOGLE';
  private readonly client: GoogleGenAI;

  constructor(credentials: LLMCredentials) {
    this.client = new GoogleGenAI({
      apiKey: credentials.apiKey,
      ...(credentials.apiUrl ? { httpOptions: { baseUrl: credentials.apiUrl } } : {}),
    });
  }

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    const model = request.model ?? GOOGLE_DEFAULT_MODEL;
    const { systemInstruction, contents } = this.splitSystemAndContents(request.messages);
    const tools = request.tools ? this.mapTools(request.tools) : undefined;

    log.debug({ model, messageCount: contents.length, hasTools: !!tools }, 'Google chat request');

    const response = await this.client.models.generateContent({
      model,
      contents,
      ...(systemInstruction ? { config: {
        systemInstruction,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens ?? GOOGLE_DEFAULT_MAX_TOKENS,
        ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
      } } : { config: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens ?? GOOGLE_DEFAULT_MAX_TOKENS,
        ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
      } }),
    });

    const content = this.extractTextContent(response);
    const toolCalls = this.extractToolCalls(response);
    const usage = response.usageMetadata;

    return {
      content,
      toolCalls,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      model,
      finishReason: this.mapFinishReason(response),
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async *chatStream(request: LLMChatRequest): AsyncIterable<LLMStreamEvent> {
    const model = request.model ?? GOOGLE_DEFAULT_MODEL;
    const { systemInstruction, contents } = this.splitSystemAndContents(request.messages);
    const tools = request.tools ? this.mapTools(request.tools) : undefined;

    const stream = await this.client.models.generateContentStream({
      model,
      contents,
      ...(systemInstruction ? { config: {
        systemInstruction,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens ?? GOOGLE_DEFAULT_MAX_TOKENS,
        ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
      } } : { config: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens ?? GOOGLE_DEFAULT_MAX_TOKENS,
        ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
      } }),
    });

    let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for await (const chunk of stream) {
      // Text deltas
      const text = chunk.text;
      if (text) {
        yield { type: 'text_delta', content: text };
      }

      // Function calls in stream
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.functionCall) {
          const fc = part.functionCall;
          const callId = `call_${fc.name}_${Date.now()}`;
          yield {
            type: 'tool_call_start',
            toolCall: { id: callId, name: fc.name ?? '' },
          };
          yield {
            type: 'tool_call_end',
            toolCall: {
              id: callId,
              name: fc.name ?? '',
              arguments: (fc.args ?? {}) as Record<string, unknown>,
            },
          };
        }
      }

      // Usage metadata
      if (chunk.usageMetadata) {
        totalUsage = {
          inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
        };
      }
    }

    yield { type: 'done', usage: totalUsage };
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  /**
   * Gemini uses systemInstruction separately, not in the contents array.
   */
  private splitSystemAndContents(messages: LLMMessage[]): {
    systemInstruction: string | undefined;
    contents: Content[];
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const systemInstruction = systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join('\n\n')
      : undefined;
    return { systemInstruction, contents: this.mapContents(nonSystemMessages) };
  }

  private mapContents(messages: LLMMessage[]): Content[] {
    return messages.map((msg): Content => {
      switch (msg.role) {
        case 'user':
          return { role: 'user', parts: [{ text: msg.content }] };
        case 'assistant': {
          const parts: Part[] = [];
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              parts.push({
                functionCall: { name: tc.name, args: tc.arguments },
              });
            }
          }
          return { role: 'model', parts };
        }
        case 'tool':
          return {
            role: 'user',
            parts: [{
              functionResponse: {
                name: msg.toolCallId ?? 'unknown',
                response: this.safeParseJson(msg.content),
              },
            }],
          };
        default:
          return { role: 'user', parts: [{ text: msg.content }] };
      }
    });
  }

  private mapTools(tools: ToolDefinition[]): FunctionDeclaration[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as FunctionDeclaration['parameters'],
    }));
  }

  private extractTextContent(response: GenerateContentResponse): string | null {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const textParts = parts.filter((p) => p.text);
    if (textParts.length === 0) return null;
    return textParts.map((p) => p.text).join('');
  }

  private extractToolCalls(response: GenerateContentResponse): ToolCall[] {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    return parts
      .filter((p) => p.functionCall)
      .map((p) => {
        const fc = p.functionCall!;
        return {
          id: `call_${fc.name}_${Date.now()}`,
          name: fc.name ?? '',
          arguments: (fc.args ?? {}) as Record<string, unknown>,
        };
      });
  }

  private mapFinishReason(response: GenerateContentResponse): LLMChatResponse['finishReason'] {
    const reason = response.candidates?.[0]?.finishReason;
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      default: {
        // Check if there are function calls — that means tool_calls finish
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        if (parts.some((p) => p.functionCall)) return 'tool_calls';
        return 'stop';
      }
    }
  }

  private safeParseJson(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { result: text };
    }
  }
}
