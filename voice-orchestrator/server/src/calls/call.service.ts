import type { PrismaClient, Call, CallStatus, VoiceProvider } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { callQueue } from '../queue/queues';
import { getProvider } from '../providers/providerRouter';
import { resolveCredentials } from '../providers/credentialResolver';
import { OmnidimService } from '../providers/omnidim/omnidim.service';
import { BolnaService } from '../providers/bolna/bolna.service';
import type { OmnidimCallLogEntry } from '../providers/omnidim/omnidim.types';
import type { BolnaExecution, BolnaExecutionListResponse } from '../providers/bolna/bolna.types';
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

    // Create call record in QUEUED state
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

    // For Omnidim: dispatch directly via API (no queue needed — call is async on their side)
    if (agent.provider === 'OMNIDIM') {
      if (!agent.providerAgentId) {
        await this.prisma.call.update({ where: { id: call.id }, data: { status: 'FAILED' } });
        const err = new Error('Agent has not been imported from Omnidim yet (no providerAgentId)');
        (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
        throw err;
      }

      try {
        const creds = await resolveCredentials(tenantId, 'OMNIDIM', this.prisma);
        const svc = new OmnidimService(creds.apiKey, creds.apiUrl);

        const dispatchPayload = {
          agent_id: Number(agent.providerAgentId),
          to_number: input.phone,
          ...(input.fromNumberId !== undefined ? { from_number_id: input.fromNumberId } : {}),
          ...(input.callContext ? { call_context: input.callContext } : {}),
        };

        logger.info({ tenantId, callId: call.id, dispatchPayload }, 'Dispatching call to Omnidim');
        const response = await svc.dispatchCall(dispatchPayload);

        // Store provider call ID from response
        const providerCallId = String(
          response.call_id ?? response.id ?? '',
        );

        await this.prisma.call.update({
          where: { id: call.id },
          data: {
            status: 'RINGING',
            providerCallId: providerCallId || null,
            startedAt: new Date(),
          },
        });

        logger.info({ callId: call.id, providerCallId, response }, 'Call dispatched to Omnidim');
      } catch (err) {
        await this.prisma.call.update({ where: { id: call.id }, data: { status: 'FAILED' } });
        throw err;
      }

      return this.prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    }

    // For Bolna: dispatch directly via API
    if (agent.provider === 'BOLNA') {
      if (!agent.providerAgentId) {
        await this.prisma.call.update({ where: { id: call.id }, data: { status: 'FAILED' } });
        const err = new Error('Agent has not been imported from Bolna yet (no providerAgentId)');
        (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 400;
        throw err;
      }

      try {
        const creds = await resolveCredentials(tenantId, 'BOLNA', this.prisma);
        const svc = new BolnaService(creds.apiKey, creds.apiUrl);

        const dispatchPayload = {
          agent_id: agent.providerAgentId,
          recipient_phone_number: input.phone,
          ...(input.fromNumberId ? { from_phone_number: input.fromNumberId } : {}),
          ...(input.callContext ? { user_data: input.callContext as Record<string, string> } : {}),
        };

        logger.info({ tenantId, callId: call.id, dispatchPayload }, 'Dispatching call to Bolna');
        const response = await svc.dispatchCall(dispatchPayload);

        await this.prisma.call.update({
          where: { id: call.id },
          data: {
            status: 'RINGING',
            providerCallId: response.execution_id || null,
            startedAt: new Date(),
          },
        });

        logger.info({ callId: call.id, executionId: response.execution_id }, 'Call dispatched to Bolna');
      } catch (err) {
        await this.prisma.call.update({ where: { id: call.id }, data: { status: 'FAILED' } });
        throw err;
      }

      return this.prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    }

    // For other providers: use queue
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
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    logger.info({ callId: call.id, tenantId, phone: input.phone }, 'Call queued');
    return call;
  }

  /**
   * Fetch call logs directly from Omnidim for a given agent.
   * Uses the tenant's stored credentials.
   */
  async listOmnidimLogs(
    tenantId: string,
    opts: { agentProviderAgentId?: string; call_status?: string; page?: number; pageSize?: number },
  ): Promise<{ logs: OmnidimCallLogEntry[]; total: number }> {
    const creds = await resolveCredentials(tenantId, 'OMNIDIM', this.prisma);
    const svc = new OmnidimService(creds.apiKey, creds.apiUrl);

    const resp = await svc.getCallLogs({
      pageno: opts.page ?? 1,
      pagesize: opts.pageSize ?? 20,
      ...(opts.agentProviderAgentId ? { agentid: Number(opts.agentProviderAgentId) } : {}),
      ...(opts.call_status ? { call_status: opts.call_status } : {}),
    });

    // Omnidim returns call_log_data key; fall back to legacy keys
    const logs = resp.call_log_data ?? resp.call_logs ?? resp.logs ?? [];
    const total = resp.total_records ?? resp.total ?? logs.length;

    return { logs, total };
  }

  /**
   * Fetch execution logs from Bolna for an agent or all agents.
   */
  async listBolnaExecutions(
    tenantId: string,
    opts: { agentProviderAgentId?: string; page?: number; pageSize?: number },
  ): Promise<{ executions: BolnaExecution[]; total: number; hasMore: boolean }> {
    const creds = await resolveCredentials(tenantId, 'BOLNA', this.prisma);
    const svc = new BolnaService(creds.apiKey, creds.apiUrl);

    if (!opts.agentProviderAgentId) {
      // Without an agent filter, we can't list all executions on Bolna.
      // Return empty; callers should always pass an agentId.
      return { executions: [], total: 0, hasMore: false };
    }

    const resp: BolnaExecutionListResponse = await svc.getAgentExecutions(
      opts.agentProviderAgentId,
      opts.page ?? 1,
      opts.pageSize ?? 20,
    );

    return {
      executions: resp.data ?? [],
      total: resp.total ?? 0,
      hasMore: resp.has_more ?? false,
    };
  }

  /**
   * Fetch a single Bolna execution by ID.
   */
  async getBolnaExecution(tenantId: string, executionId: string): Promise<BolnaExecution> {
    const creds = await resolveCredentials(tenantId, 'BOLNA', this.prisma);
    const svc = new BolnaService(creds.apiKey, creds.apiUrl);
    return svc.getExecution(executionId);
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
