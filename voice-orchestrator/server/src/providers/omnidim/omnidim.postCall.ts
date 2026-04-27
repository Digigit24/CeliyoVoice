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
  // `call_request_id` is the dispatch request ID — matches what we store as
  // providerCallId. Omnidim sends it either as a bare integer (post-call
  // webhook payload) or as a nested { id } object (call-log export shape).
  const crRaw = raw['call_request_id'];
  const callRequestId =
    crRaw != null && typeof crRaw !== 'object'
      ? String(crRaw)
      : crRaw != null &&
          typeof crRaw === 'object' &&
          (crRaw as Record<string, unknown>)['id'] != null
        ? String((crRaw as Record<string, unknown>)['id'])
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

  // recording_url may be relative — prefer the full internal_recording_url.
  // Omnidim sends `false` (boolean) on declined / no-answer calls for both
  // recording fields, so accept only string values.
  const internalRecording = raw['internal_recording_url'];
  const externalRecording = raw['recording_url'];
  const recordingUrl =
    typeof internalRecording === 'string' && internalRecording.length > 0
      ? internalRecording
      : typeof externalRecording === 'string' && externalRecording.length > 0
        ? externalRecording
        : undefined;

  // Sentiment / details / model fields are also occasionally sent as booleans
  // (`false` instead of an absent string). Accept only strings.
  const stringOrUndefined = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;

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
    agentName: stringOrUndefined(raw['bot_name']),
    toNumber: stringOrUndefined(raw['to_number']),
    fromNumber: stringOrUndefined(raw['from_number']),
    direction: stringOrUndefined(raw['call_direction']),
    durationSeconds,
    callStatus: stringOrUndefined(raw['call_status']),
    recordingUrl,
    transcript,
    summary: undefined, // Omnidim post-call doesn't include summary at top level
    sentiment: stringOrUndefined(raw['sentiment_score']),
    sentimentDetails: stringOrUndefined(raw['sentiment_analysis_details']),
    extractedVariables,
    cost,
    modelName: stringOrUndefined(raw['model_name']),
    asrService: stringOrUndefined(raw['asr_service']),
    ttsService: stringOrUndefined(raw['tts_service']),
    rawPayload: raw,
  };
};
