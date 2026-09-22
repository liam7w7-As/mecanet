import { closeCashDaySchema, financeDayQuerySchema } from '@unithor/shared';
import { Router } from 'express';

import {
  closeCashDayHandler,
  getDailyCashSummaryHandler,
  getFinanceSummaryHandler,
} from '../controllers/finance.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const financeRouter = Router();

financeRouter.use(authenticate);
financeRouter.get('/summary', authorize('finanzas', 'read'), getFinanceSummaryHandler);
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
