import { Router } from 'express';
import { requirePermission } from '../../common/permissionMiddleware';
import { startCall, endCall, listCalls, getCall } from '../../calls/call.controller';

export const callRouter = Router();

callRouter.post('/start', requirePermission('voiceai.calls.create'), startCall);
callRouter.post('/:id/end', requirePermission('voiceai.calls.edit'), endCall);
callRouter.get('/', requirePermission('voiceai.calls.view'), listCalls);
callRouter.get('/:id', requirePermission('voiceai.calls.view'), getCall);
