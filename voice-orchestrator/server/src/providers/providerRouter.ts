import type { PrismaClient, VoiceProvider } from '@prisma/client';
import type { IVoiceProvider } from './interfaces/voiceProvider.interface';
import { OmnidimAdapter } from './omnidim/omnidim.adapter';
import { BolnaAdapter } from './bolna/bolna.adapter';
import { decrypt } from '../utils/crypto';
import { config } from '../core/config';
import { logger } from '../utils/logger';

/** Cache key → adapter instance */
const adapterCache = new Map<string, IVoiceProvider>();

function cacheKey(tenantId: string, provider: VoiceProvider): string {
  return `${tenantId}:${provider}`;
}

/**
 * Resolves the correct IVoiceProvider for a given tenant + provider combination.
 *
 * Resolution order:
 *  1. Check in-memory adapter cache.
 *  2. Look up ProviderCredential in the tenant's DB.
 *  3. If found → decrypt apiKey → use tenant's credentials.
 *  4. If not found → fall back to environment variable defaults.
 *  5. Instantiate adapter, cache it, and return.
 */
export async function getProvider(
  provider: VoiceProvider,
  tenantId: string,
  prisma: PrismaClient,
): Promise<IVoiceProvider> {
  const key = cacheKey(tenantId, provider);
  const cached = adapterCache.get(key);
  if (cached) return cached;

  const credential = await prisma.providerCredential.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
    select: { apiKey: true, apiUrl: true, isActive: true },
  });

  let apiKey: string;
  let apiUrl: string;

  if (credential?.isActive) {
    apiKey = decrypt(credential.apiKey);
    apiUrl = credential.apiUrl ?? defaultApiUrl(provider);
    logger.debug({ tenantId, provider }, 'Using tenant provider credentials');
  } else {
    apiKey = defaultApiKey(provider);
    apiUrl = defaultApiUrl(provider);
    logger.debug({ tenantId, provider }, 'Using environment fallback credentials');
  }

  const adapter = createAdapter(provider, { apiKey, apiUrl });
  adapterCache.set(key, adapter);
  return adapter;
}

function createAdapter(
  provider: VoiceProvider,
  credentials: { apiKey: string; apiUrl: string },
): IVoiceProvider {
  switch (provider) {
    case 'OMNIDIM':
      return new OmnidimAdapter(credentials);
    case 'BOLNA':
      return new BolnaAdapter(credentials);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${String(_exhaustive)}`);
    }
  }
}

function defaultApiKey(provider: VoiceProvider): string {
  switch (provider) {
    case 'OMNIDIM':
      return config.providers.omnidim.apiKey;
    case 'BOLNA':
      return config.providers.bolna.apiKey;
  }
}

function defaultApiUrl(provider: VoiceProvider): string {
  switch (provider) {
    case 'OMNIDIM':
      return config.providers.omnidim.apiUrl;
    case 'BOLNA':
      return config.providers.bolna.apiUrl;
  }
}

/**
 * Clears cached adapter instances for a specific tenant+provider.
 * Call this after updating provider credentials so the next request
 * picks up the new credentials.
 */
export function clearProviderCache(tenantId: string, provider?: VoiceProvider): void {
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
