import type { PrismaClient, Tool } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { upsertCachedTool, removeCachedTool } from './tool.registry';
import type { CreateToolInput, UpdateToolInput } from './validators/tool.validators';

export interface ToolListOptions {
  tenantId: string;
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
}

export class ToolService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(tenantId: string, ownerUserId: string, input: CreateToolInput): Promise<Tool> {
    const tool = await this.prisma.tool.create({
      data: {
        tenantId,
        ownerUserId,
        name: input.name,
        description: input.description,
        endpoint: input.endpoint,
        method: input.method,
        headers: input.headers as Prisma.InputJsonValue,
        bodyTemplate: input.bodyTemplate ? (input.bodyTemplate as Prisma.InputJsonValue) : undefined,
        authType: input.authType,
        authConfig: input.authConfig as Prisma.InputJsonValue,
        timeout: input.timeout,
        retries: input.retries,
      },
    });
    upsertCachedTool(tenantId, tool);
    return tool;
  }

  async list(opts: ToolListOptions): Promise<{ tools: Tool[]; total: number }> {
    const where: Prisma.ToolWhereInput = {
      tenantId: opts.tenantId,
      ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
      ...(opts.search
        ? { name: { contains: opts.search, mode: 'insensitive' as Prisma.QueryMode } }
        : {}),
    };

    const [tools, total] = await Promise.all([
      this.prisma.tool.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tool.count({ where }),
    ]);

    return { tools, total };
  }

  async findById(id: string, tenantId: string): Promise<Tool | null> {
    return this.prisma.tool.findFirst({ where: { id, tenantId } });
  }

  async update(id: string, tenantId: string, input: UpdateToolInput): Promise<Tool | null> {
    const existing = await this.prisma.tool.findFirst({ where: { id, tenantId } });
    if (!existing) return null;

    const updated = await this.prisma.tool.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.endpoint !== undefined ? { endpoint: input.endpoint } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.headers !== undefined ? { headers: input.headers as Prisma.InputJsonValue } : {}),
        ...(input.bodyTemplate !== undefined ? { bodyTemplate: input.bodyTemplate as Prisma.InputJsonValue } : {}),
        ...(input.authType !== undefined ? { authType: input.authType } : {}),
        ...(input.authConfig !== undefined ? { authConfig: input.authConfig as Prisma.InputJsonValue } : {}),
        ...(input.timeout !== undefined ? { timeout: input.timeout } : {}),
        ...(input.retries !== undefined ? { retries: input.retries } : {}),
      },
    });

    upsertCachedTool(tenantId, updated);
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.prisma.tool.findFirst({ where: { id, tenantId } });
    if (!existing) return false;

    await this.prisma.tool.delete({ where: { id } });
    removeCachedTool(tenantId, id);
    return true;
  }
}
