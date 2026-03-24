-- Fix: rename tool_ids → toolIds to match Prisma camelCase convention
-- (all other columns in mcp_api_keys use camelCase: agentId, keyHash, isActive, lastUsedAt)
ALTER TABLE "mcp_api_keys" RENAME COLUMN "tool_ids" TO "toolIds";
