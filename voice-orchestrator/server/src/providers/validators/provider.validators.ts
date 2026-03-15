import { z } from 'zod';

export const CreateProviderCredentialSchema = z.object({
  provider: z.enum(['OMNIDIM', 'BOLNA']),
  apiKey: z.string().min(1, 'API key is required'),
  apiUrl: z.string().url('Must be a valid URL').optional(),
  config: z.record(z.unknown()).default({}),
  isDefault: z.boolean().default(false),
});

export const UpdateProviderCredentialSchema = z.object({
  apiKey: z.string().min(1).optional(),
  apiUrl: z.string().url().optional().nullable(),
  config: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateProviderCredentialInput = z.infer<typeof CreateProviderCredentialSchema>;
export type UpdateProviderCredentialInput = z.infer<typeof UpdateProviderCredentialSchema>;
