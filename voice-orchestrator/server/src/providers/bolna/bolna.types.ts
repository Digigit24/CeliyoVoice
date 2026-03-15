// Bolna API types — Phase 2 stub

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
