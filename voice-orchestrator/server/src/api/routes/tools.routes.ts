import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import { createTool, listTools, getTool, updateTool, deleteTool, executeTool } from '../../tools/tool.controller';
import { importCeliyo, previewSwagger, importSwagger } from '../../tools/import/import.controller';
import {
  createToolCredential,
  listToolCredentials,
  updateToolCredential,
  deleteToolCredential,
} from '../../tools/toolCredential.controller';
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  assignTags,
  removeTag,
} from '../../tools/toolTag.controller';
import {
  listExecutions,
  getExecution,
} from '../../tools/toolExecution.controller';

export const toolRouter = Router();

// ── Import routes (before /:id) ──────────────────────────────────────────────
toolRouter.post('/import/celiyo', requirePermission('voiceai.tools.create'), importCeliyo);
toolRouter.post('/import/swagger/preview', requirePermission('voiceai.tools.view'), previewSwagger);
toolRouter.post('/import/swagger', requirePermission('voiceai.tools.create'), importSwagger);

// ── Execution log routes (before /:id) ───────────────────────────────────────
toolRouter.get('/executions', requirePermission('voiceai.tools.view'), listExecutions);
toolRouter.get('/executions/:id', requirePermission('voiceai.tools.view'), getExecution);

// ── Credential routes (before /:id) ──────────────────────────────────────────
toolRouter.post('/credentials', requirePermission('voiceai.tools.create'), createToolCredential);
toolRouter.get('/credentials', requirePermission('voiceai.tools.view'), listToolCredentials);
toolRouter.put('/credentials/:id', requirePermission('voiceai.tools.edit'), updateToolCredential);
toolRouter.delete('/credentials/:id', requirePermission('voiceai.tools.edit'), deleteToolCredential);

// ── Tag / Toolkit routes (before /:id) ───────────────────────────────────────
toolRouter.get('/tags', requirePermission('voiceai.tools.view'), listTags);
toolRouter.post('/tags', requirePermission('voiceai.tools.create'), createTag);
toolRouter.put('/tags/:id', requirePermission('voiceai.tools.edit'), updateTag);
toolRouter.delete('/tags/:id', requirePermission('voiceai.tools.edit'), deleteTag);

// ── Standard CRUD ────────────────────────────────────────────────────────────
toolRouter.post('/', requirePermission('voiceai.tools.create'), createTool);
toolRouter.get('/', requirePermission('voiceai.tools.view'), listTools);
toolRouter.get('/:id', requirePermission('voiceai.tools.view'), getTool);
toolRouter.put('/:id', requirePermission('voiceai.tools.edit'), updateTool);
toolRouter.delete('/:id', requirePermission('voiceai.tools.delete'), deleteTool);

// ── Tool-specific tag routes ─────────────────────────────────────────────────
toolRouter.post('/:id/tags', requirePermission('voiceai.tools.edit'), assignTags);
toolRouter.delete('/:id/tags/:tagId', requirePermission('voiceai.tools.edit'), removeTag);

// ── Tool test / dry-run execution ────────────────────────────────────────────
toolRouter.post('/:id/execute', requirePermission('voiceai.tools.edit'), executeTool);
