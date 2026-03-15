import { CallStatus, type CallEventType, type PrismaClient } from '@prisma/client';
import { subscribe } from '../eventBus';
import { VoiceEventType, type VoiceEvent } from '../eventTypes';
import { getPrismaClient } from '../../db/tenantClients';
import { logger } from '../../utils/logger';

async function saveCallEvent(
  prisma: PrismaClient,
  callId: string,
  tenantId: string,
  eventType: CallEventType,
  data: Record<string, unknown>,
): Promise<void> {
  await prisma.callEvent.create({
    data: { callId, tenantId, eventType, data: data as import('@prisma/client').Prisma.InputJsonValue },
  });
}

async function handleCallStarted(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.CALL_STARTED) return;
  const prisma = await getPrismaClient(event.tenantId);

  await prisma.call.update({
    where: { id: event.callId },
    data: { status: CallStatus.IN_PROGRESS, startedAt: new Date(event.timestamp) },
  });

  await saveCallEvent(prisma, event.callId, event.tenantId, 'CALL_STARTED', {
    providerCallId: event.providerCallId,
    agentId: event.agentId,
    phone: event.phone,
  });

  logger.info({ callId: event.callId, tenantId: event.tenantId }, 'Call marked IN_PROGRESS');
}

async function handleCallRinging(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.CALL_RINGING) return;
  const prisma = await getPrismaClient(event.tenantId);

  await prisma.call.update({
    where: { id: event.callId },
    data: { status: CallStatus.RINGING },
  });

  await saveCallEvent(prisma, event.callId, event.tenantId, 'CALL_RINGING', {});
}

async function handleCallConnected(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.CALL_CONNECTED) return;
  const prisma = await getPrismaClient(event.tenantId);
  await saveCallEvent(prisma, event.callId, event.tenantId, 'CALL_CONNECTED', {});
}

async function handleCallEnded(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.CALL_ENDED) return;
  const prisma = await getPrismaClient(event.tenantId);
  const now = new Date();

  await prisma.call.update({
    where: { id: event.callId },
    data: {
      status: CallStatus.COMPLETED,
      endedAt: now,
      duration: event.duration,
      recordingUrl: event.recordingUrl,
    },
  });

  await saveCallEvent(prisma, event.callId, event.tenantId, 'CALL_ENDED', {
    duration: event.duration,
    recordingUrl: event.recordingUrl,
  });

  logger.info({ callId: event.callId, duration: event.duration }, 'Call completed');
}

async function handleTranscriptFinal(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.TRANSCRIPT_FINAL) return;
  const prisma = await getPrismaClient(event.tenantId);

  await prisma.call.update({
    where: { id: event.callId },
    data: {
      transcript: event.transcript,
      ...(event.summary ? { summary: event.summary } : {}),
    },
  });

  await saveCallEvent(prisma, event.callId, event.tenantId, 'TRANSCRIPT_FINAL', {
    transcript: event.transcript,
    summary: event.summary,
  });
}

async function handleTranscriptUpdate(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.TRANSCRIPT_UPDATE) return;
  const prisma = await getPrismaClient(event.tenantId);
  await saveCallEvent(prisma, event.callId, event.tenantId, 'TRANSCRIPT_UPDATE', {
    transcript: event.transcript,
  });
}

async function handleError(event: VoiceEvent): Promise<void> {
  if (event.type !== VoiceEventType.ERROR) return;
  const prisma = await getPrismaClient(event.tenantId);

  if (event.fatal) {
    await prisma.call.update({
      where: { id: event.callId },
      data: { status: CallStatus.FAILED, endedAt: new Date() },
    });
  }

  await saveCallEvent(prisma, event.callId, event.tenantId, 'ERROR', {
    error: event.error,
    fatal: event.fatal,
  });

  logger.error({ callId: event.callId, error: event.error }, 'Call error event');
}

/**
 * Registers all call lifecycle event handlers on the event bus.
 * Call this once at server startup.
 */
export function initCallEventHandlers(): void {
  subscribe(VoiceEventType.CALL_STARTED, (e) => void handleCallStarted(e));
  subscribe(VoiceEventType.CALL_RINGING, (e) => void handleCallRinging(e));
  subscribe(VoiceEventType.CALL_CONNECTED, (e) => void handleCallConnected(e));
  subscribe(VoiceEventType.CALL_ENDED, (e) => void handleCallEnded(e));
  subscribe(VoiceEventType.TRANSCRIPT_UPDATE, (e) => void handleTranscriptUpdate(e));
  subscribe(VoiceEventType.TRANSCRIPT_FINAL, (e) => void handleTranscriptFinal(e));
  subscribe(VoiceEventType.ERROR, (e) => void handleError(e));

  logger.info('Call event handlers registered');
}
