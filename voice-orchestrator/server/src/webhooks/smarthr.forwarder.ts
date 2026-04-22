import crypto from 'crypto';
import axios from 'axios';
import { config } from '../core/config';
import { logger } from '../utils/logger';

/**
 * Forwards CeliyoVoice call events to SmartHR's webhook endpoints so its UI
 * can move a call through RINGING → IN_PROGRESS → COMPLETED.
 *
 * Payload / auth contract (agreed with SmartHR):
 *   - In-progress events (ringing / in_progress)  → `${base}${statusPath}`
 *   - Terminal events (completed / failed / …)    → `${base}${completedPath}`
 *   - Headers:
 *       X-Webhook-Timestamp: <unix seconds>
 *       X-Webhook-Signature: hex(HMAC_SHA256(secret, f"{timestamp}.{raw_body}"))
 *   - `call_id` **must** equal the id returned from POST /api/v1/calls/start
 *     (our internal Call.id — SmartHR stores it as `provider_call_id`).
 */

export type SmartHRStatus =
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy';

export interface SmartHRScore {
  communication?: number;
  knowledge?: number;
  confidence?: number;
  relevance?: number;
  overall?: number;
  strengths?: string[];
  weaknesses?: string[];
  detailed_feedback?: Record<string, unknown>;
}

export interface SmartHRPayload {
  /** Our internal Call.id — equal to what POST /api/v1/calls/start returned. */
  call_id: string;
  status: SmartHRStatus;
  /** Seconds of actual talk time (in_progress → hangup). 0 if never picked up. */
  duration?: number;
  /** ISO-8601 UTC — when the candidate picked up. */
  started_at?: string;
  /** ISO-8601 UTC — when the call ended. */
  ended_at?: string;
  transcript?: string;
  recording_url?: string;
  summary?: string;
  score?: SmartHRScore;
  /** Short reason string for failed / no_answer / busy (optional). */
  error_message?: string;
}

/** Terminal statuses go to the call-completed endpoint; the rest to call-status. */
const TERMINAL_STATUSES: ReadonlySet<SmartHRStatus> = new Set([
  'completed',
  'failed',
  'no_answer',
  'busy',
]);

function buildSignature(secret: string, timestamp: number, rawBody: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

export async function forwardToSmartHR(payload: SmartHRPayload): Promise<void> {
  if (!config.smarthr.secret) {
    logger.debug(
      { callId: payload.call_id, status: payload.status },
      'SmartHR forwarding skipped — SMARTHR_WEBHOOK_SECRET not configured',
    );
    return;
  }

  const path = TERMINAL_STATUSES.has(payload.status)
    ? config.smarthr.completedPath
    : config.smarthr.statusPath;
  const url = `${config.smarthr.baseUrl}${path}`;

  // Sign the exact body we send — SmartHR recomputes HMAC over the raw bytes.
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignature(config.smarthr.secret, timestamp, rawBody);

  try {
    const response = await axios.post(url, rawBody, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-Signature': signature,
        'User-Agent': 'CeliyoVoice-SmartHR-Forwarder/1.0',
      },
      timeout: config.smarthr.timeoutMs,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      logger.warn(
        { callId: payload.call_id, status: payload.status, url, responseStatus: response.status },
        'SmartHR forwarding returned non-2xx',
      );
      return;
    }

    logger.info(
      { callId: payload.call_id, status: payload.status, url, responseStatus: response.status },
      'Forwarded event to SmartHR',
    );
  } catch (err) {
    // Never let a forwarding failure break webhook processing — the provider
    // already delivered the event to us and we've persisted it.
    logger.error(
      { err, callId: payload.call_id, status: payload.status, url },
      'SmartHR forwarding failed',
    );
  }
}
