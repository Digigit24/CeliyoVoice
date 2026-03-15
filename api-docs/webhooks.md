# Webhooks

CeliyoVoice receives real-time events from voice providers (Omnidim, Bolna) via webhooks. These events drive call status updates, transcript population, and post-call action execution.

---

## Setup

1. Get your webhook URL from the API:
   ```
   GET /api/v1/agents/:agentId/post-call-actions/webhook-url
   ```
2. Register that URL in your Omnidim or Bolna dashboard as the webhook endpoint for your account.
3. CeliyoVoice will receive and process all provider events automatically.

---

## Omnidim Webhook

```
POST /webhooks/omnidim
```

**No auth required** — events are verified via HMAC signature.

### Headers

| Header | Description |
|--------|-------------|
| `x-omnidim-signature` | HMAC-SHA256 signature of the payload |
| `Content-Type` | `application/json` |

### Request Body

Raw Omnidim event payload (JSON). The structure depends on the event type. CeliyoVoice normalizes all Omnidim events internally.

### Response `200 OK`

CeliyoVoice always responds within 5 seconds:

```json
{
  "received": true,
  "id": "webhook-event-uuid"
}
```

---

## Bolna Webhook

```
POST /webhooks/bolna
```

**No auth required** — events are verified via HMAC signature.

Same pattern as Omnidim. Header: `x-bolna-signature`.

---

## Processing Pipeline

```
Provider → POST /webhooks/<provider>
              ↓
         Store in webhook_events (status: RECEIVED)
              ↓
         Return 200 immediately
              ↓
         Queue BullMQ async job
              ↓
         Worker: Normalize payload
              ↓
         Match/create Call record
              ↓
         Update Call (status, transcript, sentiment, etc.)
              ↓
         Fire PostCallActions (outbound webhooks to your systems)
              ↓
         Mark webhook_events status: PROCESSED
```

---

## Supported Event Types

### Omnidim Events

| Event Type | Effect |
|------------|--------|
| Call initiated | Creates/updates call with status `RINGING` or `IN_PROGRESS` |
| Call connected | Updates call to `IN_PROGRESS`, sets `startedAt` |
| Call ended | Updates call to `COMPLETED`/`FAILED`, sets `endedAt`, `duration` |
| Post-call data | Populates `transcript`, `summary`, `sentiment`, `extractedVariables`, `recordingUrl` |

---

## Webhook Event Record

Each incoming webhook is stored in the database for auditing:

```json
{
  "id": "uuid",
  "provider": "OMNIDIM",
  "eventType": "call.ended",
  "providerCallId": "omnidim-call-id",
  "callId": "our-call-uuid",
  "rawPayload": { /* original payload from provider */ },
  "processedPayload": { /* normalized payload */ },
  "status": "PROCESSED",
  "error": null,
  "createdAt": "2024-01-15T10:05:00Z"
}
```

### Webhook Event Status

| Status | Description |
|--------|-------------|
| `RECEIVED` | Stored, queued for processing |
| `PROCESSING` | Worker is currently processing |
| `PROCESSED` | Successfully processed |
| `FAILED` | Processing failed (check `error` field) |

---

## Signature Verification

CeliyoVoice verifies incoming webhook signatures using the provider's configured webhook secret.

**Header:** `x-<provider>-signature`
**Algorithm:** HMAC-SHA256

If signature verification fails, the webhook is rejected with `400 Bad Request`.

To configure webhook secrets, update the `ProviderConfig.webhookSecret` in the database (admin operation).

---

## Retry Behavior

CeliyoVoice does not retry failed webhook deliveries from providers — the provider handles retries. However, processing failures (stored in `webhook_events.status = FAILED`) can be monitored for debugging.

---

## Troubleshooting

**Webhooks not being processed:**
1. Confirm the webhook URL is registered in the provider dashboard
2. Check that `ProviderConfig.webhookSecret` matches what the provider is using to sign
3. Check server logs for signature verification failures
4. Verify the server is reachable from the provider (not behind a firewall)

**Call data not updating after call ends:**
1. Check `webhook_events` table for `FAILED` entries
2. Look at the `error` field for processing failure reasons
3. Verify `PostCallActions` have correct URLs if expecting outbound notifications

**Post-call actions not firing:**
1. Check action is `isEnabled: true`
2. Check execution logs: `GET /api/v1/agents/:agentId/post-call-actions/executions`
3. Verify your endpoint URL is reachable from the server
