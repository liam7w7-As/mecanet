import {
  catalogItemQuerySchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  updateStockSchema,
} from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  adjustStockHandler,
  createCatalogItemHandler,
  deleteCatalogItemHandler,
  getCatalogItemByIdHandler,
  getCatalogItemsHandler,
  updateCatalogItemHandler,
} from '../controllers/catalog.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const catalogRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de item de catálogo inválido'),
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

catalogRouter.use(authenticate);

catalogRouter.get(
  '/',
  authorizeAny([
    { modulo: 'taller', accion: 'read' },
    { modulo: 'comercial', accion: 'read' },
  ]),
  validate({ query: catalogItemQuerySchema }),
  getCatalogItemsHandler,
);

catalogRouter.post(
  '/',
  authorizeAny([
    { modulo: 'taller', accion: 'create' },
    { modulo: 'admin', accion: 'create' },
  ]),
  validate({ body: createCatalogItemSchema }),
  createCatalogItemHandler,
);

catalogRouter.post(
  '/:id/stock',
  authorizeAny([
    { modulo: 'taller', accion: 'update' },
    { modulo: 'admin', accion: 'update' },
  ]),
  validate({ params: idParamSchema, body: updateStockSchema }),
  adjustStockHandler,
);

catalogRouter.get(
  '/:id',
  authorizeAny([
    { modulo: 'taller', accion: 'read' },
    { modulo: 'comercial', accion: 'read' },
  ]),
  validate({ params: idParamSchema }),
  getCatalogItemByIdHandler,
);

catalogRouter.patch(
  '/:id',
  authorizeAny([
    { modulo: 'taller', accion: 'update' },
    { modulo: 'admin', accion: 'update' },
  ]),
  validate({ params: idParamSchema, body: updateCatalogItemSchema }),
  updateCatalogItemHandler,
);

catalogRouter.delete(
  '/:id',
  authorizeAny([
    { modulo: 'taller', accion: 'delete' },
    { modulo: 'admin', accion: 'delete' },
  ]),
  validate({ params: idParamSchema }),
  deleteCatalogItemHandler,
);
