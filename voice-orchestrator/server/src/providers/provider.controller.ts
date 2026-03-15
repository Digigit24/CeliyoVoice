import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { encrypt, decrypt } from '../utils/crypto';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import { clearProviderCache } from './providerRouter';
import { defaultPrismaClient } from '../db/client';
import {
  CreateProviderCredentialSchema,
  UpdateProviderCredentialSchema,
} from './validators/provider.validators';

/** POST /api/v1/providers/credentials */
export const createCredential: RequestHandler = async (req, res) => {
  const parsed = CreateProviderCredentialSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }
  const { provider, apiKey, apiUrl, config, isDefault } = parsed.data;
  const tenantId = req.tenantId!;
  const prisma = req.prisma!;

  try {
    const credential = await prisma.providerCredential.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: {
        tenantId,
        provider,
        apiKey: encrypt(apiKey),
        apiUrl,
        config: config as Prisma.InputJsonValue,
        isDefault,
      },
      update: {
        apiKey: encrypt(apiKey),
        ...(apiUrl !== undefined ? { apiUrl } : {}),
        config: config as Prisma.InputJsonValue,
        isDefault,
        isActive: true,
      },
    });

    if (isDefault) {
      await prisma.providerCredential.updateMany({
        where: { tenantId, provider: { not: provider }, isDefault: true },
        data: { isDefault: false },
      });
    }

    clearProviderCache(tenantId, provider);

    return success(res, maskCredential(credential), 201);
  } catch (err) {
    return errorResponse(res, 'Failed to save credential', 'INTERNAL_ERROR', 500, String(err));
  }
};

/** GET /api/v1/providers/credentials */
export const listCredentials: RequestHandler = async (req, res) => {
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const credentials = await prisma.providerCredential.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return paginated(res, credentials.map(maskCredential), credentials.length, 1, 100);
};

/** PUT /api/v1/providers/credentials/:id */
export const updateCredential: RequestHandler = async (req, res) => {
  const parsed = UpdateProviderCredentialSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const { id } = req.params as { id: string };
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const existing = await prisma.providerCredential.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return errorResponse(res, 'Credential not found', 'NOT_FOUND', 404);

  const { apiKey, apiUrl, config, isDefault, isActive } = parsed.data;

  const updated = await prisma.providerCredential.update({
    where: { id },
    data: {
      ...(apiKey !== undefined ? { apiKey: encrypt(apiKey) } : {}),
      ...(apiUrl !== undefined ? { apiUrl } : {}),
      ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
      ...(isDefault !== undefined ? { isDefault } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  if (isDefault) {
    await prisma.providerCredential.updateMany({
      where: { tenantId, provider: { not: existing.provider }, isDefault: true },
      data: { isDefault: false },
    });
  }

  clearProviderCache(tenantId, existing.provider);
  return success(res, maskCredential(updated));
};

/** DELETE /api/v1/providers/credentials/:id */
export const deleteCredential: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const existing = await prisma.providerCredential.findFirst({ where: { id, tenantId } });
  if (!existing) return errorResponse(res, 'Credential not found', 'NOT_FOUND', 404);

  await prisma.providerCredential.delete({ where: { id } });
  clearProviderCache(tenantId, existing.provider);
  return success(res, { deleted: true });
};

/** GET /api/v1/providers/available */
export const listAvailableProviders: RequestHandler = async (_req, res) => {
  const configs = await defaultPrismaClient.providerConfig.findMany({
    orderBy: { provider: 'asc' },
    select: { provider: true, displayName: true, isEnabled: true, defaultConfig: true },
  });
  return success(res, configs);
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function maskCredential(credential: {
  id: string;
  tenantId: string;
  provider: string;
  apiKey: string;
  apiUrl?: string | null;
  config: unknown;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  let masked = '****';
  try {
    const plain = decrypt(credential.apiKey);
    masked = `****${plain.slice(-4)}`;
  } catch {
    masked = '****';
  }

  return { ...credential, apiKey: masked };
}
