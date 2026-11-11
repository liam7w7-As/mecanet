import { Op } from 'sequelize';

import { Quotation } from '../models/Quotation.js';
import { Role } from '../models/Role.js';
import { SalesAccessGrant } from '../models/SalesAccessGrant.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { ApiError } from '../utils/ApiError.js';

import type { Includeable, Transaction, WhereOptions } from 'sequelize';

/**
 * Alcance de una vendedora: sus propios registros más los que un administrador
 * le compartió explícitamente. `undefined` significa acceso sin restricción.
 */
export interface SalesScope {
  restricted: true;
  userId: number;
  workOrderIds: number[];
  quotationIds: number[];
}

export interface SalesScopeFilters {
  salesUserId?: number;
  grantedWorkOrderIds?: number[];
  grantedQuotationIds?: number[];
}

export const salesScopeFromFilters = (filters: SalesScopeFilters): SalesScope | undefined =>
  filters.salesUserId === undefined
    ? undefined
    : {
        restricted: true,
        userId: filters.salesUserId,
        workOrderIds: filters.grantedWorkOrderIds ?? [],
        quotationIds: filters.grantedQuotationIds ?? [],
      };

export const getSalesScope = async (userId?: number): Promise<SalesScope | undefined> => {
  if (userId === undefined) return undefined;
  const user = await User.findByPk(userId, {
    attributes: ['id', 'activo', 'salesAccessAll'],
    include: [{ model: Role, as: 'role', attributes: ['nombre'] }],
  });
  if (!user?.activo) throw ApiError.unauthorized();
  if (user.role?.nombre !== 'vendedor') return undefined;
  if (user.salesAccessAll) return undefined;

  const now = new Date();
  const grants = await SalesAccessGrant.findAll({
    attributes: ['scopeType', 'targetId'],
    where: {
      userId,
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
    },
    raw: true,
  });

  return {
    restricted: true,
    userId,
    workOrderIds: grants.filter((grant) => grant.scopeType === 'work_order').map((grant) => grant.targetId),
    quotationIds: grants.filter((grant) => grant.scopeType === 'quotation').map((grant) => grant.targetId),
  };
};

export const workOrderWhere = (scope?: SalesScope): WhereOptions<WorkOrder> => {
  if (!scope) return {};
  const alternatives: WhereOptions<WorkOrder>[] = [{ createdBy: scope.userId }];
  if (scope.workOrderIds.length > 0) {
    alternatives.push({ id: { [Op.in]: scope.workOrderIds } });
  }
  return { [Op.or]: alternatives } as WhereOptions<WorkOrder>;
};

export const quotationWhere = (scope?: SalesScope): WhereOptions<Quotation> => {
  if (!scope) return {};
  const alternatives: WhereOptions<Quotation>[] = [{ asesorId: scope.userId }];
  if (scope.quotationIds.length > 0) {
    alternatives.push({ id: { [Op.in]: scope.quotationIds } });
  }
  return { [Op.or]: alternatives } as WhereOptions<Quotation>;
};

export const scopeSalesAssociations = (
  includes: Includeable[],
  scope?: SalesScope,
): Includeable[] => {
  if (!scope) return includes;
  return includes.map((include) => {
    if (typeof include !== 'object' || include === null || !('model' in include)) return include;
    const condition =
      include.model === Quotation
        ? quotationWhere(scope)
        : include.model === WorkOrder
          ? workOrderWhere(scope)
          : undefined;
    return condition
      ? { ...include, where: { [Op.and]: [include.where ?? {}, condition] }, required: false }
      : include;
  });
};

export const assertSalesWorkOrderAccess = async (
  id: number,
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  const scope = await getSalesScope(userId);
  if (!scope) return;
  const allowed = await WorkOrder.count({
    where: { id, ...workOrderWhere(scope) } as WhereOptions<WorkOrder>,
    transaction,
  });
  if (!allowed) throw ApiError.notFound('Orden de trabajo no encontrada');
};

export const assertSalesQuotationAccess = async (
  id: number,
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  const scope = await getSalesScope(userId);
  if (!scope) return;
  const allowed = await Quotation.count({
    where: { id, ...quotationWhere(scope) } as WhereOptions<Quotation>,
    transaction,
  });
  if (!allowed) throw ApiError.notFound('Cotización no encontrada');
};
