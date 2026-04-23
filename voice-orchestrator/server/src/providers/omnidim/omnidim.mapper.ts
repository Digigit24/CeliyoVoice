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
  // Omnidim ships two webhook shapes:
  //   (A) Real-time event shape:      { event, call_id, data: {...} }
  //   (B) Post-call summary shape:    { call_id, call_request_id, call_status, call_duration, call_report: {...} }
  // The post-call shape has no `event` field, so we infer one from call_status.
  const raw = payload as unknown as Record<string, unknown>;
  const rawEvent = typeof raw['event'] === 'string' ? (raw['event'] as string) : undefined;
  const callStatus =
    typeof raw['call_status'] === 'string' ? (raw['call_status'] as string) : undefined;

  // Prefer call_request_id (matches the dispatch `requestId` we already store
  // as providerCallId); fall back to call_id. Coerce either to string.
  const idSource = raw['call_request_id'] ?? raw['call_id'];
  const providerCallId =
    idSource != null && typeof idSource !== 'object'
      ? String(idSource)
      : idSource != null &&
          typeof idSource === 'object' &&
          (idSource as Record<string, unknown>)['id'] != null
        ? String((idSource as Record<string, unknown>)['id'])
        : '';

  const event: NormalizedWebhookEvent = {
    provider: 'OMNIDIM',
    eventType: normalizeOmnidimEvent(rawEvent, callStatus),
    providerCallId,
    internalCallId: typeof raw['reference_id'] === 'string' ? (raw['reference_id'] as string) : undefined,
    raw,
  };

  // Real-time shape: data.{transcript,summary,duration,recording_url,tool_*}
  const data = (raw['data'] ?? {}) as Record<string, unknown>;
  if (typeof data['transcript'] === 'string') event.transcript = data['transcript'] as string;
  if (typeof data['summary'] === 'string') event.summary = data['summary'] as string;
  if (typeof data['duration'] === 'number') event.duration = data['duration'] as number;
  if (typeof data['recording_url'] === 'string') event.recordingUrl = data['recording_url'] as string;

  // Post-call shape: flat fields on payload + nested call_report
  if (event.duration === undefined && typeof raw['call_duration'] === 'number') {
    event.duration = raw['call_duration'] as number;
  }
  const report = (raw['call_report'] ?? {}) as Record<string, unknown>;
  if (!event.transcript && typeof report['full_conversation'] === 'string') {
    event.transcript = report['full_conversation'] as string;
  }
  if (!event.summary && typeof report['summary'] === 'string') {
    event.summary = report['summary'] as string;
  }
  if (!event.recordingUrl && typeof raw['recording_url'] === 'string') {
    event.recordingUrl = raw['recording_url'] as string;
  }

  if (typeof data['tool_name'] === 'string') {
    event.toolRequest = {
      toolName: data['tool_name'] as string,
      parameters: (data['tool_parameters'] ?? {}) as Record<string, unknown>,
      requestId:
        (data['tool_request_id'] as string | undefined) ?? `${providerCallId}-tool`,
    };
  }

  return event;
}

function normalizeOmnidimEvent(event: string | undefined, callStatus?: string): string {
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
  if (event) return map[event.toLowerCase()] ?? event.toUpperCase();

  // No event field — fall back to call_status from post-call shape.
  const s = callStatus?.toLowerCase();
  if (s === 'completed') return 'CALL_ENDED';
  if (s === 'failed' || s === 'busy' || s === 'no-answer' || s === 'no_answer') return 'ERROR';
  return 'UNKNOWN';
}
