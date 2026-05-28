import { defaultPrismaClient } from '../src/db/client';

async function main() {
  const t = await defaultPrismaClient.tool.findFirst({
    where: { name: 'crm_crm_leads_list' },
    select: { endpoint: true, method: true, authType: true, credentialId: true },
  });
  console.log('crm_crm_leads_list:', JSON.stringify(t, null, 2));

  const sample = await defaultPrismaClient.tool.findFirst({
    where: { name: { startsWith: 'crm_' }, endpoint: { not: null } },
    select: { name: true, endpoint: true },
  });
  console.log('sample endpoint:', sample?.endpoint);

  await defaultPrismaClient.$disconnect();
}
main().catch(console.error);
