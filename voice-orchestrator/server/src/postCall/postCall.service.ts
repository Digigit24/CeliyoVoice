import type { PrismaClient, PostCallAction } from '@prisma/client';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { z } from 'zod';
import type { NormalizedPostCallData } from '../providers/interfaces/postCall.interface';
import { normalizeOmnidimPostCall } from '../providers/omnidim/omnidim.postCall';
import { normalizeBolnaPostCall } from '../providers/bolna/bolna.postCall';
import type { VoiceProvider } from '@prisma/client';
import { logger } from '../utils/logger';

// ── Registry of per-provider normalizers ──────────────────────────────────────

const POST_CALL_NORMALIZERS: Record<VoiceProvider, typeof normalizeOmnidimPostCall> = {
  OMNIDIM: normalizeOmnidimPostCall,
  BOLNA: normalizeBolnaPostCall,
};

// ── Input validation schemas ──────────────────────────────────────────────────

export const CreatePostCallActionSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['WEBHOOK']).default('WEBHOOK'),
  config: z.object({
    url: z.string().url('Must be a valid URL'),
    method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
    /** Custom headers forwarded with every request */
    headers: z.record(z.string()).optional().default({}),
    /** Whether to include the full raw provider payload in the body */
    includeRawPayload: z.boolean().optional().default(false),
    /**
     * Optional HMAC secret.  If set, the outbound request will include a
     * X-Webhook-Signature: sha256=<hmac> header so the receiver can verify.
     */
    secret: z.string().optional(),
  }),
  isEnabled: z.boolean().optional().default(true),
});

export const UpdatePostCallActionSchema = CreatePostCallActionSchema.partial();

export type CreatePostCallActionInput = z.infer<typeof CreatePostCallActionSchema>;
export type UpdatePostCallActionInput = z.infer<typeof UpdatePostCallActionSchema>;

// ── Action webhook config shape ───────────────────────────────────────────────

interface WebhookActionConfig {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  includeRawPayload: boolean;
  secret?: string;
}

// ── PostCallService ───────────────────────────────────────────────────────────

