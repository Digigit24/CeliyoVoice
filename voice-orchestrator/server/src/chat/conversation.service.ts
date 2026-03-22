import type { PrismaClient, Conversation, ConversationStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface ConversationListOptions {
  tenantId: string;
  page: number;
  limit: number;
  agentId?: string;
  status?: ConversationStatus;
  search?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    tenantId: string,
    ownerUserId: string,
    agentId: string,
    channel: 'CHAT_API' | 'CHAT_WIDGET' | 'VOICE' | 'INTERNAL' = 'CHAT_API',
  ): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: {
        tenantId,
        ownerUserId,
        agentId,
        channel,
        status: 'ACTIVE',
      },
    });
  }

  async findById(id: string, tenantId: string): Promise<Conversation | null> {
    return this.prisma.conversation.findFirst({
      where: { id, tenantId, status: { not: 'DELETED' } },
    });
  }

  async findByIdWithMessages(
    id: string,
    tenantId: string,
    messageLimit = 50,
  ): Promise<(Conversation & { messages: unknown[]; _count: { messages: number } }) | null> {
    return this.prisma.conversation.findFirst({
      where: { id, tenantId, status: { not: 'DELETED' } },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: messageLimit,
        },
        _count: { select: { messages: true } },
      },
    });
  }

  async list(opts: ConversationListOptions): Promise<{ conversations: Conversation[]; total: number }> {
    const where: Prisma.ConversationWhereInput = {
      tenantId: opts.tenantId,
      status: opts.status ?? { not: 'DELETED' },
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
      ...(opts.search
        ? { title: { contains: opts.search, mode: 'insensitive' as Prisma.QueryMode } }
        : {}),
    };

    const orderBy: Prisma.ConversationOrderByWithRelationInput =
      opts.sortBy === 'lastMessageAt'
        ? { lastMessageAt: opts.sortOrder }
        : opts.sortBy === 'createdAt'
          ? { createdAt: opts.sortOrder }
          : { updatedAt: opts.sortOrder };

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy,
        include: {
          _count: { select: { messages: true } },
          agent: { select: { id: true, name: true, agentType: true } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return { conversations, total };
  }

  async listMessages(
    conversationId: string,
    tenantId: string,
    page: number,
    limit: number,
  ) {
    const where = { conversationId, tenantId };

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { messages, total };
  }

  async update(
    id: string,
    tenantId: string,
    data: { title?: string; status?: 'ACTIVE' | 'ARCHIVED' },
  ): Promise<Conversation | null> {
    const existing = await this.prisma.conversation.findFirst({
      where: { id, tenantId, status: { not: 'DELETED' } },
    });
    if (!existing) return null;

    return this.prisma.conversation.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.prisma.conversation.findFirst({
      where: { id, tenantId, status: { not: 'DELETED' } },
    });
    if (!existing) return false;

    await this.prisma.conversation.update({
      where: { id },
      data: { status: 'DELETED' },
    });
    return true;
  }

  async getMessageCount(conversationId: string): Promise<number> {
    return this.prisma.message.count({ where: { conversationId } });
  }
}
