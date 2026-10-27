import {
  adjustWorkOrderItemHoursSchema,
  assignWorkOrderItemSchema,
  completeWorkOrderItemSchema,
  createWorkOrderObservationSchema,
  createWorkOrderPriceSuggestionSchema,
  reviewWorkOrderPriceSuggestionSchema,
  updateWorkOrderItemEstimateSchema,
  validateWorkOrderItemHoursSchema,
  workshopDailyReportQuerySchema,
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
  adjustItemHoursHandler,
  assignWorkOrderItemHandler,
  completeItemTimerHandler,
  createObservationHandler,
  createPriceSuggestionHandler,
  getMyLaborWorkOrdersHandler,
  getObservationFileHandler,
  getObservationsHandler,
  getWorksheetHandler,
  getWorkshopDailyReportHandler,
  getWorkshopDailyReportPdfHandler,
  listPriceSuggestionsHandler,
  pauseItemTimerHandler,
  reviewPriceSuggestionHandler,
  startItemTimerHandler,
  updateItemEstimateHandler,
  validateItemHoursHandler,
} from '../controllers/work-order-labor.controller.js';
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
import { authorizeAny } from '../middlewares/authorize-any.js';
import { authorizeRoles } from '../middlewares/authorize-roles.js';
import { authorize } from '../middlewares/authorize.js';
import { inspectionPhotoUpload } from '../middlewares/inspection-photo-upload.js';
import { observationUpload } from '../middlewares/observation-upload.js';
import { salesRecordAccess } from '../middlewares/sales-record-access.js';
import { validate } from '../middlewares/validate.js';

import type { RequestHandler } from 'express';

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

const itemParamSchema = idParamSchema.extend({
  itemId: z.coerce.number().int().positive('ID de trabajo inválido'),
});

const observationFileParamSchema = idParamSchema.extend({
  observationId: z.coerce.number().int().positive('ID de observación inválido'),
  fileId: z.coerce.number().int().positive('ID de archivo inválido'),
});

const suggestionParamSchema = idParamSchema.extend({
  suggestionId: z.coerce.number().int().positive('ID de sugerencia inválido'),
});

/**
 * Los documentos de la OT (PDF, comprobante de recepción y fotos de inspección)
 * incluyen precios o datos comerciales. El mecánico trabaja solo con su ficha.
 */
const documentRoles = authorizeRoles(
  'desarrollador',
  'admin',
  'jefe',
  'vendedor',
  'bodeguero',
  'finanzas',
);
const workshopSupervisorRoles = authorizeRoles('desarrollador', 'admin', 'jefe');
const priceApproverRoles = authorizeRoles('desarrollador', 'admin');

const authorizePhotoUpload: RequestHandler = (req, res, next) => {
  // Attaching evidence does not grant permission to edit the work order.
  if (req.user?.role === 'vendedor') {
    return authorizeAny([
      { modulo: 'taller', accion: 'read' },
      { modulo: 'taller', accion: 'update' },
    ])(req, res, next);
  }
  return authorize('taller', 'update')(req, res, next);
};

workOrderRouter.use(authenticate);
workOrderRouter.use(salesRecordAccess('work-order'));

workOrderRouter.get(
  '/',
  authorize('taller', 'read'),
  validate({ query: workOrderQuerySchema }),
  getWorkOrdersHandler,
);

workOrderRouter.get('/mechanics', authorize('taller', 'update'), getMechanicsHandler);

workOrderRouter.get(
  '/mine',
  authorize('taller', 'read'),
  getMyLaborWorkOrdersHandler,
);

workOrderRouter.get(
  '/reports/daily',
  authorize('taller', 'read'),
  workshopSupervisorRoles,
  validate({ query: workshopDailyReportQuerySchema }),
  getWorkshopDailyReportHandler,
);

workOrderRouter.get(
  '/reports/daily/pdf',
  authorize('taller', 'export'),
  workshopSupervisorRoles,
  validate({ query: workshopDailyReportQuerySchema }),
  getWorkshopDailyReportPdfHandler,
);

