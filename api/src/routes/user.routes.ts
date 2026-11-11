import { createUserSchema, updateUserSchema, userQuerySchema, createSalesAccessGrantSchema, salesAccessGrantParamsSchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createUserSalesAccessHandler,
  listUserSalesAccessHandler,
  revokeUserSalesAccessHandler,
} from '../controllers/sales-access.controller.js';
import {
  createUserHandler,
  deleteUserHandler,
  getUserHandler,
  getUsersHandler,
  toggleStatusHandler,
  updateUserHandler,
} from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRoles } from '../middlewares/authorize-roles.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const userRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de usuario inválido'),
});

const statusSchema = z.object({
  activo: z.boolean(),
});

userRouter.use(authenticate);

userRouter.get('/', authorize('admin', 'read'), validate({ query: userQuerySchema }), getUsersHandler);
userRouter.get('/:id', authorize('admin', 'read'), validate({ params: idParamSchema }), getUserHandler);
userRouter.post(
  '/',
  authorize('admin', 'create'),
  validate({ body: createUserSchema }),
  createUserHandler,
);
userRouter.patch(
  '/:id',
  authorize('admin', 'update'),
  validate({ params: idParamSchema, body: updateUserSchema }),
  updateUserHandler,
);
userRouter.delete(
  '/:id',
  authorize('admin', 'delete'),
  validate({ params: idParamSchema }),
  deleteUserHandler,
);
userRouter.patch(
  '/:id/status',
  authorize('admin', 'update'),
  validate({ params: idParamSchema, body: statusSchema }),
  toggleStatusHandler,
);

userRouter.get(
  '/:id/sales-access',
  authorizeRoles('desarrollador', 'admin'),
  validate({ params: idParamSchema }),
  listUserSalesAccessHandler,
);
userRouter.post(
  '/:id/sales-access',
  authorizeRoles('desarrollador', 'admin'),
  validate({ params: idParamSchema, body: createSalesAccessGrantSchema }),
  createUserSalesAccessHandler,
);
userRouter.delete(
  '/:id/sales-access/:grantId',
  authorizeRoles('desarrollador', 'admin'),
  validate({ params: salesAccessGrantParamsSchema }),
  revokeUserSalesAccessHandler,
);
