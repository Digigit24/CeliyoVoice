import type { RequestHandler } from 'express';
import axios from 'axios';
import { env } from '../core/env';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/v1/auth/login — proxies to SuperAdmin Django service, then fetches tenant details */
export const login: RequestHandler = async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Email and password required' },
    });
    return;
  }

  // Step 1: Login at SuperAdmin
  let loginData: {
    message: string;
    user: {
      id: string;
      email: string;
      tenant: string;
      tenant_name: string;
      is_super_admin: boolean;
      [key: string]: unknown;
    };
    tokens: { access: string; refresh: string };
  };

  try {
    const response = await axios.post(
      `${env.SUPERADMIN_URL}/api/auth/login/`,
      parsed.data,
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    loginData = response.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(502).json({
        success: false,
        error: { code: 'BAD_GATEWAY', message: 'Auth service unavailable' },
      });
    }
    return;
  }

  const tenantId = loginData.user?.tenant;
  const accessToken = loginData.tokens?.access;

  // Step 2: Fetch tenant details if we have a tenant ID
  let tenantData: Record<string, unknown> | null = null;
  if (tenantId && accessToken) {
    try {
      const tenantRes = await axios.get(
        `${env.SUPERADMIN_URL}/api/tenants/${tenantId}/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      tenantData = tenantRes.data;
    } catch {
      // Tenant fetch failure is non-fatal — proceed without it
    }
  }

  res.status(200).json({
    success: true,
    data: {
      user: loginData.user,
      tokens: loginData.tokens,
      tenant: tenantData,
    },
  });
};

/** GET /api/v1/auth/me — returns current user info from JWT */
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
