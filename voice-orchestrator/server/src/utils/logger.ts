import fs from 'fs';
import path from 'path';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from '../core/config';

// Ensure logs directory exists
const logsDir = path.resolve(process.cwd(), 'logs');
fs.mkdirSync(logsDir, { recursive: true });

export const logger = pino({
  level: config.isDevelopment ? 'debug' : 'info',
  transport: config.isDevelopment
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'voice-orchestrator' },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
    censor: '[REDACTED]',
  },
});

export const httpLogger = pinoHttp({
  logger,
  customProps: (req) => ({
    requestId: (req as { id?: string }).id,
  }),
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      id: req.id,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Dedicated logger for the dispatch-call API.
 * Always writes JSON to logs/dispatch-calls.log regardless of NODE_ENV.
 * Captures: request, success, and every error variant (validation, provider auth, provider API, internal).
 */
export const callDispatchLogger = pino(
  {
    level: 'debug',
    base: { service: 'voice-orchestrator', component: 'dispatch-call' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
    },
  },
  pino.destination({
    dest: path.join(logsDir, 'dispatch-calls.log'),
    sync: false,
  }),
);
