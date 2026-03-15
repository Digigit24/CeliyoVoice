import Redis from 'ioredis';
import { config } from '../core/config';
import { logger } from '../utils/logger';
import type { VoiceEvent, EventHandler } from './eventTypes';

const CHANNEL_PREFIX = 'voiceai:events';

/** Dedicated publisher connection. */
const publisher = new Redis(config.redis.url, { lazyConnect: false });

/** Dedicated subscriber connection (blocked in subscribe mode). */
const subscriber = new Redis(config.redis.url, { lazyConnect: false });

publisher.on('error', (err) => logger.error({ err }, 'Event bus publisher error'));
subscriber.on('error', (err) => logger.error({ err }, 'Event bus subscriber error'));

/** Map of eventType → registered handlers */
const handlers = new Map<string, EventHandler[]>();

/** Wildcard handlers invoked for every event type. */
const wildcardHandlers: EventHandler[] = [];

let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;

  // Subscribe to all voiceai event channels
  void subscriber.psubscribe(`${CHANNEL_PREFIX}:*`);

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const eventType = channel.replace(`${CHANNEL_PREFIX}:`, '');
    let event: VoiceEvent;

    try {
      event = JSON.parse(message) as VoiceEvent;
    } catch (err) {
      logger.error({ err, channel, message }, 'Failed to parse event bus message');
      return;
    }

    const eventHandlers = handlers.get(eventType) ?? [];
    const allHandlers = [...wildcardHandlers, ...eventHandlers];

    for (const handler of allHandlers) {
      Promise.resolve(handler(event)).catch((err: unknown) => {
        logger.error({ err, eventType, callId: event.callId }, 'Event handler threw');
      });
    }
  });
}

/**
 * Publishes a VoiceEvent to Redis pub/sub.
 * All subscribers on the same instance will receive the event.
 */
export async function publish(event: VoiceEvent): Promise<void> {
  const channel = `${CHANNEL_PREFIX}:${event.type}`;
  try {
    await publisher.publish(channel, JSON.stringify(event));
  } catch (err) {
    logger.error({ err, eventType: event.type }, 'Failed to publish event');
    throw err;
  }
}

/**
 * Subscribes a handler to a specific event type.
 * Pass '*' as eventType to receive all events.
 */
export function subscribe(eventType: string, handler: EventHandler): void {
  ensureSubscribed();

  if (eventType === '*') {
    wildcardHandlers.push(handler);
    return;
  }

  const existing = handlers.get(eventType) ?? [];
  existing.push(handler);
  handlers.set(eventType, existing);
}

/**
 * Removes all handlers for a specific event type.
 */
export function unsubscribe(eventType: string): void {
  if (eventType === '*') {
    wildcardHandlers.length = 0;
    return;
  }
  handlers.delete(eventType);
}

/**
 * Gracefully disconnects pub/sub connections.
 */
export async function disconnectEventBus(): Promise<void> {
  await Promise.allSettled([publisher.quit(), subscriber.quit()]);
}