export class PostCallService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Normalise raw provider payload ─────────────────────────────────────────

  normalizePayload(
    provider: VoiceProvider,
    raw: Record<string, unknown>,
  ): NormalizedPostCallData | null {
    const normalizer = POST_CALL_NORMALIZERS[provider];
    if (!normalizer) return null;
    return normalizer(raw);
  }

  // ── Core processor (called by webhook worker) ─────────────────────────────

  /**
   * 1. Match the call in our DB (by providerCallId, agent+phone, or best-effort).
   * 2. Update the Call row with summary/sentiment/extractedVars/cost/recording.
   * 3. Execute all enabled PostCallActions for the agent.
   */
  async process(
    provider: VoiceProvider,
    raw: Record<string, unknown>,
  ): Promise<void> {
    const data = this.normalizePayload(provider, raw);
    if (!data) {
      logger.debug({ provider }, 'PostCallService: payload is not a post-call event, skipping');
      return;
    }

    logger.info({ provider, providerCallId: data.providerCallId, agentName: data.agentName }, 'Processing post-call event');

    // ── Step 1: find the Call record ─────────────────────────────────────────
    const call = await this.findCall(data);

    if (!call) {
      logger.warn({ provider, providerCallId: data.providerCallId }, 'PostCall: no matching call found — data logged but actions skipped');
      return;
    }

    const tenantId = call.tenantId;

    // ── Step 2: update Call with post-call data ───────────────────────────────
    await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: this.mapStatus(data.callStatus),
        duration: data.durationSeconds ?? undefined,
        recordingUrl: data.recordingUrl ?? undefined,
        transcript: data.transcript ?? undefined,
        summary: data.summary ?? undefined,
        sentiment: data.sentiment ?? undefined,
        extractedVariables: data.extractedVariables
          ? (data.extractedVariables as Prisma.InputJsonValue)
          : undefined,
        cost: data.cost != null ? new Prisma.Decimal(data.cost) : undefined,
        endedAt: call.endedAt ?? new Date(),
      },
    });

    logger.info({ callId: call.id, sentiment: data.sentiment }, 'Post-call data saved to Call');

    // ── Step 3: find the agent and execute configured actions ─────────────────
    const actions = await this.prisma.postCallAction.findMany({
      where: { agentId: call.agentId, tenantId, isEnabled: true },
    });

    if (actions.length === 0) return;

    logger.info({ callId: call.id, actionCount: actions.length }, 'Executing post-call actions');

    await Promise.allSettled(
      actions.map((action) => this.executeAction(action, call.id, tenantId, data)),
    );
  }

  // ── Call matching ─────────────────────────────────────────────────────────

  private async findCall(data: NormalizedPostCallData) {
    // 1st: match by providerCallId (most reliable)
    if (data.providerCallId) {
      const call = await this.prisma.call.findFirst({
        where: { providerCallId: data.providerCallId },
      });
      if (call) return call;
    }

    // 2nd: match by agent providerAgentId + phone number (most recent)
    if (data.agentProviderAgentId && data.toNumber) {
      const agent = await this.prisma.agent.findFirst({
        where: { providerAgentId: data.agentProviderAgentId },
        select: { id: true },
      });
      if (agent) {
        const call = await this.prisma.call.findFirst({
          where: { agentId: agent.id, phone: data.toNumber },
          orderBy: { createdAt: 'desc' },
        });
        if (call) return call;
      }
    }

    // 3rd: match by agent name + phone (last resort)
    if (data.agentName && data.toNumber) {
      const agent = await this.prisma.agent.findFirst({
        where: { name: data.agentName },
        select: { id: true },
      });
      if (agent) {
        const call = await this.prisma.call.findFirst({
          where: { agentId: agent.id, phone: data.toNumber },
          orderBy: { createdAt: 'desc' },
        });
        if (call) return call;
      }
    }

    return null;
  }

  // ── Action execution ──────────────────────────────────────────────────────

  private async executeAction(
    action: PostCallAction,
    callId: string,
    tenantId: string,
    data: NormalizedPostCallData,
  ): Promise<void> {
    const cfg = action.config as WebhookActionConfig;
    const startedAt = Date.now();

    // Build outbound payload
    const body: Record<string, unknown> = {
      event: 'call.completed',
      timestamp: new Date().toISOString(),
      call: {
        id: callId,
        providerCallId: data.providerCallId,
        toNumber: data.toNumber,
        fromNumber: data.fromNumber,
        direction: data.direction,
        durationSeconds: data.durationSeconds,
        status: data.callStatus,
        recordingUrl: data.recordingUrl,
        transcript: data.transcript,
        summary: data.summary,
        sentiment: data.sentiment,
        sentimentDetails: data.sentimentDetails,
        extractedVariables: data.extractedVariables ?? {},
        cost: data.cost,
      },
      agent: {
        name: data.agentName,
        providerAgentId: data.agentProviderAgentId,
        provider: data.provider,
      },
      provider: data.provider,
    };

    if (cfg.includeRawPayload) {
      body['rawPayload'] = data.rawPayload;
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CeliyoVoice-PostCall/1.0',
      ...cfg.headers,
    };

    // HMAC signature if secret configured
    if (cfg.secret) {
      const crypto = await import('crypto');
      const sig = crypto
        .createHmac('sha256', cfg.secret)
        .update(JSON.stringify(body))
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${sig}`;
    }

    try {
      const response = await axios({
        method: cfg.method ?? 'POST',
        url: cfg.url,
        headers,
        data: body,
        timeout: 10_000,
        validateStatus: () => true, // don't throw on 4xx/5xx
      });

      await this.prisma.postCallExecution.create({
        data: {
          tenantId,
          actionId: action.id,
          callId,
          status: response.status < 400 ? 'SUCCESS' : 'FAILED',
          requestPayload: body as Prisma.InputJsonValue,
          responseStatus: response.status,
          responseBody: String(response.data ?? '').slice(0, 4000),
        },
      });

      logger.info({ actionId: action.id, callId, status: response.status, ms: Date.now() - startedAt }, 'Post-call action executed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.postCallExecution.create({
        data: {
          tenantId,
          actionId: action.id,
          callId,
          status: 'FAILED',
          requestPayload: body as Prisma.InputJsonValue,
          error: message,
        },
      });
      logger.error({ actionId: action.id, callId, err: message }, 'Post-call action failed');
    }
  }

  // ── CRUD: PostCallActions ─────────────────────────────────────────────────

  async listActions(tenantId: string, agentId: string) {
    return this.prisma.postCallAction.findMany({
      where: { tenantId, agentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAction(tenantId: string, agentId: string, input: CreatePostCallActionInput) {
    // Verify agent belongs to tenant
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, tenantId } });
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 });

    return this.prisma.postCallAction.create({
      data: {
        tenantId,
        agentId,
        name: input.name,
        type: input.type,
        config: input.config as Prisma.InputJsonValue,
        isEnabled: input.isEnabled ?? true,
      },
    });
  }

  async updateAction(id: string, tenantId: string, input: UpdatePostCallActionInput) {
    const existing = await this.prisma.postCallAction.findFirst({ where: { id, tenantId } });
    if (!existing) throw Object.assign(new Error('Action not found'), { statusCode: 404 });

    return this.prisma.postCallAction.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {}),
        ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      },
    });
  }

  async deleteAction(id: string, tenantId: string) {
    const existing = await this.prisma.postCallAction.findFirst({ where: { id, tenantId } });
    if (!existing) throw Object.assign(new Error('Action not found'), { statusCode: 404 });
    await this.prisma.postCallAction.delete({ where: { id } });
  }

  async listExecutions(tenantId: string, agentId: string, limit = 50) {
    return this.prisma.postCallExecution.findMany({
      where: { tenantId, action: { agentId } },
      orderBy: { executedAt: 'desc' },
      take: limit,
      include: { action: { select: { name: true, type: true } } },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private mapStatus(providerStatus?: string): import('@prisma/client').CallStatus | undefined {
    if (!providerStatus) return undefined;
    const s = providerStatus.toLowerCase();
    if (s === 'completed') return 'COMPLETED';
    if (s === 'failed' || s === 'busy' || s === 'no-answer') return 'FAILED';
    if (s === 'cancelled') return 'CANCELLED';
    return undefined;
  }
}
