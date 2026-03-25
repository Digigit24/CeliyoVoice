-- AlterTable: add isToolkit flag to tool_tags
ALTER TABLE "tool_tags" ADD COLUMN "is_toolkit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: agent_toolkits (agent subscribes to a whole tag/toolkit)
CREATE TABLE "agent_toolkits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_toolkits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_toolkits_tenantId_agentId_idx" ON "agent_toolkits"("tenantId", "agentId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "agent_toolkits_agentId_tagId_key" ON "agent_toolkits"("agentId", "tagId");

-- AddForeignKey
ALTER TABLE "agent_toolkits" ADD CONSTRAINT "agent_toolkits_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_toolkits" ADD CONSTRAINT "agent_toolkits_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tool_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
