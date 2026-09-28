import {
  markNotificationsReadSchema,
  notificationListQuerySchema,
} from '@unithor/shared';
import { Router } from 'express';

import {
  deleteNotificationsHandler,
  getNotificationsHandler,
  getUnreadNotificationsCountHandler,
  markNotificationsReadHandler,
} from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';

export const notificationRouter = Router();

// Las notificaciones son personales: cualquier usuario autenticado accede
// únicamente a las suyas, por eso no se exige un permiso de módulo.
notificationRouter.use(authenticate);

notificationRouter.get(
  '/',
  validate({ query: notificationListQuerySchema }),
  getNotificationsHandler,
);

notificationRouter.get('/unread-count', getUnreadNotificationsCountHandler);

notificationRouter.patch(
  '/read',
  validate({ body: markNotificationsReadSchema }),
  markNotificationsReadHandler,
);

notificationRouter.delete('/', deleteNotificationsHandler);
