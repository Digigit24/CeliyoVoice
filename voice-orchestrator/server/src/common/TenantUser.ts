import type { PermissionScope } from './constants';

export interface JwtPayload {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  tenant_id: string;
  tenant_slug: string;
  is_super_admin: boolean;
  permissions: Record<string, unknown>;
  enabled_modules: string[];
  iat: number;
  exp: number;
}

/**
 * In-memory representation of an authenticated user constructed from the JWT payload.
 * There is NO database user table — this object lives only for the duration of the request.
 * Mirrors the Django TenantUser class from the SuperAdmin reference architecture.
 */
export class TenantUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly isSuperAdmin: boolean;
  readonly permissions: Record<string, unknown>;
  readonly enabledModules: string[];

  constructor(payload: JwtPayload) {
    this.id = payload.user_id;
    this.email = payload.email;
    this.firstName = payload.first_name ?? '';
    this.lastName = payload.last_name ?? '';
    this.tenantId = payload.tenant_id;
    this.tenantSlug = payload.tenant_slug;
    this.isSuperAdmin = payload.is_super_admin ?? false;
    this.permissions = payload.permissions ?? {};
    this.enabledModules = payload.enabled_modules ?? [];
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * Resolves the permission value for a dot-notation key.
   * e.g. 'voiceai.agents.view' → 'all' | 'own' | 'team' | true | false
   */
  getPermission(permissionKey: string): PermissionScope {
    if (this.isSuperAdmin) return 'all';

    const parts = permissionKey.split('.');
    let node: unknown = this.permissions;

    for (const part of parts) {
      if (node === null || typeof node !== 'object') return false;
      node = (node as Record<string, unknown>)[part];
    }

    if (node === undefined || node === null) return false;
    if (node === false) return false;
    if (node === true) return true;
    if (node === 'all' || node === 'own' || node === 'team') return node;

    return false;
  }

  /**
   * Returns true if the user has any non-false permission for the given key.
   */
  hasPerm(permissionKey: string): boolean {
    const val = this.getPermission(permissionKey);
    return val !== false;
  }

  /**
   * Returns true if the module is in the user's enabled_modules list.
   * Super admins always have module access.
   */
  hasModuleAccess(moduleName: string): boolean {
    if (this.isSuperAdmin) return true;
    return this.enabledModules.includes(moduleName);
  }

  toString(): string {
    return `TenantUser(${this.email}, tenant=${this.tenantSlug})`;
  }
}
