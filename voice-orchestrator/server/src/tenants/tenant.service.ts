import type { VoiceProvider } from '@prisma/client';
import { TenantRepository, type UpsertProviderCredentialInput } from './tenant.repository';
import { defaultPrismaClient } from '../db/client';
import { logger } from '../utils/logger';

export class TenantService {
  private readonly repository: TenantRepository;

  constructor() {
    this.repository = new TenantRepository(defaultPrismaClient);
  }

  /**
   * Upserts a voice provider credential for a tenant.
   * The API key is encrypted before persistence.
   */
  async upsertProviderCredential(input: UpsertProviderCredentialInput) {
    const credential = await this.repository.upsertProviderCredential(input);
    logger.info(
      { tenantId: input.tenantId, provider: input.provider },
      'Provider credential upserted',
    );
    return credential;
  }

  /**
   * Returns all active provider credentials for a tenant with decrypted API keys.
   * Never log or expose the returned keys.
   */
  async getProviderCredentials(tenantId: string) {
    return this.repository.getProviderCredentials(tenantId);
  }

  /**
   * Returns the default provider credential for the tenant,
   * or the first active one if no default is set.
   */
  async getDefaultProviderCredential(tenantId: string, provider?: VoiceProvider) {
    const credentials = await this.repository.getProviderCredentials(tenantId);

    if (provider) {
      return credentials.find((c) => c.provider === provider) ?? null;
    }

    return credentials.find((c) => c.isDefault) ?? credentials[0] ?? null;
  }

  async logAuditEvent(data: {
    tenantId: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await this.repository.createAuditLog(data);
    } catch (err) {
      // Audit log failure must never break the main request flow
      logger.error({ err, ...data }, 'Failed to write audit log');
    }
  }
}

export const tenantService = new TenantService();
