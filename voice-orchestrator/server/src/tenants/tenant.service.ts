import type { Tenant, VoiceProvider } from '@prisma/client';
import { TenantRepository, type CreateTenantInput, type UpsertProviderCredentialInput } from './tenant.repository';
import { defaultPrismaClient } from '../db/client';
import { disconnectAllTenantClients } from '../db/tenantClients';
import { logger } from '../utils/logger';

export class TenantService {
  private readonly repository: TenantRepository;

  constructor() {
    this.repository = new TenantRepository(defaultPrismaClient);
  }

  /**
   * Syncs a tenant record from SuperAdmin into the local DB.
   * Creates or updates — does NOT delete (SuperAdmin is source of truth).
   */
  async syncTenant(input: CreateTenantInput): Promise<Tenant> {
    const tenant = await this.repository.upsert(input);
    logger.info({ tenantId: tenant.id, slug: tenant.slug }, 'Tenant synced');
    return tenant;
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    return this.repository.findById(id);
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.repository.findBySlug(slug);
  }

  /**
   * Updates a tenant's dedicated database URL (encrypted at rest).
   * After updating, evicts the cached Prisma client so the new URL takes effect.
   */
  async setTenantDatabaseUrl(tenantId: string, databaseUrl: string | null): Promise<void> {
    if (databaseUrl) {
      await this.repository.upsert({
        id: tenantId,
        slug: (await this.repository.findById(tenantId))?.slug ?? tenantId,
        name: (await this.repository.findById(tenantId))?.name ?? tenantId,
        databaseUrl,
      });
    } else {
      await defaultPrismaClient.tenant.update({
        where: { id: tenantId },
        data: { databaseUrl: null },
      });
    }

    // Force re-resolution of the Prisma client on next request
    await disconnectAllTenantClients();
    logger.info({ tenantId }, 'Tenant database URL updated — tenant clients evicted');
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

  async deactivateTenant(tenantId: string): Promise<void> {
    await this.repository.setActive(tenantId, false);
    logger.warn({ tenantId }, 'Tenant deactivated');
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
