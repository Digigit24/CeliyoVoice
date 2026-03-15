import { z } from 'zod';

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(255),
  provider: z.enum(['OMNIDIM', 'BOLNA']),
  voiceLanguage: z.string().default('en-IN'),
  voiceModel: z.string().default('female'),
  systemPrompt: z.string().min(1),
  knowledgebaseId: z.string().uuid().optional(),
  tools: z.array(z.string().uuid()).default([]),
  workflowId: z.string().uuid().optional(),
  maxConcurrentCalls: z.number().int().min(1).max(20).default(1),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateAgentSchema = CreateAgentSchema.partial().omit({ provider: true });

export const ListAgentsQuerySchema = z.object({
  page: z.string().optional().transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1)),
  limit: z.string().optional().transform((v) => Math.min(100, Math.max(1, parseInt(v ?? '20', 10) || 20))),
  provider: z.enum(['OMNIDIM', 'BOLNA']).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'name', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
