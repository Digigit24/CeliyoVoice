-- CreateEnum
CREATE TYPE "ToolType" AS ENUM ('HTTP', 'FUNCTION', 'COMPOSITE');

-- AlterEnum: Add CELIYO_IMPORT to ToolSource
ALTER TYPE "ToolSource" ADD VALUE IF NOT EXISTS 'CELIYO_IMPORT';

-- AlterTable: Add new fields to tools, make endpoint nullable
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "tool_type" "ToolType" NOT NULL DEFAULT 'HTTP';
ALTER TABLE "tools" ALTER COLUMN "endpoint" DROP NOT NULL;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "function_name" TEXT;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "composite_config" JSONB;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "import_meta" JSONB;
