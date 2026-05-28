#!/usr/bin/env tsx
/**
 * importCrmOpenApi.ts — CLI script to import a CRM OpenAPI schema as tools.
 *
 * Fetches the OpenAPI 3.0 spec from a URL (or reads a local file), converts
 * each endpoint to a Tool record via the existing ToolImportService pipeline,
 * and optionally links a shared ToolCredential to all imported tools.
 *
 * Usage:
 *   npx tsx src/tools/import/importCrmOpenApi.ts \
 *     --url https://crm.celiyo.com/api/schema/?format=json \
 *     --tenant-id <uuid> \
 *     --user-id <uuid> \
 *     [--credential-id <uuid>]    # Links PLATFORM credential to all tools
 *     [--prefix crm]             # Prepends 'crm_' to all tool names
 *     [--include '/api/v1/leads/*,/api/v1/deals/*']
 *     [--exclude '/api/v1/admin/*,/api/v1/internal/*']
 *     [--file ./schema.json]     # Use local file instead of URL
 *     [--skip-duplicates]        # Silently skip tools that already exist
 */

import fs from 'fs';
import axios from 'axios';
import { defaultPrismaClient } from '../../db/client';
import { ToolImportService } from './import.service';

// ── Argument helpers ──────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = getArg('--url');
  const file = getArg('--file');
  const tenantId = getArg('--tenant-id');
  const userId = getArg('--user-id');
  const credentialId = getArg('--credential-id');
  const prefix = getArg('--prefix');
  const includeRaw = getArg('--include');
  const excludeRaw = getArg('--exclude');
  const skipDuplicates = hasFlag('--skip-duplicates');

  if ((!url && !file) || !tenantId || !userId) {
    console.error(
      'Usage: importCrmOpenApi.ts (--url <url> | --file <path>) --tenant-id <uuid> --user-id <uuid> [options]\n' +
      '  --url <url>           Fetch OpenAPI spec from this URL\n' +
      '  --file <path>         Read OpenAPI spec from local JSON file\n' +
      '  --tenant-id <uuid>    Target tenant\n' +
      '  --user-id <uuid>      Owner user ID for created tools\n' +
      '  --credential-id <id>  Shared ToolCredential to link (PLATFORM auth)\n' +
      '  --prefix <name>       Name prefix for all imported tools (e.g. "crm")\n' +
      '  --include <patterns>  Comma-separated path glob patterns to include\n' +
      '  --exclude <patterns>  Comma-separated path glob patterns to exclude\n' +
      '  --skip-duplicates     Silently skip tools with duplicate names',
    );
    process.exit(1);
  }

  // ── Load spec ──────────────────────────────────────────────────────────────

  let spec: unknown;

  if (file) {
    console.log(`Reading OpenAPI spec from file: ${file}`);
    const raw = fs.readFileSync(file, 'utf-8');
    spec = JSON.parse(raw);
  } else {
    console.log(`Fetching OpenAPI spec from: ${url}`);
    const response = await axios.get<unknown>(url!, {
      timeout: 30_000,
      headers: { Accept: 'application/json' },
    });
    spec = response.data;
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  const svc = new ToolImportService(defaultPrismaClient);

  const result = await svc.importSwagger(tenantId, userId, spec, {
    prefix,
    includeEndpoints: includeRaw?.split(',').map((s) => s.trim()).filter(Boolean),
    excludeEndpoints: excludeRaw?.split(',').map((s) => s.trim()).filter(Boolean),
    skipDuplicates,
  });

  // ── Link credential to all imported tools ──────────────────────────────────

  if (credentialId && result.tools.length > 0) {
    const toolIds = result.tools.map((t) => t.id);
    console.log(`\nLinking credential "${credentialId}" to ${toolIds.length} tool(s)...`);

    const updated = await defaultPrismaClient.tool.updateMany({
      where: { tenantId, id: { in: toolIds } },
      data: { credentialId },
    });
    console.log(`  Linked: ${updated.count} tool(s)`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\n── Import complete ───────────────────────────────────────────');
  console.log(`  Collection  : ${result.collectionName}`);
  console.log(`  Imported    : ${result.imported}`);
  console.log(`  Skipped     : ${result.skipped}`);
  console.log(`  Errors      : ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n  Error details:');
    for (const err of result.errors) {
      console.log(`    ✗ ${err.toolName}: ${err.error}`);
    }
  }

  if (result.tools.length > 0) {
    console.log('\n  Tools created:');
    for (const t of result.tools) {
      console.log(`    ✓ ${t.name} (${t.id})`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('\nImport failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
