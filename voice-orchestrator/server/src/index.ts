import { createApp } from './core/server';
import { config } from './core/config';
import { logger } from './utils/logger';
import { defaultPrismaClient } from './db/client';
import { disconnectAllTenantClients } from './db/tenantClients';
import { disconnectRedis } from './db/redis';

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Connect to DB eagerly to surface config issues at startup
  await defaultPrismaClient.$connect();
  logger.info('Default database connected');

  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.env,
        module: config.module.name,
      },
      `Voice Orchestrator listening on port ${config.port}`,
    );
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await disconnectAllTenantClients();
        await defaultPrismaClient.$disconnect();
        await disconnectRedis();
        logger.info('All connections closed — exiting');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
    void shutdown('unhandledRejection');
  });
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
