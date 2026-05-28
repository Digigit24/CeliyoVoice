import { defaultPrismaClient } from '../src/db/client';

async function main() {
  const tools = await defaultPrismaClient.tool.findMany({
    where: { name: { startsWith: 'crm_' }, isActive: true },
    select: { name: true, endpoint: true, method: true, description: true },
    orderBy: { name: 'asc' },
    take: 30,
  });

  if (tools.length === 0) {
    console.log('No crm_ tools found. Connect CRM first via the Ecosystem page.');
  } else {
    console.log(`Found ${tools.length} CRM tools:\n`);
    tools.forEach((t) => console.log(`  ${t.method.padEnd(6)} ${t.name}\n         ${t.description}`));
  }

  await defaultPrismaClient.$disconnect();
}

main().catch(console.error);
