/**
 * credentialResolver.ts
 *
 * Central point for turning a ToolCredential (or inline tool authType/authConfig)
 * into a ready-to-use set of HTTP auth headers.
 *
 * Auth config shapes per ToolAuthType:
 *
 * NONE:
 *   {} (empty)
 *
 * API_KEY:
 *   { headerName: "X-API-Key", apiKey: "your-key" }
 *   OR { header: "X-API-Key", value: "your-key" }  (legacy compat)
 *
 * BEARER:
 *   { token: "your-bearer-token" }
 *
 * PLATFORM:
 *   {
 *     token: "eyJhbGciOiJIUzI1NiJ9...",          // SuperAdmin JWT (required)
 *     refreshToken: "eyJhbGciOiJIUzI1NiJ9...",    // SuperAdmin refresh token (optional)
 *     refreshUrl: "https://superadmin.example.com/api/auth/token/refresh/"  // (optional)
 *   }
 *   When refreshToken + refreshUrl are provided, the resolver auto-refreshes
 *   when the JWT expires (POST { refresh } → { access }). Without them, the
 *   token is used as-is until you manually update it.
 *
 * OAUTH — Client Credentials:
 *   {
 *     tokenUrl: "https://auth.example.com/token",
 *     clientId: "your-client-id",
 *     clientSecret: "your-client-secret",
 *     scope: "read write",                        // optional
 *     grantType: "client_credentials"              // optional, this is the default
 *   }
 *
 * OAUTH — Refresh Token:
 *   {
 *     tokenUrl: "https://auth.example.com/token",
 *     clientId: "your-client-id",
 *     clientSecret: "your-client-secret",         // some providers require this for refresh
 *     refreshToken: "your-refresh-token",
 *     grantType: "refresh_token"
 *   }
 *
 *   After first token fetch, the resolver adds: accessToken, expiresAt,
 *   and optionally updates refreshToken if the provider rotates it.
 */

import type { PrismaClient, Tool, ToolCredential } from '@prisma/client';
import axios from 'axios';
import { decrypt, encrypt } from '../utils/crypto';
import { redisClient } from '../db/redis';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'credential-resolver' });

/** Redis key prefix for cached access tokens */
const TOKEN_CACHE_PREFIX = 'toolauth:token:';

/** Refresh 5 minutes before expiry */
const EXPIRY_BUFFER_SECONDS = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolvedAuthHeaders {
  [header: string]: string;
}

export interface ToolWithCredential extends Tool {
  credential?: ToolCredential | null;
}

// ── Helper: decrypt authConfig ────────────────────────────────────────────────

function decryptAuthConfig(raw: unknown): Record<string, string> {
  try {
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return JSON.parse(decrypt(str)) as Record<string, string>;
  } catch {
    // Fall back — may already be plain JSON (legacy rows or test data)
    if (typeof raw === 'object' && raw !== null) return raw as Record<string, string>;
    return {};
  }
}

// ── Helper: JWT expiry check (no signature verification needed — we're the client) ──

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false; // not a JWT — assume not expired
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8')) as { exp?: number };
    if (!payload.exp) return false;
    return Date.now() >= (payload.exp * 1000) - (EXPIRY_BUFFER_SECONDS * 1000);
  } catch {
    return false; // can't decode — let the API reject it
  }
}

// ── Main public API ───────────────────────────────────────────────────────────

/**
 * Resolves auth headers for a tool.
 * Priority: linked ToolCredential (if loaded and active) → inline tool auth → no auth.
 */
export async function resolveToolAuth(
  tool: ToolWithCredential,
  prisma: PrismaClient,
): Promise<ResolvedAuthHeaders> {
  // Prefer linked credential when present and active
  if (tool.credentialId && tool.credential?.isActive) {
    const cred = tool.credential;
    const cfg = decryptAuthConfig(cred.authConfig);
    log.debug({ toolId: tool.id, credentialId: cred.id, authType: cred.authType }, 'Resolving via linked credential');
    return resolveByType(cred.authType, cfg, cred.id, prisma);
  }

  // Fall back to inline tool auth
  const inlineCfg = decryptAuthConfig(tool.authConfig);
  return resolveByType(tool.authType, inlineCfg, undefined, prisma);
}

