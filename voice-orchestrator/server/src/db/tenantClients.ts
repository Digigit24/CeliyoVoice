import { PrismaClient } from '@prisma/client';
import { defaultPrismaClient } from './client';
import { decrypt } from '../utils/crypto';
import { config } from '../core/config';
import { logger } from '../utils/logger';

interface TenantClientEntry {
  client: PrismaClient;
  lastUsedAt: number;
  tenantId: string;
}

/** LRU-style cache of tenant-specific Prisma clients (for dedicated Neon DBs). */
const tenantClientMap = new Map<string, TenantClientEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the background cleanup timer that disconnects idle tenant DB connections.
 * Called automatically on first use.
 */
function startCleanupTimer(): void {
  if (cleanupTimer !== null) return;

  cleanupTimer = setInterval(() => {
    void evictIdleClients();
  }, config.tenantDb.idleTimeoutMs);

  // Don't block process exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

async function evictIdleClients(): Promise<void> {
  const now = Date.now();
  const idleThreshold = config.tenantDb.idleTimeoutMs;

  for (const [tenantId, entry] of tenantClientMap.entries()) {
    if (now - entry.lastUsedAt >= idleThreshold) {
      try {
        await entry.client.$disconnect();
        tenantClientMap.delete(tenantId);
        logger.debug({ tenantId }, 'Evicted idle tenant DB client');
      } catch (err) {
        logger.warn({ err, tenantId }, 'Error disconnecting idle tenant DB client');
      }
    }
  }
}

/**
 * Enforces the maximum number of cached tenant DB clients.
 * Evicts the least recently used entry when at capacity.
 */
async function enforceCacheLimit(): Promise<void> {
  if (tenantClientMap.size < config.tenantDb.maxCachedClients) return;

  // Find the LRU entry
  let lruKey: string | null = null;
  let lruTime = Infinity;

  for (const [key, entry] of tenantClientMap.entries()) {
    if (entry.lastUsedAt < lruTime) {
      lruTime = entry.lastUsedAt;
      lruKey = key;
    }
  }

  if (lruKey) {
    const evicted = tenantClientMap.get(lruKey)!;
    try {
      await evicted.client.$disconnect();
    } catch (err) {
      logger.warn({ err, tenantId: lruKey }, 'Error disconnecting LRU tenant DB client');
    }
    tenantClientMap.delete(lruKey);
    logger.debug({ tenantId: lruKey }, 'Evicted LRU tenant DB client (cache limit reached)');
  }
}

/**
 * Resolves the correct PrismaClient for the given tenant.
 *
 * Resolution logic:
 *  1. Look up tenant in shared DB.
 *  2. If tenant.databaseUrl is set → decrypt → return/create a dedicated PrismaClient.
 *  3. Otherwise → return the shared default PrismaClient.
 *
 * @param tenantId - UUID of the tenant
 */
export async function getPrismaClient(tenantId: string): Promise<PrismaClient> {
  startCleanupTimer();

  // Check cache first
  const cached = tenantClientMap.get(tenantId);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.client;
  }

  // Look up tenant in shared DB to find dedicated DB URL
  const tenant = await defaultPrismaClient.tenant.findUnique({
    where: { id: tenantId },
    select: { databaseUrl: true, isActive: true },
  });

  // If no dedicated DB URL configured, use the shared client
  if (!tenant?.databaseUrl) {
    return defaultPrismaClient;
  }

  // Decrypt the stored database URL
  let dbUrl: string;
  try {
    dbUrl = decrypt(tenant.databaseUrl);
  } catch (err) {
    logger.error({ err, tenantId }, 'Failed to decrypt tenant database URL — falling back to shared DB');
    return defaultPrismaClient;
  }

  // Enforce LRU cache limit before adding new entry
  await enforceCacheLimit();

  // Create dedicated PrismaClient for this tenant's isolated DB
  const client = new PrismaClient({
    datasources: { db: { url: dbUrl } },
    log: [{ emit: 'event', level: 'error' }],
  });

  (client.$on as Function)('error', (e: { message: string; target: string }) => {
    logger.error({ message: e.message, target: e.target, tenantId }, 'Tenant Prisma error');
  });

  tenantClientMap.set(tenantId, {
    client,
    lastUsedAt: Date.now(),
    tenantId,
  });

  logger.info({ tenantId }, 'Created dedicated Prisma client for tenant');

  return client;
}

/**
 * Gracefully disconnects all cached tenant DB clients.
 * Call this during process shutdown.
 */
export async function disconnectAllTenantClients(): Promise<void> {
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  const disconnectPromises = Array.from(tenantClientMap.entries()).map(async ([tenantId, entry]) => {
    try {
      await entry.client.$disconnect();
      logger.debug({ tenantId }, 'Disconnected tenant DB client');
    } catch (err) {
      logger.warn({ err, tenantId }, 'Error during tenant DB client disconnect');
    }
  });

  await Promise.allSettled(disconnectPromises);
  tenantClientMap.clear();
}
