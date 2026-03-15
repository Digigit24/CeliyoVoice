import type { Request, Response } from 'express';
import { ingestWebhook } from './webhook.service';
import { logger } from '../utils/logger';

/**
 * POST /webhooks/omnidim
 * Receives raw Omnidim webhook events, stores them, and queues processing.
 * Always returns 200 within 5 seconds to avoid provider retries.
 */
export async function handleOmnidimWebhook(req: Request, res: Response): Promise<void> {
  try {
    const result = await ingestWebhook(
      'OMNIDIM',
      req.body as Record<string, unknown>,
      req.headers as Record<string, string>,
      JSON.stringify(req.body),
    );

    res.status(200).json({ received: true, id: result.webhookEventId });
  } catch (err) {
    const appErr = err as { statusCode?: number; message: string };
    const statusCode = appErr.statusCode ?? 500;

    logger.error({ err, provider: 'OMNIDIM' }, 'Omnidim webhook ingestion failed');
    res.status(statusCode).json({ error: appErr.message });
  }
}
