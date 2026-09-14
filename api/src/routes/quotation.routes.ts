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
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const quotationRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de cotización inválido'),
});

const authorizeAny = (
  permissions: Array<{ modulo: string; accion: string }>,
): RequestHandler => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.internal('Error de programación: authorizeAny requiere authenticate previo');
      }

      const userId = req.user.id;
      const checks = await Promise.all(
        permissions.map((permission) =>
          hasPermission(userId, permission.modulo, permission.accion),
        ),
      );

      if (!checks.some(Boolean)) {
        throw ApiError.forbidden('No tienes permiso para esta acción');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

quotationRouter.use(authenticate);

quotationRouter.get(
  '/',
  authorize('comercial', 'read'),
  validate({ query: quotationQuerySchema }),
  getQuotationsHandler,
);

quotationRouter.get(
  '/:id/payments',
  authorize('comercial', 'read'),
  validate({ params: idParamSchema }),
  getQuotationPaymentsHandler,
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
