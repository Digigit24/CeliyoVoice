import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../core/config';
import { MODULE_NAME, PUBLIC_PATHS, TENANT_HEADERS } from './constants';
import { TenantUser, type JwtPayload } from './TenantUser';
import { getPrismaClient } from '../db/tenantClients';
import { logger } from '../utils/logger';

const REQUIRED_PAYLOAD_FIELDS: ReadonlyArray<keyof JwtPayload> = [
  'user_id',
  'email',
  'tenant_id',
  'tenant_slug',
  'permissions',
  'enabled_modules',
];

function isPublicPath(path: string, method: string): boolean {
  // OAuth callbacks are public on GET
  if (method === 'GET' && path.includes('/oauth_callback')) return true;

  return PUBLIC_PATHS.some(
    (publicPath) => path === publicPath || path.startsWith(`${publicPath}/`),
  );
}

export async function jwtMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isPublicPath(req.path, req.method)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authorization header missing or invalid. Expected: Bearer <token>',
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwt.secretKey, {
      algorithms: [config.jwt.algorithm],
      clockTolerance: config.jwt.clockTolerance,
    }) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token expired' },
      });
    } else if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    } else {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token validation failed' },
      });
    }
    return;
  }

  // Validate required fields
  for (const field of REQUIRED_PAYLOAD_FIELDS) {
    if (payload[field] === undefined || payload[field] === null) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: `JWT missing required field: ${field}` },
      });
      return;
    }
  }

  // Check module access
  if (!payload.enabled_modules.includes(MODULE_NAME)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'MODULE_NOT_ENABLED',
        message: `Module '${MODULE_NAME}' is not enabled for this tenant`,
      },
    });
    return;
  }

  // Set standard request attributes (mirrors Django middleware attributes)
  req.userId = payload.user_id;
  req.email = payload.email;
  req.tenantId = payload.tenant_id;
  req.tenantSlug = payload.tenant_slug;
  req.isSuperAdmin = payload.is_super_admin ?? false;
  req.permissions = payload.permissions;
  req.enabledModules = payload.enabled_modules;
  req.jwtPayload = payload;

  // Super admins can act as any tenant via x-tenant-id header override
  const headerTenantId = req.headers[TENANT_HEADERS.ID] as string | undefined;
  if (headerTenantId && req.isSuperAdmin) {
    req.tenantId = headerTenantId;
    logger.debug(
      { requestId: req.id, superAdminId: payload.user_id, overrideTenantId: headerTenantId },
      'Super admin overriding tenant context via x-tenant-id header',
    );
  }

  req.tenantUser = new TenantUser({ ...payload, tenant_id: req.tenantId });

  // Attach the correct Prisma client for this tenant (shared or dedicated DB)
  try {
    req.prisma = await getPrismaClient(req.tenantId);
  } catch (err) {
    logger.error({ err, requestId: req.id, tenantId: req.tenantId }, 'Failed to resolve tenant DB');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to connect to tenant database' },
    });
    return;
  }

  next();
}
