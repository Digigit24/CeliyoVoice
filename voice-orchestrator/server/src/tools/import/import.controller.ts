import type { RequestHandler } from 'express';
import { ToolImportService } from './import.service';
import { success, errorResponse } from '../../utils/apiResponse';
import { ImportCeliyoSchema, SwaggerPreviewSchema, SwaggerImportSchema } from './import.validators';

/** POST /api/v1/tools/import/celiyo */
export const importCeliyo: RequestHandler = async (req, res) => {
  const parsed = ImportCeliyoSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Invalid CTD file format', 'TOOL_IMPORT_ERROR', 400, parsed.error.flatten());
  }

  const svc = new ToolImportService(req.prisma!);
  const agentId = (req.query.agentId as string) || undefined;

  const result = await svc.importCeliyoFile(
    req.tenantId!,
    req.userId!,
    req.body,
    { skipDuplicates: true, agentId },
  );

  return success(res, result, 201);
};

/** POST /api/v1/tools/import/swagger/preview */
export const previewSwagger: RequestHandler = async (req, res) => {
  const parsed = SwaggerPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Invalid request', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new ToolImportService(req.prisma!);
  const ctdFile = svc.convertSwaggerToCeliyo(parsed.data.spec, {
    prefix: parsed.data.prefix,
    includeEndpoints: parsed.data.includeEndpoints,
    excludeEndpoints: parsed.data.excludeEndpoints,
  });

  return success(res, ctdFile);
};

/** POST /api/v1/tools/import/swagger */
export const importSwagger: RequestHandler = async (req, res) => {
  const parsed = SwaggerImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Invalid request', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  const svc = new ToolImportService(req.prisma!);
  const result = await svc.importSwagger(
    req.tenantId!,
    req.userId!,
    parsed.data.spec,
    {
      prefix: parsed.data.prefix,
      includeEndpoints: parsed.data.includeEndpoints,
      excludeEndpoints: parsed.data.excludeEndpoints,
      agentId: parsed.data.agentId,
      skipDuplicates: parsed.data.skipDuplicates,
    },
  );

  return success(res, result, 201);
};
