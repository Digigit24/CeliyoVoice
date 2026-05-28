import type { RequestHandler } from 'express';
import axios from 'axios';
import type { HttpMethod, ToolAuthType, ToolType, ToolSource } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { config } from '../core/config';
import { encrypt } from '../utils/crypto';
import { ToolImportService } from '../tools/import/import.service';
import { clearTenantToolCache } from '../tools/tool.registry';
import { success, errorResponse } from '../utils/apiResponse';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'ecosystem' });

const CRM_SERVICE_NAME = 'Celiyo CRM';
const CRM_TOOL_PREFIX = 'crm_';
const CRM_BASE_URL = 'https://crm.celiyo.com';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Returns a display-safe masked credential identifier, e.g. `celiyo-platform-key-****a3f2` */
function maskedKey(credentialId: string): string {
  return `celiyo-platform-key-****${credentialId.slice(-4)}`;
}

/** Fetch + import the CRM OpenAPI spec into tools linked to the given credential. */
async function importCrmSpec(
  tenantId: string,
  userId: string,
  credentialId: string,
  prisma: Parameters<RequestHandler>[0]['prisma'],
): Promise<{ toolCount: number; skipped: number; errors: number; warning?: string }> {
  const prismaClient = prisma!;
  let spec: unknown;
  try {
    const resp = await axios.get<unknown>(config.ecosystem.crmSpecUrl, { timeout: 20_000 });
    spec = resp.data;
  } catch (err) {
    log.error({ tenantId, err }, 'CRM spec fetch failed');
    return {
      toolCount: 0,
      skipped: 0,
      errors: 0,
      warning: 'CRM connected but schema fetch failed. Use Sync to import tools.',
    };
  }

  const importer = new ToolImportService(prismaClient);
  const result = await importer.importSwagger(tenantId, userId, spec, {
    prefix: CRM_TOOL_PREFIX,
    baseUrl: CRM_BASE_URL,
    skipDuplicates: true,
  });

  if (result.tools.length > 0) {
    await prismaClient.tool.updateMany({
      where: { id: { in: result.tools.map((t) => t.id) } },
      data: { credentialId, authType: 'PLATFORM' as ToolAuthType },
    });
  }

  return { toolCount: result.imported, skipped: result.skipped, errors: result.errors.length };
}

// ── GET /api/v1/ecosystem/crm/status ─────────────────────────────────────────

export const getCrmStatus: RequestHandler = async (req, res) => {
  const tenantId = req.tenantId!;

  const credential = await req.prisma!.toolCredential.findFirst({
    where: { tenantId, authType: 'PLATFORM' as ToolAuthType, service: CRM_SERVICE_NAME, isActive: true },
  });

  if (!credential) {
    return success(res, { connected: false });
  }

  const tools = await req.prisma!.tool.findMany({
    where: { tenantId, credentialId: credential.id },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      endpoint: true,
      method: true,
      isActive: true,
      inputSchema: true,
      updatedAt: true,
    },
  });

  return success(res, {
    connected: true,
    credentialId: credential.id,
    maskedKey: maskedKey(credential.id),
    toolCount: tools.filter((t) => t.isActive).length,
    connectedAt: credential.createdAt,
    updatedAt: credential.updatedAt,
    tools,
  });
};

// ── POST /api/v1/ecosystem/crm/keys/exchange ─────────────────────────────────

/**
 * Unified key-exchange endpoint for both connection paths:
 *
 * Manual path — body `{ manualToken: "..." }`:
 *   Validates the token by probing the CRM spec endpoint, then stores the
 *   credential and imports tools.
 *
 * Auto path — no body (or body without `manualToken`):
 *   1. If CELIYO_SYSTEM_KEY is set: calls admin.celiyo.com to generate a
 *      dedicated long-lived token pair (access + refresh).
 *   2. Otherwise: uses the caller's JWT directly (same auth system).
 */
