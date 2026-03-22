import type { PrismaClient, Agent, Conversation } from '@prisma/client';
import type { LLMProvider as LLMProviderEnum } from '@prisma/client';
import { getLLMProvider } from '../llm/llmRouter';
import { recordUsage } from '../llm/llmUsage.service';
import type {
  LLMMessage,
  LLMChatResponse,
  ToolDefinition,
} from '../llm/interfaces/llmProvider.interface';
import { ConversationService } from './conversation.service';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'chat-service' });

/** Max messages loaded from history for LLM context. */
const DEFAULT_HISTORY_LIMIT = 50;

/** Max messages per conversation before refusing new messages. */
const MAX_MESSAGES_PER_CONVERSATION = 1000;

export interface ChatInput {
  message: string;
  conversationId?: string;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChatResult {
  conversationId: string;
  message: {
    id: string;
    role: string;
    content: string;
    tokenCount: number | null;
    createdAt: Date;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export class ChatService {
  private readonly conversationSvc: ConversationService;

  constructor(private readonly prisma: PrismaClient) {
    this.conversationSvc = new ConversationService(prisma);
  }

  /**
   * Handles a non-streaming chat message.
   */
  async handleMessage(
    tenantId: string,
    agentId: string,
    userId: string,
    input: ChatInput,
  ): Promise<ChatResult> {
    // 1. Load and validate agent
    const agent = await this.loadAgent(tenantId, agentId);

    // 2. Resolve or create conversation
    const conversation = await this.resolveConversation(
      tenantId,
      userId,
      agentId,
      input.conversationId,
    );

    // 3. Check message limit
    const msgCount = await this.conversationSvc.getMessageCount(conversation.id);
    if (msgCount >= MAX_MESSAGES_PER_CONVERSATION) {
      throw Object.assign(
        new Error('Conversation has reached the maximum message limit. Please start a new conversation.'),
        { statusCode: 400, code: 'MESSAGE_LIMIT_REACHED' },
      );
    }

    // 4. Store user message
    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'USER',
        content: input.message,
        metadata: input.metadata ? (input.metadata as object) : undefined,
      },
    });

    // 5. Build LLM messages
    const llmMessages = await this.buildMessageHistory(agent, conversation.id);

    // 6. Load agent tools
    const toolDefs = await this.loadAgentTools(agentId, tenantId);

    // 7. Resolve LLM provider
    const providerName = (agent.llmProvider ?? 'OPENAI') as LLMProviderEnum;
    let llmProvider;
    try {
      llmProvider = await getLLMProvider(providerName, tenantId, this.prisma);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to resolve LLM provider';
      // Save error as assistant message
      await this.prisma.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: 'error',
          metadata: { error: true, errorMessage: errMsg },
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
      throw Object.assign(new Error(errMsg), { statusCode: 502, code: 'LLM_PROVIDER_ERROR' });
    }

    // 8. Call LLM
    log.debug(
      { agentId, conversationId: conversation.id, provider: providerName, messageCount: llmMessages.length },
      'Calling LLM',
    );

    let finalResponse: LLMChatResponse;
    try {
      const response = await llmProvider.chat({
        messages: llmMessages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        model: agent.llmModel ?? undefined,
        temperature: this.getTemperature(agent),
        maxTokens: this.getMaxTokens(agent),
      });

      // 9. Handle tool calls (single round — execute tools and get final response)
      finalResponse = response;
      if (response.toolCalls.length > 0) {
        finalResponse = await this.executeToolLoop(
          llmMessages,
          response,
          toolDefs,
          llmProvider,
          agent,
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'LLM call failed';
      log.error({ err, agentId, conversationId: conversation.id }, 'LLM call error');
      // Save error as assistant message
      await this.prisma.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: 'error',
          metadata: { error: true, errorMessage: errMsg },
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
      throw Object.assign(new Error(errMsg), { statusCode: 502, code: 'LLM_ERROR' });
    }

    // 10. Store assistant message
    const assistantMsg = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: finalResponse.content ?? '',
        tokenCount: finalResponse.usage.totalTokens,
        metadata: {
          model: finalResponse.model,
          finishReason: finalResponse.finishReason,
        },
      },
    });

    // 11. Update conversation lastMessageAt
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // 12. Track usage (fire-and-forget)
    recordUsage(this.prisma, {
      tenantId,
      agentId,
      conversationId: conversation.id,
      provider: providerName,
      model: finalResponse.model,
      inputTokens: finalResponse.usage.inputTokens,
      outputTokens: finalResponse.usage.outputTokens,
      totalTokens: finalResponse.usage.totalTokens,
    });

