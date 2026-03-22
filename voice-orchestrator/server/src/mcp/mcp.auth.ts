import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../core/config';
import { defaultPrismaClient } from '../db/client';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'mcp-auth' });

/**
 * MCP auth middleware — supports JWT bearer tokens AND MCP API keys.
 */
export async function mcpAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const token = authHeader?.replace('Bearer ', '') || apiKeyHeader;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized — provide Bearer token or x-api-key' });
    return;
  }

  // 1. Try JWT
  try {
    const payload = jwt.verify(token, config.jwt.secretKey, {
      algorithms: [config.jwt.algorithm],
      clockTolerance: config.jwt.clockTolerance,
    }) as { tenant_id?: string; user_id?: string };

    if (payload.tenant_id) {
      req.tenantId = payload.tenant_id;
      req.userId = payload.user_id;
      req.prisma = defaultPrismaClient;
      return next();
    }
  } catch {
    // Not a valid JWT — try MCP API key
  }

  // 2. Try MCP API key
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await defaultPrismaClient.mcpApiKey.findFirst({
      where: { keyHash: hash, isActive: true },
    });

    if (record) {
      req.tenantId = record.tenantId;
      req.prisma = defaultPrismaClient;
      (req as unknown as { mcpAgentId?: string | null }).mcpAgentId = record.agentId;

      // Update lastUsedAt (fire-and-forget)
      defaultPrismaClient.mcpApiKey.update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});

      log.debug({ keyId: record.id, tenantId: record.tenantId }, 'MCP API key authenticated');
      return next();
    }
  } catch (err) {
    log.warn({ err }, 'MCP API key lookup failed');
  }

  res.status(401).json({ error: 'Invalid credentials' });
}
