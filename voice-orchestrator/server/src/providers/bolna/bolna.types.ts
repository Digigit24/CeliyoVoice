// Bolna V2 API types

// ── LLM config ────────────────────────────────────────────────────────────────

export interface BolnaLLMConfig {
  agent_flow_type?: string;
  provider: string;
  family?: string;
  model: string;
  max_tokens?: number;
  temperature?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  base_url?: string;
  top_p?: number;
  min_p?: number;
  top_k?: number;
  request_json?: boolean;
  summarization_details?: unknown;
  extraction_details?: unknown;
}

export interface BolnaRoute {
  route_name: string;
  utterances: string[];
  response: string;
  score_threshold?: number;
}

export interface BolnaLLMAgent {
  agent_type?: string;
  agent_flow_type?: string;
  routes?: {
    embedding_model?: string;
    routes?: BolnaRoute[];
  };
  llm_config: BolnaLLMConfig;
}

// ── Synthesizer / Transcriber ──────────────────────────────────────────────────

export interface BolnaSynthesizerProviderConfig {
  voice?: string;
  voice_id?: string;
  model?: string;
  [key: string]: unknown;
}

export interface BolnaSynthesizerConfig {
  provider: string;
  provider_config?: BolnaSynthesizerProviderConfig;
  voice?: string;
  model?: string;
  language?: string;
  stream?: boolean;
  buffer_size?: number;
  audio_format?: string;
}

export interface BolnaTranscriberConfig {
  provider: string;
  model: string;
  language?: string;
  stream?: boolean;
  sampling_rate?: number;
  encoding?: string;
  endpointing?: number;
}

// ── Task config ────────────────────────────────────────────────────────────────

export interface BolnaTaskConfig {
  hangup_after_silence?: number;
  incremental_delay?: number;
  number_of_words_for_interruption?: number;
  hangup_after_LLMCall?: boolean;
  call_cancellation_prompt?: string | null;
  backchanneling?: boolean;
  backchanneling_message_gap?: number;
  backchanneling_start_delay?: number;
  ambient_noise?: boolean;
  ambient_noise_track?: string;
  call_terminate?: number;
  voicemail?: boolean;
  inbound_limit?: number;
  whitelist_phone_numbers?: string[] | null;
  disallow_unknown_numbers?: boolean;
}

// ── Full tools config in a task ───────────────────────────────────────────────

