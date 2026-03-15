// Bolna V2 API types

// ── V2 Task types ─────────────────────────────────────────────────────────────

export interface BolnaLLMConfig {
  model: string;
  provider: string;
  max_tokens?: number;
  temperature?: number;
  family?: string;
}

export interface BolnaSynthesizerConfig {
  provider: string;
  voice?: string;
  model?: string;
  language?: string;
  stream?: boolean;
}

export interface BolnaTranscriberConfig {
  model: string;
  provider: string;
  stream?: boolean;
  language?: string;
  endpointing?: number;
}

export interface BolnaToolsConfig {
  tools_params?: Array<{
    tool_name: string;
    execution_type?: string;
    webhook_url?: string;
    param_schema?: Record<string, unknown>;
    description?: string;
  }>;
}

export interface BolnaConversationConfig {
  agent_welcome_message?: string;
  call_cancellation_prompt?: string;
  hangup_after_silence?: number;
  incremental_delay?: number;
  ambient_noise?: boolean;
  ambient_noise_track?: string;
}

export interface BolnaTasksConfig {
  task_type: string;
  tools_config: BolnaToolsConfig;
  llm_agent?: {
    agent_task?: string;
    max_retries?: number;
    llm_config: BolnaLLMConfig;
  };
  synthesizer_config: BolnaSynthesizerConfig;
  transcriber_config: BolnaTranscriberConfig;
  conversation_config?: BolnaConversationConfig;
}

// ── V2 Agent prompts ──────────────────────────────────────────────────────────

export interface BolnaAgentPrompts {
  task_1?: {
    system_prompt: string;
  };
  [key: string]: { system_prompt: string } | undefined;
}

// ── V2 Full agent ─────────────────────────────────────────────────────────────

export interface BolnaAgentV2 {
  id: string;
  agent_name: string;
  agent_type: string;
  agent_status: string;
  tasks: BolnaTasksConfig[];
  agent_prompts: BolnaAgentPrompts;
  created_at?: string;
  updated_at?: string;
}

// ── List response ─────────────────────────────────────────────────────────────

export interface BolnaAgentListResponse {
  agents: BolnaAgentV2[];
  total?: number;
  page?: number;
  page_size?: number;
}

// ── Legacy types (kept for backward compatibility with adapter) ───────────────

export interface BolnaAgentConfig {
  name: string;
  agent_welcome_message: string;
  agent_type: string;
  language: string;
}

export interface BolnaAgentResponse {
  agent_id: string;
  agent_name: string;
  created_at: string;
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

export interface BolnaWebhookPayload {
  event_type: string;
  call_id: string;
  data: Record<string, unknown>;
}
