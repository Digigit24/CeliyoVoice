-- Add provider_config, welcome_message, and call_type columns to agents table
-- These columns support full Omnidim agent config storage and import metadata.

ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "provider_config" JSONB,
  ADD COLUMN IF NOT EXISTS "welcome_message" TEXT,
  ADD COLUMN IF NOT EXISTS "call_type" TEXT DEFAULT 'Incoming';
