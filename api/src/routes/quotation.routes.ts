import {
  convertQuotationToWorkOrderSchema,
  createQuotationSchema,
  quotationQuerySchema,
  updateQuotationSchema,
} from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import { getQuotationPaymentsHandler } from '../controllers/payment.controller.js';
import {
  convertToWorkOrderHandler,
  createQuotationHandler,
  deleteQuotationHandler,
  getQuotationByIdHandler,
  getQuotationsHandler,
  updateQuotationHandler,
} from '../controllers/quotation.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeAny } from '../middlewares/authorize-any.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const quotationRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de cotización inválido'),
});

quotationRouter.use(authenticate);

quotationRouter.get(
  '/',
  authorizeAny([{ modulo: 'comercial', accion: 'read' }, { modulo: 'finanzas', accion: 'read' }]),
  validate({ query: quotationQuerySchema }),
  getQuotationsHandler,
);

quotationRouter.get(
  '/:id/payments',
  authorizeAny([{ modulo: 'comercial', accion: 'read' }, { modulo: 'finanzas', accion: 'read' }]),
  validate({ params: idParamSchema }),
  getQuotationPaymentsHandler,
);

quotationRouter.get(
  '/:id',
  authorizeAny([{ modulo: 'comercial', accion: 'read' }, { modulo: 'finanzas', accion: 'read' }]),
  validate({ params: idParamSchema }),
  getQuotationByIdHandler,
);

quotationRouter.post(
  '/',
  authorize('comercial', 'create'),
  validate({ body: createQuotationSchema }),
  createQuotationHandler,
);

quotationRouter.post(
  '/:id/convert-to-ot',
  authorizeAny([
    { modulo: 'comercial', accion: 'update' },
    { modulo: 'taller', accion: 'create' },
  ]),
  validate({ params: idParamSchema, body: convertQuotationToWorkOrderSchema }),
  convertToWorkOrderHandler,
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
