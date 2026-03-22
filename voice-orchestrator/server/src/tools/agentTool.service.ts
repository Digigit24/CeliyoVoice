import type { PrismaClient, AgentTool } from '@prisma/client';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'agent-tool' });

export interface AttachToolInput {
  toolId: string;
  whenToUse?: string;
  isRequired?: boolean;
  priority?: number;
}

export class AgentToolService {
  constructor(private readonly prisma: PrismaClient) {}

  async attachTool(tenantId: string, agentId: string, input: AttachToolInput): Promise<AgentTool> {
    // Verify agent exists
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, tenantId } });
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404, code: 'NOT_FOUND' });

    // Verify tool exists
    const tool = await this.prisma.tool.findFirst({ where: { id: input.toolId, tenantId } });
    if (!tool) throw Object.assign(new Error('Tool not found'), { statusCode: 404, code: 'TOOL_NOT_FOUND' });

    // Check for existing link
    const existing = await this.prisma.agentTool.findUnique({
      where: { agentId_toolId: { agentId, toolId: input.toolId } },
    });
    if (existing) throw Object.assign(new Error('Tool already attached to this agent'), { statusCode: 409, code: 'CONFLICT' });

    return this.prisma.agentTool.create({
      data: {
        tenantId,
        agentId,
        toolId: input.toolId,
        whenToUse: input.whenToUse,
        isRequired: input.isRequired ?? false,
        priority: input.priority ?? 0,
      },
      include: { tool: true },
    });
  }

  async listAgentTools(tenantId: string, agentId: string): Promise<AgentTool[]> {
    return this.prisma.agentTool.findMany({
      where: { tenantId, agentId },
      include: { tool: true },
      orderBy: { priority: 'asc' },
    });
  }

  async updateAgentTool(
    tenantId: string,
    agentId: string,
    toolId: string,
    data: { whenToUse?: string; isRequired?: boolean; priority?: number },
  ): Promise<AgentTool | null> {
    const existing = await this.prisma.agentTool.findFirst({
      where: { agentId, toolId, tenantId },
    });
    if (!existing) return null;

    return this.prisma.agentTool.update({
      where: { id: existing.id },
      data: {
        ...(data.whenToUse !== undefined ? { whenToUse: data.whenToUse } : {}),
        ...(data.isRequired !== undefined ? { isRequired: data.isRequired } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
      },
      include: { tool: true },
    });
  }

  async detachTool(tenantId: string, agentId: string, toolId: string): Promise<boolean> {
    const existing = await this.prisma.agentTool.findFirst({
      where: { agentId, toolId, tenantId },
    });
    if (!existing) return false;

    await this.prisma.agentTool.delete({ where: { id: existing.id } });
    return true;
  }

  async bulkAttach(tenantId: string, agentId: string, toolIds: string[]): Promise<{ attached: number; skipped: number }> {
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, tenantId } });
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404, code: 'NOT_FOUND' });

    let attached = 0;
    let skipped = 0;

    for (const toolId of toolIds) {
      try {
        await this.prisma.agentTool.create({
          data: { tenantId, agentId, toolId, priority: attached },
        });
        attached++;
      } catch {
        skipped++; // duplicate or invalid
      }
    }

    log.info({ agentId, attached, skipped }, 'Bulk tool attach');
    return { attached, skipped };
  }
}
