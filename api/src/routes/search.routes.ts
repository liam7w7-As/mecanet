import { lookupByPlateSchema, quickSearchQuerySchema } from '@unithor/shared';
import { Router } from 'express';

import { lookupPlateHandler, quickSearchHandler } from '../controllers/search.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const searchRouter = Router();

const authorizeReadSearch: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw ApiError.internal('Error de programación: authorizeReadSearch requiere authenticate previo');
    }

    const [canReadTaller, canReadComercial] = await Promise.all([
      hasPermission(req.user.id, 'taller', 'read'),
      hasPermission(req.user.id, 'comercial', 'read'),
    ]);

    if (!canReadTaller && !canReadComercial) {
      throw ApiError.forbidden('No tienes permiso para esta acción');
    }

    next();
  } catch (error) {
    next(error);
  }
};

searchRouter.use(authenticate);

searchRouter.get(
  '/quick',
  authorizeReadSearch,
  validate({ query: quickSearchQuerySchema }),
  quickSearchHandler,
);

searchRouter.get(
  '/plate/:patente',
  authorizeReadSearch,
  validate({ params: lookupByPlateSchema }),
  lookupPlateHandler,
);