/**
 * Resolves auth headers by loading a ToolCredential from DB.
 * Used when only the credentialId is known (e.g. from tool.executor legacy path).
 */
export async function resolveCredentialHeaders(
  credentialId: string,
  prisma: PrismaClient,
): Promise<ResolvedAuthHeaders> {
  const cred = await prisma.toolCredential.findFirst({
    where: { id: credentialId, isActive: true },
  });
  if (!cred) {
    log.warn({ credentialId }, 'Credential not found or inactive — skipping auth');
    return {};
  }
  const cfg = decryptAuthConfig(cred.authConfig);
  return resolveByType(cred.authType, cfg, cred.id, prisma);
}

/**
 * Clears cached tokens for a credential from Redis.
 * Call when a credential is updated or deleted.
 */
export async function clearCredentialTokenCache(credentialId: string): Promise<void> {
  try {
    await redisClient.del(`${TOKEN_CACHE_PREFIX}${credentialId}`);
  } catch (err) {
    log.warn({ credentialId, err }, 'Failed to clear credential token cache');
  }
}

// ── Core resolver ─────────────────────────────────────────────────────────────

async function resolveByType(
  authType: string,
  cfg: Record<string, string>,
  credentialId: string | undefined,
  prisma: PrismaClient,
): Promise<ResolvedAuthHeaders> {
  switch (authType) {
    case 'NONE':
      return {};

    case 'API_KEY': {
      // Support both canonical and legacy field names
      const headerName = cfg['headerName'] ?? cfg['header'] ?? 'X-API-Key';
      const apiKey = cfg['apiKey'] ?? cfg['value'] ?? '';
      if (!apiKey) log.warn({ credentialId }, 'API_KEY credential has no apiKey value');
      return { [headerName]: apiKey };
    }

    case 'BEARER': {
      const token = cfg['token'] ?? '';
      if (!token) log.warn({ credentialId }, 'BEARER credential has no token value');
      return { Authorization: `Bearer ${token}` };
    }

    case 'PLATFORM':
      return resolvePlatformAuth(cfg, credentialId, prisma);

    case 'OAUTH':
      return resolveOAuthAuth(cfg, credentialId, prisma);

    default:
      log.warn({ authType, credentialId }, 'Unknown auth type — returning no headers');
      return {};
  }
}

// ── PLATFORM auth ─────────────────────────────────────────────────────────────

