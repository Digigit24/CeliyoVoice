import { env } from './env';

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  jwt: {
    secretKey: env.JWT_SECRET_KEY,
    algorithm: env.JWT_ALGORITHM as 'HS256',
    clockTolerance: 30,
  },

  superAdmin: {
    url: env.SUPERADMIN_URL,
  },

  providers: {
    omnidim: {
      apiUrl: env.OMNIDIM_API_URL,
      apiKey: env.OMNIDIM_API_KEY,
    },
    bolna: {
      apiUrl: env.BOLNA_API_URL,
      apiKey: env.BOLNA_API_KEY,
    },
  },

  encryption: {
    key: env.ENCRYPTION_KEY,
    algorithm: 'aes-256-gcm' as const,
  },

  apiKey: {
    salt: env.API_KEY_SALT,
  },

  cors: {
    allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
  },

  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    defaultMax: 100,
    superAdminMax: 500,
  },

  tenantDb: {
    maxCachedClients: 3,
    idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  },

  module: {
    name: 'voiceai',
  },
} as const;
