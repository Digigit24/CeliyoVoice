import type { PrismaClient, Tool, HttpMethod, ToolAuthType, ToolSource, ToolType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { upsertCachedTool, removeCachedTool, clearTenantToolCache } from './tool.registry';
import type { CreateToolInput, UpdateToolInput } from './validators/tool.validators';

export interface ToolListOptions {
  tenantId: string;
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  category?: string;
  toolType?: string;
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
        toolType: (input.toolType ?? 'HTTP') as 'HTTP' | 'FUNCTION' | 'COMPOSITE',
        endpoint: input.endpoint,
        method: input.method,
        headers: input.headers as Prisma.InputJsonValue,
        bodyTemplate: input.bodyTemplate ? (input.bodyTemplate as Prisma.InputJsonValue) : undefined,
        authType: input.authType,
        authConfig: input.authConfig as Prisma.InputJsonValue,
        timeout: input.timeout,
        retries: input.retries,
        functionName: input.functionName,
        inputSchema: input.inputSchema ? (input.inputSchema as Prisma.InputJsonValue) : undefined,
        outputSchema: input.outputSchema ? (input.outputSchema as Prisma.InputJsonValue) : undefined,
        category: input.category,
        source: (input.source ?? 'MANUAL') as 'MANUAL' | 'CELIYO_IMPORT' | 'SWAGGER_IMPORT' | 'MCP_IMPORT',
      },
    });
    upsertCachedTool(tenantId, tool);
    return tool;
  }

  async list(opts: ToolListOptions & { tags?: string }): Promise<{ tools: Tool[]; total: number }> {
    const where: Prisma.ToolWhereInput = {
      tenantId: opts.tenantId,
      ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.toolType ? { toolType: opts.toolType as 'HTTP' | 'FUNCTION' | 'COMPOSITE' } : {}),
      ...(opts.search
        ? { name: { contains: opts.search, mode: 'insensitive' as Prisma.QueryMode } }
        : {}),
      ...(opts.tags
        ? { tags: { some: { tagId: { in: opts.tags.split(',') } } } }
        : {}),
    };

    const [tools, total] = await Promise.all([
      this.prisma.tool.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tags: { include: { tag: true } },
          credential: { select: { id: true, name: true, authType: true } },
        },
      }),
      this.prisma.tool.count({ where }),
    ]);

    return { tools, total };
  }

  async findById(id: string, tenantId: string): Promise<Tool | null> {
    return this.prisma.tool.findFirst({ where: { id, tenantId } });
  }

  async findByName(name: string, tenantId: string): Promise<Tool | null> {
    return this.prisma.tool.findFirst({ where: { name, tenantId } });
  }

  async update(id: string, tenantId: string, input: UpdateToolInput): Promise<Tool | null> {
    const existing = await this.prisma.tool.findFirst({ where: { id, tenantId } });
    if (!existing) return null;

    const updated = await this.prisma.tool.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.toolType !== undefined ? { toolType: input.toolType as 'HTTP' | 'FUNCTION' | 'COMPOSITE' } : {}),
        ...(input.endpoint !== undefined ? { endpoint: input.endpoint } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.headers !== undefined ? { headers: input.headers as Prisma.InputJsonValue } : {}),
        ...(input.bodyTemplate !== undefined ? { bodyTemplate: input.bodyTemplate as Prisma.InputJsonValue } : {}),
        ...(input.authType !== undefined ? { authType: input.authType } : {}),
        ...(input.authConfig !== undefined ? { authConfig: input.authConfig as Prisma.InputJsonValue } : {}),
        ...(input.timeout !== undefined ? { timeout: input.timeout } : {}),
        ...(input.retries !== undefined ? { retries: input.retries } : {}),
        ...(input.functionName !== undefined ? { functionName: input.functionName } : {}),
        ...(input.inputSchema !== undefined ? { inputSchema: input.inputSchema as Prisma.InputJsonValue } : {}),
        ...(input.outputSchema !== undefined ? { outputSchema: input.outputSchema as Prisma.InputJsonValue } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
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

  async bulkCreate(
    tenantId: string,
    ownerUserId: string,
    tools: Array<Omit<CreateToolInput, 'source'> & { source?: string; importMeta?: Record<string, unknown> }>,
  ): Promise<Tool[]> {
    const created: Tool[] = [];
    for (const input of tools) {
      const tool = await this.prisma.tool.create({
        data: {
          tenantId,
          ownerUserId,
          name: input.name,
          description: input.description,
          toolType: (input.toolType ?? 'HTTP') as ToolType,
          endpoint: input.endpoint,
          method: (input.method ?? 'POST') as HttpMethod,
          headers: input.headers ? (input.headers as Prisma.InputJsonValue) : {},
          bodyTemplate: input.bodyTemplate ? (input.bodyTemplate as Prisma.InputJsonValue) : undefined,
          authType: (input.authType ?? 'NONE') as ToolAuthType,
          authConfig: input.authConfig ? (input.authConfig as Prisma.InputJsonValue) : {},
          timeout: input.timeout ?? 30,
          retries: input.retries ?? 0,
          functionName: input.functionName,
          inputSchema: input.inputSchema ? (input.inputSchema as Prisma.InputJsonValue) : undefined,
          outputSchema: input.outputSchema ? (input.outputSchema as Prisma.InputJsonValue) : undefined,
          category: input.category,
          source: (input.source ?? 'MANUAL') as ToolSource,
          importMeta: input.importMeta ? (input.importMeta as Prisma.InputJsonValue) : undefined,
        },
      });
      created.push(tool);
    }
    clearTenantToolCache(tenantId);
    return created;
  }
}
