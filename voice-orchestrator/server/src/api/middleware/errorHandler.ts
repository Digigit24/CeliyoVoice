import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

/**
 * Global Express error handler.
 * Catches all errors passed via next(err) and formats them consistently.
 *
 * Response format:
 * {
 *   success: false,
 *   error: { code: string, message: string, details?: any }
 * }
 */
export function globalErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
  const message = statusCode >= 500 ? 'An internal server error occurred' : err.message;

  logger.error(
    {
      requestId: req.id,
      tenantId: req.tenantId,
      userId: req.userId,
      method: req.method,
      path: req.path,
      statusCode,
      code,
      err,
    },
    err.message,
  );

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env['NODE_ENV'] !== 'production' && statusCode >= 500
        ? { details: err.stack }
        : err.details !== undefined
          ? { details: err.details }
          : {}),
    },
  });
}

/**
 * Creates a typed application error with statusCode and optional code/details.
 */
export function createError(
  message: string,
  statusCode: number,
  code?: string,
  details?: unknown,
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.details = details;
  return err;
}
