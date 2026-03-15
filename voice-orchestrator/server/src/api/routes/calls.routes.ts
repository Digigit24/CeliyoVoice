import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import { startCall, endCall, listCalls, getCall, listRemoteLogs } from '../../calls/call.controller';

export const callRouter = Router();

// Must come before /:id to avoid "logs" being treated as an id param
callRouter.get('/logs/remote', requirePermission('voiceai.calls.view'), listRemoteLogs);

callRouter.post('/start', requirePermission('voiceai.calls.create'), startCall);
callRouter.post('/:id/end', requirePermission('voiceai.calls.edit'), endCall);
callRouter.get('/', requirePermission('voiceai.calls.view'), listCalls);
callRouter.get('/:id', requirePermission('voiceai.calls.view'), getCall);
