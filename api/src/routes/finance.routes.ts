import { Router } from 'express';

import { getFinanceSummaryHandler } from '../controllers/finance.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';

export const financeRouter = Router();

financeRouter.use(authenticate);
financeRouter.get('/summary', authorize('finanzas', 'read'), getFinanceSummaryHandler);
