// Bolna mapper — Phase 2 stub
// Will be implemented when Bolna API integration is complete.

import type { NormalizedWebhookEvent } from '../interfaces/voiceProvider.interface';
import type { BolnaWebhookPayload } from './bolna.types';

export function fromBolnaWebhook(payload: BolnaWebhookPayload): NormalizedWebhookEvent {
  return {
    provider: 'BOLNA',
    eventType: payload.event_type.toUpperCase().replace('.', '_'),
    providerCallId: payload.call_id,
    raw: payload as unknown as Record<string, unknown>,
  };
}
