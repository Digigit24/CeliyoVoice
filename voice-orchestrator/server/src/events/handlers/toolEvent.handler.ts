import type { Prisma } from '@prisma/client';
import { subscribe } from '../eventBus';
import { VoiceEventType, type VoiceEvent } from '../eventTypes';
import { getPrismaClient } from '../../db/tenantClients';
import { toolQueue } from '../../queue/queues';
import { logger } from '../../utils/logger';

async function handleToolRequested(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.TOOL_REQUESTED) return;

  const prisma = await getPrismaClient(event.tenantId);

  // Store the event immediately
  await prisma.callEvent.create({
    data: {
      callId: event.callId,
      tenantId: event.tenantId,
      eventType: 'TOOL_REQUESTED',
      data: {
        toolName: event.toolName,
        parameters: event.parameters,
        requestId: event.requestId,
      } as Prisma.InputJsonValue,
    },
  });

  // Find the tool by name for this tenant
  const tool = await prisma.tool.findFirst({
    where: { tenantId: event.tenantId, name: event.toolName, isActive: true },
  });

  if (!tool) {
    logger.warn({ tenantId: event.tenantId, toolName: event.toolName }, 'Tool not found');
    return;
  }

  // Queue the tool execution
  await toolQueue.add(
    'execute-tool' as string,
    {
      tenantId: event.tenantId,
      callId: event.callId,
      toolId: tool.id,
      toolName: event.toolName,
      parameters: event.parameters,
      requestId: event.requestId,
      providerCallId: event.providerCallId,
    },
    { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  );

  logger.info({ callId: event.callId, toolName: event.toolName }, 'Tool execution queued');
}

async function handleToolCompleted(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.TOOL_COMPLETED) return;
  const prisma = await getPrismaClient(event.tenantId);

  // Append to call's toolsUsed array using raw SQL for JSON array append
  const call = await prisma.call.findUnique({
    where: { id: event.callId },
    select: { toolsUsed: true },
  });

  const currentTools = Array.isArray(call?.toolsUsed) ? call.toolsUsed : [];
  const updatedTools = [
    ...currentTools,
    { toolName: event.toolName, requestId: event.requestId, result: event.result },
  ];

  await prisma.call.update({
    where: { id: event.callId },
    data: { toolsUsed: updatedTools as Prisma.InputJsonValue },
  });

  await prisma.callEvent.create({
    data: {
      callId: event.callId,
      tenantId: event.tenantId,
      eventType: 'TOOL_COMPLETED',
      data: { toolName: event.toolName, requestId: event.requestId, result: event.result } as Prisma.InputJsonValue,
    },
  });
}

async function handleToolFailed(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.TOOL_FAILED) return;
  const prisma = await getPrismaClient(event.tenantId);

  await prisma.callEvent.create({
    data: {
      callId: event.callId,
      tenantId: event.tenantId,
      eventType: 'TOOL_FAILED',
      data: { toolName: event.toolName, requestId: event.requestId, error: event.error } as Prisma.InputJsonValue,
    },
  });

  // Update call metadata with tool failure
  const call = await prisma.call.findUnique({
    where: { id: event.callId },
    select: { metadata: true },
  });

  const meta = (call?.metadata as Record<string, unknown> | null) ?? {};
  const failures = Array.isArray(meta['toolFailures']) ? meta['toolFailures'] : [];

  await prisma.call.update({
    where: { id: event.callId },
    data: {
      metadata: {
        ...meta,
        toolFailures: [...failures, { toolName: event.toolName, error: event.error }],
      } as Prisma.InputJsonValue,
    },
  });

  logger.error({ callId: event.callId, toolName: event.toolName, error: event.error }, 'Tool failed');
}

/**
 * Registers all tool-related event handlers on the event bus.
 * Call this once at server startup.
 */
export function initToolEventHandlers(): void {
  subscribe(VoiceEventType.TOOL_REQUESTED, (e) => void handleToolRequested(e));
  subscribe(VoiceEventType.TOOL_COMPLETED, (e) => void handleToolCompleted(e));
  subscribe(VoiceEventType.TOOL_FAILED, (e) => void handleToolFailed(e));

  logger.info('Tool event handlers registered');
}
