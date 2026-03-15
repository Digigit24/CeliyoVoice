import type {
  AgentCreatePayload,
  AgentUpdatePayload,
  ProviderAgentResponse,
  ProviderCallResponse,
  NormalizedWebhookEvent,
  StartCallPayload,
} from '../interfaces/voiceProvider.interface';
import type {
  OmnidimCreateAgentRequest,
  OmnidimUpdateAgentRequest,
  OmnidimAgentResponse,
  OmnidimCallResponse,
  OmnidimWebhookPayload,
} from './omnidim.types';

export function toOmnidimAgent(payload: AgentCreatePayload): OmnidimCreateAgentRequest {
  return {
    name: payload.name,
    language: payload.voiceLanguage,
    voice: payload.voiceModel,
    system_prompt: payload.systemPrompt,
    ...(payload.knowledgebaseId ? { knowledgebase_id: payload.knowledgebaseId } : {}),
    ...(payload.tools?.length ? { tools: payload.tools } : {}),
    ...(payload.workflowId ? { workflow_id: payload.workflowId } : {}),
    ...(payload.maxConcurrentCalls ? { max_concurrent_calls: payload.maxConcurrentCalls } : {}),
    ...(payload.metadata ? { metadata: payload.metadata } : {}),
  };
}

export function toOmnidimAgentUpdate(payload: AgentUpdatePayload): OmnidimUpdateAgentRequest {
  const out: OmnidimUpdateAgentRequest = {};
  if (payload.name !== undefined) out.name = payload.name;
  if (payload.voiceLanguage !== undefined) out.language = payload.voiceLanguage;
  if (payload.voiceModel !== undefined) out.voice = payload.voiceModel;
  if (payload.systemPrompt !== undefined) out.system_prompt = payload.systemPrompt;
  if (payload.knowledgebaseId !== undefined) out.knowledgebase_id = payload.knowledgebaseId;
  if (payload.tools !== undefined) out.tools = payload.tools;
  if (payload.maxConcurrentCalls !== undefined) out.max_concurrent_calls = payload.maxConcurrentCalls;
  if (payload.metadata !== undefined) out.metadata = payload.metadata;
  return out;
}

export function fromOmnidimAgent(resp: OmnidimAgentResponse): ProviderAgentResponse {
  return {
    providerAgentId: resp.id,
    raw: resp as unknown as Record<string, unknown>,
  };
}

export function toOmnidimCall(params: StartCallPayload): import('./omnidim.types').OmnidimStartCallRequest {
  return {
    agent_id: params.providerAgentId,
    to_number: params.phone,
    reference_id: params.callId,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };
}

export function fromOmnidimCall(resp: OmnidimCallResponse): ProviderCallResponse {
  return {
    providerCallId: resp.call_id,
    status: resp.status,
    raw: resp as unknown as Record<string, unknown>,
  };
}

export function fromOmnidimWebhook(payload: OmnidimWebhookPayload): NormalizedWebhookEvent {
  const event: NormalizedWebhookEvent = {
    provider: 'OMNIDIM',
    eventType: normalizeOmnidimEvent(payload.event),
    providerCallId: payload.call_id,
    internalCallId: payload.reference_id,
    raw: payload as unknown as Record<string, unknown>,
  };

  if (payload.data.transcript) event.transcript = payload.data.transcript;
  if (payload.data.summary) event.summary = payload.data.summary;
  if (payload.data.duration !== undefined) event.duration = payload.data.duration;
  if (payload.data.recording_url) event.recordingUrl = payload.data.recording_url;

  if (payload.data.tool_name) {
    event.toolRequest = {
      toolName: payload.data.tool_name,
      parameters: payload.data.tool_parameters ?? {},
      requestId: payload.data.tool_request_id ?? `${payload.call_id}-tool`,
    };
  }

  return event;
}

function normalizeOmnidimEvent(event: string): string {
  const map: Record<string, string> = {
    'call.started': 'CALL_STARTED',
    'call.ringing': 'CALL_RINGING',
    'call.connected': 'CALL_CONNECTED',
    'call.ended': 'CALL_ENDED',
    'call.completed': 'CALL_ENDED',
    'call.failed': 'ERROR',
    'transcript.update': 'TRANSCRIPT_UPDATE',
    'transcript.final': 'TRANSCRIPT_FINAL',
    'tool.requested': 'TOOL_REQUESTED',
    'tool.completed': 'TOOL_COMPLETED',
    'tool.failed': 'TOOL_FAILED',
    'agent.action': 'AGENT_ACTION',
  };
  return map[event.toLowerCase()] ?? event.toUpperCase();
}
