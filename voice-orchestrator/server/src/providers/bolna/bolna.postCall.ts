import type { NormalizedPostCallData, PostCallNormalizer } from '../interfaces/postCall.interface';

/**
 * Bolna post-call normalizer — stub for Phase 2.
 *
 * Update detection heuristic and field mapping once Bolna webhook
 * payload shape is confirmed.
 */
export const normalizeBolnaPostCall: PostCallNormalizer = (
  raw: Record<string, unknown>,
): NormalizedPostCallData | null => {
  // TODO: implement when Bolna webhook docs are available
  const eventField = raw['event'] as string | undefined;
  if (eventField !== 'call.ended' && eventField !== 'post_call') return null;

  return {
    provider: 'BOLNA',
    providerCallId: raw['call_id'] as string | undefined,
    agentName: raw['agent_name'] as string | undefined,
    toNumber: raw['to_number'] as string | undefined,
    fromNumber: raw['from_number'] as string | undefined,
    durationSeconds: raw['duration'] as number | undefined,
    callStatus: raw['status'] as string | undefined,
    recordingUrl: raw['recording_url'] as string | undefined,
    transcript: raw['transcript'] as string | undefined,
    summary: raw['summary'] as string | undefined,
    rawPayload: raw,
  };
};
