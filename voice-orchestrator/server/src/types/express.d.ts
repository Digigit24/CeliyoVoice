import type { PrismaClient } from '@prisma/client';
import type { TenantUser, JwtPayload } from '../common/TenantUser';
import type { PermissionScope } from '../common/constants';

declare global {
  namespace Express {
    interface Request {
      /** Unique UUID assigned per request for tracing. */
      id: string;
      /** Authenticated tenant user constructed from JWT (undefined on public paths). */
      tenantUser?: TenantUser;
      /** Shorthand: JWT user_id */
      userId?: string;
      /** Shorthand: JWT email */
      email?: string;
      /** Effective tenant ID (may be overridden by x-tenant-id header for super admins). */
      tenantId?: string;
      /** JWT tenant_slug */
      tenantSlug?: string;
      /** Whether the requester is a super admin. */
      isSuperAdmin?: boolean;
      /** Decoded JWT permissions dict. */
      permissions?: Record<string, unknown>;
      /** Modules enabled for the tenant. */
      enabledModules?: string[];
      /** The raw decoded JWT payload. */
      jwtPayload?: JwtPayload;
      /** Resolved Prisma client for this tenant (shared or dedicated DB). */
      prisma?: PrismaClient;
      /** Permission scope resolved by requirePermission() middleware. */
      permissionScope?: PermissionScope;
    }
  }
}

export {};
