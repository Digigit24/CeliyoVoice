import type { PrismaClient, Tool } from '@prisma/client';
import { logger } from '../utils/logger';

/** In-memory per-tenant tool definition cache. */
const registry = new Map<string, Map<string, Tool>>();

/**
 * Returns all cached tool definitions for a tenant.
 * Populates from DB on first access.
 */
export async function getToolsForTenant(tenantId: string, prisma: PrismaClient): Promise<Tool[]> {
  let tenantTools = registry.get(tenantId);

  if (!tenantTools) {
    const tools = await prisma.tool.findMany({ where: { tenantId, isActive: true } });
    tenantTools = new Map(tools.map((t) => [t.id, t]));
    registry.set(tenantId, tenantTools);
    logger.debug({ tenantId, count: tools.length }, 'Tool registry populated');
  }

  return Array.from(tenantTools.values());
}

/**
 * Returns a single tool from cache (or DB on miss).
 */
export async function getToolById(
  toolId: string,
  tenantId: string,
  prisma: PrismaClient,
): Promise<Tool | null> {
  const tenantTools = registry.get(tenantId);
  if (tenantTools?.has(toolId)) {
    return tenantTools.get(toolId)!;
  }

  const tool = await prisma.tool.findFirst({ where: { id: toolId, tenantId, isActive: true } });
  if (tool) {
    upsertCachedTool(tenantId, tool);
  }
  return tool;
}

/**
 * Updates or inserts a tool in the registry cache.
 * Call after create/update operations.
 */
export function upsertCachedTool(tenantId: string, tool: Tool): void {
  let tenantTools = registry.get(tenantId);
  if (!tenantTools) {
    tenantTools = new Map();
    registry.set(tenantId, tenantTools);
  }
  tenantTools.set(tool.id, tool);
}

/**
 * Removes a tool from the registry cache.
 * Call after delete operations.
 */
export function removeCachedTool(tenantId: string, toolId: string): void {
  registry.get(tenantId)?.delete(toolId);
}

/**
 * Clears all cached tools for a tenant.
 * Call after bulk changes.
 */
export function clearTenantToolCache(tenantId: string): void {
  registry.delete(tenantId);
  logger.debug({ tenantId }, 'Tool registry cache cleared');
}
