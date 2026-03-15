/**
 * tenantDbRouter.ts
 *
 * Express middleware that attaches the correct PrismaClient to req.prisma
 * based on the tenant's database configuration.
 *
 * This is a thin re-export / middleware wrapper around tenantClients.ts so that
 * it can be used as a standalone middleware if needed independently of jwtMiddleware.
 *
 * In practice, jwtMiddleware already calls getPrismaClient() and sets req.prisma.
 * This module is exported for explicit use in routes that need to re-resolve the client.
 */
export { getPrismaClient, disconnectAllTenantClients } from '../db/tenantClients';
