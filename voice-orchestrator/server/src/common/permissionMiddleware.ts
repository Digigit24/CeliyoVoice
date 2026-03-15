import type { Request, Response, NextFunction } from 'express';
import { TenantUser } from './TenantUser';
import type { PermissionScope } from './constants';

/**
 * Factory that returns Express middleware enforcing a specific permission key.
 *
 * Usage:
 *   router.get('/agents', requirePermission('voiceai.agents.view'), listAgents);
 *   router.post('/agents', requirePermission('voiceai.agents.create'), createAgent);
 *
 * Super admins bypass all permission checks.
 * On success, attaches `req.permissionScope` and `req.tenantUser`.
 */
export function requirePermission(permissionKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.jwtPayload || !req.tenantId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    const user = new TenantUser(req.jwtPayload);
    const scope = user.getPermission(permissionKey);

    if (!scope) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Permission denied',
          details: { required: permissionKey },
        },
      });
      return;
    }

    // Attach scope and user for downstream handlers
    req.permissionScope = scope;
    req.tenantUser = user;

    next();
  };
}

/**
 * Builds a Sequelize/Prisma-compatible where clause fragment
 * that enforces tenant isolation and permission scope.
 *
 * Always filters by tenantId.
 * For 'own' scope, additionally filters by ownerUserId.
 *
 * @param req         - Express request (must have tenantId, userId, jwtPayload)
 * @param permKey     - e.g. 'voiceai.agents.view'
 * @param ownerField  - field name for ownership check (default: 'ownerUserId')
 */
export function getTenantScopeFilter(
  req: Request,
  permKey: string,
  ownerField = 'ownerUserId',
): Record<string, string> {
  if (!req.jwtPayload || !req.tenantId) {
    throw new Error('Request is not authenticated — cannot build tenant scope filter');
  }

  const user = new TenantUser(req.jwtPayload);
  const scope: PermissionScope = user.getPermission(permKey);

  const filter: Record<string, string> = { tenantId: req.tenantId };

  if (scope === 'own' && req.userId) {
    filter[ownerField] = req.userId;
  }

  // 'all' | 'team' | true → no additional filter beyond tenantId
  return filter;
}
