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
 *  1. ProviderCredential in DB WHERE tenantId AND provider AND isActive.
 *  2. If found → decrypt apiKey, use stored apiUrl (or hardcoded default if null).
 *  3. If NOT found → fall back to env vars (OMNIDIM_API_KEY / BOLNA_API_KEY).
 *  4. If neither → throw descriptive error.
 *
 * Logs the credential source and resolved URL at INFO level so you can always
 * see what URL is actually being called.
 */
export async function resolveCredentials(
  tenantId: string,
  provider: VoiceProvider,
  prisma: PrismaClient,
): Promise<ResolvedCredentials> {
  // 1. Try tenant-specific credentials from DB
  const credential = await prisma.providerCredential.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
    select: { apiKey: true, apiUrl: true, isActive: true },
  });

  if (credential?.isActive) {
    try {
      const apiKey = decrypt(credential.apiKey);
      // Use the stored URL, but fall back to the hardcoded default (NOT the env var)
      // so a stale DB record with the old domain doesn't break things.
      const rawUrl = credential.apiUrl;
      const apiUrl = (rawUrl && rawUrl.trim() !== '') ? rawUrl.trim() : DEFAULT_API_URLS[provider];

      logger.info(
        {
          provider,
          tenantId,
          source: 'database',
          rawStoredUrl: rawUrl ?? '(null — using default)',
          resolvedUrl: apiUrl,
          keyPrefix: apiKey.slice(0, 8) + '...',
        },
        `credentialResolver: using DB credential for ${provider}`,
      );

      return { apiKey, apiUrl };
    } catch (err) {
      logger.warn(
        { tenantId, provider, err },
        'credentialResolver: failed to decrypt DB credential, falling back to env',
      );
    }
  } else {
    logger.info(
      { provider, tenantId, hasRecord: Boolean(credential), isActive: credential?.isActive },
      `credentialResolver: no active DB credential for ${provider}, trying env`,
    );
  }

  // 2. Fall back to environment variables
  let envApiKey: string | undefined;
  let envApiUrl: string;

  switch (provider) {
    case 'OMNIDIM':
      envApiKey = config.providers.omnidim.apiKey || undefined;
      // Env var URL takes precedence; fall back to hardcoded default
      envApiUrl = (config.providers.omnidim.apiUrl || '').trim() || DEFAULT_API_URLS.OMNIDIM;
      break;
    case 'BOLNA':
      envApiKey = config.providers.bolna.apiKey || undefined;
      envApiUrl = (config.providers.bolna.apiUrl || '').trim() || DEFAULT_API_URLS.BOLNA;
      break;
  }

  if (envApiKey) {
    logger.info(
      {
        provider,
        tenantId,
        source: 'env',
        resolvedUrl: envApiUrl,
        envVar: provider === 'OMNIDIM' ? 'OMNIDIM_API_URL' : 'BOLNA_API_URL',
        keyPrefix: envApiKey.slice(0, 8) + '...',
      },
      `credentialResolver: using env credential for ${provider}`,
    );
    return { apiKey: envApiKey, apiUrl: envApiUrl };
  }

  // 3. No credentials found anywhere
  throw new Error(
    `No credentials configured for ${provider}. ` +
    `Please add your API key in Settings → Providers.`,
  );
}
