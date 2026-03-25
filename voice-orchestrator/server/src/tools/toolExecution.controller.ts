import type { RequestHandler } from 'express';
import { success, errorResponse, paginated } from '../utils/apiResponse';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'tool-execution-controller' });

/** GET /api/v1/tools/executions — list execution logs with filters */
export const listExecutions: RequestHandler = async (req, res) => {
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const toolId = req.query['toolId'] as string | undefined;
  const agentId = req.query['agentId'] as string | undefined;
  const source = req.query['source'] as string | undefined;
  const successFilter = req.query['success'] as string | undefined;
  const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
  const offset = parseInt(req.query['offset'] as string) || 0;

  const where: Record<string, unknown> = { tenantId };
  if (toolId) where['toolId'] = toolId;
  if (agentId) where['agentId'] = agentId;
  if (source) where['source'] = source;
  if (successFilter !== undefined) where['success'] = successFilter === 'true';

  try {
    const [executions, total] = await Promise.all([
      prisma.toolExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          toolId: true,
          toolName: true,
          agentId: true,
          source: true,
          success: true,
          latencyMs: true,
          responseStatus: true,
          cached: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      prisma.toolExecution.count({ where }),
    ]);

    const page = Math.floor(offset / limit) + 1;
    return paginated(res, executions, total, page, limit);
  } catch (err) {
    log.error({ err }, 'Failed to list tool executions');
    return errorResponse(res, 'Failed to list executions', 'INTERNAL_ERROR', 500);
  }
};

/** GET /api/v1/tools/executions/:id — get single execution with full details */
export const getExecution: RequestHandler = async (req, res) => {
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;
  const { id } = req.params as { id: string };

  try {
    const execution = await prisma.toolExecution.findFirst({
      where: { id, tenantId },
    });

    if (!execution) {
      return errorResponse(res, 'Execution not found', 'NOT_FOUND', 404);
    }

    return success(res, execution);
  } catch (err) {
    log.error({ err, id }, 'Failed to get tool execution');
    return errorResponse(res, 'Failed to get execution', 'INTERNAL_ERROR', 500);
  }
};
