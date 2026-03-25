-- DropForeignKey
ALTER TABLE "post_call_actions" DROP CONSTRAINT "post_call_actions_agentId_fkey";

-- DropForeignKey
ALTER TABLE "post_call_executions" DROP CONSTRAINT "post_call_executions_actionId_fkey";

-- DropForeignKey
ALTER TABLE "post_call_executions" DROP CONSTRAINT "post_call_executions_callId_fkey";

-- AlterTable
ALTER TABLE "post_call_actions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "post_call_executions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "executedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tools" ADD COLUMN     "cache_ttl_seconds" INTEGER,
ADD COLUMN     "rate_limit_per_minute" INTEGER;

-- CreateTable
CREATE TABLE "tool_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "agentId" TEXT,
    "conversationId" TEXT,
    "mcpKeyId" TEXT,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "requestUrl" TEXT,
    "requestMethod" TEXT,
    "requestHeaders" JSONB,
    "requestBody" JSONB,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "responseHeaders" JSONB,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "credentialId" TEXT,
    "credentialName" TEXT,
    "authType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_executions_tenantId_toolId_createdAt_idx" ON "tool_executions"("tenantId", "toolId", "createdAt");

-- CreateIndex
CREATE INDEX "tool_executions_tenantId_createdAt_idx" ON "tool_executions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tool_executions_tenantId_agentId_createdAt_idx" ON "tool_executions"("tenantId", "agentId", "createdAt");

-- CreateIndex
CREATE INDEX "tool_executions_tenantId_source_createdAt_idx" ON "tool_executions"("tenantId", "source", "createdAt");

-- AddForeignKey
ALTER TABLE "post_call_actions" ADD CONSTRAINT "post_call_actions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_call_executions" ADD CONSTRAINT "post_call_executions_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "post_call_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_call_executions" ADD CONSTRAINT "post_call_executions_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
