import { z } from 'zod';

export const StartCallSchema = z.object({
  agentId: z.string().uuid('agentId must be a valid UUID'),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format (+1234567890)'),
  metadata: z.record(z.unknown()).optional(),
});

export const ListCallsQuerySchema = z.object({
  page: z.string().optional().transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1)),
  limit: z.string().optional().transform((v) => Math.min(100, Math.max(1, parseInt(v ?? '20', 10) || 20))),
  status: z
    .enum(['QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .optional(),
  agentId: z.string().uuid().optional(),
  provider: z.enum(['OMNIDIM', 'BOLNA']).optional(),
  phone: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'duration', 'status']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type StartCallInput = z.infer<typeof StartCallSchema>;
