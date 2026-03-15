/**
 * Bolna webhook handler — Phase 2 stub.
 * Same structure as Omnidim; will be extended when Bolna integration is built.
 */
import type { Request, Response } from 'express';
import { ingestWebhook } from './webhook.service';
import { logger } from '../utils/logger';

/**
 * POST /webhooks/bolna
 * Receives raw Bolna webhook events, stores them, and queues processing.
 */
export async function handleBolnaWebhook(req: Request, res: Response): Promise<void> {
  try {
    const result = await ingestWebhook(
      'BOLNA',
      req.body as Record<string, unknown>,
      req.headers as Record<string, string>,
      JSON.stringify(req.body),
    );

    res.status(200).json({ received: true, id: result.webhookEventId });
  } catch (err) {
    const appErr = err as { statusCode?: number; message: string };
    logger.error({ err, provider: 'BOLNA' }, 'Bolna webhook ingestion failed');
    res.status(appErr.statusCode ?? 500).json({ error: appErr.message });
  }
}
