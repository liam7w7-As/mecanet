import { commercialReportQuerySchema } from '@unithor/shared';
import { Router } from 'express';

import { getCommercialReportExcelHandler } from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeAny } from '../middlewares/authorize-any.js';
import { validate } from '../middlewares/validate.js';

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.get(
  '/commercial/excel',
  authorizeAny([{ modulo: 'comercial', accion: 'export' }, { modulo: 'finanzas', accion: 'export' }]),
  validate({ query: commercialReportQuerySchema }),
  getCommercialReportExcelHandler,
);
