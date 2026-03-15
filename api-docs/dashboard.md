# Dashboard

The dashboard endpoint provides a summary of your tenant's activity — agents, calls, and tools at a glance.

---

## Get Dashboard Stats

```
GET /api/v1/dashboard/stats
```

**Auth:** JWT required (no specific permission needed beyond valid tenant token)

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "agents": {
      "total": 12,
      "active": 9
    },
    "calls": {
      "total": 1847,
      "active": 3,
      "completed": 1800,
      "failed": 44
    },
    "tools": {
      "total": 6,
      "active": 5
    },
    "recentCalls": [
      {
        "id": "uuid",
        "phone": "+14155552671",
        "status": "COMPLETED",
        "direction": "OUTBOUND",
        "provider": "OMNIDIM",
        "duration": 142,
        "createdAt": "2024-01-15T10:00:00Z",
        "agent": {
          "name": "Support Bot"
        }
      }
    ]
  }
}
```

### Response Fields

| Field | Description |
|-------|-------------|
| `agents.total` | Total agents for this tenant |
| `agents.active` | Agents with `isActive: true` |
| `calls.total` | All calls ever created |
| `calls.active` | Calls currently in progress (QUEUED, RINGING, IN_PROGRESS) |
| `calls.completed` | Calls with status COMPLETED |
| `calls.failed` | Calls with status FAILED or CANCELLED |
| `tools.total` | Total tools |
| `tools.active` | Tools with `isActive: true` |
| `recentCalls` | Last 10 calls (most recent first) |

---

## Example

```bash
curl http://localhost:4000/api/v1/dashboard/stats \
  -H "Authorization: Bearer <your_jwt>"
```
