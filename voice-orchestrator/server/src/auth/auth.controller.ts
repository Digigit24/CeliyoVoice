import type { RequestHandler } from 'express';
import axios from 'axios';
import { env } from '../core/env';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/v1/auth/login — proxies to SuperAdmin Django service */
export const login: RequestHandler = async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Email and password required' },
    });
    return;
  }

  try {
    const response = await axios.post(
      `${env.SUPERADMIN_URL}/api/auth/login/`,
      parsed.data,
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    res.status(200).json(response.data);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(502).json({
        success: false,
        error: { code: 'BAD_GATEWAY', message: 'Auth service unavailable' },
      });
    }
  }
};

/** GET /api/v1/auth/me — returns current user info from JWT (no proxy needed) */
export const me: RequestHandler = async (req, res) => {
  res.json({
    success: true,
    data: {
      userId: req.userId,
      email: req.email,
      tenantId: req.tenantId,
      tenantSlug: req.tenantSlug,
      isSuperAdmin: req.isSuperAdmin,
      permissions: req.permissions,
      enabledModules: req.enabledModules,
    },
  });
};
