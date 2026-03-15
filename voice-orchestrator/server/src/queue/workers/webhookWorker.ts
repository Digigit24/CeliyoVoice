import { Worker } from 'bullmq';
import { WebhookEventStatus, CallStatus } from '@prisma/client';
import { bullMQConnectionOptions, type WebhookJobData } from '../queues';
import { defaultPrismaClient } from '../../db/client';
import { getPrismaClient } from '../../db/tenantClients';
import { getProvider } from '../../providers/providerRouter';
import { publish } from '../../events/eventBus';
import { VoiceEventType } from '../../events/eventTypes';
import { logger } from '../../utils/logger';
import type { NormalizedWebhookEvent } from '../../providers/interfaces/voiceProvider.interface';
import { PostCallService } from '../../postCall/postCall.service';

export function startWebhookWorker(): Worker<WebhookJobData, void, string> {
  const worker = new Worker<WebhookJobData, void, string>(
    'webhook-queue',
    async (job) => {
      const { webhookEventId, provider } = job.data;
      const log = logger.child({ webhookEventId, provider, jobId: job.id });

      await defaultPrismaClient.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: WebhookEventStatus.PROCESSING },
      });

      const webhookEvent = await defaultPrismaClient.webhookEvent.findUnique({
        where: { id: webhookEventId },
      });

      if (!webhookEvent) {
        log.warn('WebhookEvent not found — skipping');
        return;
      }

      try {
        // Use a dummy tenantId for normalization (no DB lookup needed)
        const adapter = await getProvider(
          provider as import('@prisma/client').VoiceProvider,
          '__global__',
          defaultPrismaClient as unknown as import('@prisma/client').PrismaClient,
        );

        const normalized = await adapter.handleWebhook(
          webhookEvent.rawPayload as Record<string, unknown>,
          {},
        );

        // Resolve the call by internalCallId or providerCallId
        let call = normalized.internalCallId
          ? await defaultPrismaClient.call.findUnique({ where: { id: normalized.internalCallId } })
          : null;

        if (!call && normalized.providerCallId) {
          call = await defaultPrismaClient.call.findFirst({
            where: { providerCallId: normalized.providerCallId },
          });
        }

        const tenantId = call?.tenantId;

        await defaultPrismaClient.webhookEvent.update({
          where: { id: webhookEventId },
          data: {
            tenantId,
            callId: call?.id,
            eventType: normalized.eventType,
            processedPayload: normalized as unknown as import('@prisma/client').Prisma.InputJsonValue,
            status: WebhookEventStatus.PROCESSED,
          },
        });

        // ── Post-call processing ────────────────────────────────────────────
        // Run regardless of whether we matched a Call — the service handles
        // unmatched payloads gracefully.
        const postCallSvc = new PostCallService(defaultPrismaClient as unknown as import('@prisma/client').PrismaClient);
        await postCallSvc.process(
          provider as import('@prisma/client').VoiceProvider,
          webhookEvent.rawPayload as Record<string, unknown>,
        );

        if (!call || !tenantId) {
          log.warn({ providerCallId: normalized.providerCallId }, 'No matching call — event stored but not published');
          return;
        }

        await dispatchNormalizedEvent(normalized, call.id, tenantId);
        log.info({ eventType: normalized.eventType, callId: call.id }, 'Webhook processed');
      } catch (err) {
        await defaultPrismaClient.webhookEvent.update({
          where: { id: webhookEventId },
          data: { status: WebhookEventStatus.FAILED, error: String(err) },
        });
        log.error({ err }, 'Webhook processing failed');
        throw err;
      }
    },
    { connection: bullMQConnectionOptions, concurrency: 20, limiter: { max: 100, duration: 1000 } },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    logger.error({ jobId: job.id, webhookEventId: job.data.webhookEventId, err }, 'Webhook job permanently failed');
  });

  logger.info('Webhook worker started');
  return worker;
}

async function dispatchNormalizedEvent(
  normalized: NormalizedWebhookEvent,
  callId: string,
  tenantId: string,
): Promise<void> {
  const base = {
    callId,
    tenantId,
    provider: normalized.provider,
    providerCallId: normalized.providerCallId,
    timestamp: new Date().toISOString(),
  };

  switch (normalized.eventType) {
    case 'CALL_STARTED': {
      const prisma = await getPrismaClient(tenantId);
      const call = await prisma.call.findUnique({ where: { id: callId } });
      await publish({ ...base, type: VoiceEventType.CALL_STARTED, agentId: call?.agentId ?? '', phone: call?.phone ?? '' });
      break;
    }
    case 'CALL_RINGING':
      await publish({ ...base, type: VoiceEventType.CALL_RINGING });
      break;
    case 'CALL_CONNECTED':
      await publish({ ...base, type: VoiceEventType.CALL_CONNECTED });
      break;
    case 'CALL_ENDED':
      await publish({ ...base, type: VoiceEventType.CALL_ENDED, duration: normalized.duration, recordingUrl: normalized.recordingUrl });
      break;
    case 'TRANSCRIPT_UPDATE':
      if (normalized.transcript) await publish({ ...base, type: VoiceEventType.TRANSCRIPT_UPDATE, transcript: normalized.transcript });
      break;
    case 'TRANSCRIPT_FINAL':
      if (normalized.transcript) await publish({ ...base, type: VoiceEventType.TRANSCRIPT_FINAL, transcript: normalized.transcript, summary: normalized.summary });
      break;
    case 'TOOL_REQUESTED':
      if (normalized.toolRequest) await publish({ ...base, type: VoiceEventType.TOOL_REQUESTED, ...normalized.toolRequest });
      break;
    case 'ERROR': {
      const prisma = await getPrismaClient(tenantId);
      await prisma.call.update({ where: { id: callId }, data: { status: CallStatus.FAILED } });
      await publish({ ...base, type: VoiceEventType.ERROR, error: 'Provider error', fatal: true });
      break;
    }
    default:
      logger.debug({ eventType: normalized.eventType }, 'Unhandled normalized event type');
  }
}
