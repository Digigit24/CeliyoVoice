import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { encrypt, decrypt } from '../utils/crypto';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import { clearLLMProviderCache } from './llmRouter';
import {
  CreateLLMCredentialSchema,
  UpdateLLMCredentialSchema,
} from './validators/llmCredential.validators';

/** POST /api/v1/llm/credentials */
export const createLLMCredential: RequestHandler = async (req, res) => {
  const parsed = CreateLLMCredentialSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }
  const { provider, apiKey, apiUrl, config, isDefault } = parsed.data;
  const tenantId = req.tenantId!;
  const prisma = req.prisma!;

  try {
    const credential = await prisma.lLMCredential.upsert({
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
      await prisma.lLMCredential.updateMany({
        where: { tenantId, provider: { not: provider }, isDefault: true },
        data: { isDefault: false },
      });
    }

    clearLLMProviderCache(tenantId, provider);

    return success(res, maskCredential(credential), 201);
  } catch (err) {
    return errorResponse(res, 'Failed to save LLM credential', 'INTERNAL_ERROR', 500, String(err));
  }
};

/** GET /api/v1/llm/credentials */
export const listLLMCredentials: RequestHandler = async (req, res) => {
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const credentials = await prisma.lLMCredential.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return paginated(res, credentials.map(maskCredential), credentials.length, 1, 100);
};

/** PUT /api/v1/llm/credentials/:id */
export const updateLLMCredential: RequestHandler = async (req, res) => {
  const parsed = UpdateLLMCredentialSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const { id } = req.params as { id: string };
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const existing = await prisma.lLMCredential.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return errorResponse(res, 'LLM credential not found', 'NOT_FOUND', 404);

  const { apiKey, apiUrl, config, isDefault, isActive } = parsed.data;

  const updated = await prisma.lLMCredential.update({
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
    await prisma.lLMCredential.updateMany({
      where: { tenantId, provider: { not: existing.provider }, isDefault: true },
      data: { isDefault: false },
    });
  }

  clearLLMProviderCache(tenantId, existing.provider);
  return success(res, maskCredential(updated));
};

/** DELETE /api/v1/llm/credentials/:id */
export const deleteLLMCredential: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const existing = await prisma.lLMCredential.findFirst({ where: { id, tenantId } });
  if (!existing) return errorResponse(res, 'LLM credential not found', 'NOT_FOUND', 404);

  await prisma.lLMCredential.delete({ where: { id } });
  clearLLMProviderCache(tenantId, existing.provider);
  return success(res, { deleted: true });
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
