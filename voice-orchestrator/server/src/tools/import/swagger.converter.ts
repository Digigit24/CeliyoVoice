import type { CeliyoToolFile, CeliyoToolDef, CeliyoAuth } from './ctd.types';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger({ component: 'swagger-converter' });

export interface SwaggerConvertOptions {
  prefix?: string;
  includeEndpoints?: string[];
  excludeEndpoints?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toSnakeCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64);
}

function buildToolName(method: string, path: string, operationId?: string, prefix?: string): string {
  let name: string;
  if (operationId) {
    name = toSnakeCase(operationId);
  } else {
    const pathPart = path.replace(/\{[^}]+\}/g, 'by_id').replace(/\//g, '_');
    name = toSnakeCase(`${method}${pathPart}`);
  }
  if (prefix) {
    name = `${toSnakeCase(prefix)}_${name}`;
  }
  return name.slice(0, 64);
}

function matchesGlob(path: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return path.startsWith(pattern.slice(0, -1));
  }
  return path === pattern;
}

function shouldInclude(path: string, options?: SwaggerConvertOptions): boolean {
  if (options?.excludeEndpoints?.some((p) => matchesGlob(path, p))) return false;
  if (options?.includeEndpoints?.length) {
    return options.includeEndpoints.some((p) => matchesGlob(path, p));
  }
  return true;
}

function resolveRef(ref: string, spec: Record<string, unknown>): Record<string, unknown> | null {
  // Only handle #/components/schemas/XXX
  const parts = ref.replace('#/', '').split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return (current as Record<string, unknown>) ?? null;
}

function flattenSchema(
  schema: Record<string, unknown>,
  spec: Record<string, unknown>,
): { properties: Record<string, Record<string, unknown>>; required: string[] } {
  // Handle $ref
  if (schema.$ref && typeof schema.$ref === 'string') {
    const resolved = resolveRef(schema.$ref, spec);
    if (!resolved) return { properties: {}, required: [] };
    return flattenSchema(resolved, spec);
  }

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = (schema.required as string[]) ?? [];

  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const [key, val] of Object.entries(props)) {
    // Skip nested $ref chains — just describe as object
    if (val.$ref) {
      const resolved = resolveRef(val.$ref as string, spec);
      properties[key] = {
        type: 'object',
        description: (resolved?.description as string) ?? `See API docs for ${key}`,
      };
    } else {
      properties[key] = {
        type: (val.type as string) ?? 'string',
        ...(val.description ? { description: val.description as string } : {}),
        ...(val.enum ? { enum: val.enum as unknown[] } : {}),
        ...(val.default !== undefined ? { default: val.default } : {}),
      };
    }
  }

  return { properties, required };
}

function mapSecurityToAuth(spec: Record<string, unknown>): CeliyoAuth | undefined {
  const components = (spec.components ?? {}) as Record<string, unknown>;
  const schemes = (components.securitySchemes ?? {}) as Record<string, Record<string, unknown>>;

  for (const [, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      return { type: 'bearer', config: { token: '{{BEARER_TOKEN}}' } };
    }
    if (scheme.type === 'apiKey') {
      return {
        type: 'api_key',
        config: {
          headerName: scheme.name ?? 'X-API-Key',
          apiKey: '{{API_KEY}}',
        },
      };
    }
  }
  return undefined;
}

// ── Main converter ───────────────────────────────────────────────────────────

export function convertSwaggerToCeliyo(
  spec: Record<string, unknown>,
  options?: SwaggerConvertOptions,
): CeliyoToolFile {
  const info = (spec.info ?? {}) as Record<string, unknown>;
  const servers = (spec.servers ?? []) as Array<{ url?: string }>;
  const baseUrl = servers[0]?.url ?? '';
  const paths = (spec.paths ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const auth = mapSecurityToAuth(spec);

  const tools: CeliyoToolDef[] = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete'];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!shouldInclude(path, options)) continue;

    for (const method of methods) {
      const operation = pathItem?.[method];
      if (!operation) continue;

      try {
        const operationId = operation.operationId as string | undefined;
        const summary = (operation.summary ?? operation.description ?? `${method.toUpperCase()} ${path}`) as string;
        const name = buildToolName(method, path, operationId, options?.prefix);

        // Build inputSchema from params + requestBody
        const allProperties: Record<string, Record<string, unknown>> = {};
        const allRequired: string[] = [];

        // Path parameters
        const params = (operation.parameters ?? pathItem.parameters ?? []) as Array<Record<string, unknown>>;
        for (const param of params) {
          const pName = param.name as string;
          const pIn = param.in as string;
          const pSchema = (param.schema ?? {}) as Record<string, unknown>;

          if (pIn === 'path') {
            allProperties[pName] = {
              type: (pSchema.type as string) ?? 'string',
              description: (param.description as string) ?? `Path parameter: ${pName}`,
            };
            allRequired.push(pName);
          } else if (pIn === 'query') {
            allProperties[pName] = {
              type: (pSchema.type as string) ?? 'string',
              ...(param.description ? { description: param.description as string } : {}),
              ...(pSchema.enum ? { enum: pSchema.enum as unknown[] } : {}),
            };
            if (param.required) allRequired.push(pName);
          }
        }

        // Request body
        const requestBody = operation.requestBody as Record<string, unknown> | undefined;
        if (requestBody) {
          const content = (requestBody.content ?? {}) as Record<string, Record<string, unknown>>;
          const jsonContent = content['application/json'];
          if (jsonContent?.schema) {
            const { properties, required } = flattenSchema(
              jsonContent.schema as Record<string, unknown>,
              spec,
            );
            Object.assign(allProperties, properties);
            allRequired.push(...required);
          } else {
            // Skip multipart/form-data and other content types
            continue;
          }
        }

        // Build bodyTemplate for POST/PUT/PATCH
        let bodyTemplate: Record<string, unknown> | undefined;
        const queryParams: Record<string, unknown> | undefined = undefined;
        if (['post', 'put', 'patch'].includes(method)) {
          bodyTemplate = {};
          for (const key of Object.keys(allProperties)) {
            bodyTemplate[key] = `{{${key}}}`;
          }
        }

        const toolDef: CeliyoToolDef = {
          name,
          description: summary,
          type: 'http',
          endpoint: path,
          method: method.toUpperCase() as CeliyoToolDef['method'],
          inputSchema: {
            type: 'object',
            properties: allProperties as CeliyoToolDef['inputSchema']['properties'],
            required: allRequired.length > 0 ? allRequired : undefined,
          },
          bodyTemplate,
          queryParams,
          timeout: 30,
          retries: 0,
        };

        tools.push(toolDef);
      } catch (err) {
        log.warn({ path, method, error: err instanceof Error ? err.message : String(err) }, 'Skipped endpoint');
      }
    }
  }

  log.info(
    { name: info.title ?? 'Unknown API', toolCount: tools.length, totalPaths: Object.keys(paths).length },
    'Swagger conversion complete',
  );

  return {
    celiyo_version: '1.0',
    name: toSnakeCase((info.title as string) ?? 'imported_api'),
    description: (info.description as string) ?? undefined,
    baseUrl,
    auth,
    tools,
  };
}
