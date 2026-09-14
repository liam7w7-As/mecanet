import { createPaymentSchema, paymentQuerySchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createPaymentHandler,
  deletePaymentHandler,
  getPaymentsHandler,
} from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const paymentRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de pago inválido'),
});

paymentRouter.use(authenticate);

paymentRouter.get(
  '/',
  authorize('comercial', 'read'),
  validate({ query: paymentQuerySchema }),
  getPaymentsHandler,
);

paymentRouter.post(
  '/',
  authorize('comercial', 'create'),
  validate({ body: createPaymentSchema }),
  createPaymentHandler,
);

paymentRouter.delete(
  '/:id',
  authorize('comercial', 'delete'),
  validate({ params: idParamSchema }),
  deletePaymentHandler,
);
