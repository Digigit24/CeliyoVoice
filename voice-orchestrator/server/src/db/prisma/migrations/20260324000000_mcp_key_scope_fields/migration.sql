-- Migration: mcp_key_scope_fields
-- Evolves McpApiKey into a virtual MCP server concept with scope control

-- Add new columns
ALTER TABLE "mcp_api_keys"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "tool_ids" JSONB NOT NULL DEFAULT '[]';

-- Backfill: if agentId is already set, mark scope as AGENT
UPDATE "mcp_api_keys"
SET "scope" = 'AGENT'
WHERE "agentId" IS NOT NULL;
