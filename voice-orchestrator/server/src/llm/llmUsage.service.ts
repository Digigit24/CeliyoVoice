import type { PrismaClient } from '@prisma/client';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'llm-usage' });

export interface RecordUsageParams {
  tenantId: string;
  agentId?: string;
  conversationId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
}

/**
 * Records LLM token usage in the llm_usage table.
 * Fire-and-forget — does not block the caller on failure.
 */
export function recordUsage(prisma: PrismaClient, params: RecordUsageParams): void {
  prisma.lLMUsage
    .create({
      data: {
        tenantId: params.tenantId,
        agentId: params.agentId,
        conversationId: params.conversationId,
        provider: params.provider,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.totalTokens,
        cost: params.cost,
      },
    })
    .then(() => {
      log.debug(
        { provider: params.provider, model: params.model, totalTokens: params.totalTokens },
        'LLM usage recorded',
      );
    })
    .catch((err: unknown) => {
      log.error({ err, params }, 'Failed to record LLM usage');
    });
}
