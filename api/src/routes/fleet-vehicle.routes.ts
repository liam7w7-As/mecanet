import {
  createFleetDocumentSchema,
  createFleetVehicleSchema,
  fleetDocumentFileQuerySchema,
  fleetDocumentVersionSchema,
  fleetVehicleQuerySchema,
  updateFleetDocumentSchema,
  updateFleetVehicleSchema,
} from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createFleetDocumentHandler,
  deleteFleetDocumentHandler,
  getFleetDocumentFileHandler,
  getFleetDocumentVersionsHandler,
  getFleetDocumentsHandler,
  updateFleetDocumentHandler,
  addFleetDocumentVersionHandler,
} from '../controllers/fleet-document.controller.js';
import {
  createFleetVehicleHandler,
  deleteFleetVehicleHandler,
  getFleetVehicleByIdHandler,
  getFleetVehiclesHandler,
  updateFleetVehicleHandler,
} from '../controllers/fleet-vehicle.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { fleetDocumentUpload } from '../middlewares/fleet-document-upload.js';
import { validate } from '../middlewares/validate.js';

export const fleetVehicleRouter = Router();

const vehicleParamsSchema = z.object({
  id: z.coerce.number().int().positive('ID de vehículo de flota inválido'),
});

const documentParamsSchema = vehicleParamsSchema.extend({
  documentId: z.coerce.number().int().positive('ID de documento inválido'),
});

fleetVehicleRouter.use(authenticate);

fleetVehicleRouter.get(
  '/',
  authorize('flota', 'read'),
  validate({ query: fleetVehicleQuerySchema }),
  getFleetVehiclesHandler,
);

fleetVehicleRouter.post(
  '/',
  authorize('flota', 'create'),
  validate({ body: createFleetVehicleSchema }),
  createFleetVehicleHandler,
);

fleetVehicleRouter.get(
  '/:id',
  authorize('flota', 'read'),
  validate({ params: vehicleParamsSchema }),
  getFleetVehicleByIdHandler,
);

fleetVehicleRouter.patch(
  '/:id',
  authorize('flota', 'update'),
  validate({ params: vehicleParamsSchema, body: updateFleetVehicleSchema }),
  updateFleetVehicleHandler,
);

fleetVehicleRouter.delete(
  '/:id',
  authorize('flota', 'delete'),
  validate({ params: vehicleParamsSchema }),
  deleteFleetVehicleHandler,
);

fleetVehicleRouter.get(
  '/:id/documents',
  authorize('flota', 'read'),
  validate({ params: vehicleParamsSchema }),
  getFleetDocumentsHandler,
);

fleetVehicleRouter.post(
  '/:id/documents',
  authorize('flota', 'create'),
  validate({ params: vehicleParamsSchema }),
  fleetDocumentUpload,
  validate({ body: createFleetDocumentSchema }),
  createFleetDocumentHandler,
);

fleetVehicleRouter.patch(
  '/:id/documents/:documentId',
  authorize('flota', 'update'),
  validate({ params: documentParamsSchema, body: updateFleetDocumentSchema }),
  updateFleetDocumentHandler,
);

fleetVehicleRouter.delete(
  '/:id/documents/:documentId',
  authorize('flota', 'delete'),
  validate({ params: documentParamsSchema }),
  deleteFleetDocumentHandler,
);

fleetVehicleRouter.post(
  '/:id/documents/:documentId/versions',
  authorize('flota', 'update'),
  validate({ params: documentParamsSchema }),
  fleetDocumentUpload,
  validate({ body: fleetDocumentVersionSchema }),
  addFleetDocumentVersionHandler,
);

fleetVehicleRouter.get(
  '/:id/documents/:documentId/versions',
  authorize('flota', 'read'),
  validate({ params: documentParamsSchema }),
  getFleetDocumentVersionsHandler,
);

fleetVehicleRouter.get(
  '/:id/documents/:documentId/file',
  authorize('flota', 'read'),
  validate({ params: documentParamsSchema, query: fleetDocumentFileQuerySchema }),
  getFleetDocumentFileHandler,
);
