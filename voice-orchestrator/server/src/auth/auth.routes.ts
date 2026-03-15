import { Router } from 'express';
import { login, me } from './auth.controller';

export const authRouter = Router();

/** POST /api/v1/auth/login — public, no JWT required */
authRouter.post('/login', login);

/** GET /api/v1/auth/me — requires JWT */
authRouter.get('/me', me);
