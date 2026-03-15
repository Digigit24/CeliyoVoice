import { Queue } from 'bullmq';
import { config } from '../core/config';
import type { ConnectionOptions } from 'bullmq';

/**
 * BullMQ connection config.
 * BullMQ bundles its own ioredis; we pass a plain options object to avoid
 * version-mismatch type conflicts with the external ioredis package.
 */
function parseBullMQConnection(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    } as ConnectionOptions;
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null, enableReadyCheck: false } as ConnectionOptions;
  }
}

export const bullMQConnectionOptions = parseBullMQConnection(config.redis.url);

const queueOpts = { connection: bullMQConnectionOptions };

/** Outbound call initiation queue */
export const callQueue = new Queue<CallJobData, void, string>('call-queue', queueOpts);

/** Tool HTTP execution queue */
export const toolQueue = new Queue<ToolJobData, void, string>('tool-queue', queueOpts);

/** Provider webhook processing queue */
export const webhookQueue = new Queue<WebhookJobData, void, string>('webhook-queue', queueOpts);

// ── Job data interfaces ───────────────────────────────────────────────────────

export interface CallJobData {
  callId: string;
  tenantId: string;
  agentId: string;
  phone: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

export interface ToolJobData {
  tenantId: string;
  callId: string;
  toolId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  requestId: string;
  providerCallId: string;
}

export interface WebhookJobData {
  webhookEventId: string;
  provider: string;
}
