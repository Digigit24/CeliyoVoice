import type { Request } from 'express';

/**
 * Injects tenantId and ownerUserId into data before creating a record.
 * Mirrors Django's TenantMixin.create().
 *
 * @param req  - Authenticated Express request
 * @param data - Partial record data
 * @returns    New object with tenantId and ownerUserId injected
 */
export function injectTenantId<T extends object>(
  req: Request,
  data: T,
): T & { tenantId: string; ownerUserId: string } {
  if (!req.tenantId) {
    throw new Error('tenantId is required but not found on request');
  }
  if (!req.userId) {
    throw new Error('userId is required but not found on request');
  }

  return {
    ...data,
    tenantId: req.tenantId,
    ownerUserId: req.userId,
  };
}

/**
 * Asserts that a database record belongs to the same tenant as the requester.
 * Throws a 403-tagged error if they do not match.
 *
 * @param req         - Authenticated Express request
 * @param record      - Database record with tenant field
 * @param tenantField - Field name on the record (default: 'tenantId')
 */
export function assertSameTenant(
  req: Request,
  record: Record<string, unknown>,
  tenantField = 'tenantId',
): void {
  const recordTenant = String(record[tenantField]);
  const reqTenant = String(req.tenantId);

  if (recordTenant !== reqTenant) {
    const err = new Error('Tenant mismatch: resource belongs to a different tenant');
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 403;
    (err as NodeJS.ErrnoException & { code: string }).code = 'TENANT_MISMATCH';
    throw err;
  }
}

/**
 * Builds a Prisma where clause that enforces tenant isolation and owner scope.
 *
 * - Always includes tenantId
 * - Adds ownerUserId filter when permissionScope is 'own'
 *
 * @param req          - Authenticated Express request (must have tenantId)
 * @param ownerField   - Prisma field name for owner (default: 'ownerUserId')
 */
export function getTenantScopeFilter(
  req: Request,
  ownerField = 'ownerUserId',
): Record<string, string> {
  if (!req.tenantId) {
    throw new Error('tenantId is required but not found on request');
  }

  const filter: Record<string, string> = { tenantId: req.tenantId };

  if (req.permissionScope === 'own' && req.userId) {
    filter[ownerField] = req.userId;
  }

  return filter;
}
