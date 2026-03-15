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

/**
 * Full agent / bot object from Omnidim.
 * The list endpoint (GET /agents) returns a flat structure with integer id and
 * direct fields like `bot_call_type`, `voice` (string ID), `language` (array).
 * The single-fetch endpoint may return a richer shape — both are covered here.
 */
export interface OmnidimFullAgent {
  /** Integer in list response, string in some single-fetch responses */
  id: number | string;
  name: string;
  bot_type?: string;

  // ── Voice ───────────────────────────────────────────────────────────────
  /** Voice ID string in list response */
  voice?: string | OmnidimVoiceConfig;
  voice_provider?: string;
  voice_external_id?: string;
  english_voice_accent?: string;
  voice_name?: string;
  speech_speed?: number;

  // ── Language ────────────────────────────────────────────────────────────
  /** Array of language names in list response (e.g. ["English","Hindi"]) */
  language?: string | string[];
  /** Legacy: language codes array */
  languages?: string[];

  // ── LLM / model ─────────────────────────────────────────────────────────
  llm_service?: string;
  model?: OmnidimModelConfig;

  // ── Call type ────────────────────────────────────────────────────────────
  /** "Outgoing" | "Incoming" — used in list response */
  bot_call_type?: string;
  /** Legacy single-fetch alias */
  call_type?: string;

  // ── Filler / noise ──────────────────────────────────────────────────────
  is_filler_enable?: boolean;
  filler_after_sec?: number;
  fillers?: unknown;
  background_noise_enabled?: boolean;
  background_noice_name?: unknown;
  background_audio_volume?: number;

  // ── End call ────────────────────────────────────────────────────────────
  is_end_call_enabled?: boolean;
  end_call_condition?: string | false;
  end_call_message?: string | false;
  end_call_message_type?: string;
  end_call_message_prompt?: string | false;

  // ── Voicemail ───────────────────────────────────────────────────────────
  voicemail_enabled?: boolean;

  // ── Web search ──────────────────────────────────────────────────────────
  enable_web_search?: boolean;
  web_search_engine?: string | false;
  web_search?: OmnidimWebSearchConfig;

  // ── Rich/legacy fields (single-fetch shape) ─────────────────────────────
  welcome_message?: string;
  context_breakdown?: OmnidimContextBreakdown[];
  transcriber?: OmnidimTranscriberConfig;
  post_call_actions?: OmnidimPostCallActions;
  filler?: OmnidimFillerConfig;
  background_track?: OmnidimBackgroundTrackConfig;
  voicemail?: OmnidimVoicemailConfig;
  transfer?: OmnidimTransferConfig;
  end_call?: OmnidimEndCallConfig;

  // ── Status / metadata ───────────────────────────────────────────────────
  is_active?: boolean;
  allow_to_delete?: boolean;
  created_at?: string;
  updated_at?: string;
  user_id?: number;
  user_name?: string;

  // ── Catch-all for extra fields ──────────────────────────────────────────
  [key: string]: unknown;
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
