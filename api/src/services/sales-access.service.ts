import { Op } from 'sequelize';

import { Quotation } from '../models/Quotation.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { ApiError } from '../utils/ApiError.js';

import type { Includeable, Transaction } from 'sequelize';

export const scopeSalesAssociations = (
  includes: Includeable[],
  salesId?: number,
): Includeable[] => {
  if (salesId === undefined) return includes;
  return includes.map((include) => {
    if (typeof include !== 'object' || !('model' in include)) return include;
    const condition =
      include.model === Quotation
        ? { asesorId: salesId }
        : include.model === WorkOrder
          ? { createdBy: salesId }
          : undefined;
    return condition
      ? { ...include, where: { [Op.and]: [include.where ?? {}, condition] }, required: false }
      : include;
  });
};

export const getSalesUserId = async (userId?: number): Promise<number | undefined> => {
  if (userId === undefined) return undefined;
  const user = await User.findByPk(userId, {
    attributes: ['id', 'activo'],
    include: [{ model: Role, attributes: ['nombre'] }],
  });
  if (!user?.activo) throw ApiError.unauthorized();
  return user.role?.nombre === 'vendedor' ? user.id : undefined;
};

export const assertSalesWorkOrderAccess = async (
  id: number,
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  const salesId = await getSalesUserId(userId);
  if (
    salesId !== undefined &&
    !(await WorkOrder.count({ where: { id, createdBy: salesId }, transaction }))
  ) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }
};

export const assertSalesQuotationAccess = async (
  id: number,
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  const salesId = await getSalesUserId(userId);
  if (
    salesId !== undefined &&
    !(await Quotation.count({ where: { id, asesorId: salesId }, transaction }))
  ) {
    throw ApiError.notFound('Cotización no encontrada');
  }
};
