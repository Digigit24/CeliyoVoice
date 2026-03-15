import type { VoiceProvider } from '@prisma/client';

// ── Event type enum ───────────────────────────────────────────────────────────

export enum VoiceEventType {
  CALL_STARTED = 'CALL_STARTED',
  CALL_RINGING = 'CALL_RINGING',
  CALL_CONNECTED = 'CALL_CONNECTED',
  CALL_ENDED = 'CALL_ENDED',
  TRANSCRIPT_UPDATE = 'TRANSCRIPT_UPDATE',
  TRANSCRIPT_FINAL = 'TRANSCRIPT_FINAL',
  TOOL_REQUESTED = 'TOOL_REQUESTED',
  TOOL_COMPLETED = 'TOOL_COMPLETED',
  TOOL_FAILED = 'TOOL_FAILED',
  AGENT_ACTION = 'AGENT_ACTION',
  ERROR = 'ERROR',
}

// ── Event payload interfaces ──────────────────────────────────────────────────

export interface BaseEventPayload {
  callId: string;
  tenantId: string;
  provider: VoiceProvider;
  providerCallId: string;
  timestamp: string;
}

export interface CallStartedPayload extends BaseEventPayload {
  type: VoiceEventType.CALL_STARTED;
  agentId: string;
  phone: string;
}

export interface CallRingingPayload extends BaseEventPayload {
  type: VoiceEventType.CALL_RINGING;
}

export interface CallConnectedPayload extends BaseEventPayload {
  type: VoiceEventType.CALL_CONNECTED;
}

export interface CallEndedPayload extends BaseEventPayload {
  type: VoiceEventType.CALL_ENDED;
  duration?: number;
  recordingUrl?: string;
}

export interface TranscriptUpdatePayload extends BaseEventPayload {
  type: VoiceEventType.TRANSCRIPT_UPDATE;
  transcript: string;
}

export interface TranscriptFinalPayload extends BaseEventPayload {
  type: VoiceEventType.TRANSCRIPT_FINAL;
  transcript: string;
  summary?: string;
}

export interface ToolRequestedPayload extends BaseEventPayload {
  type: VoiceEventType.TOOL_REQUESTED;
  toolName: string;
  parameters: Record<string, unknown>;
  requestId: string;
}

export interface ToolCompletedPayload extends BaseEventPayload {
  type: VoiceEventType.TOOL_COMPLETED;
  toolName: string;
  requestId: string;
  result: Record<string, unknown>;
}

export interface ToolFailedPayload extends BaseEventPayload {
  type: VoiceEventType.TOOL_FAILED;
  toolName: string;
  requestId: string;
  error: string;
}

export interface AgentActionPayload extends BaseEventPayload {
  type: VoiceEventType.AGENT_ACTION;
  action: string;
  data: Record<string, unknown>;
}

export interface ErrorPayload extends BaseEventPayload {
  type: VoiceEventType.ERROR;
  error: string;
  fatal?: boolean;
}

export type VoiceEvent =
  | CallStartedPayload
  | CallRingingPayload
  | CallConnectedPayload
  | CallEndedPayload
  | TranscriptUpdatePayload
  | TranscriptFinalPayload
  | ToolRequestedPayload
  | ToolCompletedPayload
  | ToolFailedPayload
  | AgentActionPayload
  | ErrorPayload;

export type EventHandler = (event: VoiceEvent) => Promise<void> | void;
