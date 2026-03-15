import { Prisma, type PrismaClient, type VoiceProvider } from '@prisma/client';
import { encrypt, decrypt } from '../utils/crypto';

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

  async upsertProviderCredential(input: UpsertProviderCredentialInput) {
    const encryptedApiKey = encrypt(input.apiKey);

    const credential = await this.prisma.providerCredential.upsert({
      where: { tenantId_provider: { tenantId: input.tenantId, provider: input.provider } },
      create: {
        tenantId: input.tenantId,
        provider: input.provider,
        apiKey: encryptedApiKey,
        apiUrl: input.apiUrl,
        config: (input.config ?? {}) as Prisma.InputJsonValue,
        isDefault: input.isDefault ?? false,
      },
      update: {
        apiKey: encryptedApiKey,
        ...(input.apiUrl !== undefined ? { apiUrl: input.apiUrl } : {}),
        ...(input.config ? { config: input.config as Prisma.InputJsonValue } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });

    // If this is being set as default, unset other defaults for this tenant
    if (input.isDefault) {
      await this.prisma.providerCredential.updateMany({
        where: { tenantId: input.tenantId, provider: { not: input.provider }, isDefault: true },
        data: { isDefault: false },
      });
    }

    return credential;
  }

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
    return this.prisma.auditLog.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        metadata: (data.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        ipAddress: data.ipAddress,
      },
    });
  }
}
