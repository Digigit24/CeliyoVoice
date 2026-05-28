-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_mcp_session_validation_models
-- Adds three new tables:
--   1. mcp_sessions          — tracks live SSE connections for monitoring
--   2. mcp_server_instances  — outbound MCP server registry per tenant
--   3. tool_validation_policies — per-tool input guardrails
-- Also adds the validation policy FK column to the tools table (toolId is
-- already present; only the relation side needs the column on the policy table).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. mcp_sessions
CREATE TABLE "mcp_sessions" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "key_id"        TEXT NOT NULL,
    "client_ip"     TEXT,
    "user_agent"    TEXT,
    "connected_at"  TIMESTAMP(3) NOT NULL,
    "last_ping_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_sessions_tenant_id_idx" ON "mcp_sessions"("tenant_id");

-- 2. mcp_server_instances
CREATE TABLE "mcp_server_instances" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenant_id"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "url"         TEXT NOT NULL,
    "auth_type"   TEXT NOT NULL DEFAULT 'NONE',
    "auth_config" JSONB NOT NULL DEFAULT '{}',
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_instances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_server_instances_tenant_id_idx" ON "mcp_server_instances"("tenant_id");

-- 3. tool_validation_policies
CREATE TABLE "tool_validation_policies" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenant_id"        TEXT NOT NULL,
    "tool_id"          TEXT NOT NULL,
    "blocked_patterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "max_characters"   INTEGER NOT NULL DEFAULT 500,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_validation_policies_pkey" PRIMARY KEY ("id")
);

-- Unique: one policy per tool
ALTER TABLE "tool_validation_policies"
    ADD CONSTRAINT "tool_validation_policies_tool_id_key" UNIQUE ("tool_id");

-- FK: policy → tool
ALTER TABLE "tool_validation_policies"
    ADD CONSTRAINT "tool_validation_policies_tool_id_fkey"
    FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE CASCADE;

CREATE INDEX "tool_validation_policies_tenant_id_idx" ON "tool_validation_policies"("tenant_id");