async function resolvePlatformAuth(
  cfg: Record<string, string>,
  credentialId: string | undefined,
  prisma: PrismaClient,
): Promise<ResolvedAuthHeaders> {
  const token = cfg['token'] ?? '';
  if (!token) {
    log.warn({ credentialId }, 'PLATFORM credential has no token');
    return {};
  }

  if (!isJwtExpired(token)) {
    return { Authorization: `Bearer ${token}` };
  }

  // Token is expired — try to refresh
  const refreshToken = cfg['refreshToken'];
  const refreshUrl = cfg['refreshUrl'];

  if (!refreshToken || !refreshUrl) {
    log.warn({ credentialId }, 'PLATFORM token expired but no refreshToken/refreshUrl — using expired token');
    return { Authorization: `Bearer ${token}` };
  }

  log.info({ credentialId }, 'PLATFORM token expired — refreshing');

  try {
    // Django SimpleJWT format: POST { refresh } → { access }
    const response = await axios.post<{ access?: string; access_token?: string }>(
      refreshUrl,
      { refresh: refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );

    const newToken = response.data?.access ?? response.data?.access_token;
    if (!newToken) {
      log.error({ credentialId }, 'PLATFORM refresh response missing access token — using expired token');
      return { Authorization: `Bearer ${token}` };
    }

    // Persist new token to DB (fire-and-forget)
    if (credentialId) {
      prisma.toolCredential
        .update({
          where: { id: credentialId },
          data: { authConfig: encrypt(JSON.stringify({ ...cfg, token: newToken })) },
        })
        .catch((err: unknown) => log.warn({ credentialId, err }, 'Failed to persist refreshed PLATFORM token'));
    }

    log.info({ credentialId }, 'PLATFORM token refreshed');
    return { Authorization: `Bearer ${newToken}` };
  } catch (err) {
    log.error({ credentialId, err }, 'PLATFORM token refresh failed — using expired token');
    return { Authorization: `Bearer ${token}` };
  }
}

// ── OAuth auth ────────────────────────────────────────────────────────────────

async function resolveOAuthAuth(
  cfg: Record<string, string>,
  credentialId: string | undefined,
  prisma: PrismaClient,
): Promise<ResolvedAuthHeaders> {
  const tokenUrl = cfg['tokenUrl'];
  if (!tokenUrl) {
    log.warn({ credentialId }, 'OAUTH credential missing tokenUrl');
    return {};
  }

  // 1. Check Redis cache
  const cacheKey = credentialId ? `${TOKEN_CACHE_PREFIX}${credentialId}` : null;
  if (cacheKey) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        log.debug({ credentialId }, 'Using cached OAuth access token');
        return { Authorization: `Bearer ${cached}` };
      }
    } catch (err) {
      log.warn({ credentialId, err }, 'Redis cache read failed — proceeding without cache');
    }
  }

  // 2. Check stored accessToken expiry
  const existingToken = cfg['accessToken'];
  const expiresAt = cfg['expiresAt'];
  if (existingToken && expiresAt) {
    const expiryMs = new Date(expiresAt).getTime();
    if (expiryMs > Date.now() + EXPIRY_BUFFER_SECONDS * 1000) {
      // Still valid — cache it
      if (cacheKey) {
        const ttl = Math.floor((expiryMs - Date.now()) / 1000) - EXPIRY_BUFFER_SECONDS;
        if (ttl > 0) redisClient.set(cacheKey, existingToken, 'EX', ttl).catch(() => {});
      }
      return { Authorization: `Bearer ${existingToken}` };
    }
  }

  // 3. Fetch a new token
  const grantType = cfg['grantType'] ?? (cfg['refreshToken'] ? 'refresh_token' : 'client_credentials');
  const clientId = cfg['clientId'];
  const clientSecret = cfg['clientSecret'];

  if (!clientId) {
    log.warn({ credentialId }, 'OAUTH credential missing clientId');
    return existingToken ? { Authorization: `Bearer ${existingToken}` } : {};
  }

  const tokenParams: Record<string, string> = {
    grant_type: grantType,
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  };

  if (grantType === 'refresh_token') {
    const refreshToken = cfg['refreshToken'];
    if (!refreshToken) {
      log.warn({ credentialId }, 'OAUTH refresh_token grant but no refreshToken stored');
      return existingToken ? { Authorization: `Bearer ${existingToken}` } : {};
    }
    tokenParams['refresh_token'] = refreshToken;
  } else if (cfg['scope']) {
    tokenParams['scope'] = cfg['scope'];
  }

  let tokenResponse: { access_token?: string; expires_in?: number; refresh_token?: string };
  try {
    const resp = await axios.post(
      tokenUrl,
      new URLSearchParams(tokenParams).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 },
    );
    tokenResponse = resp.data as typeof tokenResponse;
  } catch (err) {
    log.error({ credentialId, err }, 'OAuth token request failed');
    return existingToken ? { Authorization: `Bearer ${existingToken}` } : {};
  }

  const newToken = tokenResponse.access_token;
  if (!newToken) {
    log.error({ credentialId }, 'OAuth token response missing access_token');
    return existingToken ? { Authorization: `Bearer ${existingToken}` } : {};
  }

  const expiresIn = tokenResponse.expires_in ?? 3600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Cache in Redis
  if (cacheKey) {
    const cacheTtl = Math.max(expiresIn - EXPIRY_BUFFER_SECONDS, 60);
    redisClient.set(cacheKey, newToken, 'EX', cacheTtl).catch(() => {});
  }

  // Persist updated config to DB (fire-and-forget)
  if (credentialId) {
    const updatedCfg = {
      ...cfg,
      accessToken: newToken,
      expiresAt: newExpiresAt,
      ...(tokenResponse.refresh_token ? { refreshToken: tokenResponse.refresh_token } : {}),
    };
    prisma.toolCredential
      .update({
        where: { id: credentialId },
        data: { authConfig: encrypt(JSON.stringify(updatedCfg)) },
      })
      .catch((err: unknown) => log.warn({ credentialId, err }, 'Failed to persist refreshed OAuth token'));

    log.info({ credentialId, expiresIn }, 'OAuth token fetched and saved');
  }

  return { Authorization: `Bearer ${newToken}` };
}