workOrderRouter.get(
  '/:id/worksheet',
  authorize('taller', 'read'),
  validate({ params: idParamSchema }),
  getWorksheetHandler,
);

workOrderRouter.get(
  '/:id/observations',
  authorize('taller', 'read'),
  validate({ params: idParamSchema }),
  getObservationsHandler,
);

workOrderRouter.post(
  '/:id/observations',
  authorize('taller', 'update'),
  validate({ params: idParamSchema }),
  observationUpload,
  validate({ body: createWorkOrderObservationSchema }),
  createObservationHandler,
);

workOrderRouter.get(
  '/:id/observations/:observationId/files/:fileId',
  authorize('taller', 'read'),
  validate({ params: observationFileParamSchema }),
  getObservationFileHandler,
);

workOrderRouter.post(
  '/:id/items/:itemId/assignment',
  authorize('taller', 'update'),
  workshopSupervisorRoles,
  validate({ params: itemParamSchema, body: assignWorkOrderItemSchema }),
  assignWorkOrderItemHandler,
);

workOrderRouter.patch(
  '/:id/items/:itemId/estimate',
  authorize('taller', 'update'),
  workshopSupervisorRoles,
  validate({ params: itemParamSchema, body: updateWorkOrderItemEstimateSchema }),
  updateItemEstimateHandler,
);

workOrderRouter.post(
  '/:id/items/:itemId/start',
  authorize('taller', 'update'),
  validate({ params: itemParamSchema }),
  startItemTimerHandler,
);

workOrderRouter.post(
  '/:id/items/:itemId/pause',
  authorize('taller', 'update'),
  validate({ params: itemParamSchema }),
  pauseItemTimerHandler,
);

workOrderRouter.post(
  '/:id/items/:itemId/complete',
  authorize('taller', 'update'),
  validate({ params: itemParamSchema, body: completeWorkOrderItemSchema }),
  completeItemTimerHandler,
);

workOrderRouter.post(
  '/:id/items/:itemId/hours/adjust',
  authorize('taller', 'update'),
  workshopSupervisorRoles,
  validate({ params: itemParamSchema, body: adjustWorkOrderItemHoursSchema }),
  adjustItemHoursHandler,
);

workOrderRouter.post(
  '/:id/items/:itemId/hours/validate',
  authorize('taller', 'update'),
  workshopSupervisorRoles,
  validate({ params: itemParamSchema, body: validateWorkOrderItemHoursSchema }),
  validateItemHoursHandler,
);

workOrderRouter.get(
  '/:id/price-suggestions',
  authorize('taller', 'read'),
  workshopSupervisorRoles,
  validate({ params: idParamSchema }),
  listPriceSuggestionsHandler,
);

workOrderRouter.post(
  '/:id/price-suggestions',
  authorize('taller', 'update'),
  workshopSupervisorRoles,
  validate({ params: idParamSchema, body: createWorkOrderPriceSuggestionSchema }),
  createPriceSuggestionHandler,
);

workOrderRouter.patch(
  '/:id/price-suggestions/:suggestionId',
  authorize('taller', 'update'),
  priceApproverRoles,
  validate({ params: suggestionParamSchema, body: reviewWorkOrderPriceSuggestionSchema }),
  reviewPriceSuggestionHandler,
);

workOrderRouter.get(
  '/:id/inspection/photos/:slot',
  authorize('taller', 'read'),
  documentRoles,
  validate({ params: inspectionPhotoParamSchema }),
  getWorkOrderInspectionPhotoHandler,
);

workOrderRouter.post(
  '/:id/inspection/photos/:slot',
  authorizePhotoUpload,
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
  documentRoles,
  validate({ params: idParamSchema }),
  getWorkOrderReceptionPdfHandler,
);

workOrderRouter.get(
  '/:id/pdf',
  authorize('taller', 'read'),
  documentRoles,
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
