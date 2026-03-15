# Post-Call Actions

Post-call actions are per-agent webhooks that fire automatically after a call ends. Use them to push call results (transcript, summary, sentiment, extracted variables) to your own systems in real time.

---

## How It Works

1. A call ends and the voice provider sends a webhook to CeliyoVoice
2. CeliyoVoice processes the webhook, enriches the call record (transcript, sentiment, etc.)
3. CeliyoVoice fires all enabled post-call actions for the agent that handled the call
4. Your endpoint receives a POST request with the call data

---

## Post-Call Action Object

```json
{
  "id": "uuid",
  "tenantId": "tenant-uuid",
  "agentId": "agent-uuid",
  "name": "Notify CRM",
  "type": "WEBHOOK",
  "config": {
    "url": "https://your-crm.com/hooks/call-ended",
    "method": "POST",
    "headers": {
      "X-Custom-Header": "value"
    },
    "includeRawPayload": false,
    "secret": "hmac-secret"
  },
  "isEnabled": true,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

---

## Get Provider Webhook URL (for Agent)

Before creating post-call actions, configure your agent's webhook URL in the voice provider dashboard.

```
GET /api/v1/agents/:agentId/post-call-actions/webhook-url
```

**Permission:** `voiceai.agents.view`

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "url": "https://your-server.com/webhooks/omnidim"
  }
}
```

Register this URL in your Omnidim/Bolna dashboard so that post-call events are delivered to CeliyoVoice.

---

## List Post-Call Actions

```
GET /api/v1/agents/:agentId/post-call-actions
```

**Permission:** `voiceai.agents.view`

### Path Params

| Param | Description |
|-------|-------------|
| `agentId` | Agent UUID |

### Response `200 OK`

```json
{
  "success": true,
  "data": [ /* PostCallAction objects */ ]
}
```

---

## Create Post-Call Action

```
POST /api/v1/agents/:agentId/post-call-actions
```

**Permission:** `voiceai.agents.edit`

### Path Params

| Param | Description |
|-------|-------------|
| `agentId` | Agent UUID |

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string (1–120) | Yes | — | Action label |
| `type` | `WEBHOOK` | Yes | — | Action type (currently only `WEBHOOK`) |
| `config.url` | string (URL) | Yes | — | Your endpoint URL |
| `config.method` | `POST` \| `PUT` \| `PATCH` | No | `POST` | HTTP method |
| `config.headers` | object | No | `{}` | Additional headers to send |
| `config.includeRawPayload` | boolean | No | `false` | Also include raw provider payload |
| `config.secret` | string | No | — | HMAC-SHA256 secret for signature verification |
| `isEnabled` | boolean | No | `true` | Enable/disable without deleting |

```json
{
  "name": "Notify CRM",
  "type": "WEBHOOK",
  "config": {
    "url": "https://your-crm.com/hooks/call-ended",
    "method": "POST",
    "headers": {
      "X-Source": "celiyo-voice"
    },
    "includeRawPayload": false,
    "secret": "your-hmac-secret-here"
  },
  "isEnabled": true
}
```

### Response `201 Created`

```json
{
  "success": true,
  "data": { /* PostCallAction object */ }
}
```

---

## Update Post-Call Action

```
PUT /api/v1/agents/:agentId/post-call-actions/:actionId
```

**Permission:** `voiceai.agents.edit`

All fields are optional. Only provided fields are updated.

### Path Params

| Param | Description |
|-------|-------------|
| `agentId` | Agent UUID |
| `actionId` | Action UUID |

```json
{
  "isEnabled": false
}
```

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Updated PostCallAction object */ }
}
```

---

## Delete Post-Call Action

```
DELETE /api/v1/agents/:agentId/post-call-actions/:actionId
```

**Permission:** `voiceai.agents.edit`

### Response `200 OK`

```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

## List Execution Logs

```
GET /api/v1/agents/:agentId/post-call-actions/executions
```

**Permission:** `voiceai.agents.view`

Returns logs of recent post-call action executions, including HTTP response and any errors.

### Query Parameters

| Param | Type | Default | Max | Description |
|-------|------|---------|-----|-------------|
| `limit` | int | `50` | `100` | Number of results |

### Response `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "actionId": "action-uuid",
      "callId": "call-uuid",
      "status": "SUCCESS",
      "requestPayload": { /* what was sent */ },
      "responseStatus": 200,
      "responseBody": "{\"received\": true}",
      "error": null,
      "executedAt": "2024-01-15T10:05:00Z"
    }
  ]
}
```

### Execution Status Values

| Status | Description |
|--------|-------------|
| `SUCCESS` | Webhook delivered, HTTP 2xx response |
| `FAILED` | HTTP error or network failure |
| `SKIPPED` | Action disabled or conditions not met |

---

## Webhook Payload (Sent to Your Endpoint)

When a call ends, CeliyoVoice POSTs the following to your endpoint:

```json
{
  "event": "call.completed",
  "callId": "uuid",
  "agentId": "agent-uuid",
  "tenantId": "tenant-uuid",
  "phone": "+14155552671",
  "direction": "OUTBOUND",
  "provider": "OMNIDIM",
  "status": "COMPLETED",
  "duration": 142,
  "startedAt": "2024-01-15T10:00:00Z",
  "endedAt": "2024-01-15T10:02:22Z",
  "transcript": "Agent: Hello...\nUser: Hi...",
  "summary": "Customer inquired about billing.",
  "sentiment": "positive",
  "extractedVariables": {
    "orderId": "12345",
    "issueType": "billing"
  },
  "recordingUrl": "https://...",
  "toolsUsed": [
    { "toolId": "uuid", "toolName": "Lookup Order", "result": {} }
  ],
  "rawPayload": { /* only if includeRawPayload: true */ }
}
```

---

## Verifying Webhook Signatures

If you set a `secret` in the action config, CeliyoVoice signs each request with HMAC-SHA256 and includes the signature in the header:

```
x-webhook-signature: sha256=<hmac_hex>
```

Verify the signature in your endpoint:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

```python
import hmac, hashlib, json

def verify_signature(payload: dict, signature: str, secret: str) -> bool:
    body = json.dumps(payload, separators=(',', ':'))
    expected = 'sha256=' + hmac.new(
        secret.encode(), body.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```
