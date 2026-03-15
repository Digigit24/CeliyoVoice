import type { NormalizedPostCallData, PostCallNormalizer } from '../interfaces/postCall.interface';

/**
 * Omnidim post-call webhook payload normalizer.
 *
 * Omnidim fires a single POST after the call ends.  The payload looks like the
 * call-log entry shape (id, bot_name, call_status, extracted_variables, …).
 *
 * We detect a post-call payload by the presence of `call_status` or `bot_name`
 * combined with the absence of a structured `event` field.
 *
 * Returns null if the payload does not look like an Omnidim post-call event.
 */
export const normalizeOmnidimPostCall: PostCallNormalizer = (
  raw: Record<string, unknown>,
): NormalizedPostCallData | null => {
  // ── Detection heuristic ──────────────────────────────────────────────────
  // Omnidim post-call payloads have call_status / bot_name but no event field,
  // OR the event field is something like "post_call".
  const eventField = raw['event'] as string | undefined;
  const hasCallStatus = typeof raw['call_status'] === 'string';
  const hasBotName = typeof raw['bot_name'] === 'string';

  const isPostCallEvent =
    eventField === 'post_call' ||
    (!eventField && (hasCallStatus || hasBotName));

  if (!isPostCallEvent) return null;

  // ── Extract fields ────────────────────────────────────────────────────────
  // The call log `id` is the Omnidim call-log row ID.
  // `call_request_id.id` is the dispatch request ID — this matches what
  // Omnidim returns in the dispatch response and what we store as providerCallId.
  const callRequestId =
    raw['call_request_id'] != null &&
    typeof raw['call_request_id'] === 'object' &&
    (raw['call_request_id'] as Record<string, unknown>)['id']
      ? String((raw['call_request_id'] as Record<string, unknown>)['id'])
      : undefined;

  const id = callRequestId ?? (raw['id'] != null ? String(raw['id']) : undefined);

  // agent / bot id may be in different places
  const agentId =
    raw['agent_id'] != null
      ? String(raw['agent_id'])
      : raw['bot_id'] != null
        ? String(raw['bot_id'])
        : undefined;

  const durationSeconds =
    typeof raw['call_duration_in_seconds'] === 'number'
      ? raw['call_duration_in_seconds']
      : typeof raw['duration'] === 'number'
        ? raw['duration']
        : undefined;

  // recording_url may be relative — prefer the full internal_recording_url
  const recordingUrl =
    (raw['internal_recording_url'] as string | undefined) ??
    (raw['recording_url'] as string | undefined);

  // Transcript is a serialised Python list string in practice; keep raw
  const transcript =
    typeof raw['call_conversation'] === 'string'
      ? raw['call_conversation']
      : undefined;

  // Extracted variables live in a nested object
  const extractedVariables =
    raw['extracted_variables'] != null &&
    typeof raw['extracted_variables'] === 'object' &&
    !Array.isArray(raw['extracted_variables'])
      ? (raw['extracted_variables'] as Record<string, unknown>)
      : undefined;

  const cost =
    typeof raw['call_cost'] === 'number'
      ? raw['call_cost']
      : typeof raw['aggregated_estimated_cost'] === 'number'
        ? raw['aggregated_estimated_cost']
        : undefined;

  return {
    provider: 'OMNIDIM',
    providerCallId: id,
    agentProviderAgentId: agentId,
    agentName: raw['bot_name'] as string | undefined,
    toNumber: raw['to_number'] as string | undefined,
    fromNumber: raw['from_number'] as string | undefined,
    direction: raw['call_direction'] as string | undefined,
    durationSeconds,
    callStatus: raw['call_status'] as string | undefined,
    recordingUrl,
    transcript,
    summary: undefined, // Omnidim post-call doesn't include summary at top level
    sentiment: raw['sentiment_score'] as string | undefined,
    sentimentDetails: raw['sentiment_analysis_details'] as string | undefined,
    extractedVariables,
    cost,
    modelName: raw['model_name'] as string | undefined,
    asrService: raw['asr_service'] as string | undefined,
    ttsService: raw['tts_service'] as string | undefined,
    rawPayload: raw,
  };
};
