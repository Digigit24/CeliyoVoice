import { z } from 'zod';

export const CreateAgentSchema = z
  .object({
    name: z.string().min(1).max(255),
    agentType: z.enum(['VOICE', 'CHAT', 'HYBRID']).optional().default('VOICE'),
    typeConfig: z.record(z.unknown()).optional().default({}),
    llmProvider: z.string().optional(),
    llmModel: z.string().optional(),
    // provider is required for VOICE/HYBRID, optional for CHAT (defaults to OMNIDIM)
    provider: z.enum(['OMNIDIM', 'BOLNA']).optional().default('OMNIDIM'),
    voiceLanguage: z.string().default('en-IN'),
    voiceModel: z.string().default('female'),
    systemPrompt: z.string().min(1),
    knowledgebaseId: z.string().uuid().optional(),
    tools: z.array(z.string().uuid()).default([]),
    workflowId: z.string().uuid().optional(),
    maxConcurrentCalls: z.number().int().min(1).max(20).default(1),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    const type = data.agentType ?? 'VOICE';
    // CHAT and HYBRID agents require llmProvider + llmModel
    if ((type === 'CHAT' || type === 'HYBRID') && !data.llmProvider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'llmProvider is required for CHAT and HYBRID agents',
        path: ['llmProvider'],
      });
    }
    if ((type === 'CHAT' || type === 'HYBRID') && !data.llmModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'llmModel is required for CHAT and HYBRID agents',
        path: ['llmModel'],
      });
    }
  });

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  agentType: z.enum(['VOICE', 'CHAT', 'HYBRID']).optional(),
  typeConfig: z.record(z.unknown()).optional(),
  llmProvider: z.string().optional(),
  llmModel: z.string().optional(),
  voiceLanguage: z.string().optional(),
  voiceModel: z.string().optional(),
  systemPrompt: z.string().min(1).optional(),
  knowledgebaseId: z.string().uuid().optional(),
  tools: z.array(z.string().uuid()).optional(),
  workflowId: z.string().uuid().optional(),
  maxConcurrentCalls: z.number().int().min(1).max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ListAgentsQuerySchema = z.object({
  page: z.string().optional().transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1)),
  limit: z.string().optional().transform((v) => Math.min(100, Math.max(1, parseInt(v ?? '20', 10) || 20))),
  provider: z.enum(['OMNIDIM', 'BOLNA']).optional(),
  agentType: z.enum(['VOICE', 'CHAT', 'HYBRID']).optional(),
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
