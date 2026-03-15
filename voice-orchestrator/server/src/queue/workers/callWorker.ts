import { Worker } from 'bullmq';
import { CallStatus } from '@prisma/client';
import { bullMQConnectionOptions, type CallJobData } from '../queues';
import { getPrismaClient } from '../../db/tenantClients';
import { getProvider } from '../../providers/providerRouter';
import { publish } from '../../events/eventBus';
import { VoiceEventType } from '../../events/eventTypes';
import { logger } from '../../utils/logger';

export function startCallWorker(): Worker<CallJobData, void, string> {
  const worker = new Worker<CallJobData, void, string>(
    'call-queue',
    async (job) => {
      const { callId, tenantId, agentId, phone, provider, metadata } = job.data;
      const log = logger.child({ callId, tenantId, jobId: job.id });

      const prisma = await getPrismaClient(tenantId);

      const agent = await prisma.agent.findUnique({ where: { id: agentId } });
      if (!agent) {
        await prisma.call.update({ where: { id: callId }, data: { status: CallStatus.FAILED } });
        throw new Error(`Agent ${agentId} not found`);
      }

      if (!agent.providerAgentId) {
        await prisma.call.update({ where: { id: callId }, data: { status: CallStatus.FAILED } });
        throw new Error(`Agent ${agentId} has no providerAgentId — sync it to the provider first`);
      }

      const adapter = await getProvider(
        provider as import('@prisma/client').VoiceProvider,
        tenantId,
        prisma,
      );

      const result = await adapter.startCall({
        phone,
        providerAgentId: agent.providerAgentId,
        callId,
        tenantId,
        metadata,
      });

      await prisma.call.update({
        where: { id: callId },
        data: {
          providerCallId: result.providerCallId,
          status: CallStatus.RINGING,
          startedAt: new Date(),
        },
      });

      await publish({
        type: VoiceEventType.CALL_RINGING,
        callId,
        tenantId,
        provider: provider as import('@prisma/client').VoiceProvider,
        providerCallId: result.providerCallId,
        timestamp: new Date().toISOString(),
      });

      log.info({ providerCallId: result.providerCallId }, 'Call started successfully');
    },
    {
      connection: bullMQConnectionOptions,
      concurrency: 10,
      limiter: { max: 50, duration: 1000 },
    },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    logger.error({ jobId: job.id, callId: job.data.callId, err }, 'Call job failed');
    try {
      const prisma = await getPrismaClient(job.data.tenantId);
      await prisma.call.update({ where: { id: job.data.callId }, data: { status: CallStatus.FAILED } });
    } catch (updateErr) {
      logger.error({ updateErr, callId: job.data.callId }, 'Failed to mark call as FAILED');
    }
  });

  logger.info('Call worker started');
  return worker;
}
