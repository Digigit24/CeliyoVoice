# Calls

Calls represent voice interactions initiated by an agent to a phone number, or inbound calls received by an agent. Each call tracks status, transcript, duration, sentiment, and more.

---

## Call Object

```json
{
  "id": "uuid",
  "tenantId": "tenant-uuid",
  "ownerUserId": "user-uuid",
  "agentId": "agent-uuid",
  "phone": "+14155552671",
  "direction": "OUTBOUND",
  "provider": "OMNIDIM",
  "providerCallId": "omnidim-call-id",
  "status": "COMPLETED",
  "duration": 142,
  "transcript": "Agent: Hello...\nUser: Hi...",
  "summary": "Customer inquired about billing.",
  "recordingUrl": "https://...",
  "sentiment": "positive",
  "extractedVariables": { "orderId": "12345" },
  "cost": "0.045000",
  "toolsUsed": [
    { "toolId": "uuid", "toolName": "Lookup Order", "result": { "status": "shipped" } }
  ],
  "metadata": {},
  "startedAt": "2024-01-15T10:00:00Z",
  "endedAt": "2024-01-15T10:02:22Z",
  "createdAt": "2024-01-15T09:59:55Z",
  "updatedAt": "2024-01-15T10:02:25Z"
}
```

### Call Status Values

| Status | Description |
|--------|-------------|
| `QUEUED` | Call created, waiting to be dialed |
| `RINGING` | Phone is ringing |
| `IN_PROGRESS` | Call connected and active |
| `COMPLETED` | Call ended normally |
| `FAILED` | Call failed (network, provider error, etc.) |
| `CANCELLED` | Call was cancelled before connecting |

---

## Start a Call

```
POST /api/v1/calls/start
```

**Permission:** `voiceai.calls.create`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | UUID | Yes | The agent to handle the call |
| `phone` | string | Yes | Phone number in E.164 format (e.g. `+14155552671`) |
| `fromNumberId` | string \| number | No | Omnidim phone number ID to dial from |
| `callContext` | object | No | Key-value context injected into the agent's prompt |
| `metadata` | object | No | Arbitrary metadata stored with the call |

```json
{
  "agentId": "agent-uuid",
  "phone": "+14155552671",
  "fromNumberId": "42",
  "callContext": {
    "customerName": "John Doe",
    "orderId": "ORD-999"
  },
  "metadata": {
    "source": "crm-integration"
  }
}
```

### Response `202 Accepted`

The call is queued. Status will update asynchronously as the call progresses.

```json
{
  "success": true,
  "data": {
    "id": "call-uuid",
    "status": "QUEUED",
    "agentId": "agent-uuid",
    "phone": "+14155552671",
    "provider": "OMNIDIM",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 400 | `VALIDATION_ERROR` | Missing/invalid phone or agentId |
| 404 | `NOT_FOUND` | Agent not found |
| 502 | `PROVIDER_ERROR` | Provider failed to initiate call |

---

## End a Call

```
POST /api/v1/calls/:id/end
```

**Permission:** `voiceai.calls.edit`

Terminates an active call.

### Path Params

| Param | Description |
|-------|-------------|
| `id` | Call UUID |

### Request Body

Empty.

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Updated Call object */ }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 404 | `NOT_FOUND` | Call not found |

---

## List Calls

```
GET /api/v1/calls
```

**Permission:** `voiceai.calls.view`

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Items per page (max 100) |
| `status` | string | — | Filter: `QUEUED`, `RINGING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `agentId` | UUID | — | Filter by agent |
| `provider` | `OMNIDIM` \| `BOLNA` | — | Filter by provider |
| `phone` | string | — | Partial match on phone number |
| `dateFrom` | ISO8601 datetime | — | Filter calls created after this time |
| `dateTo` | ISO8601 datetime | — | Filter calls created before this time |
| `sortBy` | `createdAt` \| `duration` \| `status` | `createdAt` | Sort field |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort direction |

```bash
GET /api/v1/calls?status=COMPLETED&agentId=agent-uuid&dateFrom=2024-01-01T00:00:00Z&limit=50
```

### Response `200 OK`

```json
{
  "success": true,
  "data": [ /* Call objects */ ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 238,
    "totalPages": 5
  }
}
```

---

## Get Call Details

```
GET /api/v1/calls/:id
```

**Permission:** `voiceai.calls.view`

Returns full call details including transcript, sentiment, tools used, and extracted variables.

### Path Params

| Param | Description |
|-------|-------------|
| `id` | Call UUID |

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Full Call object */ }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 404 | `NOT_FOUND` | Call not found |

---

## Fetch Remote Call Logs (from Omnidim)

```
GET /api/v1/calls/logs/remote
```

**Permission:** `voiceai.calls.view`

Fetches call logs directly from the Omnidim API for the tenant's configured credentials.

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `agentId` | UUID | — | Our agent UUID (resolved to Omnidim's `providerAgentId`) |
| `page` | int | `1` | Page in Omnidim's result |
| `pageSize` | int | `20` | Results per page |
| `call_status` | string | — | Omnidim-specific status filter |

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Omnidim raw call logs */ }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 400 | `CREDENTIALS_MISSING` | No Omnidim credentials configured |
| 502 | `PROVIDER_ERROR` | Omnidim API unavailable |

---

## Phone Number Format

All phone numbers must be in **E.164 format**:

- Starts with `+`
- Followed by country code and number
- No spaces, dashes, or parentheses

| Valid | Invalid |
|-------|---------|
| `+14155552671` | `415-555-2671` |
| `+919876543210` | `09876543210` |
| `+442071234567` | `(+44) 20 7123 4567` |

---

## Call Lifecycle

```
QUEUED → RINGING → IN_PROGRESS → COMPLETED
                              ↘ FAILED
               ↘ CANCELLED
```

Status updates are pushed via incoming webhooks from the provider. See [webhooks.md](./webhooks.md) for details.

Post-call data (transcript, summary, sentiment, extracted variables) is populated after the call ends via the webhook processor. See [post-call-actions.md](./post-call-actions.md) to configure outbound notifications when this data is ready.
