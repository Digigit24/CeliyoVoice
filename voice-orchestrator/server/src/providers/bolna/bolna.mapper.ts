import type { NormalizedWebhookEvent } from '../interfaces/voiceProvider.interface';
import type {
  BolnaAgentV2,
  BolnaWebhookPayload,
} from './bolna.types';
import type {
  ProviderAgentResponse,
  AgentCreatePayload,
  AgentUpdatePayload,
} from '../interfaces/voiceProvider.interface';

export function fromBolnaWebhook(payload: BolnaWebhookPayload): NormalizedWebhookEvent {
  return {
    provider: 'BOLNA',
    eventType: payload.event_type.toUpperCase().replace('.', '_'),
    providerCallId: payload.call_id,
    raw: payload as unknown as Record<string, unknown>,
  };
}

export function fromBolnaAgent(agent: BolnaAgentV2): ProviderAgentResponse {
  return {
    providerAgentId: agent.id,
    raw: agent as unknown as Record<string, unknown>,
  };
}

/**
 * Build a Bolna create payload from a provider-agnostic AgentCreatePayload.
 * We create a minimal conversation task with defaults.
 */
export function toBolnaCreatePayload(payload: AgentCreatePayload) {
  return {
    agent_config: {
      agent_name: payload.name,
      agent_type: 'other',
      tasks: [
        {
          task_type: 'conversation',
          tools_config: {
            llm_agent: {
              agent_type: 'simple_llm_agent',
              agent_flow_type: 'streaming',
              llm_config: {
                provider: 'openai',
                family: 'openai',
                model: 'gpt-4o-mini',
                agent_flow_type: 'streaming',
                max_tokens: 150,
                temperature: 0.1,
              },
            },
            synthesizer: {
              provider: 'elevenlabs',
              stream: true,
              audio_format: 'wav',
            },
            transcriber: {
              provider: 'deepgram',
              model: 'nova-2',
              language: payload.language ?? 'en',
              stream: true,
            },
          },
          task_config: {
            hangup_after_silence: 10,
            incremental_delay: 400,
          },
        },
      ],
      agent_welcome_message: payload.welcomeMessage ?? '',
      webhook_url: null,
    },
    agent_prompts: {
      task_1: {
        system_prompt: payload.systemPrompt ?? '',
      },
    },
  };
}

/** Build a PATCH payload for updating agent system prompt / welcome message */
export function toBolnaPatchPayload(payload: AgentUpdatePayload) {
  return {
    agent_config: {
      ...(payload.name ? { agent_name: payload.name } : {}),
      ...(payload.welcomeMessage !== undefined ? { agent_welcome_message: payload.welcomeMessage } : {}),
    },
    agent_prompts: payload.systemPrompt
      ? { task_1: { system_prompt: payload.systemPrompt } }
      : undefined,
  };
}
