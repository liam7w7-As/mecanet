import { createPaymentSchema, paymentQuerySchema, verifyPaymentSchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createPaymentHandler,
  deletePaymentHandler,
  getPaymentReceiptHandler,
  getPaymentsHandler,
  verifyPaymentHandler,
} from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeAny } from '../middlewares/authorize-any.js';
import { authorize } from '../middlewares/authorize.js';
import { paymentReceiptUpload } from '../middlewares/payment-receipt-upload.js';
import { validate } from '../middlewares/validate.js';

export const paymentRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de pago inválido'),
});

paymentRouter.use(authenticate);

paymentRouter.get(
  '/',
  authorizeAny([
    { modulo: 'comercial', accion: 'read' },
    { modulo: 'finanzas', accion: 'read' },
  ]),
  validate({ query: paymentQuerySchema }),
  getPaymentsHandler,
);

paymentRouter.post(
  '/',
  authorizeAny([
    { modulo: 'comercial', accion: 'create' },
    { modulo: 'finanzas', accion: 'create' },
  ]),
  paymentReceiptUpload,
  validate({ body: createPaymentSchema }),
  createPaymentHandler,
);

paymentRouter.get(
  '/:id/receipt',
  authorizeAny([
    { modulo: 'comercial', accion: 'read' },
    { modulo: 'finanzas', accion: 'read' },
  ]),
  validate({ params: idParamSchema }),
  getPaymentReceiptHandler,
);

paymentRouter.patch(
  '/:id/verify',
  authorize('finanzas', 'update'),
  validate({ params: idParamSchema, body: verifyPaymentSchema }),
  verifyPaymentHandler,
);

paymentRouter.delete(
  '/:id',
  authorizeAny([
    { modulo: 'comercial', accion: 'delete' },
    { modulo: 'finanzas', accion: 'delete' },
  ]),
  validate({ params: idParamSchema }),
  deletePaymentHandler,
);
