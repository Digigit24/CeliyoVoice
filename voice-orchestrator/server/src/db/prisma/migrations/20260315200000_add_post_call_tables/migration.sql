-- Add post-call fields to calls table
ALTER TABLE "calls"
  ADD COLUMN IF NOT EXISTS "sentiment"            TEXT,
  ADD COLUMN IF NOT EXISTS "extracted_variables"  JSONB,
  ADD COLUMN IF NOT EXISTS "cost"                 DECIMAL(10,6);

-- Enums
DO $$ BEGIN
  CREATE TYPE "PostCallActionType" AS ENUM ('WEBHOOK');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PostCallExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- PostCallAction
CREATE TABLE IF NOT EXISTS "post_call_actions" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId"    TEXT NOT NULL,
  "agentId"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "type"        "PostCallActionType" NOT NULL DEFAULT 'WEBHOOK',
  "config"      JSONB NOT NULL DEFAULT '{}',
  "isEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "post_call_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_call_actions_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "post_call_actions_tenantId_agentId_idx"
  ON "post_call_actions"("tenantId", "agentId");

-- PostCallExecution
CREATE TABLE IF NOT EXISTS "post_call_executions" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId"        TEXT NOT NULL,
  "actionId"        TEXT NOT NULL,
  "callId"          TEXT,
  "status"          "PostCallExecutionStatus" NOT NULL,
  "requestPayload"  JSONB,
  "responseStatus"  INTEGER,
  "responseBody"    TEXT,
  "error"           TEXT,
  "executedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "post_call_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_call_executions_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "post_call_actions"("id") ON DELETE CASCADE,
  CONSTRAINT "post_call_executions_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "post_call_executions_tenantId_actionId_idx"
  ON "post_call_executions"("tenantId", "actionId");

CREATE INDEX IF NOT EXISTS "post_call_executions_tenantId_callId_idx"
  ON "post_call_executions"("tenantId", "callId");
