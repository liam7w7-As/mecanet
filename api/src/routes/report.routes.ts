import { commercialReportQuerySchema } from '@unithor/shared';
import { Router } from 'express';

import { getCommercialReportExcelHandler } from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.get(
  '/commercial/excel',
  authorize('comercial', 'export'),
  validate({ query: commercialReportQuerySchema }),
  getCommercialReportExcelHandler,
);
