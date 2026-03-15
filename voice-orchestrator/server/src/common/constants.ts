/** Module name for this service — must appear in JWT enabled_modules. */
export const MODULE_NAME = 'voiceai';

/**
 * Paths that bypass JWT authentication.
 * Checked as exact match or prefix (with trailing slash).
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/',
  '/health',
  '/api/docs',
  '/api/schema',
  '/auth',
  '/static',
  '/webhooks',
  '/api/v1/auth/login',
] as const;

/** HTTP header names for tenant identification (mirrors SuperAdmin convention). */
export const TENANT_HEADERS = {
  ID: 'x-tenant-id',
  SLUG: 'x-tenant-slug',
  TOKEN: 'tenanttoken',
} as const;

/** Permission scope values returned by the JWT payload. */
export type PermissionScope = 'all' | 'own' | 'team' | true | false;

/** Standard error codes used in API responses. */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  MODULE_NOT_ENABLED: 'MODULE_NOT_ENABLED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
