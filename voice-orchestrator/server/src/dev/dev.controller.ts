import type { RequestHandler } from 'express';
import axios, { isAxiosError } from 'axios';
import { z } from 'zod';
import { resolveCredentials } from '../providers/credentialResolver';
import { logger } from '../utils/logger';

const ProxySchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  path: z.string().min(1, 'path is required').refine((p) => p.startsWith('/'), {
    message: 'path must start with /',
  }),
  params: z.record(z.unknown()).optional(),
  body: z.record(z.unknown()).optional(),
});

/**
 * POST /api/v1/dev/omnidim
 * Proxies any Omnidim API call using the tenant's stored credentials.
 * Only available to authenticated users — useful for debugging.
 */
export const omnidimProxy: RequestHandler = async (req, res) => {
  const parsed = ProxySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() },
    });
    return;
  }

  const { method, path, params, body } = parsed.data;

  let baseURL: string;
  let apiKey: string;

  try {
    const creds = await resolveCredentials(req.tenantId!, 'OMNIDIM', req.prisma!);
    baseURL = creds.apiUrl.replace(/\/$/, '');
    apiKey = creds.apiKey;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Credential error';
    res.status(400).json({
      success: false,
      error: { code: 'CREDENTIALS_MISSING', message },
    });
    return;
  }

  const url = `${baseURL}${path}`;
  logger.info({ tenantId: req.tenantId, method, url, params }, 'dev/omnidim-proxy: outbound');

  try {
    const response = await axios.request({
      method,
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      params,
      data: body && Object.keys(body).length > 0 ? body : undefined,
      timeout: 30_000,
      validateStatus: () => true, // pass through all status codes
    });

    logger.info(
      { tenantId: req.tenantId, method, url, status: response.status },
      'dev/omnidim-proxy: response',
    );

    res.status(200).json({
      success: true,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.data,
      },
    });
  } catch (err) {
    const message = isAxiosError(err) ? err.message : String(err);
    logger.warn({ tenantId: req.tenantId, method, url, err }, 'dev/omnidim-proxy: failed');
    res.status(502).json({
      success: false,
      error: { code: 'PROXY_ERROR', message },
    });
  }
};
