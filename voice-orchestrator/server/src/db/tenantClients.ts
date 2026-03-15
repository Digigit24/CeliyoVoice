/**
 * tenantClients.ts — Option A: single shared database
 *
 * Tenant isolation is enforced by filtering all queries with tenantId (from JWT).
 * There is no per-tenant database routing — all tenants share the same PostgreSQL DB.
 *
 * The function signatures are kept identical to the original so that workers,
 * event handlers, and other callers need no changes.
 */
import { defaultPrismaClient } from './client';

export async function getPrismaClient(_tenantId: string) {
  return defaultPrismaClient;
}

export async function disconnectAllTenantClients(): Promise<void> {
  // no-op — only the shared client exists
}
