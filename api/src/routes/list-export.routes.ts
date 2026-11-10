import { LIST_EXPORT_POLICIES, LIST_EXPORT_TARGETS } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import { getListExportHandler } from '../controllers/list-export.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { ListExportTarget } from '@unithor/shared';

export const listExportRouter = Router();
listExportRouter.use(authenticate);
listExportRouter.get(
  '/:target/:format',
  validate({
    params: z.object({ target: z.enum(LIST_EXPORT_TARGETS), format: z.enum(['excel', 'pdf']) }),
  }),
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    const policy = LIST_EXPORT_POLICIES[req.params.target as ListExportTarget];
    if (policy.roles && !policy.roles.includes(req.user.role)) throw ApiError.forbidden('No tienes acceso a este reporte.');
    const [read, allowedExport] = await Promise.all([
      Promise.all(policy.read.map((area) => hasPermission(req.user!.id, area, 'read'))),
      Promise.all(policy.export.map((area) => hasPermission(req.user!.id, area, 'export'))),
    ]);
    if (!read.some(Boolean) || !allowedExport.some(Boolean)) {
      throw ApiError.forbidden('Necesitas permisos de lectura y exportación para este listado.');
    }
    next();
  }),
  getListExportHandler,
);
