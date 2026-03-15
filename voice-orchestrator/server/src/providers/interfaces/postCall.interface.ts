import type { VoiceProvider } from '@prisma/client';

/**
 * Provider-agnostic representation of the data received in a post-call
 * webhook / callback.  Both Omnidim and Bolna (and future providers) normalise
 * their raw payloads into this shape before it is persisted or forwarded.
 */
export interface NormalizedPostCallData {
  provider: VoiceProvider;

  // ── Call identity ──────────────────────────────────────────────────────────
  /** Provider-side integer/string call ID — used to match our local Call row. */
  providerCallId?: string;
  /** Provider-side agent ID (as string) — used as fallback match. */
  agentProviderAgentId?: string;
  /** Human-readable agent / bot name from the provider. */
  agentName?: string;

  // ── Call details ──────────────────────────────────────────────────────────
  toNumber?: string;
  fromNumber?: string;
  /** "outbound" | "inbound" */
  direction?: string;
  durationSeconds?: number;
  /** Provider status string e.g. "completed", "failed", "busy", "no-answer" */
  callStatus?: string;

  // ── Rich post-call data ───────────────────────────────────────────────────
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
  /** "Positive" | "Negative" | "Neutral" */
  sentiment?: string;
  sentimentDetails?: string;
  extractedVariables?: Record<string, unknown>;
  /** Cost in USD */
  cost?: number;

  // ── Technical metadata ────────────────────────────────────────────────────
  modelName?: string;
  asrService?: string;
  ttsService?: string;

  // ── Original payload (always kept for audit / forwarding) ─────────────────
  rawPayload: Record<string, unknown>;
}

/**
 * Each voice provider module must export a function with this signature so
 * that the PostCallService can call it in a provider-agnostic way.
 */
export type PostCallNormalizer = (
  raw: Record<string, unknown>,
) => NormalizedPostCallData | null;
