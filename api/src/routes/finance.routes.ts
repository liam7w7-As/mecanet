import {
  closeCashDaySchema,
  createCashMovementSchema,
  financeDayQuerySchema,
  financialReportQuerySchema,
  voidCashMovementSchema,
} from '@unithor/shared';
import { Router } from 'express';

import {
  closeCashDayHandler,
  createCashMovementHandler,
  getCashMovementsHandler,
  getDailyCashSummaryHandler,
  getFinancialAnalyticsHandler,
  getFinanceSummaryHandler,
  voidCashMovementHandler,
} from '../controllers/finance.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const financeRouter = Router();

financeRouter.use(authenticate);
financeRouter.get('/summary', authorize('finanzas', 'read'), getFinanceSummaryHandler);
financeRouter.get(
  '/analytics',
  authorize('finanzas', 'read'),
  validate({ query: financialReportQuerySchema }),
  getFinancialAnalyticsHandler,
);
financeRouter.get(
  '/day',
  authorize('finanzas', 'read'),
  validate({ query: financeDayQuerySchema }),
  getDailyCashSummaryHandler,
);
financeRouter.post(
  '/cash-closures',
  authorize('finanzas', 'create'),
  validate({ body: closeCashDaySchema }),
  closeCashDayHandler,
);
financeRouter.get(
  '/movements',
  authorize('finanzas', 'read'),
  validate({ query: financeDayQuerySchema }),
  getCashMovementsHandler,
);
financeRouter.post(
  '/movements',
  authorize('finanzas', 'create'),
  validate({ body: createCashMovementSchema }),
  createCashMovementHandler,
);
financeRouter.patch(
  '/movements/:id/void',
  authorize('finanzas', 'delete'),
  validate({ body: voidCashMovementSchema }),
  voidCashMovementHandler,
);
