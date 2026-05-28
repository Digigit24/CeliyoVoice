import { Router } from 'express';
import { getCrmStatus, exchangeCrmKey, revokeCrm, syncCrm } from './ecosystem.controller';

export const ecosystemRouter = Router();

/** GET  /api/v1/ecosystem/crm/status        — connection status + tool list */
ecosystemRouter.get('/crm/status', getCrmStatus);

/** POST /api/v1/ecosystem/crm/keys/exchange — auto or manual key setup + tool import */
ecosystemRouter.post('/crm/keys/exchange', exchangeCrmKey);

/** DELETE /api/v1/ecosystem/crm/disconnect  — revoke credential + deactivate tools */
ecosystemRouter.delete('/crm/disconnect', revokeCrm);

/** POST /api/v1/ecosystem/crm/sync          — upsert / deactivate stale tools */
ecosystemRouter.post('/crm/sync', syncCrm);
