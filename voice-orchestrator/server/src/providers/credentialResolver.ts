import type { PrismaClient, VoiceProvider } from '@prisma/client';
import { decrypt } from '../utils/crypto';
import { config } from '../core/config';
import { logger } from '../utils/logger';

export interface ResolvedCredentials {
  apiKey: string;
  apiUrl: string;
}

const DEFAULT_API_URLS: Record<VoiceProvider, string> = {
  OMNIDIM: 'https://backend.omnidim.io/api/v1',
  BOLNA: 'https://api.bolna.ai',
};

/**
 * Resolves provider credentials for a tenant.
 *
 * Resolution order:
 *  1. Query ProviderCredential WHERE tenantId AND provider AND isActive.
 *  2. If found → decrypt apiKey, use stored apiUrl (or default if null).
 *  3. If NOT found → fall back to env vars (OMNIDIM_API_KEY / BOLNA_API_KEY).
 *  4. If neither → throw descriptive error.
 */
export async function resolveCredentials(
  tenantId: string,
  provider: VoiceProvider,
  prisma: PrismaClient,
): Promise<ResolvedCredentials> {
  // 1. Try tenant-specific credentials
  const credential = await prisma.providerCredential.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
    select: { apiKey: true, apiUrl: true, isActive: true },
  });

  if (credential?.isActive) {
    try {
      const apiKey = decrypt(credential.apiKey);
      const apiUrl = credential.apiUrl ?? DEFAULT_API_URLS[provider];
      logger.debug({ tenantId, provider }, 'credentialResolver: using tenant credentials');
      return { apiKey, apiUrl };
    } catch (err) {
      logger.warn({ tenantId, provider, err }, 'credentialResolver: failed to decrypt tenant credentials, falling back to env');
    }
  }

  // 2. Fall back to environment variables
  let envApiKey: string | undefined;
  let envApiUrl: string;

  switch (provider) {
    case 'OMNIDIM':
      envApiKey = config.providers.omnidim.apiKey || undefined;
      envApiUrl = config.providers.omnidim.apiUrl || DEFAULT_API_URLS.OMNIDIM;
      break;
    case 'BOLNA':
      envApiKey = config.providers.bolna.apiKey || undefined;
      envApiUrl = config.providers.bolna.apiUrl || DEFAULT_API_URLS.BOLNA;
      break;
  }

  if (envApiKey) {
    logger.debug({ tenantId, provider }, 'credentialResolver: using env fallback credentials');
    return { apiKey: envApiKey, apiUrl: envApiUrl };
  }

  // 3. No credentials found
  throw new Error(
    `No credentials configured for ${provider}. Please add your API key in Settings → Providers.`,
  );
}
