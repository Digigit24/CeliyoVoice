import type { RequestHandler } from 'express';
import { z } from 'zod';
import { encrypt, decrypt } from '../utils/crypto';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import { clearCredentialTokenCache } from './credentialResolver';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'tool-credential' });

const AUTH_TYPES = ['NONE', 'API_KEY', 'BEARER', 'OAUTH', 'PLATFORM'] as const;

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  authType: z.enum(AUTH_TYPES),
  authConfig: z.record(z.unknown()),
  service: z.string().max(255).optional(),
}).superRefine((data, ctx) => {
  const c = data.authConfig;
  switch (data.authType) {
    case 'BEARER':
      if (!c['token']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'BEARER requires "token" in authConfig', path: ['authConfig'] });
      break;
    case 'API_KEY':
      if (!c['apiKey'] && !c['value']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'API_KEY requires "apiKey" in authConfig', path: ['authConfig'] });
      break;
    case 'PLATFORM':
      if (!c['token']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PLATFORM requires "token" (JWT) in authConfig', path: ['authConfig'] });
      break;
    case 'OAUTH':
      if (!c['tokenUrl']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OAUTH requires "tokenUrl" in authConfig', path: ['authConfig'] });
      if (!c['clientId']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OAUTH requires "clientId" in authConfig', path: ['authConfig'] });
      if (!c['clientSecret'] && !c['refreshToken']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OAUTH requires "clientSecret" (client_credentials) or "refreshToken" (refresh_token flow)', path: ['authConfig'] });
      break;
  }
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  authType: z.enum(AUTH_TYPES).optional(),
  authConfig: z.record(z.unknown()).optional(),
  service: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional(),
});

function maskConfig(config: unknown): Record<string, unknown> {
  const obj = config as Record<string, unknown>;
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.length > 4) {
      masked[k] = `****${v.slice(-4)}`;
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

function decryptConfig(encrypted: unknown): Record<string, unknown> {
  try {
    const str = typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted);
    return JSON.parse(decrypt(str)) as Record<string, unknown>;
  } catch {
    return encrypted as Record<string, unknown>;
  }
}

function maskCredential(cred: { id: string; tenantId: string; name: string; authType: string; authConfig: unknown; service: string | null; isActive: boolean; createdAt: Date; updatedAt: Date; _count?: { tools: number } }) {
  let maskedConfig: Record<string, unknown> = {};
  try {
    maskedConfig = maskConfig(decryptConfig(cred.authConfig));
  } catch {
    maskedConfig = { masked: true };
  }
  return { ...cred, authConfig: maskedConfig };
}

/** POST /api/v1/tools/credentials */
export const createToolCredential: RequestHandler = async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  const prisma = req.prisma!;
  const cred = await prisma.toolCredential.create({
    data: {
      tenantId: req.tenantId!,
      ownerUserId: req.userId!,
      name: parsed.data.name,
      authType: parsed.data.authType,
      authConfig: encrypt(JSON.stringify(parsed.data.authConfig)),
      service: parsed.data.service,
    },
    include: { _count: { select: { tools: true } } },
  });

  log.info({ credentialId: cred.id, tenantId: req.tenantId }, 'Tool credential created');
  return success(res, maskCredential(cred), 201);
};

/** GET /api/v1/tools/credentials */
export const listToolCredentials: RequestHandler = async (req, res) => {
  const creds = await req.prisma!.toolCredential.findMany({
    where: { tenantId: req.tenantId! },
    include: { _count: { select: { tools: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return paginated(res, creds.map(maskCredential), creds.length, 1, 100);
};

/** PUT /api/v1/tools/credentials/:id */
export const updateToolCredential: RequestHandler = async (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  const { id } = req.params as { id: string };
  const prisma = req.prisma!;
  const existing = await prisma.toolCredential.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!existing) return errorResponse(res, 'Credential not found', 'CREDENTIAL_NOT_FOUND', 404);

  const updated = await prisma.toolCredential.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.authType !== undefined ? { authType: parsed.data.authType } : {}),
      ...(parsed.data.authConfig !== undefined ? { authConfig: encrypt(JSON.stringify(parsed.data.authConfig)) } : {}),
      ...(parsed.data.service !== undefined ? { service: parsed.data.service } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
    include: { _count: { select: { tools: true } } },
  });

  // Clear any cached tokens so the updated credential is used immediately
  await clearCredentialTokenCache(id);

  return success(res, maskCredential(updated));
};

/** DELETE /api/v1/tools/credentials/:id */
export const deleteToolCredential: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const prisma = req.prisma!;
  const existing = await prisma.toolCredential.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!existing) return errorResponse(res, 'Credential not found', 'CREDENTIAL_NOT_FOUND', 404);

  await prisma.toolCredential.delete({ where: { id } });
  await clearCredentialTokenCache(id);
  return success(res, { deleted: true });
};
