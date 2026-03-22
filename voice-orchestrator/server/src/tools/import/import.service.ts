import type { PrismaClient, HttpMethod, ToolAuthType, ToolSource, ToolType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { parseCeliyoFile } from './ctd.parser';
import { convertSwaggerToCeliyo, type SwaggerConvertOptions } from './swagger.converter';
import type { CeliyoToolFile } from './ctd.types';
import { clearTenantToolCache } from '../tool.registry';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger({ component: 'tool-import' });

export interface ImportResult {
  collectionName: string;
  imported: number;
  skipped: number;
  errors: Array<{ toolName: string; error: string }>;
  tools: Array<{ id: string; name: string }>;
}

export class ToolImportService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Import tools from a CTD (Celiyo Tool Definition) file.
   */
  async importCeliyoFile(
    tenantId: string,
    ownerUserId: string,
    fileContent: unknown,
    options?: { skipDuplicates?: boolean; agentId?: string },
  ): Promise<ImportResult> {
    const skipDuplicates = options?.skipDuplicates ?? true;

    // Parse
    const { collectionName, parsedTools, errors } = parseCeliyoFile(fileContent);
    if (parsedTools.length === 0 && errors.length > 0) {
      return { collectionName: collectionName || 'unknown', imported: 0, skipped: 0, errors, tools: [] };
    }

    const result: ImportResult = {
      collectionName,
      imported: 0,
      skipped: 0,
      errors: [...errors],
      tools: [],
    };

    // Import each tool
    for (const parsed of parsedTools) {
      try {
        // Check for duplicate by name
        const existing = await this.prisma.tool.findFirst({
          where: { tenantId, name: parsed.name },
        });

        if (existing) {
          if (skipDuplicates) {
            result.skipped++;
            continue;
          }
          result.errors.push({ toolName: parsed.name, error: 'Tool with this name already exists' });
          continue;
        }

        // Create tool
        const tool = await this.prisma.tool.create({
          data: {
            tenantId,
            ownerUserId,
            name: parsed.name,
            description: parsed.description,
            toolType: parsed.toolType as ToolType,
            endpoint: parsed.endpoint,
            method: (parsed.method ?? 'POST') as HttpMethod,
            headers: parsed.headers as Prisma.InputJsonValue,
            bodyTemplate: parsed.bodyTemplate ? (parsed.bodyTemplate as Prisma.InputJsonValue) : undefined,
            authType: parsed.authType as ToolAuthType,
            authConfig: parsed.authConfig as Prisma.InputJsonValue,
            inputSchema: parsed.inputSchema as Prisma.InputJsonValue,
            outputSchema: parsed.outputSchema ? (parsed.outputSchema as Prisma.InputJsonValue) : undefined,
            category: parsed.category,
            timeout: parsed.timeout,
            retries: parsed.retries,
            source: parsed.source as ToolSource,
            importMeta: parsed.importMeta as Prisma.InputJsonValue,
          },
        });

        result.tools.push({ id: tool.id, name: tool.name });
        result.imported++;

        // Auto-attach to agent if specified
        if (options?.agentId) {
          await this.prisma.agentTool.create({
            data: {
              tenantId,
              agentId: options.agentId,
              toolId: tool.id,
              whenToUse: parsed.importMeta.whenToUse,
              priority: result.imported,
            },
          }).catch((err) => {
            log.warn({ toolId: tool.id, agentId: options.agentId, err }, 'Failed to attach tool to agent');
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ toolName: parsed.name, error: msg }, 'Failed to import tool');
        result.errors.push({ toolName: parsed.name, error: msg });
      }
    }

    clearTenantToolCache(tenantId);

    log.info(
      { collectionName, imported: result.imported, skipped: result.skipped, errors: result.errors.length },
      'CTD import complete',
    );

    return result;
  }

  /**
   * Convert Swagger/OpenAPI spec to CTD format (preview — no DB writes).
   */
  convertSwaggerToCeliyo(
    specContent: unknown,
    options?: SwaggerConvertOptions,
  ): CeliyoToolFile {
    return convertSwaggerToCeliyo(specContent as Record<string, unknown>, options);
  }

  /**
   * Import from Swagger directly (convert → parse → import).
   */
  async importSwagger(
    tenantId: string,
    ownerUserId: string,
    specContent: unknown,
    options?: SwaggerConvertOptions & { skipDuplicates?: boolean; agentId?: string },
  ): Promise<ImportResult> {
    const ctdFile = this.convertSwaggerToCeliyo(specContent, options);
    return this.importCeliyoFile(tenantId, ownerUserId, ctdFile, {
      skipDuplicates: options?.skipDuplicates,
      agentId: options?.agentId,
    });
  }
}
