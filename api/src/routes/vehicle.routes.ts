import { createVehicleSchema, updateVehicleSchema, vehicleQuerySchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createVehicleHandler,
  deleteVehicleHandler,
  getVehicleByIdHandler,
  getVehicleByPatenteHandler,
  getVehiclesHandler,
  updateVehicleHandler,
} from '../controllers/vehicle.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const vehicleRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de vehículo inválido'),
});

const patenteParamSchema = z.object({
  patente: z.string().trim().min(1, 'Patente inválida').max(15),
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

vehicleRouter.use(authenticate);

vehicleRouter.get(
  '/',
  authorizeAny([
    { modulo: 'taller', accion: 'read' },
    { modulo: 'comercial', accion: 'read' },
  ]),
  validate({ query: vehicleQuerySchema }),
  getVehiclesHandler,
);

vehicleRouter.get(
  '/patente/:patente',
  authorizeAny([
    { modulo: 'taller', accion: 'read' },
    { modulo: 'comercial', accion: 'read' },
  ]),
  validate({ params: patenteParamSchema }),
  getVehicleByPatenteHandler,
);

vehicleRouter.get(
  '/:id',
  authorizeAny([
    { modulo: 'taller', accion: 'read' },
    { modulo: 'comercial', accion: 'read' },
  ]),
  validate({ params: idParamSchema }),
  getVehicleByIdHandler,
);

vehicleRouter.post(
  '/',
  authorizeAny([
    { modulo: 'taller', accion: 'create' },
    { modulo: 'comercial', accion: 'create' },
  ]),
  validate({ body: createVehicleSchema }),
  createVehicleHandler,
);

vehicleRouter.patch(
  '/:id',
  authorizeAny([
    { modulo: 'taller', accion: 'update' },
    { modulo: 'comercial', accion: 'update' },
  ]),
  validate({ params: idParamSchema, body: updateVehicleSchema }),
  updateVehicleHandler,
);

vehicleRouter.delete(
  '/:id',
  authorize('taller', 'delete'),
  validate({ params: idParamSchema }),
  deleteVehicleHandler,
);
