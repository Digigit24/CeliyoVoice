# Errors

All API errors follow a consistent JSON format. HTTP status codes indicate the category of error; the `code` field gives the specific reason.

---

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of what went wrong.",
    "details": {}
  }
}
```

| Field | Description |
|-------|-------------|
| `success` | Always `false` for errors |
| `error.code` | Machine-readable error identifier |
| `error.message` | Human-readable message (safe to show to users) |
| `error.details` | Optional extra context (e.g. validation field errors) |

---

## HTTP Status Codes & Error Codes

### 400 Bad Request

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `VALIDATION_ERROR` | Request body or query params failed validation | Missing required field, invalid format, out-of-range value |
| `CREDENTIALS_MISSING` | Provider credentials not configured | Trying to sync/import before saving API key via `/providers/credentials` |

**Validation error example:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "phone": "Must be in E.164 format (e.g. +14155552671)",
      "agentId": "Required"
    }
  }
}
```

---

### 401 Unauthorized

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `UNAUTHORIZED` | Missing, expired, or invalid JWT | Token not sent, token expired, wrong secret |
| `PROVIDER_AUTH_ERROR` | Voice provider rejected your API key | Invalid or expired Omnidim/Bolna API key |

**Example:**

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token is expired or invalid."
  }
}
```

**Fix:** Re-authenticate via `POST /api/v1/auth/login` to get a fresh token.

---

### 403 Forbidden

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `FORBIDDEN` | Valid JWT but insufficient permissions | User doesn't have the required `voiceai.*` permission |
| `MODULE_NOT_ENABLED` | The `voiceai` module is not enabled for this tenant | Tenant account doesn't have voice AI module activated |

**Example:**

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You don't have permission to perform this action."
  }
}
```

---

### 404 Not Found

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `NOT_FOUND` | Resource doesn't exist or belongs to a different tenant | Wrong UUID, deleted resource, cross-tenant access |

**Example:**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent not found."
  }
}
```

---

### 429 Too Many Requests

| Code | Meaning |
|------|---------|
| `RATE_LIMIT_EXCEEDED` | You've exceeded the request rate limit |

**Rate limits:**

| Role | Limit |
|------|-------|
| Regular tenant | 100 requests / 60 seconds |
| Super admin | 500 requests / 60 seconds |

**Example:**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please slow down."
  }
}
```

**Fix:** Wait for the rate limit window to reset (60 seconds) and reduce request frequency.

---

### 500 Internal Server Error

| Code | Meaning |
|------|---------|
| `INTERNAL_ERROR` | Unexpected server error |

In production, no internal details are exposed. Check server logs for the root cause.

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred."
  }
}
```

---

### 502 Bad Gateway

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `BAD_GATEWAY` | External service (SuperAdmin) is unavailable | SuperAdmin Django service is down |
| `PROVIDER_ERROR` | Voice provider API failed | Omnidim or Bolna service is down or returned an error |
| `PROXY_ERROR` | Dev proxy endpoint failed | Provider unreachable via dev proxy |

**Example:**

```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "Omnidim service returned an error.",
    "details": {
      "providerStatus": 503,
      "providerMessage": "Service Unavailable"
    }
  }
}
```

---

### 503 Service Unavailable

Returned only by `GET /api/v1/health` when database or Redis checks fail.

```json
{
  "success": true,
  "data": {
    "status": "degraded",
    "checks": {
      "database": "error",
      "redis": "ok"
    }
  }
}
```

---

## Error Handling Tips

### Always check `success` first

```javascript
const res = await fetch('/api/v1/calls', { headers: { Authorization: `Bearer ${token}` } });
const body = await res.json();

if (!body.success) {
  console.error(`[${body.error.code}] ${body.error.message}`);
  // handle specific codes
  if (body.error.code === 'UNAUTHORIZED') {
    // re-authenticate
  }
} else {
  // use body.data
}
```

### Handle rate limits gracefully

```python
import time, requests

def api_call_with_retry(url, headers, max_retries=3):
    for attempt in range(max_retries):
        response = requests.get(url, headers=headers)
        if response.status_code == 429:
            wait = 2 ** attempt  # exponential backoff: 1s, 2s, 4s
            time.sleep(wait)
            continue
        return response
    raise Exception("Rate limit exceeded after retries")
```

### Validation errors

When you get `VALIDATION_ERROR`, inspect `error.details` for field-level messages:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "phone": "Invalid E.164 format",
      "maxConcurrentCalls": "Must be between 1 and 20"
    }
  }
}
```
