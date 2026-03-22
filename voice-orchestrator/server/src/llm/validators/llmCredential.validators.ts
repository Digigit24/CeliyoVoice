import { z } from 'zod';

export const CreateLLMCredentialSchema = z.object({
  provider: z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'GROQ', 'CUSTOM']),
  apiKey: z.string().min(1, 'API key is required'),
  apiUrl: z.string().url('Must be a valid URL').optional(),
  config: z.record(z.unknown()).default({}),
  isDefault: z.boolean().default(false),
});

export const UpdateLLMCredentialSchema = z.object({
  apiKey: z.string().min(1).optional(),
  apiUrl: z.string().url().optional().nullable(),
  config: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateLLMCredentialInput = z.infer<typeof CreateLLMCredentialSchema>;
export type UpdateLLMCredentialInput = z.infer<typeof UpdateLLMCredentialSchema>;
