import type { PrismaClient, LLMProvider as LLMProviderEnum } from '@prisma/client';
import type { ILLMProvider } from './interfaces/llmProvider.interface';
import { OpenAIAdapter } from './openai/openai.adapter';
import { AnthropicAdapter } from './anthropic/anthropic.adapter';
import { GoogleAdapter } from './google/google.adapter';
import { decrypt } from '../utils/crypto';
import { config } from '../core/config';
import { logger } from '../utils/logger';

/** Cache key → adapter instance */
const adapterCache = new Map<string, ILLMProvider>();

function cacheKey(tenantId: string, provider: LLMProviderEnum): string {
  return `${tenantId}:${provider}`;
}

/**
 * Resolves the correct ILLMProvider for a given tenant + provider combination.
 *
 * Resolution order:
 *  1. Check in-memory adapter cache.
 *  2. Look up LLMCredential in the tenant's DB.
 *  3. If found → decrypt apiKey → instantiate adapter.
 *  4. If not found → fall back to environment variable defaults.
 *  5. Cache and return.
 */
export async function getLLMProvider(
  provider: LLMProviderEnum,
  tenantId: string,
  prisma: PrismaClient,
): Promise<ILLMProvider> {
  const key = cacheKey(tenantId, provider);
  const cached = adapterCache.get(key);
  if (cached) return cached;

  const credential = await prisma.lLMCredential.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
    select: { apiKey: true, apiUrl: true, isActive: true },
  });

  let apiKey: string;
  let apiUrl: string | undefined;

  if (credential?.isActive) {
    apiKey = decrypt(credential.apiKey);
    apiUrl = credential.apiUrl ?? undefined;
    logger.debug({ tenantId, provider }, 'Using tenant LLM credentials');
  } else {
    apiKey = defaultApiKey(provider);
    apiUrl = defaultApiUrl(provider);
    logger.debug({ tenantId, provider }, 'Using environment fallback LLM credentials');
  }

  const adapter = createAdapter(provider, { apiKey, apiUrl });
  adapterCache.set(key, adapter);
  return adapter;
}

function createAdapter(
  provider: LLMProviderEnum,
  credentials: { apiKey: string; apiUrl?: string },
): ILLMProvider {
  switch (provider) {
    case 'OPENAI':
      return new OpenAIAdapter(credentials);
    case 'ANTHROPIC':
      return new AnthropicAdapter(credentials);
    case 'GOOGLE':
      return new GoogleAdapter(credentials);
    case 'GROQ':
    case 'CUSTOM':
      throw new Error(`LLM provider ${provider} is not yet supported`);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown LLM provider: ${String(_exhaustive)}`);
    }
  }
}

function defaultApiKey(provider: LLMProviderEnum): string {
  switch (provider) {
    case 'OPENAI':
      return config.llm.openai.apiKey;
    case 'ANTHROPIC':
      return config.llm.anthropic.apiKey;
    case 'GOOGLE':
      return config.llm.google.apiKey;
    default:
      throw new Error(`No default API key configured for LLM provider: ${provider}`);
  }
}

function defaultApiUrl(provider: LLMProviderEnum): string | undefined {
  switch (provider) {
    case 'OPENAI':
      return config.llm.openai.apiUrl || undefined;
    case 'ANTHROPIC':
      return config.llm.anthropic.apiUrl || undefined;
    case 'GOOGLE':
      return config.llm.google.apiUrl || undefined;
    default:
      return undefined;
  }
}

/**
 * Clears cached adapter instances for a specific tenant+provider.
 * Call this after updating LLM credentials so the next request
 * picks up the new credentials.
 */
export function clearLLMProviderCache(tenantId: string, provider?: LLMProviderEnum): void {
  if (provider) {
    adapterCache.delete(cacheKey(tenantId, provider));
  } else {
    for (const key of adapterCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        adapterCache.delete(key);
      }
    }
  }
}
