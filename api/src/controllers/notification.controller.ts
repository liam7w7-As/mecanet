import * as notificationService from '../services/notification.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { MarkNotificationsReadInput, NotificationListQuery } from '@unithor/shared';
import type { Request, Response } from 'express';

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

export const getNotificationsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCurrentUserId(req);
    const query = res.locals.validatedQuery as NotificationListQuery;

    // Barrido perezoso de vencimientos: se ejecuta al abrir la campanita.
    await notificationService.sweepOverdueWorkOrders();

    const result = await notificationService.listNotifications(userId, query);
    res.status(200).json(result);
  },
);

export const getUnreadNotificationsCountHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const noLeidas = await notificationService.getUnreadCount(getCurrentUserId(req));
    res.status(200).json({ noLeidas });
  },
);

export const markNotificationsReadHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCurrentUserId(req);
    const data = req.body as MarkNotificationsReadInput;
    const affected = await notificationService.markNotificationsAsRead(
      userId,
      data.todas ? null : (data.ids ?? []),
    );
    const noLeidas = await notificationService.getUnreadCount(userId);

    res.status(200).json({ affected, noLeidas });
  },
);

export const deleteNotificationsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const affected = await notificationService.deleteAllNotifications(getCurrentUserId(req));
    res.status(200).json({ affected });
  },
);
