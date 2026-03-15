# Tools

Tools are HTTP integrations that agents can call during a live conversation — for example, to look up order status, create a ticket, or fetch customer data in real time.

Each tool defines an HTTP endpoint, method, headers, body template, and optional authentication.

---

## Tool Object

```json
{
  "id": "uuid",
  "tenantId": "tenant-uuid",
  "ownerUserId": "user-uuid",
  "name": "Lookup Order",
  "description": "Fetches order status by order ID",
  "endpoint": "https://api.example.com/orders/lookup",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "bodyTemplate": {
    "order_id": "{{orderId}}"
  },
  "authType": "API_KEY",
  "authConfig": { /* masked */ },
  "timeout": 30,
  "retries": 1,
  "isActive": true,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

> `authConfig` is stored encrypted (AES-256-GCM) and returned masked.

---

## Create Tool

```
POST /api/v1/tools
```

**Permission:** `voiceai.tools.create`

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string (1–255) | Yes | — | Tool display name |
| `description` | string | Yes | — | What this tool does (used by agent to decide when to call it) |
| `endpoint` | string (URL) | Yes | — | Full URL of the HTTP endpoint |
| `method` | `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE` | No | `POST` | HTTP method |
| `headers` | object | No | `{}` | Static request headers |
| `bodyTemplate` | object | No | `null` | JSON body template (supports `{{variable}}` placeholders) |
| `authType` | `NONE` \| `API_KEY` \| `BEARER` \| `OAUTH` | No | `NONE` | Authentication method |
| `authConfig` | object | No | `{}` | Auth credentials (encrypted at rest) |
| `timeout` | int (1–120) | No | `30` | Request timeout in seconds |
| `retries` | int (0–3) | No | `0` | Retry attempts on failure |

```json
{
  "name": "Lookup Order",
  "description": "Fetches real-time order status given an order ID. Use when the customer asks about their order.",
  "endpoint": "https://api.example.com/orders",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "bodyTemplate": {
    "order_id": "{{orderId}}"
  },
  "authType": "API_KEY",
  "authConfig": {
    "header": "X-API-Key",
    "value": "your-secret-api-key"
  },
  "timeout": 10,
  "retries": 1
}
```

### Response `201 Created`

```json
{
  "success": true,
  "data": { /* Tool object */ }
}
```

---

## List Tools

```
GET /api/v1/tools
```

**Permission:** `voiceai.tools.view`

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Items per page (max 100) |
| `search` | string | — | Filter by name |
| `isActive` | `"true"` \| `"false"` | — | Filter by active status |

### Response `200 OK`

```json
{
  "success": true,
  "data": [ /* Tool objects */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "totalPages": 1
  }
}
```

---

## Get Tool

```
GET /api/v1/tools/:id
```

**Permission:** `voiceai.tools.view`

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Tool object */ }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 404 | `NOT_FOUND` | Tool not found |

---

## Update Tool

```
PUT /api/v1/tools/:id
```

**Permission:** `voiceai.tools.edit`

All fields are optional. Only provided fields are updated.

### Request Body

```json
{
  "name": "Updated Tool Name",
  "description": "Updated description",
  "endpoint": "https://api.example.com/v2/orders",
  "method": "GET",
  "headers": { "Accept": "application/json" },
  "bodyTemplate": null,
  "authType": "BEARER",
  "authConfig": { "token": "new-token" },
  "timeout": 15,
  "retries": 2
}
```

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Updated Tool object */ }
}
```

---

## Delete Tool

```
DELETE /api/v1/tools/:id
```

**Permission:** `voiceai.tools.delete`

### Response `200 OK`

```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

## Auth Types

### `NONE`
No authentication. No `authConfig` needed.

### `API_KEY`
Adds an API key as a request header.

```json
{
  "authType": "API_KEY",
  "authConfig": {
    "header": "X-API-Key",
    "value": "your-api-key"
  }
}
```

### `BEARER`
Adds a Bearer token to the `Authorization` header.

```json
{
  "authType": "BEARER",
  "authConfig": {
    "token": "your-bearer-token"
  }
}
```

### `OAUTH`
OAuth2 client credentials flow (Phase 2).

```json
{
  "authType": "OAUTH",
  "authConfig": {
    "tokenUrl": "https://auth.example.com/token",
    "clientId": "client-id",
    "clientSecret": "client-secret",
    "scope": "read:orders"
  }
}
```

---

## Attaching Tools to Agents

After creating a tool, attach it to an agent by including its UUID in the agent's `tools` array:

```bash
# When creating an agent
curl -X POST /api/v1/agents \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Support Bot",
    "provider": "OMNIDIM",
    "systemPrompt": "...",
    "tools": ["tool-uuid-1", "tool-uuid-2"]
  }'

# Or when updating an existing agent
curl -X PUT /api/v1/agents/<agent-id> \
  -H "Authorization: Bearer <token>" \
  -d '{ "tools": ["tool-uuid-1", "tool-uuid-2"] }'
```

The agent will automatically call tools when appropriate during conversations.
