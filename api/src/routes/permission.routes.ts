import { updateRolePermissionsSchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  getPermissionsHandler,
  getRolePermissionsHandler,
  getRolesHandler,
  updateRolePermissionsHandler,
} from '../controllers/permission.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const permissionRouter = Router();

const roleIdParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de rol inválido'),
});

permissionRouter.get('/roles', authenticate, authorize('admin', 'read'), getRolesHandler);
permissionRouter.get('/permissions', authenticate, authorize('admin', 'read'), getPermissionsHandler);
permissionRouter.get(
  '/roles/:id/permissions',
  authenticate,
  authorize('admin', 'read'),
  validate({ params: roleIdParamSchema }),
  getRolePermissionsHandler,
);
permissionRouter.put(
  '/roles/:id/permissions',
  authenticate,
  authorize('admin', 'update'),
  validate({ params: roleIdParamSchema, body: updateRolePermissionsSchema }),
  updateRolePermissionsHandler,
);
