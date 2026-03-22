import { z } from 'zod';

export const ImportCeliyoSchema = z.object({
  celiyo_version: z.literal('1.0'),
  name: z.string().min(1),
  tools: z.array(z.unknown()).min(1),
}).passthrough();

export const SwaggerPreviewSchema = z.object({
  spec: z.record(z.unknown()),
  prefix: z.string().optional(),
  includeEndpoints: z.array(z.string()).optional(),
  excludeEndpoints: z.array(z.string()).optional(),
});

export const SwaggerImportSchema = SwaggerPreviewSchema.extend({
  agentId: z.string().uuid().optional(),
  skipDuplicates: z.boolean().optional().default(true),
});
