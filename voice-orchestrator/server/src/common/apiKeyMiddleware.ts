import type { Request, Response, NextFunction } from 'express';
import { config } from '../core/config';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Middleware that authenticates requests using the x-api-key header.
 * Falls through to the next middleware (JWT) if no API key is provided.
 * If VOICE_AI_API_KEY is not configured, this middleware is a no-op.
 */
export function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  // No API key header — let JWT middleware handle auth
  if (!apiKey) {
    return next();
  }

  // API key auth not configured on this server
  if (!config.voiceAi.apiKey) {
    logger.warn('x-api-key header received but VOICE_AI_API_KEY is not configured');
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key authentication is not configured on this server',
      },
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(config.voiceAi.apiKey, 'utf8');
  const provided = Buffer.from(apiKey, 'utf8');

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
    return;
  }

  // Mark request as API-key-authenticated (service-to-service)
  req.isServiceAuth = true;

  logger.debug({ requestId: req.id }, 'Request authenticated via x-api-key');
  next();
}
