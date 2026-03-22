-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('VOICE', 'CHAT', 'HYBRID');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('CHAT_API', 'CHAT_WIDGET', 'VOICE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL_CALL', 'TOOL_RESULT');

-- CreateEnum
CREATE TYPE "ToolSource" AS ENUM ('MANUAL', 'SWAGGER_IMPORT', 'MCP_IMPORT');

-- CreateEnum
CREATE TYPE "LLMProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'GROQ', 'CUSTOM');

-- AlterTable: Add new fields to agents
ALTER TABLE "agents" ADD COLUMN "agent_type" "AgentType" NOT NULL DEFAULT 'VOICE';
ALTER TABLE "agents" ADD COLUMN "type_config" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "agents" ADD COLUMN "llm_provider" TEXT;
ALTER TABLE "agents" ADD COLUMN "llm_model" TEXT;

-- AlterTable: Add new fields to tools
ALTER TABLE "tools" ADD COLUMN "input_schema" JSONB;
ALTER TABLE "tools" ADD COLUMN "output_schema" JSONB;
ALTER TABLE "tools" ADD COLUMN "category" TEXT;
ALTER TABLE "tools" ADD COLUMN "source" "ToolSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable: conversations
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT,
    "channel" "ConversationChannel" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "last_message_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: messages
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_call_id" TEXT,
    "tool_name" TEXT,
    "token_count" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agent_tools
CREATE TABLE "agent_tools" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "when_to_use" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable: llm_credentials
CREATE TABLE "llm_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "LLMProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiUrl" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable: llm_usage
CREATE TABLE "llm_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cost" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: agents
CREATE INDEX "agents_tenantId_agent_type_idx" ON "agents"("tenantId", "agent_type");

-- CreateIndex: conversations
CREATE INDEX "conversations_tenantId_agentId_idx" ON "conversations"("tenantId", "agentId");
CREATE INDEX "conversations_tenantId_status_idx" ON "conversations"("tenantId", "status");

-- CreateIndex: messages
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex: agent_tools
CREATE UNIQUE INDEX "agent_tools_agentId_toolId_key" ON "agent_tools"("agentId", "toolId");
CREATE INDEX "agent_tools_tenantId_agentId_idx" ON "agent_tools"("tenantId", "agentId");

-- CreateIndex: llm_credentials
CREATE UNIQUE INDEX "llm_credentials_tenantId_provider_key" ON "llm_credentials"("tenantId", "provider");
CREATE INDEX "llm_credentials_tenantId_idx" ON "llm_credentials"("tenantId");

-- CreateIndex: llm_usage
CREATE INDEX "llm_usage_tenantId_createdAt_idx" ON "llm_usage"("tenantId", "createdAt");
CREATE INDEX "llm_usage_tenantId_agentId_idx" ON "llm_usage"("tenantId", "agentId");

-- AddForeignKey: conversations -> agents
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: messages -> conversations (cascade delete)
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: agent_tools -> agents (cascade delete)
ALTER TABLE "agent_tools" ADD CONSTRAINT "agent_tools_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: agent_tools -> tools (cascade delete)
ALTER TABLE "agent_tools" ADD CONSTRAINT "agent_tools_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
