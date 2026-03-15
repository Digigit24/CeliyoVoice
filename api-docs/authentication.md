# Authentication

CeliyoVoice uses **JWT (HS256)** for authentication. Tokens are issued by the SuperAdmin service and verified by this API using a shared secret.

---

## Login

```
POST /api/v1/auth/login
```

**No auth required.**

### Request Body

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "tenant": "tenant-uuid",
      "tenant_name": "Acme Corp",
      "is_super_admin": false
    },
    "tokens": {
      "access": "<jwt_token>",
      "refresh": "<refresh_token>"
    },
    "tenant": {}
  }
}
```

### Errors

| Status | Code | Reason |
|--------|------|--------|
| 400 | `VALIDATION_ERROR` | Missing email or password |
| 502 | `BAD_GATEWAY` | SuperAdmin service unreachable |

---

## Using the Token

Include the access token in every authenticated request:

```
Authorization: Bearer <jwt_token>
```

**Example:**

```bash
curl http://localhost:4000/api/v1/agents \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9..."
```

---

## Get Current User

```
GET /api/v1/auth/me
```

Returns the decoded identity from the current JWT.

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "user@example.com",
    "tenantId": "tenant-uuid",
    "tenantSlug": "acme",
    "isSuperAdmin": false,
    "permissions": {
      "voiceai.agents": "full",
      "voiceai.calls": "view"
    },
    "enabledModules": ["voiceai"]
  }
}
```

---

## JWT Payload Structure

The token must contain the following claims (set by the SuperAdmin service):

| Claim | Type | Description |
|-------|------|-------------|
| `user_id` | UUID string | Unique user identifier |
| `email` | string | User email |
| `tenant_id` | UUID string | Tenant identifier |
| `tenant_slug` | string | Human-readable tenant slug |
| `is_super_admin` | boolean | Super admin flag |
| `permissions` | object | Map of `"resource.action"` → scope |
| `enabled_modules` | string[] | List of enabled modules, must include `"voiceai"` |

---

## Permissions

Every protected endpoint requires a specific permission. Super admins bypass all permission checks.

### Permission Format

```
voiceai.<resource>.<action>
```

### Permission Reference

| Permission | Required For |
|------------|-------------|
| `voiceai.agents.view` | List/get agents |
| `voiceai.agents.create` | Create agents, import from provider |
| `voiceai.agents.edit` | Update agents, sync, manage post-call actions |
| `voiceai.agents.delete` | Delete agents |
| `voiceai.calls.view` | List/get calls |
| `voiceai.calls.create` | Start calls |
| `voiceai.calls.edit` | End calls |
| `voiceai.calls.delete` | Delete call records |
| `voiceai.tools.view` | List/get tools |
| `voiceai.tools.create` | Create tools |
| `voiceai.tools.edit` | Update tools |
| `voiceai.tools.delete` | Delete tools |
| `voiceai.providers.view` | List provider credentials |
| `voiceai.providers.create` | Add provider credentials |
| `voiceai.providers.edit` | Update provider credentials |
| `voiceai.providers.delete` | Delete provider credentials |

---

## Public Endpoints (No Auth)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Basic server health |
| `POST /api/v1/auth/login` | Login |
| `POST /webhooks/omnidim` | Omnidim webhook receiver |
| `POST /webhooks/bolna` | Bolna webhook receiver |

---

## Super Admin Features

Super admins (where `is_super_admin: true` in JWT) can:

- Bypass all permission checks
- Override the tenant context using the `x-tenant-id` header to act as any tenant

```bash
curl http://localhost:4000/api/v1/agents \
  -H "Authorization: Bearer <super_admin_jwt>" \
  -H "x-tenant-id: <target-tenant-uuid>"
```

---

## Health Check (Authenticated)

```
GET /api/v1/health
```

Checks database and Redis connectivity.

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0",
    "tenant": {
      "id": "tenant-uuid",
      "slug": "acme",
      "isSuperAdmin": false
    },
    "checks": {
      "database": "ok",
      "redis": "ok"
    }
  }
}
```

Returns `503` if any check fails, with `"status": "degraded"`.

---

## Identity Check

```
GET /api/v1/health/me
```

Quick identity check — returns the user's resolved identity from token.

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "user@example.com",
    "tenantId": "tenant-uuid",
    "tenantSlug": "acme",
    "isSuperAdmin": false,
    "enabledModules": ["voiceai"],
    "fullName": "Jane Doe"
  }
}
```
