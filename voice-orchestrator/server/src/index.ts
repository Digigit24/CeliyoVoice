import { createApp } from './core/server';
import { config } from './core/config';
import { logger } from './utils/logger';
import { defaultPrismaClient } from './db/client';
import { disconnectRedis } from './db/redis';
import { startAllWorkers, stopAllWorkers } from './queue/index';
import { initCallEventHandlers } from './events/handlers/callEvent.handler';
import { initToolEventHandlers } from './events/handlers/toolEvent.handler';
import { disconnectEventBus } from './events/eventBus';

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Connect to DB eagerly to surface config issues at startup
  await defaultPrismaClient.$connect();
  logger.info('Default database connected');

  // Initialize event handlers (subscribe before workers produce events)
  initCallEventHandlers();
  initToolEventHandlers();

  // Start BullMQ workers
  startAllWorkers();

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.env, module: config.module.name },
      `Voice Orchestrator listening on port ${config.port}`,
    );
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await stopAllWorkers();
        await disconnectEventBus();
        await defaultPrismaClient.$disconnect();
        await disconnectRedis();
        logger.info('All connections closed — exiting');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });

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
    const err = reason instanceof Error
      ? { message: reason.message, stack: reason.stack, name: reason.name }
      : reason;
    logger.fatal({ err }, 'Unhandled promise rejection — shutting down');
    void shutdown('unhandledRejection');
  });
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
