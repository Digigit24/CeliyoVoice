import type { RequestHandler } from 'express';

/** GET /api/v1/dashboard/stats — tenant-scoped aggregate counts */
export const getStats: RequestHandler = async (req, res) => {
  const prisma = req.prisma!;
  const tenantId = req.tenantId!;

  const [
    totalAgents,
    activeAgents,
    totalCalls,
    activeCalls,
    completedCalls,
    failedCalls,
    totalTools,
    activeTools,
    recentCalls,
  ] = await Promise.all([
    prisma.agent.count({ where: { tenantId } }),
    prisma.agent.count({ where: { tenantId, isActive: true } }),
    prisma.call.count({ where: { tenantId } }),
    prisma.call.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
    prisma.call.count({ where: { tenantId, status: 'COMPLETED' } }),
    prisma.call.count({ where: { tenantId, status: 'FAILED' } }),
    prisma.tool.count({ where: { tenantId } }),
    prisma.tool.count({ where: { tenantId, isActive: true } }),
    prisma.call.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        phone: true,
        status: true,
        direction: true,
        provider: true,
        duration: true,
        createdAt: true,
        agent: { select: { name: true } },
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      agents: { total: totalAgents, active: activeAgents },
      calls: {
        total: totalCalls,
        active: activeCalls,
        completed: completedCalls,
        failed: failedCalls,
      },
      tools: { total: totalTools, active: activeTools },
      recentCalls,
    },
  });
};
