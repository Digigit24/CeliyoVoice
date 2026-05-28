import axios from 'axios';

async function main() {
  const resp = await axios.get('https://crm.celiyo.com/api/schema/?format=json', { timeout: 15_000 });
  const spec = resp.data as Record<string, unknown>;
  const servers = (spec.servers ?? []) as Array<{ url?: string }>;
  console.log('servers:', JSON.stringify(servers));
  console.log('first baseUrl:', servers[0]?.url ?? '(empty)');
}
main().catch(console.error);