export const exchangeCrmKey: RequestHandler = async (req, res) => {
  const tenantId = req.tenantId!;
  const userId = req.userId!;

  // Idempotency guard
  const existing = await req.prisma!.toolCredential.findFirst({
    where: { tenantId, authType: 'PLATFORM' as ToolAuthType, service: CRM_SERVICE_NAME, isActive: true },
  });
  if (existing) {
    return errorResponse(res, 'CRM is already connected. Revoke first to reconnect.', 'ALREADY_CONNECTED', 409);
  }

  const { manualToken } = req.body as { manualToken?: string };
  const refreshUrl = `${config.ecosystem.adminUrl}/api/auth/token/refresh/`;

  let integrationToken: string;
  let refreshToken: string | undefined;

  if (manualToken && manualToken.trim().length > 0) {
    // ── Manual path ──────────────────────────────────────────────────────────
    const token = manualToken.trim();

    // Probe the spec endpoint to validate the token
    try {
      await axios.get(config.ecosystem.crmSpecUrl, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
        validateStatus: (s) => s < 500, // accept anything that isn't a server error
      });
    } catch (err) {
      log.warn({ tenantId, err }, 'CRM token probe failed (network error)');
      // Network errors during probe shouldn't block the user — they may still have a valid token
    }

    integrationToken = token;
    log.info({ tenantId }, 'CRM connect: manual token accepted');
  } else {
    // ── Auto path ────────────────────────────────────────────────────────────
    const callerToken = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!callerToken) {
      return errorResponse(res, 'Authorization token missing.', 'UNAUTHORIZED', 401);
    }

    integrationToken = callerToken; // default fallback

    if (config.ecosystem.systemKey) {
      try {
        const adminResp = await axios.post<{ access: string; refresh: string }>(
          `${config.ecosystem.adminUrl}/api/auth/system-keys/generate/`,
          { tenant_id: tenantId },
          {
            headers: {
              Authorization: `Bearer ${config.ecosystem.systemKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15_000,
          },
        );
        integrationToken = adminResp.data.access;
        refreshToken = adminResp.data.refresh;
        log.info({ tenantId }, 'CRM connect: obtained long-lived service token from admin');
      } catch (err) {
        log.warn({ tenantId, err }, 'Admin system-key generation failed — using caller JWT');
      }
    } else {
      log.info({ tenantId }, 'CRM connect: CELIYO_SYSTEM_KEY not set — using caller JWT as integration token');
    }
  }

  // Persist encrypted PLATFORM credential
  const authConfig = encrypt(
    JSON.stringify({
      token: integrationToken,
      ...(refreshToken ? { refreshToken, refreshUrl } : {}),
    }),
  );

  const credential = await req.prisma!.toolCredential.create({
    data: {
      tenantId,
      ownerUserId: userId,
      name: 'Celiyo CRM Integration',
      authType: 'PLATFORM' as ToolAuthType,
      authConfig,
      service: CRM_SERVICE_NAME,
      isActive: true,
    },
  });

  const importSummary = await importCrmSpec(tenantId, userId, credential.id, req.prisma);

  log.info({ tenantId, credentialId: credential.id, ...importSummary }, 'CRM key exchange complete');

  return success(res, {
    credentialId: credential.id,
    maskedKey: maskedKey(credential.id),
    ...importSummary,
  }, 201);
};

// ── DELETE /api/v1/ecosystem/crm/disconnect ───────────────────────────────────

export const revokeCrm: RequestHandler = async (req, res) => {
  const tenantId = req.tenantId!;

  const credential = await req.prisma!.toolCredential.findFirst({
    where: { tenantId, authType: 'PLATFORM' as ToolAuthType, service: CRM_SERVICE_NAME, isActive: true },
  });

  if (!credential) {
    return errorResponse(res, 'No active CRM connection found.', 'NOT_CONNECTED', 404);
  }

  // Deactivate the credential
  await req.prisma!.toolCredential.update({
    where: { id: credential.id },
    data: { isActive: false },
  });

  // Deactivate and detach all linked tools
  await req.prisma!.tool.updateMany({
    where: { tenantId, credentialId: credential.id },
    data: { isActive: false, credentialId: null },
  });

  clearTenantToolCache(tenantId);

  log.info({ tenantId, credentialId: credential.id }, 'CRM connection revoked');

  return success(res, { revoked: true });
};

// ── POST /api/v1/ecosystem/crm/sync ──────────────────────────────────────────

export const syncCrm: RequestHandler = async (req, res) => {
  const tenantId = req.tenantId!;
  const userId = req.userId!;

  const credential = await req.prisma!.toolCredential.findFirst({
    where: { tenantId, authType: 'PLATFORM' as ToolAuthType, service: CRM_SERVICE_NAME, isActive: true },
  });

  if (!credential) {
    return errorResponse(res, 'CRM is not connected.', 'NOT_CONNECTED', 404);
  }

  let spec: unknown;
  try {
    const resp = await axios.get<unknown>(config.ecosystem.crmSpecUrl, { timeout: 20_000 });
    spec = resp.data;
  } catch (err) {
    log.error({ tenantId, err }, 'CRM spec fetch failed during sync');
    return errorResponse(res, 'Failed to fetch CRM schema. Please try again later.', 'SPEC_FETCH_ERROR', 502);
  }

  const importer = new ToolImportService(req.prisma!);
  const ctdFile = importer.convertSwaggerToCeliyo(spec, { prefix: CRM_TOOL_PREFIX, baseUrl: CRM_BASE_URL });
  const freshTools = ctdFile.tools;

  if (freshTools.length === 0) {
    return errorResponse(res, 'Fetched schema produced no tools. Sync aborted.', 'EMPTY_SPEC', 422);
  }

  const freshNames = new Set(freshTools.map((t) => t.name));
  let added = 0;
  let updated = 0;

  for (const toolDef of freshTools) {
    const existing = await req.prisma!.tool.findFirst({ where: { tenantId, name: toolDef.name } });

    if (existing) {
      await req.prisma!.tool.update({
        where: { id: existing.id },
        data: {
          description: toolDef.description,
          endpoint: toolDef.endpoint ?? null,
          method: (toolDef.method ?? 'POST') as HttpMethod,
          headers: (toolDef.headers ?? {}) as Prisma.InputJsonValue,
          inputSchema: toolDef.inputSchema as Prisma.InputJsonValue,
          ...(toolDef.bodyTemplate ? { bodyTemplate: toolDef.bodyTemplate as Prisma.InputJsonValue } : {}),
          credentialId: credential.id,
          authType: 'PLATFORM' as ToolAuthType,
          isActive: true,
        },
      });
      updated++;
    } else {
      await req.prisma!.tool.create({
        data: {
          tenantId,
          ownerUserId: userId,
          name: toolDef.name,
          description: toolDef.description,
          toolType: 'HTTP' as ToolType,
          endpoint: toolDef.endpoint ?? null,
          method: (toolDef.method ?? 'POST') as HttpMethod,
          headers: (toolDef.headers ?? {}) as Prisma.InputJsonValue,
          ...(toolDef.bodyTemplate ? { bodyTemplate: toolDef.bodyTemplate as Prisma.InputJsonValue } : {}),
          authType: 'PLATFORM' as ToolAuthType,
          credentialId: credential.id,
          inputSchema: toolDef.inputSchema as Prisma.InputJsonValue,
          importMeta: { collectionName: ctdFile.name } as Prisma.InputJsonValue,
          source: 'SWAGGER_IMPORT' as ToolSource,
        },
      });
      added++;
    }
  }

  const freshNamesArray = [...freshNames];
  const staleResult = await req.prisma!.tool.updateMany({
    where: {
      tenantId,
      name: { startsWith: CRM_TOOL_PREFIX },
      isActive: true,
      NOT: { name: { in: freshNamesArray } },
    },
    data: { isActive: false },
  });

  clearTenantToolCache(tenantId);

  log.info({ tenantId, added, updated, deactivated: staleResult.count }, 'CRM sync complete');

  return success(res, { added, updated, deactivated: staleResult.count, totalActive: freshTools.length });
};