    return {
      conversationId: conversation.id,
      message: {
        id: assistantMsg.id,
        role: 'assistant',
        content: finalResponse.content ?? '',
        tokenCount: assistantMsg.tokenCount,
        createdAt: assistantMsg.createdAt,
      },
      usage: finalResponse.usage,
    };
  }

  /**
   * Handles a streaming chat message via SSE.
   * Yields LLMStreamEvents and handles persistence after stream completes.
   */
  async *handleMessageStream(
    tenantId: string,
    agentId: string,
    userId: string,
    input: ChatInput,
  ): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
    // 1. Load and validate agent
    const agent = await this.loadAgent(tenantId, agentId);

    // 2. Resolve or create conversation
    const conversation = await this.resolveConversation(
      tenantId,
      userId,
      agentId,
      input.conversationId,
    );

    // 3. Check message limit
    const msgCount = await this.conversationSvc.getMessageCount(conversation.id);
    if (msgCount >= MAX_MESSAGES_PER_CONVERSATION) {
      yield {
        event: 'error',
        data: { error: 'Conversation has reached the maximum message limit.' },
      };
      return;
    }

    // 4. Store user message
    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'USER',
        content: input.message,
        metadata: input.metadata ? (input.metadata as object) : undefined,
      },
    });

    // 5. Build LLM messages
    const llmMessages = await this.buildMessageHistory(agent, conversation.id);

    // 6. Load agent tools
    const toolDefs = await this.loadAgentTools(agentId, tenantId);

    // 7. Resolve LLM provider
    const providerName = (agent.llmProvider ?? 'OPENAI') as LLMProviderEnum;
    const llmProvider = await getLLMProvider(providerName, tenantId, this.prisma);

    // 8. Create placeholder message ID
    const assistantMsg = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: '', // will be updated after stream completes
      },
    });

    yield {
      event: 'message_start',
      data: { conversationId: conversation.id, messageId: assistantMsg.id },
    };

    // 9. Stream LLM response
    let fullContent = '';
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let finishReason = 'stop';
    let hadError = false;

    try {
      const stream = llmProvider.chatStream({
        messages: llmMessages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        model: agent.llmModel ?? undefined,
        temperature: this.getTemperature(agent),
        maxTokens: this.getMaxTokens(agent),
        stream: true,
      });

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            if (event.content) {
              fullContent += event.content;
              yield { event: 'text_delta', data: { content: event.content } };
            }
            break;
          case 'tool_call_start':
            yield { event: 'tool_call_start', data: { toolCall: event.toolCall ?? {} } };
            break;
          case 'tool_call_delta':
            yield { event: 'tool_call_delta', data: { content: event.content ?? '' } };
            break;
          case 'tool_call_end':
            yield { event: 'tool_call_end', data: { toolCall: event.toolCall ?? {} } };
            break;
          case 'done':
            if (event.usage) usage = event.usage;
            break;
          case 'error':
            hadError = true;
            yield { event: 'error', data: { error: event.error ?? 'Unknown stream error' } };
            break;
        }
      }
    } catch (err) {
      hadError = true;
      const message = err instanceof Error ? err.message : 'Stream failed';
      log.error({ err, agentId, conversationId: conversation.id }, 'LLM stream error');
      fullContent = fullContent || 'error';
      finishReason = 'error';
      yield { event: 'error', data: { error: message } };
    }

    // 10. Update assistant message with full content (save "error" if failed)
    await this.prisma.message.update({
      where: { id: assistantMsg.id },
      data: {
        content: hadError && !fullContent ? 'error' : fullContent,
        tokenCount: usage.totalTokens || null,
        metadata: { model: agent.llmModel, finishReason, ...(hadError ? { error: true } : {}) },
      },
    });

    // 11. Update conversation
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // 12. Track usage
    recordUsage(this.prisma, {
      tenantId,
      agentId,
      conversationId: conversation.id,
      provider: providerName,
      model: agent.llmModel ?? providerName,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });

    yield {
      event: 'message_end',
      data: { usage, finishReason },
    };
    yield { event: 'done', data: {} };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadAgent(tenantId: string, agentId: string): Promise<Agent> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, tenantId },
    });

    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    if (!agent.isActive) {
      throw Object.assign(new Error('Agent is inactive'), { statusCode: 400, code: 'AGENT_INACTIVE' });
    }
    if (agent.agentType === 'VOICE') {
      throw Object.assign(
        new Error('This agent is voice-only and does not support chat'),
        { statusCode: 400, code: 'AGENT_TYPE_MISMATCH' },
      );
    }
    return agent;
  }

  private async resolveConversation(
    tenantId: string,
    userId: string,
    agentId: string,
    conversationId?: string,
  ): Promise<Conversation> {
    if (conversationId) {
      const existing = await this.conversationSvc.findById(conversationId, tenantId);
      if (!existing) {
        throw Object.assign(
          new Error('Conversation not found'),
          { statusCode: 404, code: 'NOT_FOUND' },
        );
      }
      if (existing.agentId !== agentId) {
        throw Object.assign(
          new Error('Conversation does not belong to this agent'),
          { statusCode: 400, code: 'CONVERSATION_AGENT_MISMATCH' },
        );
      }
      if (existing.status !== 'ACTIVE') {
        throw Object.assign(
          new Error('Conversation is not active'),
          { statusCode: 400, code: 'CONVERSATION_NOT_ACTIVE' },
        );
      }
      return existing;
    }

    return this.conversationSvc.create(tenantId, userId, agentId, 'CHAT_API');
  }

  private async buildMessageHistory(
    agent: Agent,
    conversationId: string,
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];

    // System prompt
    if (agent.systemPrompt) {
      messages.push({ role: 'system', content: agent.systemPrompt });
    }

    // Load recent messages from conversation
    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_HISTORY_LIMIT,
    });

    // Reverse to chronological order
    for (const msg of history.reverse()) {
      const role = this.mapMessageRole(msg.role);
      if (role) {
        messages.push({
          role,
          content: msg.content,
          ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
        });
      }
    }

    return messages;
  }

  private mapMessageRole(
    dbRole: string,
  ): 'system' | 'user' | 'assistant' | 'tool' | null {
    switch (dbRole) {
      case 'SYSTEM':
        return 'system';
      case 'USER':
        return 'user';
      case 'ASSISTANT':
        return 'assistant';
      case 'TOOL_RESULT':
        return 'tool';
      default:
        return null;
    }
  }

  private async loadAgentTools(agentId: string, tenantId: string): Promise<ToolDefinition[]> {
    const agentTools = await this.prisma.agentTool.findMany({
      where: { agentId, tenantId },
      include: { tool: true },
      orderBy: { priority: 'asc' },
    });

    return agentTools
      .filter((at) => at.tool.isActive)
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

  private getTemperature(agent: Agent): number | undefined {
    const tc = agent.typeConfig as Record<string, unknown> | null;
    if (tc && typeof tc.temperature === 'number') return tc.temperature;
    return undefined;
  }

  private getMaxTokens(agent: Agent): number | undefined {
    const tc = agent.typeConfig as Record<string, unknown> | null;
    if (tc && typeof tc.maxTokens === 'number') return tc.maxTokens;
    return undefined;
  }

  /**
   * Simple single-round tool execution loop.
   * Executes tool calls, feeds results back to LLM, returns final response.
   */
  private async executeToolLoop(
    messages: LLMMessage[],
    firstResponse: LLMChatResponse,
    toolDefs: ToolDefinition[],
    llmProvider: { chat: (req: { messages: LLMMessage[]; tools?: ToolDefinition[]; model?: string; temperature?: number; maxTokens?: number }) => Promise<LLMChatResponse> },
    agent: Agent,
    maxRounds = 5,
  ): Promise<LLMChatResponse> {
    let currentResponse = firstResponse;
    const currentMessages = [...messages];

    for (let round = 0; round < maxRounds; round++) {
      if (currentResponse.toolCalls.length === 0) break;

      // Add assistant message with tool calls
      currentMessages.push({
        role: 'assistant',
        content: currentResponse.content ?? '',
        toolCalls: currentResponse.toolCalls,
      });

      // Execute each tool call (placeholder — tools are HTTP endpoints, would need HTTP execution)
      for (const tc of currentResponse.toolCalls) {
        log.info({ toolName: tc.name, toolCallId: tc.id }, 'Tool call requested (stub)');
        // TODO: Actually execute the HTTP tool using the Tool model's endpoint/auth config
        currentMessages.push({
          role: 'tool',
          content: JSON.stringify({ status: 'error', message: 'Tool execution not yet implemented' }),
          toolCallId: tc.id,
        });
      }

      // Call LLM again with tool results
      currentResponse = await llmProvider.chat({
        messages: currentMessages,
        tools: toolDefs,
        model: agent.llmModel ?? undefined,
        temperature: this.getTemperature(agent),
        maxTokens: this.getMaxTokens(agent),
      });
    }

    return currentResponse;
  }
}
