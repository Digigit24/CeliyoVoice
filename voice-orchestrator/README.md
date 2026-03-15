# Voice AI Orchestrator

Multi-tenant SaaS backend for orchestrating AI voice calls across providers (Omnidim, Bolna).

## Architecture

```
voice-orchestrator/
├── server/          # Node.js + TypeScript + Express + Prisma backend
└── client/          # Frontend (Prompt 3)
```

### Authentication

This service does **not** manage users. All authentication is handled by the SuperAdmin service at `https://admin.celiyo.com`. It issues HS256 JWT tokens signed with a shared `JWT_SECRET_KEY`. This service validates tokens locally — no round-trip to SuperAdmin per request.

### Multi-tenancy

Every database record carries `tenant_id` and `owner_user_id` (both from JWT). Tenant isolation is enforced at:

1. **Middleware** (`jwtMiddleware.ts`) — extracts `tenantId` from JWT
2. **Helpers** (`tenantHelpers.ts`) — `injectTenantId()`, `assertSameTenant()`, `getTenantScopeFilter()`
3. **DB routing** (`tenantDbRouter.ts`) — routes queries to tenant's dedicated Neon DB if configured

### Permissions

Format: `voiceai.{resource}.{action}` — e.g. `voiceai.agents.view`

Values: `false` (deny), `true` (allow), `"all"`, `"own"`, `"team"`

Super admins bypass all permission checks.

## Quick Start

```bash
cd server
cp .env.example .env
# Edit .env with real values

npm install
npm run db:generate
npm run db:migrate:dev
npm run db:seed
npm run dev
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Service health check |
| GET | `/api/v1/health` | JWT | Authenticated health + tenant info |
| GET | `/api/v1/health/me` | JWT | Current user identity from JWT |

## Environment Variables

See `.env.example` for full documentation.

Key variables:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET_KEY` — Shared HS256 secret with SuperAdmin service
- `ENCRYPTION_KEY` — 64 hex chars (32 bytes) for AES-256-GCM encryption
- `REDIS_URL` — Redis connection for rate limiting and caching

## Database Models

- **Tenant** — Synced from SuperAdmin, manages dedicated DB routing
- **ProviderCredential** — Tenant-specific voice provider API keys (encrypted)
- **AuditLog** — Immutable audit trail (userId from JWT, not FK)
