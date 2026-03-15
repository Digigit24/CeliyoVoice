import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('4000'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT — shared secret with SuperAdmin service
  JWT_SECRET_KEY: z.string().min(16),
  JWT_ALGORITHM: z.string().default('HS256'),

  // SuperAdmin service URL
  SUPERADMIN_URL: z.string().url(),

  // Voice provider defaults (used if tenant has no custom credentials)
  OMNIDIM_API_URL: z.string().url(),
  OMNIDIM_API_KEY: z.string().min(1),
  BOLNA_API_URL: z.string().url(),
  BOLNA_API_KEY: z.string().min(1),

  // Encryption — must be exactly 64 hex chars (32 bytes)
  ENCRYPTION_KEY: z.string().length(64),

  // Hashing salt for API keys
  API_KEY_SALT: z.string().min(8),

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
