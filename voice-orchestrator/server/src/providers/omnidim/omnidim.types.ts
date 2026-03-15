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
