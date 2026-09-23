import { commercialReportQuerySchema, financialReportQuerySchema } from '@unithor/shared';
import { Router } from 'express';

import {
  getCommercialReportExcelHandler,
  getFinancialReportExcelHandler,
  getFinancialReportPdfHandler,
} from '../controllers/report.controller.js';
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
reportRouter.get(
  '/finance/excel',
  authorizeAny([{ modulo: 'finanzas', accion: 'export' }]),
  validate({ query: financialReportQuerySchema }),
  getFinancialReportExcelHandler,
);

reportRouter.get(
  '/finance/pdf',
  authorizeAny([{ modulo: 'finanzas', accion: 'export' }]),
  validate({ query: financialReportQuerySchema }),
  getFinancialReportPdfHandler,
);
