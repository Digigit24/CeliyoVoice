# Agents

Agents are AI voice personas configured with a system prompt, voice settings, and optional tools. They handle inbound/outbound calls via a connected voice provider (Omnidim or Bolna).

---

## Agent Object

```json
{
  "id": "uuid",
  "tenantId": "tenant-uuid",
  "ownerUserId": "user-uuid",
  "name": "Support Bot",
  "provider": "OMNIDIM",
  "providerAgentId": "omnidim-internal-id",
  "voiceLanguage": "en-IN",
  "voiceModel": "female",
  "systemPrompt": "You are a helpful support assistant.",
  "knowledgebaseId": null,
  "tools": ["tool-uuid-1", "tool-uuid-2"],
  "workflowId": null,
  "maxConcurrentCalls": 1,
  "isActive": true,
  "metadata": {},
  "providerConfig": {},
  "welcomeMessage": "Hello, how can I help you?",
  "callType": "Incoming",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

---

## Create Agent

```
POST /api/v1/agents
```

**Permission:** `voiceai.agents.create`

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string (1–255) | Yes | — | Agent display name |
| `provider` | `OMNIDIM` \| `BOLNA` | Yes | — | Voice provider |
| `systemPrompt` | string | Yes | — | Agent personality/instructions |
| `voiceLanguage` | string | No | `"en-IN"` | Language code (e.g. `"en-US"`, `"hi-IN"`) |
| `voiceModel` | string | No | `"female"` | Voice gender/model |
| `knowledgebaseId` | UUID | No | `null` | Linked knowledge base |
| `tools` | UUID[] | No | `[]` | Tool IDs available during calls |
| `workflowId` | UUID | No | `null` | Linked workflow |
| `maxConcurrentCalls` | int (1–20) | No | `1` | Max simultaneous calls |
| `metadata` | object | No | `{}` | Arbitrary key-value metadata |

```json
{
  "name": "Support Bot",
  "provider": "OMNIDIM",
  "systemPrompt": "You are a helpful support assistant. Always be polite and concise.",
  "voiceLanguage": "en-IN",
  "voiceModel": "female",
  "maxConcurrentCalls": 3,
  "tools": ["tool-uuid-1"]
}
```

### Response `201 Created`

```json
{
  "success": true,
  "data": { /* Agent object */ },
  "warning": "Provider sync had issues: ..."  // optional
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 400 | `VALIDATION_ERROR` | Invalid fields |
| 401 | `UNAUTHORIZED` | Missing/invalid token |
| 403 | `FORBIDDEN` | Insufficient permissions |

---

## List Agents

```
GET /api/v1/agents
```

**Permission:** `voiceai.agents.view`

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Items per page (max 100) |
| `provider` | `OMNIDIM` \| `BOLNA` | — | Filter by provider |
| `isActive` | `"true"` \| `"false"` | — | Filter by active status |
| `search` | string | — | Search by name |
| `sortBy` | `createdAt` \| `name` \| `updatedAt` | `createdAt` | Sort field |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort direction |

```bash
GET /api/v1/agents?provider=OMNIDIM&isActive=true&search=support&page=1&limit=10
```

### Response `200 OK`

```json
{
  "success": true,
  "data": [ /* Agent objects */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

---

## Get Agent

```
GET /api/v1/agents/:id
```

**Permission:** `voiceai.agents.view`

### Path Params

| Param | Description |
|-------|-------------|
| `id` | Agent UUID |

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Agent object with stats */ }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 404 | `NOT_FOUND` | Agent not found |

---

## Update Agent

```
PUT /api/v1/agents/:id
```

**Permission:** `voiceai.agents.edit`

> Note: `provider` cannot be changed after creation.

### Request Body (all fields optional)

```json
{
  "name": "Updated Bot Name",
  "systemPrompt": "New system prompt...",
  "voiceLanguage": "hi-IN",
  "voiceModel": "male",
  "knowledgebaseId": "kb-uuid",
  "tools": ["tool-uuid-1", "tool-uuid-2"],
  "workflowId": null,
  "maxConcurrentCalls": 5,
  "metadata": { "team": "sales" }
}
```

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Updated Agent object */ },
  "warning": "..."  // optional
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 400 | `VALIDATION_ERROR` | Invalid fields |
| 404 | `NOT_FOUND` | Agent not found |

---

## Delete Agent

```
DELETE /api/v1/agents/:id
```

**Permission:** `voiceai.agents.delete`

### Response `200 OK`

```json
{
  "success": true,
  "data": { "deleted": true }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 404 | `NOT_FOUND` | Agent not found |

---

## Sync Agent with Provider

Re-pushes the agent configuration to the voice provider (useful after manual changes).

```
POST /api/v1/agents/:id/sync
```

**Permission:** `voiceai.agents.edit`

### Request Body

Empty.

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Synced Agent object */ }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 400 | `CREDENTIALS_MISSING` | No provider credentials configured |
| 401 | `PROVIDER_AUTH_ERROR` | Provider rejected credentials |
| 404 | `NOT_FOUND` | Agent not found |
| 502 | `PROVIDER_ERROR` | Provider service unavailable |

---

## Import Agents from Omnidim

### Import a Single Agent

```
POST /api/v1/agents/import/omnidim
```

**Permission:** `voiceai.agents.create`

```json
{
  "agentId": "12345"
}
```

> `agentId` is the Omnidim agent ID (will be coerced to string if number).

### Response `201 Created` (new) or `200 OK` (updated)

```json
{
  "success": true,
  "data": {
    "agent": { /* Agent object */ },
    "action": "created"
  }
}
```

---

### Import All Agents from Omnidim

```
POST /api/v1/agents/import/omnidim/all
```

**Permission:** `voiceai.agents.create`

**Request Body:** Empty.

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "imported": 5,
    "updated": 2,
    "failed": 1,
    "details": [
      { "agentId": "123", "status": "created" },
      { "agentId": "456", "status": "updated" },
      { "agentId": "789", "status": "failed", "error": "..." }
    ]
  }
}
```

---

### List Remote Agents from Omnidim

```
GET /api/v1/agents/remote/omnidim
```

**Permission:** `voiceai.agents.view`

Fetches agents directly from the Omnidim API (not stored locally).

### Response `200 OK`

```json
{
  "success": true,
  "data": [
    { "id": "omnidim-id", "name": "...", "provider": "OMNIDIM" }
  ]
}
```

### Errors (Import/Remote endpoints)

| Status | Code | Reason |
|--------|------|--------|
| 400 | `CREDENTIALS_MISSING` | No Omnidim credentials configured |
| 401 | `PROVIDER_AUTH_ERROR` | Invalid Omnidim API key |
| 502 | `PROVIDER_ERROR` | Omnidim service unavailable |
