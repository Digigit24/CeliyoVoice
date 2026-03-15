# Providers

Providers are the underlying voice AI services (Omnidim, Bolna) that power your agents and calls. Each tenant stores their own encrypted API credentials per provider.

---

## Supported Providers

| Value | Name | Status |
|-------|------|--------|
| `OMNIDIM` | Omnidim | Fully supported |
| `BOLNA` | Bolna | Phase 2 (stub) |

---

## Provider Credential Object

```json
{
  "id": "uuid",
  "provider": "OMNIDIM",
  "apiKey": "****key",
  "apiUrl": "https://backend.omnidim.io/api/v1",
  "config": {},
  "isActive": true,
  "isDefault": true,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

> `apiKey` is stored encrypted (AES-256-GCM) and returned with only the last 4 characters visible (e.g. `"****abcd"`).

---

## List Available Providers

```
GET /api/v1/providers/available
```

**Permission:** JWT required (no specific permission needed)

Returns global provider configuration (enabled providers and their default settings).

### Response `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "provider": "OMNIDIM",
      "displayName": "Omnidim",
      "isEnabled": true,
      "defaultConfig": {}
    },
    {
      "provider": "BOLNA",
      "displayName": "Bolna",
      "isEnabled": true,
      "defaultConfig": {}
    }
  ]
}
```

---

## Create / Upsert Provider Credential

```
POST /api/v1/providers/credentials
```

**Permission:** `voiceai.providers.create`

Creates a new credential or updates the existing one for the given provider. Each tenant can have **one credential per provider**.

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | `OMNIDIM` \| `BOLNA` | Yes | — | Provider type |
| `apiKey` | string | Yes | — | API key from provider (encrypted at rest) |
| `apiUrl` | string (URL) | No | Provider default | Override the provider API base URL |
| `config` | object | No | `{}` | Additional provider-specific configuration |
| `isDefault` | boolean | No | `false` | Set as default credential (clears other providers' default flag) |

```json
{
  "provider": "OMNIDIM",
  "apiKey": "sk-omnidim-your-actual-key",
  "isDefault": true
}
```

With custom URL:

```json
{
  "provider": "OMNIDIM",
  "apiKey": "sk-omnidim-your-actual-key",
  "apiUrl": "https://custom.omnidim.io/api/v1",
  "config": { "region": "us-east-1" },
  "isDefault": true
}
```

### Response `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "provider": "OMNIDIM",
    "apiKey": "****rkey",
    "apiUrl": "https://backend.omnidim.io/api/v1",
    "config": {},
    "isActive": true,
    "isDefault": true,
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

---

## List Provider Credentials

```
GET /api/v1/providers/credentials
```

**Permission:** `voiceai.providers.view`

Returns all credentials for the current tenant (API keys are masked).

### Response `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "provider": "OMNIDIM",
      "apiKey": "****rkey",
      "apiUrl": "https://backend.omnidim.io/api/v1",
      "config": {},
      "isActive": true,
      "isDefault": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 1, "totalPages": 1 }
}
```

---

## Update Provider Credential

```
PUT /api/v1/providers/credentials/:id
```

**Permission:** `voiceai.providers.edit`

### Path Params

| Param | Description |
|-------|-------------|
| `id` | Credential UUID |

### Request Body (all fields optional)

```json
{
  "apiKey": "new-api-key",
  "apiUrl": "https://new-api-url.com",
  "config": { "key": "value" },
  "isDefault": true,
  "isActive": false
}
```

### Response `200 OK`

```json
{
  "success": true,
  "data": { /* Updated Credential object (masked) */ }
}
```

---

## Delete Provider Credential

```
DELETE /api/v1/providers/credentials/:id
```

**Permission:** `voiceai.providers.delete`

### Response `200 OK`

```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

## Default Credentials

When `isDefault: true` is set on a credential:
- All other tenant credentials (across all providers) lose their default flag
- The default credential is used for operations when no specific provider override is given

---

## Security Notes

- **API keys** are encrypted at rest using **AES-256-GCM** with the server's `ENCRYPTION_KEY`
- Keys are **never returned in plaintext** — only the last 4 characters are shown
- To rotate a key, simply update the credential with the new `apiKey` value
