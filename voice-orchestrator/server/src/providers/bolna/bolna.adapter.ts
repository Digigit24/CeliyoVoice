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
import { BolnaService } from './bolna.service';
import { fromBolnaWebhook, fromBolnaAgent, toBolnaCreatePayload, toBolnaPatchPayload } from './bolna.mapper';
import type { BolnaWebhookPayload } from './bolna.types';
import { logger } from '../../utils/logger';

export class BolnaAdapter implements IVoiceProvider {
  readonly providerType = 'BOLNA' as const;
  private readonly svc: BolnaService;

  constructor(credentials: ProviderCredentials) {
    this.svc = new BolnaService(credentials.apiKey, credentials.apiUrl);
    logger.info({ provider: 'BOLNA', apiUrl: credentials.apiUrl }, 'BolnaAdapter initialized');
  }

  async createAgent(payload: AgentCreatePayload): Promise<ProviderAgentResponse> {
    const bolnaPayload = toBolnaCreatePayload(payload);
    const agent = await this.svc.createAgent(bolnaPayload);
    logger.info({ provider: 'BOLNA', agentId: agent.id, name: agent.agent_name }, 'Agent created on Bolna');
    return fromBolnaAgent(agent);
  }

  async updateAgent(providerAgentId: string, payload: AgentUpdatePayload): Promise<void> {
    const patchPayload = toBolnaPatchPayload(payload);
    await this.svc.patchAgent(providerAgentId, patchPayload);
    logger.info({ provider: 'BOLNA', providerAgentId }, 'Agent updated on Bolna');
  }

  async deleteAgent(providerAgentId: string): Promise<void> {
    // Bolna API does not expose a delete endpoint — stop all executions instead
    logger.warn(
      { provider: 'BOLNA', providerAgentId },
      'Bolna does not support agent deletion; stopping all active executions',
    );
    try {
      await this.svc.stopAllExecutions(providerAgentId);
    } catch {
      // Best-effort — not critical
    }
  }

  async startCall(params: StartCallPayload): Promise<ProviderCallResponse> {
    const resp = await this.svc.dispatchCall({
      agent_id: params.providerAgentId!,
      recipient_phone_number: params.phone,
      ...(params.fromPhone ? { from_phone_number: params.fromPhone } : {}),
      ...(params.metadata ? { user_data: params.metadata as Record<string, string> } : {}),
    });

    logger.info(
      { provider: 'BOLNA', executionId: resp.execution_id, status: resp.status },
      'Call dispatched via Bolna',
    );

    return {
      providerCallId: resp.execution_id,
      status: resp.status,
      raw: resp as unknown as Record<string, unknown>,
    };
  }

  async endCall(providerCallId: string): Promise<void> {
    await this.svc.stopCall(providerCallId);
    logger.info({ provider: 'BOLNA', executionId: providerCallId }, 'Call stopped on Bolna');
  }

  async getCallStatus(providerCallId: string): Promise<CallStatusResponse> {
    const exec = await this.svc.getExecution(providerCallId);
    return {
      providerCallId,
      status: exec.status,
      duration: exec.telephony_data?.duration ?? exec.conversation_time,
      raw: exec as unknown as Record<string, unknown>,
    };
  }

  async handleWebhook(
    payload: Record<string, unknown>,
    _headers: Record<string, string>,
  ): Promise<NormalizedWebhookEvent> {
    return fromBolnaWebhook(payload as unknown as BolnaWebhookPayload);
  }
}
