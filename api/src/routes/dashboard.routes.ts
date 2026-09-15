import { Router } from 'express';

import { getDashboardSummaryHandler } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, Response } from 'express';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get(
  '/summary',
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.internal('Error de programación: dashboard requiere authenticate previo');
      }

      const [canReadWorkshop, canReadCommercial] = await Promise.all([
        hasPermission(req.user.id, 'taller', 'read'),
        hasPermission(req.user.id, 'comercial', 'read'),
      ]);
      if (!canReadWorkshop && !canReadCommercial) {
        throw ApiError.forbidden('No tienes permiso para esta acción');
      }
      next();
    } catch (error) {
      next(error);
    }
  },
  getDashboardSummaryHandler,
);
