import { clientQuerySchema, createClientSchema, updateClientSchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createClientHandler,
  deleteClientHandler,
  getClientByIdHandler,
  getClientsHandler,
  updateClientHandler,
} from '../controllers/client.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const clientRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de cliente inválido'),
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

clientRouter.use(authenticate);

clientRouter.get(
  '/',
  authorizeAny([
    { modulo: 'comercial', accion: 'read' },
    { modulo: 'taller', accion: 'read' },
  ]),
  validate({ query: clientQuerySchema }),
  getClientsHandler,
);

clientRouter.get(
  '/:id',
  authorizeAny([
    { modulo: 'comercial', accion: 'read' },
    { modulo: 'taller', accion: 'read' },
  ]),
  validate({ params: idParamSchema }),
  getClientByIdHandler,
);

clientRouter.post(
  '/',
  authorizeAny([
    { modulo: 'comercial', accion: 'create' },
    { modulo: 'taller', accion: 'create' },
  ]),
  validate({ body: createClientSchema }),
  createClientHandler,
);

clientRouter.patch(
  '/:id',
  authorizeAny([
    { modulo: 'comercial', accion: 'update' },
    { modulo: 'taller', accion: 'update' },
  ]),
  validate({ params: idParamSchema, body: updateClientSchema }),
  updateClientHandler,
);

clientRouter.delete(
  '/:id',
  authorize('comercial', 'delete'),
  validate({ params: idParamSchema }),
  deleteClientHandler,
);
