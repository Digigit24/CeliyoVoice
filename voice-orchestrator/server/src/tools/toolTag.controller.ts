import type { RequestHandler } from 'express';
import { z } from 'zod';
import { success, errorResponse } from '../utils/apiResponse';

const CreateTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isToolkit: z.boolean().optional().default(false),
});

const UpdateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  isToolkit: z.boolean().optional(),
});

const AssignTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1),
});

/** GET /api/v1/tools/tags — supports ?isToolkit=true|false filter */
export const listTags: RequestHandler = async (req, res) => {
  const where: Record<string, unknown> = { tenantId: req.tenantId! };
  if (req.query['isToolkit'] !== undefined) {
    where['isToolkit'] = req.query['isToolkit'] === 'true';
  }

  const tags = await req.prisma!.toolTag.findMany({
    where,
    include: { _count: { select: { tools: true } } },
    orderBy: [{ isToolkit: 'desc' }, { name: 'asc' }],
  });
  return success(res, tags);
};

/** POST /api/v1/tools/tags */
export const createTag: RequestHandler = async (req, res) => {
  const parsed = CreateTagSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  try {
    const tag = await req.prisma!.toolTag.create({
      data: {
        tenantId: req.tenantId!,
        name: parsed.data.name,
        color: parsed.data.color,
        isToolkit: parsed.data.isToolkit ?? false,
      },
    });
    return success(res, tag, 201);
  } catch {
    return errorResponse(res, 'Tag already exists', 'CONFLICT', 409);
  }
};

/** PUT /api/v1/tools/tags/:id — update name, color, or promote to toolkit */
export const updateTag: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = UpdateTagSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  const existing = await req.prisma!.toolTag.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!existing) return errorResponse(res, 'Tag not found', 'NOT_FOUND', 404);

  try {
    const tag = await req.prisma!.toolTag.update({
      where: { id },
      data: parsed.data,
      include: { _count: { select: { tools: true } } },
    });
    return success(res, tag);
  } catch {
    return errorResponse(res, 'Update failed', 'CONFLICT', 409);
  }
};

/** DELETE /api/v1/tools/tags/:id */
export const deleteTag: RequestHandler = async (req, res) => {
  const { id } = req.params as { id: string };
  const existing = await req.prisma!.toolTag.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!existing) return errorResponse(res, 'Tag not found', 'NOT_FOUND', 404);

  await req.prisma!.toolTag.delete({ where: { id } });
  return success(res, { deleted: true });
};

/** POST /api/v1/tools/:id/tags */
export const assignTags: RequestHandler = async (req, res) => {
  const parsed = AssignTagsSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, 'Validation failed', 'VALIDATION_ERROR', 400, parsed.error.flatten());

  const { id: toolId } = req.params as { id: string };
  const prisma = req.prisma!;

  const tool = await prisma.tool.findFirst({ where: { id: toolId, tenantId: req.tenantId! } });
  if (!tool) return errorResponse(res, 'Tool not found', 'NOT_FOUND', 404);

  let assigned = 0;
  for (const tagId of parsed.data.tagIds) {
    try {
      await prisma.toolTagAssignment.create({ data: { toolId, tagId } });
      assigned++;
    } catch { /* skip duplicates */ }
  }
  return success(res, { assigned });
};

/** DELETE /api/v1/tools/:id/tags/:tagId */
export const removeTag: RequestHandler = async (req, res) => {
  const { id: toolId, tagId } = req.params as { id: string; tagId: string };
  const existing = await req.prisma!.toolTagAssignment.findFirst({ where: { toolId, tagId } });
  if (!existing) return errorResponse(res, 'Tag assignment not found', 'NOT_FOUND', 404);

  await req.prisma!.toolTagAssignment.delete({ where: { id: existing.id } });
  return success(res, { deleted: true });
};
