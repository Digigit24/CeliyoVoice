import { Router } from 'express';
import { handleOmnidimWebhook } from '../../webhooks/omnidim.webhook';
import { handleBolnaWebhook } from '../../webhooks/bolna.webhook';

export const webhookRouter = Router();

// Raw body is required for signature verification — parsed as JSON by Express
webhookRouter.post('/omnidim', (req, res) => void handleOmnidimWebhook(req, res));
webhookRouter.post('/bolna', (req, res) => void handleBolnaWebhook(req, res));
