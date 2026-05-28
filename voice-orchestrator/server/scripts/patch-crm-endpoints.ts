/**
 * One-time patch: prepend https://crm.celiyo.com to all crm_ tool endpoints
 * that were imported with a relative path (e.g. /api/crm/leads/).
 */
import { defaultPrismaClient } from '../src/db/client';

const BASE = 'https://crm.celiyo.com';

async function main() {
  const tools = await defaultPrismaClient.tool.findMany({
    where: { name: { startsWith: 'crm_' } },
    select: { id: true, name: true, endpoint: true },
  });

  let patched = 0;
  for (const t of tools) {
    if (!t.endpoint) continue;
    if (t.endpoint.startsWith('http://') || t.endpoint.startsWith('https://')) continue; // already absolute
    const full = `${BASE}${t.endpoint}`;
    await defaultPrismaClient.tool.update({ where: { id: t.id }, data: { endpoint: full } });
    console.log(`  ✓ ${t.name}  →  ${full}`);
    patched++;
  }

  console.log(`\nPatched ${patched} / ${tools.length} CRM tools.`);
  await defaultPrismaClient.$disconnect();
}

main().catch(console.error);