export interface BolnaFullToolsConfig {
  llm_agent?: BolnaLLMAgent;
  synthesizer?: BolnaSynthesizerConfig;
  transcriber?: BolnaTranscriberConfig;
  input?: { provider?: string; format?: string };
  output?: { provider?: string; format?: string };
  api_tools?: unknown;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export interface BolnaTask {
  task_type: string;
  tools_config: BolnaFullToolsConfig;
  toolchain?: {
    execution?: string;
    pipelines?: string[][];
  };
  task_config?: BolnaTaskConfig;
}

// ── Agent prompts ─────────────────────────────────────────────────────────────

export interface BolnaAgentPrompts {
  task_1?: { system_prompt: string };
  [key: string]: { system_prompt: string } | undefined;
}

// ── Ingest source ─────────────────────────────────────────────────────────────

export interface BolnaIngestSourceConfig {
  source_type?: string;
  source_url?: string;
  source_auth_token?: string;
  source_name?: string;
}

// ── Calling guardrails ────────────────────────────────────────────────────────

export interface BolnaCallingGuardrails {
  call_start_hour?: number;
  call_end_hour?: number;
}

// ── Full agent ────────────────────────────────────────────────────────────────

export interface BolnaAgentV2 {
  id: string;
  agent_name: string;
  agent_type: string;
  agent_status: string;
  tasks: BolnaTask[];
  agent_prompts: BolnaAgentPrompts;
  agent_welcome_message?: string;
  webhook_url?: string | null;
  ingest_source_config?: BolnaIngestSourceConfig;
  calling_guardrails?: BolnaCallingGuardrails;
  created_at?: string;
  updated_at?: string;
}

// ── List response (GET /v2/agent/all returns array directly) ──────────────────

export type BolnaAgentListResponse = BolnaAgentV2[];

// ── Dispatch call ─────────────────────────────────────────────────────────────

export interface BolnaDispatchCallRequest {
  agent_id: string;
  recipient_phone_number: string;
  from_phone_number?: string;
  scheduled_at?: string;
  user_data?: Record<string, string | number | boolean>;
  agent_data?: Record<string, unknown>;
}

export interface BolnaDispatchCallResponse {
  message: string;
  status: string;
  execution_id: string;
}

// ── Execution (call log) ──────────────────────────────────────────────────────

export interface BolnaCostBreakdown {
  llm?: number;
  network?: number;
  platform?: number;
  synthesizer?: number;
  transcriber?: number;
}

export interface BolnaTelephonyData {
  duration?: number;
  to_number?: string;
  from_number?: string;
  recording_url?: string;
  hosted_telephony?: boolean;
  provider_call_id?: string;
  call_type?: string;
  provider?: string;
  hangup_by?: string;
  hangup_reason?: string;
  hangup_provider_code?: number;
  ring_duration?: number;
  post_dial_delay?: number;
  to_number_carrier?: string;
}

export interface BolnaTransferCallData {
  provider_call_id?: string;
  status?: string;
  duration?: number;
  cost?: number;
  to_number?: string;
  from_number?: string;
  recording_url?: string;
  hangup_by?: string;
  hangup_reason?: string;
  hangup_provider_code?: number;
}

export interface BolnaBatchRunDetails {
  status?: string;
  created_at?: string;
  updated_at?: string;
  retried?: number;
}

export interface BolnaExecution {
  id: string;
  agent_id: string;
  batch_id?: string;
  conversation_time?: number;
  total_cost?: number;
  status: string;
  error_message?: string | null;
  answered_by_voice_mail?: boolean;
  transcript?: string | null;
  created_at: string;
  updated_at: string;
  cost_breakdown?: BolnaCostBreakdown;
  telephony_data?: BolnaTelephonyData;
  transfer_call_data?: BolnaTransferCallData;
  batch_run_details?: BolnaBatchRunDetails;
  extracted_data?: Record<string, unknown>;
  context_details?: Record<string, unknown>;
}

export interface BolnaExecutionListResponse {
  page_number: number;
  page_size: number;
  total: number;
  has_more: boolean;
  data: BolnaExecution[];
}

// ── Stop response ─────────────────────────────────────────────────────────────

export interface BolnaStopCallResponse {
  message: string;
  status: string;
  execution_id: string;
}

export interface BolnaStopAllResponse {
  stopped_executions: string[];
}

// ── Execution log ─────────────────────────────────────────────────────────────

export interface BolnaExecutionLogEntry {
  created_at: string;
  type: string;
  component: string;
  provider: string;
  data: string;
}

export interface BolnaExecutionLogResponse {
  data: BolnaExecutionLogEntry[];
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export interface BolnaWebhookPayload {
  event_type: string;
  call_id: string;
  data: Record<string, unknown>;
}

// ── Legacy compat (for adapter) ───────────────────────────────────────────────

export interface BolnaAgentListResponse_Legacy {
  agents: BolnaAgentV2[];
  total?: number;
  page?: number;
  page_size?: number;
}

export interface BolnaCallRequest {
  agent_id: string;
  recipient_phone_number: string;
  user_data?: Record<string, unknown>;
}

export interface BolnaCallResponse {
  call_id: string;
  status: string;
}

// ── Agent create/update payload ───────────────────────────────────────────────

export interface BolnaCreateAgentPayload {
  agent_config: {
    agent_name: string;
    tasks: BolnaTask[];
    agent_welcome_message?: string;
    webhook_url?: string | null;
    agent_type?: string;
    ingest_source_config?: BolnaIngestSourceConfig;
    calling_guardrails?: BolnaCallingGuardrails;
  };
  agent_prompts: BolnaAgentPrompts;
}
