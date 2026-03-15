-- CreateEnum
CREATE TYPE "VoiceProvider" AS ENUM ('OMNIDIM', 'BOLNA');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "ToolAuthType" AS ENUM ('NONE', 'API_KEY', 'BEARER', 'OAUTH');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallEventType" AS ENUM ('CALL_STARTED', 'CALL_RINGING', 'CALL_CONNECTED', 'CALL_ENDED', 'TRANSCRIPT_UPDATE', 'TRANSCRIPT_FINAL', 'TOOL_REQUESTED', 'TOOL_COMPLETED', 'TOOL_FAILED', 'AGENT_ACTION', 'ERROR');

-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "VoiceProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiUrl" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" TEXT NOT NULL,
    "provider" "VoiceProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultConfig" JSONB NOT NULL DEFAULT '{}',
    "webhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "VoiceProvider" NOT NULL,
    "providerAgentId" TEXT,
    "voiceLanguage" TEXT NOT NULL DEFAULT 'en-IN',
    "voiceModel" TEXT NOT NULL DEFAULT 'female',
    "systemPrompt" TEXT NOT NULL,
    "knowledgebaseId" TEXT,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "workflowId" TEXT,
    "maxConcurrentCalls" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "provider_config" JSONB,
    "welcome_message" TEXT,
    "call_type" TEXT DEFAULT 'Incoming',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL DEFAULT 'OUTBOUND',
    "provider" "VoiceProvider" NOT NULL,
    "providerCallId" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
    "duration" INTEGER,
    "transcript" TEXT,
    "summary" TEXT,
    "recordingUrl" TEXT,
    "toolsUsed" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" "HttpMethod" NOT NULL DEFAULT 'POST',
    "headers" JSONB NOT NULL DEFAULT '{}',
    "bodyTemplate" JSONB,
    "authType" "ToolAuthType" NOT NULL DEFAULT 'NONE',
    "authConfig" JSONB NOT NULL DEFAULT '{}',
    "timeout" INTEGER NOT NULL DEFAULT 30,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" "VoiceProvider" NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerCallId" TEXT,
    "callId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "processedPayload" JSONB,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "eventType" "CallEventType" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_credentials_tenantId_idx" ON "provider_credentials"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credentials_tenantId_provider_key" ON "provider_credentials"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_provider_key" ON "provider_configs"("provider");

-- CreateIndex
CREATE INDEX "agents_tenantId_idx" ON "agents"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_tenantId_providerAgentId_key" ON "agents"("tenantId", "providerAgentId");

-- CreateIndex
CREATE INDEX "calls_tenantId_status_idx" ON "calls"("tenantId", "status");

-- CreateIndex
CREATE INDEX "calls_tenantId_agentId_idx" ON "calls"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "tools_tenantId_idx" ON "tools"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_events_providerCallId_idx" ON "webhook_events"("providerCallId");

-- CreateIndex
CREATE INDEX "webhook_events_tenantId_createdAt_idx" ON "webhook_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "call_events_callId_idx" ON "call_events"("callId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_userId_idx" ON "audit_logs"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_resource_idx" ON "audit_logs"("tenantId", "resource");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

