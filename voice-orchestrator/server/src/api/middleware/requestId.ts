import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique UUID request ID to every request for distributed tracing.
 * Reads from x-request-id header if present (allows forwarding from gateway),
 * otherwise generates a new UUID.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  req.id = typeof existingId === 'string' && existingId.length > 0 ? existingId : uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
}
