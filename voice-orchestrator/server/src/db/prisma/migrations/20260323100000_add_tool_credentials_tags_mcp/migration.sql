-- CreateTable: tool_credentials
CREATE TABLE "tool_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authType" "ToolAuthType" NOT NULL,
    "authConfig" JSONB NOT NULL DEFAULT '{}',
    "service" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tool_credentials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tool_credentials_tenantId_idx" ON "tool_credentials"("tenantId");

-- CreateTable: tool_tags
CREATE TABLE "tool_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tool_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tool_tags_tenantId_name_key" ON "tool_tags"("tenantId", "name");
CREATE INDEX "tool_tags_tenantId_idx" ON "tool_tags"("tenantId");

-- CreateTable: tool_tag_assignments
CREATE TABLE "tool_tag_assignments" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "tool_tag_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tool_tag_assignments_toolId_tagId_key" ON "tool_tag_assignments"("toolId", "tagId");
ALTER TABLE "tool_tag_assignments" ADD CONSTRAINT "tool_tag_assignments_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_tag_assignments" ADD CONSTRAINT "tool_tag_assignments_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tool_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: mcp_api_keys
CREATE TABLE "mcp_api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "agentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mcp_api_keys_tenantId_idx" ON "mcp_api_keys"("tenantId");
CREATE INDEX "mcp_api_keys_keyHash_idx" ON "mcp_api_keys"("keyHash");

-- AlterTable: Add credential_id to tools
ALTER TABLE "tools" ADD COLUMN "credential_id" TEXT;
ALTER TABLE "tools" ADD CONSTRAINT "tools_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "tool_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
