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

  // Pull `call_report` early — production payloads nest most rich fields
  // (transcript, summary, sentiment, extracted_variables) inside it, while
  // the older test/sample payload had them flat at top level.
  const callReport =
    raw['call_report'] != null &&
    typeof raw['call_report'] === 'object' &&
    !Array.isArray(raw['call_report'])
      ? (raw['call_report'] as Record<string, unknown>)
      : undefined;

  // Transcript: real payloads put the joined transcript in
  // call_report.full_conversation. The legacy `call_conversation` path is a
  // fallback for older sample shapes.
  const transcript =
    stringOrUndefined(callReport?.['full_conversation']) ??
    (typeof raw['call_conversation'] === 'string' ? raw['call_conversation'] : undefined);

  // Summary lives only inside call_report.summary on real payloads.
  const summary = stringOrUndefined(callReport?.['summary']);

  // Sentiment likewise: prefer call_report.sentiment over the legacy
  // sentiment_score field.
  const sentiment =
    stringOrUndefined(callReport?.['sentiment']) ??
    stringOrUndefined(raw['sentiment_score']);

  // Extracted variables: prefer call_report.extracted_variables (real
  // payloads), fall back to the top-level field (test payloads).
  const evRaw = callReport?.['extracted_variables'] ?? raw['extracted_variables'];
  const extractedVariables =
    evRaw != null && typeof evRaw === 'object' && !Array.isArray(evRaw)
      ? (evRaw as Record<string, unknown>)
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
    summary,
    sentiment,
    sentimentDetails: stringOrUndefined(raw['sentiment_analysis_details']),
    extractedVariables,
    cost,
    modelName: stringOrUndefined(raw['model_name']),
    asrService: stringOrUndefined(raw['asr_service']),
    ttsService: stringOrUndefined(raw['tts_service']),
    rawPayload: raw,
  };
};
