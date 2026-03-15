/**
 * Database seed script.
 *
 * Creates:
 *   - 1 test tenant (no users — users are managed by SuperAdmin)
 *   - 2 provider credentials for the tenant (Omnidim + Bolna)
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../utils/crypto';

// Bootstrap env before any config import
import '../core/env';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DATABASE_URL'] } },
});

const TEST_TENANT_ID = 'd2bcd1ee-e5c5-4c9f-bff2-aaf901d40440';
const TEST_TENANT_SLUG = 'acme-demo';

async function seed(): Promise<void> {
  console.log('🌱 Starting seed...');

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { id: TEST_TENANT_ID },
    create: {
      id: TEST_TENANT_ID,
      slug: TEST_TENANT_SLUG,
      name: 'Acme Demo Tenant',
      plan: 'STARTER',
      settings: {
        timezone: 'Asia/Kolkata',
        language: 'en',
        maxConcurrentCalls: 5,
      },
      isActive: true,
    },
    update: {
      name: 'Acme Demo Tenant',
      plan: 'STARTER',
    },
  });

  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ── Provider: Omnidim (default) ───────────────────────────────────────────
  const omnidimApiKey = process.env['OMNIDIM_API_KEY'] ?? 'seed-omnidim-key';
  const omnidim = await prisma.providerCredential.upsert({
    where: { tenantId_provider: { tenantId: TEST_TENANT_ID, provider: 'OMNIDIM' } },
    create: {
      tenantId: TEST_TENANT_ID,
      provider: 'OMNIDIM',
      apiKey: encrypt(omnidimApiKey),
      apiUrl: process.env['OMNIDIM_API_URL'] ?? 'https://api.omnidim.com',
      config: { region: 'us-east-1', maxCallDuration: 3600 },
      isActive: true,
      isDefault: true,
    },
    update: {
      apiKey: encrypt(omnidimApiKey),
      isDefault: true,
    },
  });

  console.log(`✅ Provider: ${omnidim.provider} (default=${omnidim.isDefault})`);

  // ── Provider: Bolna ───────────────────────────────────────────────────────
  const bolnaApiKey = process.env['BOLNA_API_KEY'] ?? 'seed-bolna-key';
  const bolna = await prisma.providerCredential.upsert({
    where: { tenantId_provider: { tenantId: TEST_TENANT_ID, provider: 'BOLNA' } },
    create: {
      tenantId: TEST_TENANT_ID,
      provider: 'BOLNA',
      apiKey: encrypt(bolnaApiKey),
      apiUrl: process.env['BOLNA_API_URL'] ?? 'https://api.bolna.ai',
      config: { voice: 'en-US-Standard-B', sampleRate: 16000 },
      isActive: true,
      isDefault: false,
    },
    update: {
      apiKey: encrypt(bolnaApiKey),
      isDefault: false,
    },
  });

  console.log(`✅ Provider: ${bolna.provider} (default=${bolna.isDefault})`);

  console.log('\n🎉 Seed complete!');
  console.log(`\nTest tenant ID: ${TEST_TENANT_ID}`);
  console.log(`Test tenant slug: ${TEST_TENANT_SLUG}`);
  console.log('\nNote: No users seeded — users are managed by the SuperAdmin service.');
}

seed()
  .catch((err: unknown) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
