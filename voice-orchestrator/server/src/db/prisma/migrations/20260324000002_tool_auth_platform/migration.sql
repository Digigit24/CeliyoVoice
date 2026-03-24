-- Add PLATFORM value to ToolAuthType enum
-- Used for long-lived service tokens issued by the SuperAdmin platform per-tenant.
ALTER TYPE "ToolAuthType" ADD VALUE IF NOT EXISTS 'PLATFORM';
