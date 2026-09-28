import { NOTIFICATION_RECIPIENT_ROLES } from '@unithor/shared';
import { Op } from 'sequelize';

import { Notification } from '../models/Notification.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { getPagination } from '../utils/paginate.js';

import type {
  NotificationLevel,
  NotificationListQuery,
  NotificationType,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

export interface NotificationPublic {
  id: number;
  tipo: NotificationType;
  nivel: NotificationLevel;
  titulo: string;
  mensaje: string;
  href: string;
  leida: boolean;
  workOrderId: number | null;
  quotationId: number | null;
  paymentId: number | null;
  actor: { id: number; nombre: string } | null;
  createdAt: string;
}

export interface NotificationListResult {
  items: NotificationPublic[];
  noLeidas: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface NotificationPayload {
  tipo: NotificationType;
  titulo: string;
  mensaje: string;
  href: string;
  nivel?: NotificationLevel;
  workOrderId?: number | null;
  quotationId?: number | null;
  paymentId?: number | null;
  actorId?: number | null;
  dedupeKey?: string | null;
}

const DEFAULT_LEVEL: Record<NotificationType, NotificationLevel> = {
  solicitud_creada: 'warning',
  solicitud_aprobada: 'info',
  solicitud_rechazada: 'warning',
  repuesto_por_entregar: 'warning',
  pago_por_verificar: 'warning',
  pago_verificado: 'info',
  pago_rechazado: 'warning',
  ot_estado_cambiado: 'info',
  ot_entregada: 'info',
  mecanico_asignado: 'info',
  reingreso_creado: 'info',
  fecha_entrega_vencida: 'critical',
  cotizacion_creada: 'info',
  cotizacion_convertida: 'info',
};

const toPublic = (notification: Notification): NotificationPublic => ({
  id: notification.id,
  tipo: notification.tipo,
  nivel: notification.nivel,
  titulo: notification.titulo,
  mensaje: notification.mensaje,
  href: notification.href,
  leida: notification.leidaAt !== null,
  workOrderId: notification.workOrderId ?? null,
  quotationId: notification.quotationId ?? null,
  paymentId: notification.paymentId ?? null,
  actor: notification.actor ? { id: notification.actor.id, nombre: notification.actor.nombre } : null,
  createdAt: notification.createdAt.toISOString(),
});

const resolveUserIdsByRoles = async (
  roleNames: readonly string[],
  transaction?: Transaction,
  excludeUserId?: number | null,
): Promise<number[]> => {
  const rows = await User.findAll({
    attributes: ['id'],
    where: {
      activo: true,
      ...(excludeUserId ? { id: { [Op.ne]: excludeUserId } } : {}),
    },
    include: [{ model: Role, as: 'role', attributes: ['id'], where: { nombre: { [Op.in]: roleNames } } }],
    transaction,
  });

  return rows.map((row) => row.id);
};

/**
 * Crea una notificación para cada usuario activo de los roles indicados.
 * Nunca lanza: una notificación fallida no debe tumbar la transacción de negocio.
 */
export const notifyRoles = async (
  roleNames: readonly string[],
  payload: NotificationPayload,
  options?: { transaction?: Transaction; excludeUserId?: number | null },
): Promise<void> => {
  try {
    const userIds = await resolveUserIdsByRoles(roleNames, options?.transaction, options?.excludeUserId);
    await notifyUsers(userIds, payload, options?.transaction);
  } catch (error) {
    logger.warn(
      { err: error, tipo: payload.tipo, roles: [...roleNames] },
      'No fue posible crear la notificación',
    );
  }
};

/** Igual que `notifyRoles`, pero con destinatarios explícitos (ej. el mecánico de la OT). */
export const notifyUsers = async (
  userIds: Array<number | null | undefined>,
  payload: NotificationPayload,
  transaction?: Transaction,
): Promise<void> => {
  const targets = [...new Set(userIds.filter((id): id is number => typeof id === 'number'))];
  if (targets.length === 0) {
    return;
  }

  const nivel = payload.nivel ?? DEFAULT_LEVEL[payload.tipo];
  const existingKeys = payload.dedupeKey
    ? new Set(
        (
          await Notification.findAll({
            attributes: ['dedupeKey'],
            where: { dedupeKey: { [Op.like]: `${payload.dedupeKey}:%` } },
            transaction,
          })
        )
          .map((row) => row.dedupeKey)
          .filter((key): key is string => key !== null),
      )
    : null;

  const toCreate = targets
    .filter((userId) => {
      if (!existingKeys) {
        return true;
      }
      const key = `${payload.dedupeKey}:${userId}`;
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    })
    .map((userId) => ({
      userId,
      tipo: payload.tipo,
      nivel,
      titulo: payload.titulo,
      mensaje: payload.mensaje,
      href: payload.href,
      workOrderId: payload.workOrderId ?? null,
      quotationId: payload.quotationId ?? null,
      paymentId: payload.paymentId ?? null,
      actorId: payload.actorId ?? null,
      dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${userId}` : null,
    }));

  if (toCreate.length > 0) {
    await Notification.bulkCreate(toCreate, { transaction, ignoreDuplicates: true });
  }
};

/** Atajo de los dos helpers para el caso más común: un tipo y sus destinatarios por rol. */
export const notifyByType = async (
  tipo: NotificationType,
  payload: Omit<NotificationPayload, 'tipo'>,
  options?: { transaction?: Transaction; excludeUserId?: number | null },
): Promise<void> => {
  await notifyRoles(NOTIFICATION_RECIPIENT_ROLES[tipo], { ...payload, tipo }, options);
};

export const getUnreadCount = async (userId: number): Promise<number> =>
  Notification.count({ where: { userId, leidaAt: null } });

export const listNotifications = async (
  userId: number,
  query: NotificationListQuery,
): Promise<NotificationListResult> => {
  const { limit, offset, meta } = getPagination({ page: query.page, pageSize: query.pageSize });
  const where = {
    userId,
    ...(query.soloNoLeidas ? { leidaAt: null } : {}),
  };

  const [rows, total, noLeidas] = await Promise.all([
    Notification.findAll({
      where,
      include: [{ model: User, as: 'actor', attributes: ['id', 'nombre'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    }),
    Notification.count({ where }),
    Notification.count({ where: { userId, leidaAt: null } }),
  ]);

  const pagination = meta(total);

  return {
    items: rows.map(toPublic),
    noLeidas,
    total: pagination.total,
    page: pagination.page,
    pageSize: limit,
    totalPages: pagination.totalPages,
  };
};

export const markNotificationsAsRead = async (
  userId: number,
  ids: number[] | null,
  transaction?: Transaction,
): Promise<number> => {
  const where = {
    userId,
    leidaAt: null,
    ...(ids && ids.length > 0 ? { id: { [Op.in]: ids } } : {}),
  };

  const [affected] = await Notification.update(
    { leidaAt: new Date() },
    { where, transaction },
  );

  return affected;
};

export const deleteAllNotifications = async (userId: number): Promise<number> =>
  Notification.destroy({ where: { userId } });

/**
 * Barrido perezoso de fechas de entrega vencidas. Se ejecuta al listar
 * notificaciones para no depender de un cron: el `dedupeKey` garantiza
 * como máximo un aviso por usuario, OT y día.
 */
export const sweepOverdueWorkOrders = async (): Promise<void> => {
  try {
    const now = new Date();
    const overdue = await WorkOrder.findAll({
      attributes: ['id', 'codigo', 'fechaEntrega', 'assignedMechanicId'],
      where: {
        fechaEntrega: { [Op.lt]: now },
        estado: { [Op.in]: ['borrador', 'en_progreso', 'esperando_repuesto'] },
      },
      limit: 200,
    });

    if (overdue.length === 0) {
      return;
    }

    const dayKey = now.toISOString().slice(0, 10);
    for (const workOrder of overdue) {
      await notifyByType(
        'fecha_entrega_vencida',
        {
          titulo: `${workOrder.codigo} fuera del plazo prometido`,
          mensaje: 'La fecha de entrega comprometida ya pasó y la orden sigue sin entregarse.',
          href: `/work-orders/${workOrder.id}`,
          workOrderId: workOrder.id,
          dedupeKey: `overdue:${workOrder.id}:${dayKey}`,
        },
        { excludeUserId: null },
      );
    }
  } catch (error) {
    logger.warn({ err: error }, 'No fue posible revisar las fechas de entrega vencidas');
  }
};

export const assertNotificationOwner = async (
  userId: number,
  notificationId: number,
): Promise<Notification> => {
  const notification = await Notification.findOne({ where: { id: notificationId, userId } });
  if (!notification) {
    throw ApiError.notFound('Notificación no encontrada');
  }

  return notification;
};
