Phase Overview
Phase 1 — Backend Core + Minimal UI: All backend APIs, database, provider adapters, webhook handling, tool runtime, and a single dashboard screen showing agents/calls.
Phase 2 — Workflow Engine, Knowledgebase, Dashboard Expansion: Workflow builder, knowledgebase management, call analytics, provider management UI, and the Bolna adapter.
Phase 3 — Polish & Scale: SDK generation, auto-routing, real-time call monitoring, settings/billing UI, observability, and production hardening.

Phase 1 Prompt
Here's your first prompt for Claude Code:

Build the complete backend + minimal frontend for a Voice AI Orchestrator platform. This is a multi-tenant SaaS that sits between SaaS applications and voice providers (like Omnidim, Bolna). It orchestrates voice agents, routes calls to providers, handles webhooks, and executes tools on behalf of agents.
Tech stack:

Backend: Node.js with TypeScript, Express, Prisma ORM, PostgreSQL, Redis (BullMQ for queues)
Frontend: React with Vite, TypeScript, shadcn/ui, TailwindCSS, React Router, TanStack Query
Monorepo structure with separate /server and /client folders

Folder structure for /server:
server/
├── src/
│   ├── core/
│   │   ├── server.ts          # Express app setup
│   │   ├── config.ts          # App config loader
│   │   └── env.ts             # Env validation (zod)
│   ├── api/
│   │   ├── routes/
│   │   │   ├── agent.routes.ts
│   │   │   ├── call.routes.ts
│   │   │   ├── tool.routes.ts
│   │   │   ├── provider.routes.ts
│   │   │   └── webhook.routes.ts
│   │   ├── controllers/
│   │   │   ├── agent.controller.ts
│   │   │   ├── call.controller.ts
│   │   │   ├── tool.controller.ts
│   │   │   └── provider.controller.ts
│   │   └── middleware/
│   │       ├── auth.middleware.ts         # API key auth + tenant resolution
│   │       ├── rateLimiter.middleware.ts
│   │       └── errorHandler.middleware.ts
│   ├── providers/
│   │   ├── interfaces/
│   │   │   └── voiceProvider.interface.ts  # createAgent, startCall, endCall, getCallStatus, handleWebhook
│   │   ├── omnidim/
│   │   │   ├── omnidim.adapter.ts
│   │   │   ├── omnidim.mapper.ts          # Maps universal schema → Omnidim payload
│   │   │   └── omnidim.types.ts
│   │   ├── bolna/
│   │   │   ├── bolna.adapter.ts           # Stub implementation for Phase 2
│   │   │   ├── bolna.mapper.ts
│   │   │   └── bolna.types.ts
│   │   └── providerRouter.ts             # Routes to correct adapter based on agent.provider
│   ├── agents/
│   │   ├── agent.service.ts
│   │   ├── agent.repository.ts
│   │   └── agent.validator.ts            # Zod schemas
│   ├── calls/
│   │   ├── call.service.ts
│   │   ├── call.repository.ts
│   │   └── call.processor.ts             # Handles call lifecycle
│   ├── tools/
│   │   ├── tool.registry.ts              # Stores tool definitions per tenant
│   │   ├── tool.executor.ts              # Makes HTTP calls to tool endpoints
│   │   └── tool.service.ts
│   ├── events/
│   │   ├── eventBus.ts                   # Redis-based pub/sub
│   │   ├── eventTypes.ts                 # CALL_STARTED, CALL_ENDED, TRANSCRIPT_RECEIVED, etc.
│   │   └── handlers/
│   │       ├── callEvent.handler.ts
│   │       └── toolEvent.handler.ts
│   ├── webhooks/
│   │   ├── webhook.service.ts
│   │   ├── omnidim.webhook.ts            # Parse + normalize Omnidim webhooks
│   │   └── bolna.webhook.ts              # Stub
│   ├── tenants/
│   │   ├── tenant.service.ts
│   │   └── tenant.repository.ts
│   ├── db/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── client.ts                     # Prisma client singleton
│   ├── queue/
│   │   ├── redis.ts                      # Redis/BullMQ connection
│   │   └── workers/
│   │       ├── callWorker.ts
│   │       └── toolWorker.ts
│   └── utils/
│       ├── logger.ts                     # Pino or Winston
│       ├── apiResponse.ts                # Standardized response helpers
│       └── crypto.ts                     # API key generation/hashing
├── package.json
├── tsconfig.json
└── .env.example
Folder structure for /client:
client/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/
│   │   └── Dashboard.tsx                 # Single page for Phase 1
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── agents/
│   │   │   ├── AgentList.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   └── CreateAgentDialog.tsx
│   │   └── calls/
│   │       ├── CallList.tsx
│   │       └── CallStatusBadge.tsx
│   ├── lib/
│   │   ├── api.ts                        # Axios/fetch wrapper
│   │   └── utils.ts
│   └── hooks/
│       ├── useAgents.ts
│       └── useCalls.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
Prisma schema — create these models:

