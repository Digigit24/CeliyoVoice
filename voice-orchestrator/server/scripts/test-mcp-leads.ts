/**
 * Connects to the local MCP SSE server, lists available tools,
 * then calls crm_crm_leads_list and prints the result.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/test-mcp-leads.ts [mcp-api-key]
 *
 * If no key is passed as an argument, the script will look up the first
 * active MCP key in the database and use it.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { defaultPrismaClient } from '../src/db/client';
import { config } from '../src/core/config';

const SERVER_URL = `http://localhost:${config.port}/mcp/sse`;

async function resolveKey(rawArg?: string): Promise<string> {
  if (rawArg) return rawArg;

  // Pull the first active key from the DB (for local testing only)
  const record = await defaultPrismaClient.mcpApiKey.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!record) {
    throw new Error(
      'No active MCP API key found in the database.\n' +
      'Create one at http://localhost:5173/mcp  then re-run:\n' +
      '  npx tsx --env-file=.env scripts/test-mcp-leads.ts <raw-key>',
    );
  }
  throw new Error(
    `Found key "${record.name}" (${record.id}) but can't read its raw value from the DB ` +
    '(it is stored hashed). Pass the raw key as the first argument:\n' +
    '  npx tsx --env-file=.env scripts/test-mcp-leads.ts mcp_<your-raw-key>',
  );
}

async function main() {
  const rawKey = await resolveKey(process.argv[2]);

  console.log(`\n🔌 Connecting to ${SERVER_URL} …`);

  const transport = new SSEClientTransport(new URL(SERVER_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${rawKey}` },
    },
  });

  const client = new Client(
    { name: 'celiyo-test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log('✅ Connected\n');

  // List all available tools
  const { tools } = await client.listTools();
  const crmTools = tools.filter((t) => t.name.startsWith('crm_'));
  console.log(`📦 ${tools.length} total tools  |  ${crmTools.length} CRM tools`);
  crmTools.slice(0, 8).forEach((t) => console.log(`   • ${t.name}`));
  if (crmTools.length > 8) console.log(`   … and ${crmTools.length - 8} more`);

  // Call crm_crm_leads_list
  const TOOL = 'crm_crm_leads_list';
  const toolExists = tools.some((t) => t.name === TOOL);
  if (!toolExists) {
    console.warn(`\n⚠️  Tool "${TOOL}" not found in this MCP key's scope.`);
    await client.close();
    return;
  }

  console.log(`\n📋 Calling ${TOOL} …`);
  const result = await client.callTool({ name: TOOL, arguments: {} });

  // MCP tools return content blocks
  const text = result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  console.log('\n📊 Lead list response:\n');
  console.log(JSON.stringify(parsed, null, 2));

  await client.close();
  await defaultPrismaClient.$disconnect();
  console.log('\n✔ Done');
}

main().catch((err) => {
  console.error('\n❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
