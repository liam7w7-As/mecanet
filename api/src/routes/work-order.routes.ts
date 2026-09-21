import {
  changeWorkOrderStatusSchema,
  deliverWorkOrderSchema,
  createWorkOrderSchema,
  createWorkOrderReentrySchema,
  updateWorkOrderSchema,
  workOrderQuerySchema,
  WORK_ORDER_INSPECTION_PHOTO_SLOTS,
  assignWorkOrderMechanicSchema,
  createWorkOrderRequestSchema,
  reviewWorkOrderRequestSchema,
  updateWorkOrderExecutionSchema,
} from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createWorkOrderHandler,
  createWorkOrderReentryHandler,
  changeWorkOrderStatusHandler,
  deleteWorkOrderHandler,
  deliverWorkOrderHandler,
  deleteWorkOrderInspectionPhotoHandler,
  getWorkOrderByIdHandler,
  getWorkOrderPdfHandler,
  getWorkOrderReceptionPdfHandler,
  getWorkOrderInspectionPhotoHandler,
  getWorkOrdersHandler,
  updateWorkOrderHandler,
  uploadWorkOrderInspectionPhotoHandler,
  assignWorkOrderMechanicHandler,
  createWorkOrderRequestHandler,
  getMechanicsHandler,
  reviewWorkOrderRequestHandler,
  updateWorkOrderExecutionHandler,
} from '../controllers/work-order.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { inspectionPhotoUpload } from '../middlewares/inspection-photo-upload.js';
import { validate } from '../middlewares/validate.js';

export const workOrderRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de orden de trabajo inválido'),
});

const inspectionPhotoParamSchema = idParamSchema.extend({
  slot: z.enum(WORK_ORDER_INSPECTION_PHOTO_SLOTS),
});

const requestParamSchema = idParamSchema.extend({
  requestId: z.coerce.number().int().positive('ID de solicitud inválido'),
});

workOrderRouter.use(authenticate);

workOrderRouter.get(
  '/',
  authorize('taller', 'read'),
  validate({ query: workOrderQuerySchema }),
  getWorkOrdersHandler,
);

workOrderRouter.get('/mechanics', authorize('taller', 'update'), getMechanicsHandler);

workOrderRouter.get(
  '/:id/inspection/photos/:slot',
  authorize('taller', 'read'),
  validate({ params: inspectionPhotoParamSchema }),
  getWorkOrderInspectionPhotoHandler,
);

workOrderRouter.post(
  '/:id/inspection/photos/:slot',
  authorize('taller', 'update'),
  validate({ params: inspectionPhotoParamSchema }),
  inspectionPhotoUpload,
  uploadWorkOrderInspectionPhotoHandler,
);

workOrderRouter.delete(
  '/:id/inspection/photos/:slot',
  authorize('taller', 'update'),
  validate({ params: inspectionPhotoParamSchema }),
  deleteWorkOrderInspectionPhotoHandler,
);

workOrderRouter.get(
  '/:id/reception-pdf',
  authorize('taller', 'read'),
  validate({ params: idParamSchema }),
  getWorkOrderReceptionPdfHandler,
);

workOrderRouter.get(
  '/:id/pdf',
  authorize('taller', 'read'),
  validate({ params: idParamSchema }),
  getWorkOrderPdfHandler,
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
  '/:id/assignment',
  authorize('taller', 'update'),
  validate({ params: idParamSchema, body: assignWorkOrderMechanicSchema }),
  assignWorkOrderMechanicHandler,
);

workOrderRouter.patch(
  '/:id/execution',
  authorize('taller', 'update'),
  validate({ params: idParamSchema, body: updateWorkOrderExecutionSchema }),
  updateWorkOrderExecutionHandler,
);

workOrderRouter.post(
  '/:id/requests',
  authorize('taller', 'update'),
  validate({ params: idParamSchema, body: createWorkOrderRequestSchema }),
  createWorkOrderRequestHandler,
);

workOrderRouter.patch(
  '/:id/requests/:requestId',
  authorize('taller', 'update'),
  validate({ params: requestParamSchema, body: reviewWorkOrderRequestSchema }),
  reviewWorkOrderRequestHandler,
);

workOrderRouter.post(
  '/:id/deliver',
  authorize('taller', 'update'),
  validate({ params: idParamSchema, body: deliverWorkOrderSchema }),
  deliverWorkOrderHandler,
);

workOrderRouter.post(
  '/:id/reentry',
  authorize('taller', 'create'),
  validate({ params: idParamSchema, body: createWorkOrderReentrySchema }),
  createWorkOrderReentryHandler,
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
