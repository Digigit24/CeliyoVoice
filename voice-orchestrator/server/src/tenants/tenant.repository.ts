import { Prisma, type PrismaClient, type Tenant, type VoiceProvider } from '@prisma/client';
import { encrypt, decrypt } from '../utils/crypto';

export interface CreateTenantInput {
  id: string;
  slug: string;
  name: string;
  databaseUrl?: string;
  plan?: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  settings?: Record<string, unknown>;
}

export interface UpsertProviderCredentialInput {
  tenantId: string;
  provider: VoiceProvider;
  apiKey: string;
  apiUrl?: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}

export class TenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  async upsert(input: CreateTenantInput): Promise<Tenant> {
    const createData: Prisma.TenantCreateInput = {
      id: input.id,
      slug: input.slug,
      name: input.name,
      plan: input.plan ?? 'FREE',
      settings: (input.settings ?? {}) as Prisma.InputJsonValue,
    };

    if (input.databaseUrl) {
      createData.databaseUrl = encrypt(input.databaseUrl);
    }

    const updateData: Prisma.TenantUpdateInput = {
      slug: input.slug,
      name: input.name,
      ...(input.databaseUrl ? { databaseUrl: encrypt(input.databaseUrl) } : {}),
      ...(input.plan ? { plan: input.plan } : {}),
      ...(input.settings ? { settings: input.settings as Prisma.InputJsonValue } : {}),
    };

    return this.prisma.tenant.upsert({
      where: { id: input.id },
      create: createData,
      update: updateData,
    });
  }

  async setActive(id: string, isActive: boolean): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data: { isActive } });
  }

  /**
   * Retrieves the decrypted database URL for a tenant.
   * Returns null if the tenant has no dedicated database URL.
   */
  async getDecryptedDatabaseUrl(id: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { databaseUrl: true },
    });

    if (!tenant?.databaseUrl) return null;

    return decrypt(tenant.databaseUrl);
  }

  async upsertProviderCredential(input: UpsertProviderCredentialInput) {
    const encryptedApiKey = encrypt(input.apiKey);

    const createData: Prisma.ProviderCredentialCreateInput = {
      tenant: { connect: { id: input.tenantId } },
      provider: input.provider,
      apiKey: encryptedApiKey,
      apiUrl: input.apiUrl,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
      isDefault: input.isDefault ?? false,
    };

    const updateData: Prisma.ProviderCredentialUpdateInput = {
      apiKey: encryptedApiKey,
      ...(input.apiUrl !== undefined ? { apiUrl: input.apiUrl } : {}),
      ...(input.config ? { config: input.config as Prisma.InputJsonValue } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    };

    const credential = await this.prisma.providerCredential.upsert({
      where: { tenantId_provider: { tenantId: input.tenantId, provider: input.provider } },
      create: createData,
      update: updateData,
    });

    // If this is being set as default, unset other defaults for this tenant
    if (input.isDefault) {
      await this.prisma.providerCredential.updateMany({
        where: {
          tenantId: input.tenantId,
          provider: { not: input.provider },
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return credential;
  }

  /**
   * Returns provider credentials with decrypted API keys.
   */
  async getProviderCredentials(tenantId: string) {
    const credentials = await this.prisma.providerCredential.findMany({
      where: { tenantId, isActive: true },
      orderBy: { isDefault: 'desc' },
    });

    return credentials.map((cred) => ({
      ...cred,
      apiKey: decrypt(cred.apiKey),
    }));
  }

  async createAuditLog(data: {
    tenantId: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    const createData: Prisma.AuditLogCreateInput = {
      tenant: { connect: { id: data.tenantId } },
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: data.ipAddress,
    };

    return this.prisma.auditLog.create({ data: createData });
  }
}
