import type { Worker } from 'bullmq';
import { startCallWorker } from './workers/callWorker';
import { startToolWorker } from './workers/toolWorker';
import { startWebhookWorker } from './workers/webhookWorker';
import { logger } from '../utils/logger';

let workers: Worker[] = [];

/**
 * Starts all BullMQ workers. Call once at server startup.
 */
export function startAllWorkers(): void {
  workers = [startCallWorker(), startToolWorker(), startWebhookWorker()];
  logger.info({ workerCount: workers.length }, 'All queue workers started');
}

/**
 * Gracefully closes all workers.
 */
export async function stopAllWorkers(): Promise<void> {
  await Promise.allSettled(workers.map((w) => w.close()));
  logger.info('All queue workers stopped');
}
