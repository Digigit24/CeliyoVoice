# CeliyoVoice API Documentation

> **Multi-tenant Voice AI Orchestrator SaaS Platform**

## Overview

CeliyoVoice provides a RESTful API to manage AI voice agents, outbound/inbound calls, HTTP tools, provider credentials, post-call webhooks, and analytics — all with full multi-tenant isolation.

---

## Base URL

```
http://<your-server-host>:4000
```

All authenticated API endpoints are prefixed with:

```
/api/v1
```

**Example:** `http://localhost:4000/api/v1/agents`

---

## Quick Start

### 1. Authenticate

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'
```

Copy the `tokens.access` JWT from the response.

### 2. Set Up Provider Credentials

```bash
curl -X POST http://localhost:4000/api/v1/providers/credentials \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"provider": "OMNIDIM", "apiKey": "your-omnidim-key", "isDefault": true}'
```

### 3. Create an Agent

```bash
curl -X POST http://localhost:4000/api/v1/agents \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Bot",
    "provider": "OMNIDIM",
    "systemPrompt": "You are a helpful support assistant.",
    "voiceLanguage": "en-IN"
  }'
```

### 4. Start a Call

```bash
curl -X POST http://localhost:4000/api/v1/calls/start \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "<agent-uuid>",
    "phone": "+14155552671"
  }'
```

---

## Documentation Index

| File | Contents |
|------|----------|
| [authentication.md](./authentication.md) | JWT auth, login, permissions, headers |
| [agents.md](./agents.md) | Create, list, update, delete, sync, import agents |
| [calls.md](./calls.md) | Start, end, list, filter calls |
| [tools.md](./tools.md) | HTTP tool CRUD (used by agents during calls) |
| [providers.md](./providers.md) | Provider credential management (Omnidim, Bolna) |
| [post-call-actions.md](./post-call-actions.md) | Per-agent post-call webhooks |
| [webhooks.md](./webhooks.md) | Incoming webhooks from voice providers |
| [dashboard.md](./dashboard.md) | Tenant-level stats and analytics |
| [errors.md](./errors.md) | Error codes, formats, HTTP status codes |

---

## API Overview Table

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Public health check |
| `GET` | `/api/v1/health` | Authenticated health check |
| `GET` | `/api/v1/health/me` | Current user identity |
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/auth/me` | Current authenticated user |
| `POST` | `/api/v1/agents` | Create agent |
| `GET` | `/api/v1/agents` | List agents |
| `GET` | `/api/v1/agents/:id` | Get agent |
| `PUT` | `/api/v1/agents/:id` | Update agent |
| `DELETE` | `/api/v1/agents/:id` | Delete agent |
| `POST` | `/api/v1/agents/:id/sync` | Sync agent with provider |
| `POST` | `/api/v1/agents/import/omnidim` | Import one agent from Omnidim |
| `POST` | `/api/v1/agents/import/omnidim/all` | Import all agents from Omnidim |
| `GET` | `/api/v1/agents/remote/omnidim` | List remote Omnidim agents |
| `POST` | `/api/v1/calls/start` | Start a call |
| `POST` | `/api/v1/calls/:id/end` | End a call |
| `GET` | `/api/v1/calls` | List calls |
| `GET` | `/api/v1/calls/:id` | Get call details |
| `GET` | `/api/v1/calls/logs/remote` | Fetch call logs from Omnidim |
| `POST` | `/api/v1/tools` | Create tool |
| `GET` | `/api/v1/tools` | List tools |
| `GET` | `/api/v1/tools/:id` | Get tool |
| `PUT` | `/api/v1/tools/:id` | Update tool |
| `DELETE` | `/api/v1/tools/:id` | Delete tool |
| `GET` | `/api/v1/providers/available` | List available providers |
| `POST` | `/api/v1/providers/credentials` | Create/upsert provider credential |
| `GET` | `/api/v1/providers/credentials` | List provider credentials |
| `PUT` | `/api/v1/providers/credentials/:id` | Update provider credential |
| `DELETE` | `/api/v1/providers/credentials/:id` | Delete provider credential |
| `GET` | `/api/v1/agents/:agentId/post-call-actions` | List post-call actions |
| `POST` | `/api/v1/agents/:agentId/post-call-actions` | Create post-call action |
| `PUT` | `/api/v1/agents/:agentId/post-call-actions/:actionId` | Update post-call action |
| `DELETE` | `/api/v1/agents/:agentId/post-call-actions/:actionId` | Delete post-call action |
| `GET` | `/api/v1/agents/:agentId/post-call-actions/webhook-url` | Get provider webhook URL |
| `GET` | `/api/v1/agents/:agentId/post-call-actions/executions` | List action execution logs |
| `GET` | `/api/v1/dashboard/stats` | Tenant dashboard stats |
| `POST` | `/webhooks/omnidim` | Omnidim webhook receiver |
| `POST` | `/webhooks/bolna` | Bolna webhook receiver |

---

## Common Conventions

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes (most routes) | `Bearer <jwt_token>` |
| `Content-Type` | Yes (POST/PUT) | `application/json` |
| `x-tenant-id` | Super admin only | Override tenant context |

### Pagination

All list endpoints accept:

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `page` | `1` | — | Page number |
| `limit` | `20` | `100` | Items per page |

Response always includes:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Success Response Envelope

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response Envelope

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### Rate Limits

| Role | Limit |
|------|-------|
| Regular tenant | 100 requests / 60 seconds |
| Super admin | 500 requests / 60 seconds |

Exceeded limit returns **HTTP 429** with code `RATE_LIMIT_EXCEEDED`.