Tenant (id, name, apiKey, apiKeyHash, plan, databaseUrl nullable, createdAt, updatedAt)
User (id, tenantId, email, name, role, createdAt)
Agent (id, tenantId, name, provider enum [OMNIDIM, BOLNA], voiceLanguage, voiceModel, systemPrompt, knowledgebaseId nullable, tools json, workflowId nullable, isActive, createdAt, updatedAt)
Call (id, tenantId, agentId, phone, provider, providerCallId, status enum [QUEUED, RINGING, IN_PROGRESS, COMPLETED, FAILED], duration nullable, transcript nullable, metadata json, createdAt, updatedAt)
Tool (id, tenantId, name, description, endpoint, method enum [GET, POST, PUT, DELETE], headers json, authType enum [NONE, API_KEY, BEARER, OAUTH], authConfig json, isActive, createdAt)
Provider (id, tenantId, type enum [OMNIDIM, BOLNA], config json encrypted, isDefault, isActive, createdAt)

All tables include tenantId for multi-tenant isolation. Add proper indexes on tenantId + commonly queried fields.
API Endpoints to implement (all prefixed /api/v1):
Agents:

POST /agents — Create agent (validate with zod, save to DB, call provider adapter's createAgent)
GET /agents — List agents for tenant (paginated)
GET /agents/:id — Get single agent
PUT /agents/:id — Update agent
DELETE /agents/:id — Soft delete agent

Calls:

POST /calls/start — Start a call (resolve agent → route to provider → create call record → return call id)
POST /calls/:id/end — End a call
GET /calls — List calls for tenant (paginated, filterable by status, agent, date range)
GET /calls/:id — Get call details with transcript

Tools:

POST /tools — Register a tool
GET /tools — List tools for tenant
DELETE /tools/:id — Remove tool

Providers:

POST /providers — Register provider credentials for tenant
GET /providers — List configured providers

Webhooks (no auth middleware, use signature verification instead):

POST /webhooks/omnidim — Receive Omnidim events, normalize to internal events, publish to event bus
POST /webhooks/bolna — Stub

Implementation requirements:

Auth middleware: Extract API key from x-api-key header → hash it → look up tenant → attach req.tenantId to all downstream operations. Return 401 if invalid.
Provider Router: Given an agent's provider field, instantiate the correct adapter. Each adapter implements the VoiceProvider interface. Omnidim adapter should make real HTTP calls (use axios) to Omnidim's API. Bolna adapter is a stub that returns mock responses.
Event Bus: Use Redis pub/sub. When a webhook arrives, the adapter normalizes it into an internal event (CALL_STARTED, CALL_ENDED, TRANSCRIPT_RECEIVED, TOOL_REQUESTED) and publishes it. Handlers subscribe and update call records, trigger tool execution, etc.
Tool Executor: When a TOOL_REQUESTED event fires, look up the tool definition, make the HTTP request to the tool's endpoint with proper auth, and store the result.
Queue Workers: Use BullMQ. Call start requests go through a queue for reliability. Tool executions go through a separate queue.
Rate Limiter: Use express-rate-limit with Redis store. 100 req/min per tenant default.
Error handling: Global error handler middleware. All errors follow format { success: false, error: { code, message, details } }.
Logger: Structured JSON logging with request ID correlation.

Frontend (single Dashboard page):
Build one unified dashboard page using shadcn/ui components that shows:

Left sidebar with navigation items (Agents, Calls, Tools — only Agents and Calls functional in Phase 1)
Top header with tenant name and API key display (masked, click to copy)
Main content area split into two sections:

Top: Agent list as cards (name, provider badge, status, last call time) with a "Create Agent" button that opens a shadcn Dialog form
Bottom: Recent calls table (phone, agent name, provider, status badge, duration, timestamp) with status filters



Use TanStack Query for data fetching. Use shadcn Card, Table, Dialog, Badge, Button, Input, Select components. Dark mode support via shadcn theming.
Seed data:
Create a seed script that generates:

1 test tenant with API key
3 sample agents (different providers)
10 sample calls with mixed statuses
2 sample tools

Environment variables needed:
DATABASE_URL, REDIS_URL, PORT, OMNIDIM_API_URL, OMNIDIM_API_KEY, BOLNA_API_URL, BOLNA_API_KEY, API_KEY_SALT
Build the complete working application. Every file should have real implementation, no TODOs or placeholders (except Bolna adapter which returns mocks). Make sure the server starts, database migrates, seed runs, and the frontend renders with data from the API.
