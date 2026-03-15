import type { PrismaClient, Agent, VoiceProvider } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { getProvider } from '../providers/providerRouter';
import { logger } from '../utils/logger';
import type { CreateAgentInput, UpdateAgentInput } from './validators/agent.validators';

export interface AgentWithCallCount extends Agent {
  _count: { calls: number };
}

export interface AgentListOptions {
  tenantId: string;
  page: number;
  limit: number;
  provider?: VoiceProvider;
  isActive?: boolean;
  search?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export class AgentService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    tenantId: string,
    ownerUserId: string,
    input: CreateAgentInput,
  ): Promise<{ agent: Agent; warning?: string }> {
    // Save agent to local DB first
    const agent = await this.prisma.agent.create({
      data: {
        tenantId,
        ownerUserId,
        name: input.name,
        provider: input.provider as VoiceProvider,
        voiceLanguage: input.voiceLanguage,
        voiceModel: input.voiceModel,
        systemPrompt: input.systemPrompt,
        knowledgebaseId: input.knowledgebaseId,
        tools: (input.tools ?? []) as Prisma.InputJsonValue,
        workflowId: input.workflowId,
        maxConcurrentCalls: input.maxConcurrentCalls,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      },
    });

    // Sync to provider — if it fails, the agent is still saved locally
    try {
      const adapter = await getProvider(input.provider as VoiceProvider, tenantId, this.prisma);
      const result = await adapter.createAgent({
        name: input.name,
        voiceLanguage: input.voiceLanguage,
        voiceModel: input.voiceModel,
        systemPrompt: input.systemPrompt,
        knowledgebaseId: input.knowledgebaseId,
        tools: input.tools,
        workflowId: input.workflowId,
        maxConcurrentCalls: input.maxConcurrentCalls,
        metadata: input.metadata,
      });

      const synced = await this.prisma.agent.update({
        where: { id: agent.id },
        data: { providerAgentId: result.providerAgentId },
      });

      return { agent: synced };
    } catch (err) {
      logger.warn({ err, agentId: agent.id }, 'Failed to sync agent to provider');
      return {
        agent,
        warning: `Agent saved locally but failed to sync with provider: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async list(opts: AgentListOptions): Promise<{ agents: AgentWithCallCount[]; total: number }> {
    const where: Prisma.AgentWhereInput = {
      tenantId: opts.tenantId,
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
      ...(opts.search
        ? { name: { contains: opts.search, mode: 'insensitive' as Prisma.QueryMode } }
        : {}),
    };

    const orderBy: Prisma.AgentOrderByWithRelationInput =
      opts.sortBy === 'name'
        ? { name: opts.sortOrder }
        : opts.sortBy === 'updatedAt'
          ? { updatedAt: opts.sortOrder }
          : { createdAt: opts.sortOrder };

    const [agents, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy,
        include: { _count: { select: { calls: true } } },
      }),
      this.prisma.agent.count({ where }),
    ]);

    return { agents: agents as AgentWithCallCount[], total };
  }

  async findById(id: string, tenantId: string): Promise<AgentWithCallCount | null> {
    return this.prisma.agent.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { calls: true } } },
    }) as Promise<AgentWithCallCount | null>;
  }

  async getAgentWithStats(id: string, tenantId: string): Promise<(AgentWithCallCount & { lastCallAt?: Date | null; successfulCalls?: number; avgDuration?: number | null }) | null> {
    const agent = await this.prisma.agent.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { calls: true } } },
    });
    if (!agent) return null;

    const [lastCall, successCount, avgAgg] = await Promise.all([
      this.prisma.call.findFirst({
        where: { agentId: id, tenantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.call.count({ where: { agentId: id, tenantId, status: 'COMPLETED' } }),
      this.prisma.call.aggregate({
        where: { agentId: id, tenantId, status: 'COMPLETED', duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);

    return {
      ...(agent as AgentWithCallCount),
      lastCallAt: lastCall?.createdAt ?? null,
      successfulCalls: successCount,
      avgDuration: avgAgg._avg.duration,
    };
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateAgentInput,
  ): Promise<{ agent: Agent; warning?: string } | null> {
    const existing = await this.prisma.agent.findFirst({ where: { id, tenantId } });
    if (!existing) return null;

    const updated = await this.prisma.agent.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.voiceLanguage !== undefined ? { voiceLanguage: input.voiceLanguage } : {}),
        ...(input.voiceModel !== undefined ? { voiceModel: input.voiceModel } : {}),
        ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
        ...(input.knowledgebaseId !== undefined ? { knowledgebaseId: input.knowledgebaseId } : {}),
        ...(input.tools !== undefined ? { tools: input.tools as Prisma.InputJsonValue } : {}),
        ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
        ...(input.maxConcurrentCalls !== undefined
          ? { maxConcurrentCalls: input.maxConcurrentCalls }
          : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });

    // Sync to provider if the agent has a providerAgentId
    if (existing.providerAgentId) {
      try {
        const adapter = await getProvider(existing.provider, tenantId, this.prisma);
        await adapter.updateAgent(existing.providerAgentId, {
          name: updated.name,
          voiceLanguage: updated.voiceLanguage,
          voiceModel: updated.voiceModel,
          systemPrompt: updated.systemPrompt,
          knowledgebaseId: updated.knowledgebaseId ?? undefined,
          tools: Array.isArray(updated.tools) ? (updated.tools as string[]) : [],
          maxConcurrentCalls: updated.maxConcurrentCalls,
          metadata: (updated.metadata as Record<string, unknown> | null) ?? undefined,
        });
        return { agent: updated };
      } catch (err) {
        logger.warn({ err, agentId: id }, 'Failed to sync agent update to provider');
        return { agent: updated, warning: 'Agent updated locally but provider sync failed' };
      }
    }

    return { agent: updated };
  }

  async delete(id: string, tenantId: string): Promise<{ deleted: boolean; warning?: string }> {
    const existing = await this.prisma.agent.findFirst({ where: { id, tenantId } });
    if (!existing) return { deleted: false };

    // Soft delete
    await this.prisma.agent.update({ where: { id }, data: { isActive: false } });

    // Try to remove from provider
    if (existing.providerAgentId) {
      try {
        const adapter = await getProvider(existing.provider, tenantId, this.prisma);
        await adapter.deleteAgent(existing.providerAgentId);
      } catch (err) {
        logger.warn({ err, agentId: id }, 'Failed to delete agent from provider');
        return { deleted: true, warning: 'Agent deactivated locally but provider deletion failed' };
      }
    }

    return { deleted: true };
  }
}
