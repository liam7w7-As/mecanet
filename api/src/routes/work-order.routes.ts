import {
  changeWorkOrderStatusSchema,
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderQuerySchema,
} from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createWorkOrderHandler,
  changeWorkOrderStatusHandler,
  deleteWorkOrderHandler,
  getWorkOrderByIdHandler,
  getWorkOrdersHandler,
  updateWorkOrderHandler,
} from '../controllers/work-order.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const workOrderRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de orden de trabajo inválido'),
});

workOrderRouter.use(authenticate);

workOrderRouter.get(
  '/',
  authorize('taller', 'read'),
  validate({ query: workOrderQuerySchema }),
  getWorkOrdersHandler,
);

workOrderRouter.get(
  '/:id',
  authorize('taller', 'read'),
  validate({ params: idParamSchema }),
  getWorkOrderByIdHandler,
);

workOrderRouter.post(
  '/',
  authorize('taller', 'create'),
  validate({ body: createWorkOrderSchema }),
  createWorkOrderHandler,
);

workOrderRouter.patch(
  '/:id/status',
  authorize('taller', 'update'),
  validate({ params: idParamSchema, body: changeWorkOrderStatusSchema }),
  changeWorkOrderStatusHandler,
);

workOrderRouter.patch(
  '/:id',
  authorize('taller', 'update'),
  validate({ params: idParamSchema, body: updateWorkOrderSchema }),
  updateWorkOrderHandler,
);

workOrderRouter.delete(
  '/:id',
  authorize('taller', 'delete'),
  validate({ params: idParamSchema }),
  deleteWorkOrderHandler,
);
