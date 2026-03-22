import { z } from 'zod';
import type { CeliyoToolFile, CeliyoToolDef, CeliyoAuth, ParsedTool } from './ctd.types';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger({ component: 'ctd-parser' });

// ── Zod schema for top-level CTD validation ──────────────────────────────────

const CeliyoFileSchema = z.object({
  celiyo_version: z.literal('1.0'),
  name: z.string().min(1),
  description: z.string().optional(),
  baseUrl: z.string().optional(),
  auth: z.object({
    type: z.enum(['none', 'api_key', 'bearer', 'basic', 'oauth']),
    config: z.record(z.unknown()),
  }).optional(),
  rateLimit: z.object({ maxPerMinute: z.number().optional() }).optional(),
  tools: z.array(z.unknown()).min(1, 'At least one tool is required'),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

function isValidToolName(name: string): boolean {
  return SNAKE_CASE_RE.test(name) && name.length <= 64;
}

function mapAuth(auth: CeliyoAuth | undefined): { authType: string; authConfig: Record<string, unknown> } {
  if (!auth || auth.type === 'none') {
    return { authType: 'NONE', authConfig: {} };
  }
  switch (auth.type) {
    case 'bearer':
      return { authType: 'BEARER', authConfig: { token: auth.config.token ?? '' } };
    case 'api_key':
      return {
        authType: 'API_KEY',
        authConfig: {
          headerName: auth.config.headerName ?? 'X-API-Key',
          apiKey: auth.config.apiKey ?? '',
        },
      };
    case 'basic':
      return { authType: 'BEARER', authConfig: auth.config }; // basic → stored as bearer for now
    case 'oauth':
      return { authType: 'OAUTH', authConfig: auth.config };
    default:
      return { authType: 'NONE', authConfig: {} };
  }
}

function resolveEndpoint(endpoint: string | undefined, baseUrl: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  if (endpoint.startsWith('/') && baseUrl) {
    return baseUrl.replace(/\/$/, '') + endpoint;
  }
  return endpoint;
}

// ── Parser ───────────────────────────────────────────────────────────────────

export interface ParseResult {
  collectionName: string;
  parsedTools: ParsedTool[];
  errors: Array<{ toolName: string; error: string }>;
}

export function parseCeliyoFile(input: unknown): ParseResult {
  // 1. Validate top-level structure
  const topLevel = CeliyoFileSchema.safeParse(input);
  if (!topLevel.success) {
    const msg = topLevel.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { collectionName: '', parsedTools: [], errors: [{ toolName: '(file)', error: msg }] };
  }

  const file = topLevel.data as CeliyoToolFile;
  const collectionName = file.name;
  const parsedTools: ParsedTool[] = [];
  const errors: Array<{ toolName: string; error: string }> = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < file.tools.length; i++) {
    const raw = file.tools[i] as CeliyoToolDef;
    const toolName = raw?.name ?? `tool_${i}`;

    try {
      // Validate name
      if (!raw?.name) {
        errors.push({ toolName, error: 'Missing name' });
        continue;
      }
      if (!isValidToolName(raw.name)) {
        errors.push({ toolName, error: 'Name must be snake_case, max 64 chars' });
        continue;
      }
      if (seenNames.has(raw.name)) {
        errors.push({ toolName, error: 'Duplicate name in file' });
        continue;
      }
      seenNames.add(raw.name);

      // Validate description
      if (!raw.description) {
        errors.push({ toolName, error: 'Missing description' });
        continue;
      }

      // Validate inputSchema
      if (!raw.inputSchema?.type || raw.inputSchema.type !== 'object' || !raw.inputSchema.properties) {
        errors.push({ toolName, error: 'inputSchema must have type: "object" and properties' });
        continue;
      }

      const toolType = raw.type === 'function' ? 'FUNCTION' : 'HTTP';

      // Resolve endpoint for HTTP tools
      let endpoint: string | undefined;
      if (toolType === 'HTTP') {
        endpoint = resolveEndpoint(raw.endpoint, file.baseUrl);
        if (!endpoint) {
          errors.push({ toolName, error: 'HTTP tool requires endpoint (or baseUrl + relative path)' });
          continue;
        }
      }

      // Merge auth: tool-level overrides collection-level
      const effectiveAuth = raw.auth ?? file.auth;
      const { authType, authConfig } = mapAuth(effectiveAuth);

      const parsed: ParsedTool = {
        name: raw.name,
        description: raw.description,
        toolType,
        endpoint,
        method: raw.method ?? 'POST',
        headers: raw.headers ?? {},
        authType,
        authConfig,
        inputSchema: raw.inputSchema as Record<string, unknown>,
        bodyTemplate: raw.bodyTemplate,
        category: raw.category,
        timeout: raw.timeout ?? 30,
        retries: raw.retries ?? 0,
        source: 'CELIYO_IMPORT',
        importMeta: {
          collectionName,
          whenToUse: raw.whenToUse,
          responseMapping: raw.responseMapping as Record<string, unknown> | undefined,
          queryParams: raw.queryParams,
        },
      };

      // Function tools
      if (toolType === 'FUNCTION' && !raw.functionName) {
        errors.push({ toolName, error: 'FUNCTION tool requires functionName' });
        continue;
      }

      parsedTools.push(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ toolName, error: msg }, 'CTD parse error for tool');
      errors.push({ toolName, error: msg });
    }
  }

  log.info(
    { collectionName, total: file.tools.length, parsed: parsedTools.length, errors: errors.length },
    'CTD file parsed',
  );

  return { collectionName, parsedTools, errors };
}
