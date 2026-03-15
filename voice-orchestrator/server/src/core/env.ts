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
  SUPERADMIN_URL: z.string().url().default('https://admin.celiyo.com'),

  // Voice provider defaults (used if tenant has no custom credentials)
  OMNIDIM_API_URL: z.string().url().default('https://backend.omnidim.io/api/v1'),
  OMNIDIM_API_KEY: z.string().min(1).default(''),
  // Bolna is optional — the adapter is a stub (Phase 2)
  BOLNA_API_URL: z.string().url().default('https://api.bolna.ai'),
  BOLNA_API_KEY: z.string().default(''),

  // Encryption — must be exactly 64 hex chars (32 bytes)
  ENCRYPTION_KEY: z.string().length(64),

  // Hashing salt for API keys (set a real value in production)
  API_KEY_SALT: z.string().min(8).default('dev-salt-change-in-production'),

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
