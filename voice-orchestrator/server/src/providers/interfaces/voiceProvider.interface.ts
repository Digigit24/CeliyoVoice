import type { VoiceProvider } from '@prisma/client';

// ── Shared payload types ──────────────────────────────────────────────────────

export interface AgentCreatePayload {
  name: string;
  voiceLanguage: string;
  voiceModel: string;
  systemPrompt: string;
  knowledgebaseId?: string;
  tools?: string[];
  workflowId?: string;
  maxConcurrentCalls?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentUpdatePayload {
  name?: string;
  voiceLanguage?: string;
  voiceModel?: string;
  systemPrompt?: string;
  knowledgebaseId?: string;
  tools?: string[];
  maxConcurrentCalls?: number;
  metadata?: Record<string, unknown>;
}

export interface ProviderAgentResponse {
  providerAgentId: string;
  raw: Record<string, unknown>;
}

export interface StartCallPayload {
  phone: string;
  /** Agent ID on the provider's platform */
  providerAgentId: string;
  /** Our internal call ID — sent as reference for webhook correlation */
  callId: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderCallResponse {
  providerCallId: string;
  status: string;
  raw: Record<string, unknown>;
}

export interface CallStatusResponse {
  providerCallId: string;
  status: string;
  duration?: number;
  recordingUrl?: string;
  raw: Record<string, unknown>;
}

export interface NormalizedWebhookEvent {
  provider: VoiceProvider;
  eventType: string;
  providerCallId: string;
  /** Our internal call ID if embedded in the webhook */
  internalCallId?: string;
  transcript?: string;
  summary?: string;
  duration?: number;
  recordingUrl?: string;
  toolRequest?: {
    toolName: string;
    parameters: Record<string, unknown>;
    requestId: string;
  };
  raw: Record<string, unknown>;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface IVoiceProvider {
  readonly providerType: VoiceProvider;

  createAgent(payload: AgentCreatePayload): Promise<ProviderAgentResponse>;
  updateAgent(providerAgentId: string, payload: AgentUpdatePayload): Promise<void>;
  deleteAgent(providerAgentId: string): Promise<void>;

  startCall(params: StartCallPayload): Promise<ProviderCallResponse>;
  endCall(providerCallId: string): Promise<void>;
  getCallStatus(providerCallId: string): Promise<CallStatusResponse>;

  handleWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<NormalizedWebhookEvent>;
}

export interface ProviderCredentials {
  apiKey: string;
  apiUrl: string;
}
