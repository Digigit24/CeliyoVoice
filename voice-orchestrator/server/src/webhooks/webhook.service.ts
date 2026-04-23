import crypto from 'crypto';
import type { VoiceProvider } from '@prisma/client';
import { defaultPrismaClient } from '../db/client';
import { webhookQueue } from '../queue/queues';
import { logger } from '../utils/logger';

export interface WebhookIngestResult {
  webhookEventId: string;
  queued: boolean;
}

/**
 * Verifies an HMAC-SHA256 webhook signature.
 * Signature format: "sha256=<hex>"
 */
export function verifyWebhookSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string,
): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Ingests a raw webhook from a provider:
 * 1. Optionally verifies the signature.
 * 2. Stores the raw payload in WebhookEvent (always returns 200 to provider).
 * 3. Queues async processing.
 */
export async function ingestWebhook(
  provider: VoiceProvider,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  rawBody: string,
): Promise<WebhookIngestResult> {
  // Check if signature verification is configured for this provider
  const providerConfig = await defaultPrismaClient.providerConfig.findUnique({
    where: { provider },
    select: { webhookSecret: true },
  });

  if (providerConfig?.webhookSecret) {
    const sigHeader =
      headers['x-omnidim-signature'] ??
      headers['x-bolna-signature'] ??
      headers['x-webhook-signature'] ??
      '';

    if (!sigHeader) {
      logger.warn({ provider }, 'Webhook received without signature header — rejecting');
      const err = new Error('Missing webhook signature');
      (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 401;
      throw err;
    }

    const valid = verifyWebhookSignature(rawBody, providerConfig.webhookSecret, sigHeader);
    if (!valid) {
      logger.warn({ provider }, 'Invalid webhook signature');
      const err = new Error('Invalid webhook signature');
      (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 401;
      throw err;
    }
  }

  // Persist raw event immediately (before queuing).
  // Omnidim sends numeric ids (e.g. call_id: 33302, call_request_id: 87198);
  // our Prisma column is String, so coerce. Prefer call_request_id since that
  // is the same integer we store at dispatch time as providerCallId.
  const rawProviderCallId =
    payload['call_request_id'] ??
    payload['call_id'] ??
    payload['callId'] ??
    null;
  const providerCallId =
    rawProviderCallId != null && typeof rawProviderCallId !== 'object'
      ? String(rawProviderCallId)
      : rawProviderCallId != null &&
          typeof rawProviderCallId === 'object' &&
          (rawProviderCallId as Record<string, unknown>)['id'] != null
        ? String((rawProviderCallId as Record<string, unknown>)['id'])
        : undefined;

  const eventType =
    (payload['event'] as string | undefined) ??
    (payload['event_type'] as string | undefined) ??
    'unknown';

  const webhookEvent = await defaultPrismaClient.webhookEvent.create({
    data: {
      provider,
      eventType,
      providerCallId,
      rawPayload: payload as import('@prisma/client').Prisma.InputJsonValue,
      status: 'RECEIVED',
    },
  });

  // Queue for async processing — do not await
  await webhookQueue.add(
    'process-webhook' as string,
    { webhookEventId: webhookEvent.id, provider },
    { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  );

  logger.info({ webhookEventId: webhookEvent.id, provider, eventType }, 'Webhook ingested');
  return { webhookEventId: webhookEvent.id, queued: true };
}
