// ── Omnidim REST API request/response types ───────────────────────────────────

export interface OmnidimCreateAgentRequest {
  name: string;
  language: string;
  voice: string;
  system_prompt: string;
  knowledgebase_id?: string;
  tools?: string[];
  workflow_id?: string;
  max_concurrent_calls?: number;
  metadata?: Record<string, unknown>;
}

export interface OmnidimUpdateAgentRequest {
  name?: string;
  language?: string;
  voice?: string;
  system_prompt?: string;
  knowledgebase_id?: string;
  tools?: string[];
  max_concurrent_calls?: number;
  metadata?: Record<string, unknown>;
}

export interface OmnidimAgentResponse {
  id: string;
  name: string;
  language: string;
  voice: string;
  system_prompt: string;
  knowledgebase_id?: string;
  tools: string[];
  max_concurrent_calls: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OmnidimStartCallRequest {
  agent_id: string;
  to_number: string;
  /** Our internal reference for webhook correlation */
  reference_id?: string;
  metadata?: Record<string, unknown>;
}

export interface OmnidimCallResponse {
  call_id: string;
  status: string;
  agent_id: string;
  to_number: string;
  reference_id?: string;
  created_at: string;
}

export interface OmnidimCallStatusResponse {
  call_id: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  duration?: number;
  recording_url?: string;
  transcript?: string;
  ended_at?: string;
}

export interface OmnidimWebhookPayload {
  event: string;
  call_id: string;
  agent_id?: string;
  reference_id?: string;
  timestamp: string;
  data: {
    status?: string;
    duration?: number;
    transcript?: string;
    summary?: string;
    recording_url?: string;
    tool_name?: string;
    tool_parameters?: Record<string, unknown>;
    tool_request_id?: string;
  };
}

export interface OmnidimErrorResponse {
  error: string;
  message: string;
  code?: string;
}

// ── Full agent config types (for import/detail view) ─────────────────────────

export interface OmnidimContextBreakdown {
  title: string;
  body: string;
  is_enabled?: boolean;
}

export interface OmnidimTranscriberConfig {
  provider: string;
  silence_timeout_ms?: number;
  language?: string;
}

export interface OmnidimModelConfig {
  model: string;
  temperature?: number;
  max_tokens?: number;
}

export interface OmnidimVoiceConfig {
  provider: string;
  voice_id: string;
  speed?: number;
}

export interface OmnidimWebSearchConfig {
  enabled: boolean;
  provider?: string;
}

export interface OmnidimPostCallEmailAction {
  enabled: boolean;
  recipients?: string[];
  subject?: string;
}

export interface OmnidimPostCallWebhookAction {
  enabled: boolean;
  url?: string;
  headers?: Record<string, string>;
}

export interface OmnidimPostCallActions {
  email?: OmnidimPostCallEmailAction;
  webhook?: OmnidimPostCallWebhookAction;
}

export interface OmnidimFillerConfig {
  enabled: boolean;
  after_sec?: number;
  fillers?: string[];
}

export interface OmnidimBackgroundTrackConfig {
  enabled: boolean;
  track_url?: string;
  volume?: number;
}

export interface OmnidimVoicemailConfig {
  enabled: boolean;
  detection_provider?: string;
  message?: string;
}

export interface OmnidimTransferOption {
  number: string;
  backup_numbers?: string[];
  transfer_condition?: string;
  transfer_message?: string;
}

export interface OmnidimTransferConfig {
  enabled: boolean;
  transfer_options?: OmnidimTransferOption[];
}

export interface OmnidimEndCallConfig {
  enabled: boolean;
  condition?: string;
  message?: string;
}

/** Full agent response from GET /agents/{agent_id} — richer than the list response */
export interface OmnidimFullAgent {
  id: string;
  name: string;
  welcome_message?: string;
  context_breakdown?: OmnidimContextBreakdown[];
  transcriber?: OmnidimTranscriberConfig;
  model?: OmnidimModelConfig;
  voice?: OmnidimVoiceConfig;
  web_search?: OmnidimWebSearchConfig;
  post_call_actions?: OmnidimPostCallActions;
  filler?: OmnidimFillerConfig;
  background_track?: OmnidimBackgroundTrackConfig;
  voicemail?: OmnidimVoicemailConfig;
  languages?: string[];
  transfer?: OmnidimTransferConfig;
  end_call?: OmnidimEndCallConfig;
  call_type?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Paginated list response from GET /agents — Omnidim uses "bots" not "agents" */
export interface OmnidimAgentListResponse {
  bots: OmnidimFullAgent[];
  total_records: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
}

/** Payload for creating a full agent via POST /agents/create */
export type OmnidimCreateAgentPayload = Omit<OmnidimFullAgent, 'id' | 'created_at' | 'updated_at'>;
