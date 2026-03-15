import Redis from 'ioredis';
import { config } from '../core/config';
import { logger } from '../utils/logger';

function createRedisClient(): Redis {
  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('ready', () => {
    logger.info('Redis ready');
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return client;
}

export const redisClient = createRedisClient();

export async function disconnectRedis(): Promise<void> {
  await redisClient.quit();
  logger.info('Redis disconnected');
}
