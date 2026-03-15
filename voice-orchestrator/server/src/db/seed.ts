/**
 * Database seed script.
 *
 * Creates:
 *   - 1 test tenant (no users — users are managed by SuperAdmin)
 *   - 2 provider credentials (Omnidim + Bolna)
 *   - 2 global provider configs (Omnidim + Bolna)
 *   - 3 sample agents
 *   - 10 sample calls with mixed statuses
 *   - 2 sample tools
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
// Fake owner user ID (would come from JWT in production)
const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

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
      settings: { timezone: 'Asia/Kolkata', language: 'en', maxConcurrentCalls: 5 },
      isActive: true,
    },
    update: { name: 'Acme Demo Tenant', plan: 'STARTER' },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ── Global Provider Configs ───────────────────────────────────────────────
  const omnidimConfig = await prisma.providerConfig.upsert({
    where: { provider: 'OMNIDIM' },
    create: {
      provider: 'OMNIDIM',
      displayName: 'Omnidim Voice AI',
      isEnabled: true,
      defaultConfig: { region: 'us-east-1', maxCallDuration: 3600 },
    },
    update: { displayName: 'Omnidim Voice AI', isEnabled: true },
  });
  console.log(`✅ ProviderConfig: ${omnidimConfig.provider}`);

  const bolnaConfig = await prisma.providerConfig.upsert({
    where: { provider: 'BOLNA' },
    create: {
      provider: 'BOLNA',
      displayName: 'Bolna Voice AI',
      isEnabled: true,
      defaultConfig: { voice: 'en-US-Standard-B', sampleRate: 16000 },
    },
    update: { displayName: 'Bolna Voice AI', isEnabled: true },
  });
  console.log(`✅ ProviderConfig: ${bolnaConfig.provider}`);

  // ── Provider Credentials ──────────────────────────────────────────────────
  const omnidimKey = process.env['OMNIDIM_API_KEY'] ?? 'seed-omnidim-key';
  await prisma.providerCredential.upsert({
    where: { tenantId_provider: { tenantId: TEST_TENANT_ID, provider: 'OMNIDIM' } },
    create: {
      tenantId: TEST_TENANT_ID,
      provider: 'OMNIDIM',
      apiKey: encrypt(omnidimKey),
      apiUrl: process.env['OMNIDIM_API_URL'] ?? 'https://api.omnidim.com',
      config: { region: 'us-east-1' },
      isActive: true,
      isDefault: true,
    },
    update: { apiKey: encrypt(omnidimKey), isDefault: true },
  });
  console.log('✅ ProviderCredential: OMNIDIM (default)');

  const bolnaKey = process.env['BOLNA_API_KEY'] ?? 'seed-bolna-key';
  await prisma.providerCredential.upsert({
    where: { tenantId_provider: { tenantId: TEST_TENANT_ID, provider: 'BOLNA' } },
    create: {
      tenantId: TEST_TENANT_ID,
      provider: 'BOLNA',
      apiKey: encrypt(bolnaKey),
      apiUrl: process.env['BOLNA_API_URL'] ?? 'https://api.bolna.ai',
      config: { voice: 'en-US-Standard-B' },
      isActive: true,
      isDefault: false,
    },
    update: { apiKey: encrypt(bolnaKey), isDefault: false },
  });
  console.log('✅ ProviderCredential: BOLNA');

  // ── Agents ────────────────────────────────────────────────────────────────
  const agent1 = await prisma.agent.upsert({
    where: { id: 'a0000001-0000-0000-0000-000000000001' },
    create: {
      id: 'a0000001-0000-0000-0000-000000000001',
      tenantId: TEST_TENANT_ID,
      ownerUserId: SEED_USER_ID,
      name: 'Customer Support Agent',
      provider: 'OMNIDIM',
      providerAgentId: 'omnidim-agent-cs-001',
      voiceLanguage: 'en-IN',
      voiceModel: 'female',
      systemPrompt: 'You are a helpful customer support agent for Acme Corp. Be polite and resolve issues efficiently.',
      maxConcurrentCalls: 5,
      isActive: true,
      tools: [],
    },
    update: { name: 'Customer Support Agent' },
  });

  const agent2 = await prisma.agent.upsert({
    where: { id: 'a0000001-0000-0000-0000-000000000002' },
    create: {
      id: 'a0000001-0000-0000-0000-000000000002',
      tenantId: TEST_TENANT_ID,
      ownerUserId: SEED_USER_ID,
      name: 'Sales Outreach Agent',
      provider: 'OMNIDIM',
      providerAgentId: 'omnidim-agent-sales-001',
      voiceLanguage: 'en-IN',
      voiceModel: 'male',
      systemPrompt: 'You are a professional sales agent. Introduce our product and schedule demos.',
      maxConcurrentCalls: 10,
      isActive: true,
      tools: [],
    },
    update: { name: 'Sales Outreach Agent' },
  });

  const agent3 = await prisma.agent.upsert({
    where: { id: 'a0000001-0000-0000-0000-000000000003' },
    create: {
      id: 'a0000001-0000-0000-0000-000000000003',
      tenantId: TEST_TENANT_ID,
      ownerUserId: SEED_USER_ID,
      name: 'Appointment Reminder Agent',
      provider: 'BOLNA',
      voiceLanguage: 'en-IN',
      voiceModel: 'female',
      systemPrompt: 'You call patients to remind them of upcoming appointments. Be brief and friendly.',
      maxConcurrentCalls: 3,
      isActive: true,
      tools: [],
    },
    update: { name: 'Appointment Reminder Agent' },
  });

  console.log(`✅ Agents: ${[agent1, agent2, agent3].map((a) => a.name).join(', ')}`);

  // ── Tools ─────────────────────────────────────────────────────────────────
  const tool1 = await prisma.tool.upsert({
    where: { id: 't0000001-0000-0000-0000-000000000001' },
    create: {
      id: 't0000001-0000-0000-0000-000000000001',
      tenantId: TEST_TENANT_ID,
      ownerUserId: SEED_USER_ID,
      name: 'check_order_status',
      description: 'Checks the status of a customer order by order ID.',
      endpoint: 'https://api.acme.example.com/orders/{{orderId}}/status',
      method: 'GET',
      headers: { 'X-Internal-Key': 'seed-key' },
      authType: 'API_KEY',
      authConfig: { headerName: 'X-Internal-Key', apiKey: 'seed-key' },
      timeout: 10,
      retries: 1,
      isActive: true,
    },
    update: { name: 'check_order_status' },
  });

  const tool2 = await prisma.tool.upsert({
    where: { id: 't0000001-0000-0000-0000-000000000002' },
    create: {
      id: 't0000001-0000-0000-0000-000000000002',
      tenantId: TEST_TENANT_ID,
      ownerUserId: SEED_USER_ID,
      name: 'schedule_callback',
      description: 'Schedules a callback with a customer at a specified time.',
      endpoint: 'https://api.acme.example.com/callbacks',
      method: 'POST',
      bodyTemplate: { customerId: '{{customerId}}', callbackTime: '{{callbackTime}}', notes: '{{notes}}' },
      authType: 'BEARER',
      authConfig: { token: 'seed-bearer-token' },
      timeout: 15,
      retries: 2,
      isActive: true,
    },
    update: { name: 'schedule_callback' },
  });

  console.log(`✅ Tools: ${tool1.name}, ${tool2.name}`);

  // ── Calls ─────────────────────────────────────────────────────────────────
  const callStatuses = [
    'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED',
    'FAILED', 'FAILED',
    'IN_PROGRESS',
    'QUEUED', 'QUEUED',
    'CANCELLED',
  ] as const;

  const agentIds = [agent1.id, agent2.id, agent3.id];
  const providers = ['OMNIDIM', 'OMNIDIM', 'BOLNA'] as const;
  const phones = [
    '+911234567890', '+919876543210', '+911122334455', '+919988776655', '+911029384756',
    '+912345678901', '+916789012345', '+917890123456', '+918901234567', '+910123456789',
  ];

  for (let i = 0; i < 10; i++) {
    const agentIdx = i % 3;
    const status = callStatuses[i]!;
    const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
    const startedAt = isTerminal || status === 'IN_PROGRESS' ? new Date(Date.now() - (10 - i) * 60000) : null;
    const endedAt = isTerminal ? new Date(Date.now() - (10 - i) * 30000) : null;

    await prisma.call.upsert({
      where: { id: `c0000001-0000-0000-0000-${String(i + 1).padStart(12, '0')}` },
      create: {
        id: `c0000001-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
        tenantId: TEST_TENANT_ID,
        ownerUserId: SEED_USER_ID,
        agentId: agentIds[agentIdx]!,
        phone: phones[i]!,
        direction: 'OUTBOUND',
        provider: providers[agentIdx]!,
        providerCallId: isTerminal || status === 'IN_PROGRESS' ? `prov-call-${i + 1}` : null,
        status,
        duration: status === 'COMPLETED' ? 60 + i * 30 : null,
        transcript: status === 'COMPLETED' ? `Agent: Hello! Customer: Hi, I need help with my order.\nAgent: Of course! Call ${i + 1}.` : null,
        toolsUsed: [],
        startedAt,
        endedAt,
      },
      update: { status },
    });
  }
  console.log('✅ Calls: 10 sample calls seeded');

  console.log('\n🎉 Seed complete!');
  console.log(`\nTest tenant ID:   ${TEST_TENANT_ID}`);
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
