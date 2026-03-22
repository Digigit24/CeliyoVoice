import { z } from 'zod';

export const CreateToolSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1),
  endpoint: z.string().url('Must be a valid URL'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  headers: z.record(z.string()).default({}),
  bodyTemplate: z.record(z.unknown()).optional(),
  authType: z.enum(['NONE', 'API_KEY', 'BEARER', 'OAUTH']).default('NONE'),
  authConfig: z.record(z.unknown()).default({}),
  timeout: z.number().int().min(1).max(120).default(30),
  retries: z.number().int().min(0).max(3).default(0),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  category: z.string().max(100).optional(),
  source: z.enum(['MANUAL', 'SWAGGER_IMPORT', 'MCP_IMPORT']).optional().default('MANUAL'),
});

export const UpdateToolSchema = CreateToolSchema.partial();

export const ListToolsQuerySchema = z.object({
  page: z.string().optional().transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1)),
  limit: z.string().optional().transform((v) => Math.min(100, Math.max(1, parseInt(v ?? '20', 10) || 20))),
  search: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
});

export type CreateToolInput = z.infer<typeof CreateToolSchema>;
export type UpdateToolInput = z.infer<typeof UpdateToolSchema>;
