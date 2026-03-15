import { PrismaClient } from '@prisma/client';
import { config } from '../core/config';
import { logger } from '../utils/logger';

declare global {
  // Allow reuse in hot-module-reload environments (dev only)
  // eslint-disable-next-line no-var
  var __defaultPrismaClient: PrismaClient | undefined;
}

function createDefaultPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: config.database.url } },
    log: config.isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : [{ emit: 'event', level: 'error' }],
  });
}

/** Default shared Prisma client — singleton for the process lifetime. */
export const defaultPrismaClient: PrismaClient =
  global.__defaultPrismaClient ?? createDefaultPrismaClient();

if (config.isDevelopment) {
  global.__defaultPrismaClient = defaultPrismaClient;
}

// Wire up query logging in development
if (config.isDevelopment) {
  (defaultPrismaClient.$on as Function)('query', (e: { query: string; duration: number }) => {
    logger.debug({ query: e.query, duration: e.duration }, 'Prisma query');
  });
}

(defaultPrismaClient.$on as Function)('error', (e: { message: string; target: string }) => {
  logger.error({ message: e.message, target: e.target }, 'Prisma error');
});
