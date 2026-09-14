import { createQuotationSchema, quotationQuerySchema, updateQuotationSchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createQuotationHandler,
  deleteQuotationHandler,
  getQuotationByIdHandler,
  getQuotationsHandler,
  updateQuotationHandler,
} from '../controllers/quotation.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const quotationRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de cotización inválido'),
});

quotationRouter.use(authenticate);

quotationRouter.get(
  '/',
  authorize('comercial', 'read'),
  validate({ query: quotationQuerySchema }),
  getQuotationsHandler,
);

quotationRouter.get(
  '/:id',
  authorize('comercial', 'read'),
  validate({ params: idParamSchema }),
  getQuotationByIdHandler,
);

quotationRouter.post(
  '/',
  authorize('comercial', 'create'),
  validate({ body: createQuotationSchema }),
  createQuotationHandler,
);

quotationRouter.patch(
  '/:id',
  authorize('comercial', 'update'),
  validate({ params: idParamSchema, body: updateQuotationSchema }),
  updateQuotationHandler,
);

quotationRouter.delete(
  '/:id',
  authorize('comercial', 'delete'),
  validate({ params: idParamSchema }),
  deleteQuotationHandler,
);
