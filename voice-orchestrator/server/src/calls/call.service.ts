import type { PrismaClient, Call, CallStatus, VoiceProvider } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { callQueue } from '../queue/queues';
import { getProvider } from '../providers/providerRouter';
import { logger } from '../utils/logger';
import type { StartCallInput } from './validators/call.validators';

export interface CallWithDetails extends Call {
  agent: { id: string; name: string; provider: string };
  events: Array<{ id: string; eventType: string; data: unknown; createdAt: Date }>;
}

export interface CallListOptions {
  tenantId: string;
  page: number;
  limit: number;
  status?: CallStatus;
  agentId?: string;
  provider?: VoiceProvider;
  phone?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export class CallService {
  constructor(private readonly prisma: PrismaClient) {}

  async startCall(
    tenantId: string,
    ownerUserId: string,
    input: StartCallInput,
  ): Promise<Call> {
    // Validate agent exists and belongs to tenant
    const agent = await this.prisma.agent.findFirst({
      where: { id: input.agentId, tenantId, isActive: true },
    });
    if (!agent) {
      const err = new Error('Agent not found or inactive');
      (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 404;
      throw err;
    }

    // Create call record with QUEUED status
    const call = await this.prisma.call.create({
      data: {
        tenantId,
        ownerUserId,
        agentId: input.agentId,
        phone: input.phone,
        provider: agent.provider,
        status: 'QUEUED',
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      },
    });

    // Queue the call for async processing
    await callQueue.add(
      'start-call' as string,
      {
        callId: call.id,
        tenantId,
        agentId: input.agentId,
        phone: input.phone,
        provider: agent.provider,
        metadata: input.metadata,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    logger.info({ callId: call.id, tenantId, phone: input.phone }, 'Call queued');
    return call;
  }

  async endCall(id: string, tenantId: string): Promise<Call | null> {
    const call = await this.prisma.call.findFirst({
      where: { id, tenantId },
    });
    if (!call) return null;

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(call.status)) {
      return call; // Already terminal
    }

    // Try to end the call via provider
    if (call.providerCallId) {
      try {
        const adapter = await getProvider(call.provider, tenantId, this.prisma);
        await adapter.endCall(call.providerCallId);
      } catch (err) {
        logger.warn({ err, callId: id }, 'Failed to end call via provider');
      }
    }

    return this.prisma.call.update({
      where: { id },
      data: { status: 'CANCELLED', endedAt: new Date() },
    });
  }

  async list(opts: CallListOptions): Promise<{ calls: Call[]; total: number }> {
    const where: Prisma.CallWhereInput = {
      tenantId: opts.tenantId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.phone ? { phone: { contains: opts.phone } } : {}),
      ...(opts.dateFrom || opts.dateTo
        ? {
            createdAt: {
              ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
              ...(opts.dateTo ? { lte: new Date(opts.dateTo) } : {}),
            },
          }
        : {}),
    };

    const orderBy: Prisma.CallOrderByWithRelationInput =
      opts.sortBy === 'duration'
        ? { duration: opts.sortOrder }
        : opts.sortBy === 'status'
          ? { status: opts.sortOrder }
          : { createdAt: opts.sortOrder };

    const [calls, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy,
        include: {
          agent: { select: { id: true, name: true, provider: true } },
        },
      }),
      this.prisma.call.count({ where }),
    ]);

    return { calls, total };
  }

  async findById(id: string, tenantId: string): Promise<CallWithDetails | null> {
    return this.prisma.call.findFirst({
      where: { id, tenantId },
      include: {
        agent: { select: { id: true, name: true, provider: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    }) as Promise<CallWithDetails | null>;
  }
}
