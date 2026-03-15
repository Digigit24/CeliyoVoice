/**
 * Bolna voice provider adapter — Phase 2 STUB.
 *
 * This adapter returns realistic mock responses so the rest of the system can
 * be built and tested end-to-end without a live Bolna account.
 * All methods log a warning at startup. Replace the stub body with real
 * Bolna API calls in Phase 2.
 */
import type {
  IVoiceProvider,
  AgentCreatePayload,
  AgentUpdatePayload,
  ProviderAgentResponse,
  ProviderCallResponse,
  CallStatusResponse,
  StartCallPayload,
  NormalizedWebhookEvent,
  ProviderCredentials,
} from '../interfaces/voiceProvider.interface';
import { fromBolnaWebhook } from './bolna.mapper';
import type { BolnaWebhookPayload } from './bolna.types';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const STUB_WARNING = 'Bolna adapter is a stub — will be implemented in Phase 2';

export class BolnaAdapter implements IVoiceProvider {
  readonly providerType = 'BOLNA' as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_credentials: ProviderCredentials) {
    logger.warn({ provider: 'BOLNA' }, STUB_WARNING);
  }

  async createAgent(payload: AgentCreatePayload): Promise<ProviderAgentResponse> {
    logger.warn({ method: 'createAgent', name: payload.name }, STUB_WARNING);
    const stubId = `bolna-agent-${uuidv4()}`;
    return { providerAgentId: stubId, raw: { id: stubId, stub: true } };
  }

  async updateAgent(providerAgentId: string, _payload: AgentUpdatePayload): Promise<void> {
    logger.warn({ method: 'updateAgent', providerAgentId }, STUB_WARNING);
  }

  async deleteAgent(providerAgentId: string): Promise<void> {
    logger.warn({ method: 'deleteAgent', providerAgentId }, STUB_WARNING);
  }

  async startCall(params: StartCallPayload): Promise<ProviderCallResponse> {
    logger.warn({ method: 'startCall', phone: params.phone }, STUB_WARNING);
    const stubId = `bolna-call-${uuidv4()}`;
    return { providerCallId: stubId, status: 'ringing', raw: { call_id: stubId, stub: true } };
  }

  async endCall(providerCallId: string): Promise<void> {
    logger.warn({ method: 'endCall', providerCallId }, STUB_WARNING);
  }

  async getCallStatus(providerCallId: string): Promise<CallStatusResponse> {
    logger.warn({ method: 'getCallStatus', providerCallId }, STUB_WARNING);
    return {
      providerCallId,
      status: 'completed',
      duration: 0,
      raw: { call_id: providerCallId, stub: true },
    };
  }

  async handleWebhook(
    payload: Record<string, unknown>,
    _headers: Record<string, string>,
  ): Promise<NormalizedWebhookEvent> {
    logger.warn({ method: 'handleWebhook' }, STUB_WARNING);
    return fromBolnaWebhook(payload as unknown as BolnaWebhookPayload);
  }
}
