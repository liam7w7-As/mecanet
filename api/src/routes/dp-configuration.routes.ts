import { dpQuoteInputSchema, updateDpConfigurationSchema } from '@unithor/shared';
import { Router } from 'express';

import {
  calculateDpQuoteHandler,
  getDpConfigurationHandler,
  getDpConfigurationHistoryHandler,
  updateDpConfigurationHandler,
} from '../controllers/dp-configuration.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRoles } from '../middlewares/authorize-roles.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const dpConfigurationRouter = Router();
dpConfigurationRouter.use(authenticate, authorizeRoles('admin', 'desarrollador'));
dpConfigurationRouter.get('/', authorize('admin', 'read'), getDpConfigurationHandler);
dpConfigurationRouter.get('/history', authorize('admin', 'read'), getDpConfigurationHistoryHandler);
dpConfigurationRouter.put(
  '/',
  authorize('admin', 'update'),
  validate({ body: updateDpConfigurationSchema }),
  updateDpConfigurationHandler,
);

/** Mounted by catalog.routes after its normal authentication/read permission. */
export const dpCatalogRouter = Router();
dpCatalogRouter.get('/', getDpConfigurationHandler);
dpCatalogRouter.post('/quote', validate({ body: dpQuoteInputSchema }), calculateDpQuoteHandler);
