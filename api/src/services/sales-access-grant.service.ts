import { SALES_ACCESS_SCOPE_LABELS } from '@unithor/shared';

import { notifyUsers } from './notification.service.js';
import { sequelize } from '../config/database.js';
import { Quotation } from '../models/Quotation.js';
import { Role } from '../models/Role.js';
import { SalesAccessGrant } from '../models/SalesAccessGrant.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { ApiError } from '../utils/ApiError.js';

import type {
  CreateRecordSalesAccessGrantInput,
  CreateSalesAccessGrantInput,
  SalesAccessScopeType,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

export interface SalesAccessGrantPublic {
  id: number;
  userId: number;
  scopeType: SalesAccessScopeType;
  targetId: number;
  targetCodigo: string | null;
  grantedBy: number | null;
  grantedByName: string | null;
  expiresAt: Date | null;
  expired: boolean;
  createdAt: Date;
}

export interface SalesAccessRecordGrantPublic {
  id: number;
  userId: number;
  nombre: string;
  username: string;
  expiresAt: Date | null;
  expired: boolean;
  createdAt: Date;
}

interface TargetInfo {
  codigo: string;
  ownerId: number | null;
}

const grantInclude = [{ model: User, as: 'grantedByUser', attributes: ['id', 'nombre'], required: false }];

const isExpired = (expiresAt: Date | null): boolean =>
  expiresAt !== null && expiresAt.getTime() <= Date.now();

const assertGrantee = async (granteeId: number, transaction?: Transaction): Promise<User> => {
  const user = await User.findByPk(granteeId, {
    attributes: ['id', 'nombre', 'username', 'activo'],
    include: [{ model: Role, as: 'role', attributes: ['nombre'] }],
    transaction,
  });
  if (!user) throw ApiError.notFound('Usuario no encontrado');
  if (!user.activo) throw ApiError.badRequest('El usuario no está activo');
  if (user.role?.nombre !== 'vendedor') {
    throw ApiError.badRequest('Solo se puede compartir acceso con usuarios con rol vendedor');
  }
  return user;
};

const getTargetInfo = async (
  scopeType: SalesAccessScopeType,
  targetId: number,
  transaction?: Transaction,
): Promise<TargetInfo> => {
  if (scopeType === 'work_order') {
    const workOrder = await WorkOrder.findByPk(targetId, {
      attributes: ['id', 'codigo', 'createdBy'],
      transaction,
    });
    if (!workOrder) throw ApiError.notFound('Orden de trabajo no encontrada');
    return { codigo: workOrder.codigo, ownerId: workOrder.createdBy };
  }

  const quotation = await Quotation.findByPk(targetId, {
    attributes: ['id', 'codigo', 'asesorId'],
    transaction,
  });
  if (!quotation) throw ApiError.notFound('Cotización no encontrada');
  return { codigo: quotation.codigo, ownerId: quotation.asesorId };
};

const getLinkedTarget = async (
  scopeType: SalesAccessScopeType,
  targetId: number,
  transaction?: Transaction,
): Promise<{ scopeType: SalesAccessScopeType; targetId: number; codigo: string; ownerId: number | null } | null> => {
  if (scopeType === 'work_order') {
    const quotation = await Quotation.findOne({
      where: { workOrderId: targetId },
      attributes: ['id', 'codigo', 'asesorId'],
      order: [['id', 'ASC']],
      transaction,
    });
    return quotation
      ? { scopeType: 'quotation', targetId: quotation.id, codigo: quotation.codigo, ownerId: quotation.asesorId }
      : null;
  }

  const quotation = await Quotation.findByPk(targetId, {
    attributes: ['id', 'workOrderId'],
    transaction,
  });
  if (!quotation?.workOrderId) return null;
  const workOrder = await WorkOrder.findByPk(quotation.workOrderId, {
    attributes: ['id', 'codigo', 'createdBy'],
    transaction,
  });
  return workOrder
    ? { scopeType: 'work_order', targetId: workOrder.id, codigo: workOrder.codigo, ownerId: workOrder.createdBy }
    : null;
};

const upsertGrant = async (
  granteeId: number,
  scopeType: SalesAccessScopeType,
  targetId: number,
  expiresAt: Date | null,
  grantedBy: number,
  transaction: Transaction,
): Promise<boolean> => {
  const [grant, created] = await SalesAccessGrant.findOrCreate({
    where: { userId: granteeId, scopeType, targetId },
    defaults: { userId: granteeId, scopeType, targetId, expiresAt, grantedBy },
    transaction,
  });
  const currentExpiry = grant.expiresAt ? grant.expiresAt.getTime() : null;
  const nextExpiry = expiresAt ? expiresAt.getTime() : null;
  if (currentExpiry !== nextExpiry || grant.grantedBy !== grantedBy) {
    await grant.update({ expiresAt, grantedBy }, { transaction });
  }
  return created;
};

interface GrantedRecord {
  scopeType: SalesAccessScopeType;
  targetId: number;
  codigo: string;
}

/** Avisa a la vendedora solo cuando el acceso es nuevo, no al renovarlo. */
const notifyGrantedRecords = async (
  granteeId: number,
  grantedBy: number,
  records: GrantedRecord[],
  transaction: Transaction,
): Promise<void> => {
  for (const record of records) {
    const label = SALES_ACCESS_SCOPE_LABELS[record.scopeType];
    await notifyUsers(
      [granteeId],
      {
        tipo: 'acceso_compartido',
        titulo: `Acceso compartido: ${record.codigo}`,
        mensaje: `Un administrador te dio acceso para ver y gestionar la ${label.toLowerCase()} ${record.codigo}.`,
        href: record.scopeType === 'work_order'
          ? `/work-orders/${record.targetId}`
          : `/quotations/${record.targetId}`,
        workOrderId: record.scopeType === 'work_order' ? record.targetId : null,
        quotationId: record.scopeType === 'quotation' ? record.targetId : null,
        actorId: grantedBy,
      },
      transaction,
    );
  }
};

export const listUserSalesAccessGrants = async (
  granteeId: number,
): Promise<SalesAccessGrantPublic[]> => {
  const grants = await SalesAccessGrant.findAll({
    where: { userId: granteeId },
    include: grantInclude,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });

  const workOrderIds = grants.filter((grant) => grant.scopeType === 'work_order').map((grant) => grant.targetId);
  const quotationIds = grants.filter((grant) => grant.scopeType === 'quotation').map((grant) => grant.targetId);
  const [workOrders, quotations] = await Promise.all([
    workOrderIds.length
      ? WorkOrder.findAll({ where: { id: workOrderIds }, attributes: ['id', 'codigo'], paranoid: false })
      : [],
    quotationIds.length
      ? Quotation.findAll({ where: { id: quotationIds }, attributes: ['id', 'codigo'], paranoid: false })
      : [],
  ]);
  const codes = new Map<string, string>();
  workOrders.forEach((workOrder) => codes.set(`work_order:${workOrder.id}`, workOrder.codigo));
  quotations.forEach((quotation) => codes.set(`quotation:${quotation.id}`, quotation.codigo));

  return grants.map((grant) => ({
    id: grant.id,
    userId: grant.userId,
    scopeType: grant.scopeType,
    targetId: grant.targetId,
    targetCodigo: codes.get(`${grant.scopeType}:${grant.targetId}`) ?? null,
    grantedBy: grant.grantedBy,
    grantedByName: grant.grantedByUser?.nombre ?? null,
    expiresAt: grant.expiresAt,
    expired: isExpired(grant.expiresAt),
    createdAt: grant.createdAt,
  }));
};

export const createUserSalesAccessGrant = async (
  granteeId: number,
  input: CreateSalesAccessGrantInput,
  grantedBy: number,
): Promise<SalesAccessGrantPublic[]> => {
  const expiresAt = input.expiresAt ?? null;

  await sequelize.transaction(async (transaction) => {
    const grantee = await assertGrantee(granteeId, transaction);
    const target = await getTargetInfo(input.scopeType, input.targetId, transaction);
    if (target.ownerId === grantee.id) {
      throw ApiError.badRequest(`${target.codigo} ya pertenece a esta vendedora`);
    }

    const createdRecords: GrantedRecord[] = [];
    const mainCreated = await upsertGrant(
      granteeId, input.scopeType, input.targetId, expiresAt, grantedBy, transaction,
    );
    if (mainCreated) {
      createdRecords.push({
        scopeType: input.scopeType,
        targetId: input.targetId,
        codigo: target.codigo,
      });
    }

    if (input.includeLinkedRecord) {
      const linked = await getLinkedTarget(input.scopeType, input.targetId, transaction);
      if (linked && linked.ownerId !== grantee.id) {
        const linkedCreated = await upsertGrant(
          granteeId, linked.scopeType, linked.targetId, expiresAt, grantedBy, transaction,
        );
        if (linkedCreated) {
          createdRecords.push({
            scopeType: linked.scopeType,
            targetId: linked.targetId,
            codigo: linked.codigo,
          });
        }
      }
    }

    if (createdRecords.length > 0) {
      await notifyGrantedRecords(grantee.id, grantedBy, createdRecords, transaction);
    }
  });

  return listUserSalesAccessGrants(granteeId);
};

export const createRecordSalesAccessGrant = async (
  scopeType: SalesAccessScopeType,
  targetId: number,
  input: CreateRecordSalesAccessGrantInput,
  grantedBy: number,
): Promise<SalesAccessRecordGrantPublic[]> => createUserSalesAccessGrant(
  input.userId,
  {
    scopeType,
    targetId,
    includeLinkedRecord: input.includeLinkedRecord,
    expiresAt: input.expiresAt ?? null,
  },
  grantedBy,
).then(() => listRecordSalesAccessGrantees(scopeType, targetId));

export const revokeUserSalesAccessGrant = async (
  granteeId: number,
  grantId: number,
): Promise<void> => {
  const grant = await SalesAccessGrant.findOne({ where: { id: grantId, userId: granteeId } });
  if (!grant) throw ApiError.notFound('Acceso no encontrado');
  await grant.destroy();
};

export const revokeRecordSalesAccessGrant = async (
  scopeType: SalesAccessScopeType,
  targetId: number,
  grantId: number,
): Promise<void> => {
  const grant = await SalesAccessGrant.findOne({ where: { id: grantId, scopeType, targetId } });
  if (!grant) throw ApiError.notFound('Acceso no encontrado');
  await grant.destroy();
};

export const listRecordSalesAccessGrantees = async (
  scopeType: SalesAccessScopeType,
  targetId: number,
): Promise<SalesAccessRecordGrantPublic[]> => {
  const grants = await SalesAccessGrant.findAll({
    where: { scopeType, targetId },
    include: [{ model: User, as: 'user', attributes: ['id', 'nombre', 'username'], required: true }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });

  return grants.map((grant) => ({
    id: grant.id,
    userId: grant.userId,
    nombre: grant.user?.nombre ?? 'Usuario no disponible',
    username: grant.user?.username ?? '',
    expiresAt: grant.expiresAt,
    expired: isExpired(grant.expiresAt),
    createdAt: grant.createdAt,
  }));
};
