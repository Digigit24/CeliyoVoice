import { Worker } from 'bullmq';
import { bullMQConnectionOptions, type ToolJobData } from '../queues';
import { getPrismaClient } from '../../db/tenantClients';
import { ToolExecutor } from '../../tools/tool.executor';
import { publish } from '../../events/eventBus';
import { VoiceEventType } from '../../events/eventTypes';
import { logger } from '../../utils/logger';

export function startToolWorker(): Worker<ToolJobData, void, string> {
  const worker = new Worker<ToolJobData, void, string>(
    'tool-queue',
    async (job) => {
      const { tenantId, callId, toolId, toolName, parameters, requestId, providerCallId } = job.data;
      const log = logger.child({ callId, toolId, requestId, jobId: job.id });

      const prisma = await getPrismaClient(tenantId);
      const executor = new ToolExecutor(prisma);

      try {
        const result = await executor.executeTool(
          toolId,
          { callId, tenantId, providerCallId },
          parameters,
        );

        await publish({
          type: VoiceEventType.TOOL_COMPLETED,
          callId,
          tenantId,
          provider: 'OMNIDIM',
          providerCallId,
          timestamp: new Date().toISOString(),
          toolName,
          requestId,
          result,
        });

        log.info({ toolName }, 'Tool executed successfully');
      } catch (err) {
        await publish({
          type: VoiceEventType.TOOL_FAILED,
          callId,
          tenantId,
          provider: 'OMNIDIM',
          providerCallId,
          timestamp: new Date().toISOString(),
          toolName,
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });
        log.error({ err, toolName }, 'Tool execution failed');
        throw err;
      }
    },
    { connection: bullMQConnectionOptions, concurrency: 20 },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    logger.error({ jobId: job.id, toolName: job.data.toolName, err }, 'Tool job permanently failed');
  });

  logger.info('Tool worker started');
  return worker;
}
