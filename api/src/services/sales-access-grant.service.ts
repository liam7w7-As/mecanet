import { SALES_ACCESS_SCOPE_LABELS } from '@unithor/shared';
import { Op } from 'sequelize';

import { notifyUsers } from './notification.service.js';
import { loadSalesAccessTargets, lockSalesAccessTargets, salesRecordKey, searchSalesAccessRecords } from './sales-access-record.service.js';
import { sequelize } from '../config/database.js';
import { Quotation } from '../models/Quotation.js';
import { Role } from '../models/Role.js';
import { SalesAccessGrant } from '../models/SalesAccessGrant.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { ApiError } from '../utils/ApiError.js';

import type { SalesAccessRecord, SalesAccessTarget } from './sales-access-record.service.js';
import type {
  CreateRecordSalesAccessGrantInput,
  CreateSalesAccessGrantInput,
  SalesAccessScopeType,
  SalesAccessMode,
  SalesAccessRecordsQuery,
  UpdateSalesAccessInput,
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
  clientName?: string | null;
  patente?: string | null;
  linkedRecord?: SalesAccessRecord | null;
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
    attributes: ['id', 'nombre', 'username', 'activo', 'roleId', 'salesAccessAll'],
    transaction,
    // All writers lock the same row before reading or changing grants.
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!user) throw ApiError.notFound('Usuario no encontrado');
  if (!user.activo) throw ApiError.badRequest('El usuario no está activo');
  const role = await Role.findByPk(user.roleId, { attributes: ['nombre'], transaction });
  if (role?.nombre !== 'vendedor') {
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
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!workOrder) throw ApiError.notFound('Orden de trabajo no encontrada');
    return { codigo: workOrder.codigo, ownerId: workOrder.createdBy };
  }

  const quotation = await Quotation.findByPk(targetId, {
    attributes: ['id', 'codigo', 'asesorId'],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
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
  transaction?: Transaction,
): Promise<SalesAccessGrantPublic[]> => {
  const grants = await SalesAccessGrant.findAll({
    where: { userId: granteeId },
    include: grantInclude,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    transaction,
  });
  // Keep historical targetCodigo (including soft-deleted targets) for old consumers.
  const targets = await loadSalesAccessTargets(grants, transaction, true);

  return grants.map((grant) => ({
    id: grant.id,
    userId: grant.userId,
    scopeType: grant.scopeType,
    targetId: grant.targetId,
    targetCodigo: targets.get(salesRecordKey(grant))?.codigo ?? null,
    clientName: targets.get(salesRecordKey(grant))?.clientName ?? null,
    patente: targets.get(salesRecordKey(grant))?.patente ?? null,
    linkedRecord: targets.get(salesRecordKey(grant))?.linkedRecord ?? null,
    grantedBy: grant.grantedBy,
    grantedByName: grant.grantedByUser?.nombre ?? null,
    expiresAt: grant.expiresAt,
    expired: isExpired(grant.expiresAt),
    createdAt: grant.createdAt,
  }));
};

export const getUserSalesAccess = async (granteeId: number) =>
  sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(granteeId, {
      attributes: ['id', 'salesAccessAll'], transaction, lock: transaction.LOCK.SHARE,
    });
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    const grants = await listUserSalesAccessGrants(granteeId, transaction);
    const mode: SalesAccessMode = user.salesAccessAll ? 'all'
      : grants.some((grant) => !grant.expired) ? 'selected' : 'own';
    return { mode, grants };
  });

export const listUserSalesAccessRecords = async (granteeId: number, query: SalesAccessRecordsQuery) => {
  await assertGrantee(granteeId);
  return searchSalesAccessRecords(granteeId, query);
};

export const updateUserSalesAccess = async (
  granteeId: number,
  input: UpdateSalesAccessInput,
  grantedBy: number,
) => sequelize.transaction(async (transaction) => {
  if (input.mode === 'selected' && input.records?.length) {
    await lockSalesAccessTargets(input.records, transaction);
  }
  const user = await assertGrantee(granteeId, transaction);
  const hadAllAccess = user.salesAccessAll;
  const newRecords: SalesAccessTarget[] = [];
  if (input.mode === 'selected') {
    if (!input.records?.length) throw ApiError.badRequest('Selecciona al menos un registro');
    const targets = await loadSalesAccessTargets(input.records, transaction);
    const desired = new Map<string, SalesAccessTarget>();
    // Validate the complete request before changing anything, including explicit owned selections.
    for (const record of input.records) {
      const target = targets.get(salesRecordKey(record));
      if (!target) throw ApiError.badRequest('Uno o más registros no existen o fueron eliminados');
      if (target.ownerId === granteeId) throw ApiError.badRequest(`${target.codigo} ya pertenece a esta vendedora`);
      desired.set(salesRecordKey(target), target);
      if (target.linkedRecord) {
        const linked = targets.get(salesRecordKey(target.linkedRecord));
        if (linked && linked.ownerId !== granteeId) desired.set(salesRecordKey(linked), linked);
      }
    }
    const existing = await SalesAccessGrant.findAll({ where: { userId: granteeId }, transaction });
    const surviving = new Set(existing.filter((grant) => desired.has(salesRecordKey(grant)) && !isExpired(grant.expiresAt))
      .map(salesRecordKey));
    const removedIds = existing.filter((grant) => !surviving.has(salesRecordKey(grant))).map((grant) => grant.id);
    if (removedIds.length) {
      await SalesAccessGrant.destroy({ where: { userId: granteeId, id: { [Op.in]: removedIds } }, transaction });
    }
    newRecords.push(...[...desired.values()].filter((target) => !surviving.has(salesRecordKey(target))));
    if (newRecords.length) {
      await SalesAccessGrant.bulkCreate(newRecords.map((record) => ({
        userId: granteeId, scopeType: record.scopeType, targetId: record.targetId,
        grantedBy, expiresAt: null,
      })), { transaction });
    }
  } else {
    await SalesAccessGrant.destroy({ where: { userId: granteeId }, transaction });
  }
  await user.update({ salesAccessAll: input.mode === 'all' }, { transaction });
  // One notification for an access expansion; repeated saves and revocations stay silent.
  if ((input.mode === 'all' && !hadAllAccess) || (newRecords.length > 0 && !hadAllAccess)) {
    await notifyUsers([granteeId], {
      tipo: 'acceso_compartido',
      titulo: input.mode === 'all' ? 'Acceso compartido: todas las OT y COT' : 'Acceso compartido actualizado',
      mensaje: input.mode === 'all'
        ? 'Un administrador te dio acceso a todas las órdenes de trabajo y cotizaciones, incluidas las futuras.'
        : `Un administrador te dio acceso a ${newRecords.length} registros adicionales de OT y COT.`,
      href: '/work-orders', actorId: grantedBy,
    }, transaction);
  }
  return { mode: input.mode, grants: await listUserSalesAccessGrants(granteeId, transaction) };
});

export const createUserSalesAccessGrant = async (
  granteeId: number,
  input: CreateSalesAccessGrantInput,
  grantedBy: number,
): Promise<SalesAccessGrantPublic[]> => {
  const expiresAt = input.expiresAt ?? null;

  await sequelize.transaction(async (transaction) => {
    const target = await getTargetInfo(input.scopeType, input.targetId, transaction);
    const grantee = await assertGrantee(granteeId, transaction);
    if (target.ownerId === grantee.id) {
      throw ApiError.badRequest(`${target.codigo} ya pertenece a esta vendedora`);
    }
    if (grantee.salesAccessAll) return;

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

/** Called when a new counterpart is linked, with the source locked at READ COMMITTED. */
export const propagateLinkedSalesAccess = async (
  source: Pick<SalesAccessRecord, 'scopeType' | 'targetId'>,
  target: SalesAccessRecord & { ownerId: number | null },
  actorId: number,
  transaction: Transaction,
): Promise<void> => {
  // A fresh committed read on the same connection avoids an earlier transaction snapshot.
  // Grant writers lock the source first, so a new grant waits and then sees the new link.
  const candidates = await SalesAccessGrant.findAll({
    attributes: ['userId'], where: { scopeType: source.scopeType, targetId: source.targetId },
    raw: true, transaction,
  });
  const userIds = [...new Set(candidates.map((grant) => grant.userId))].sort((a, b) => a - b);
  if (!userIds.length) return;
  const users = await User.findAll({
    attributes: ['id', 'activo', 'roleId', 'salesAccessAll'], where: { id: userIds },
    order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE,
  });
  const sellerRole = await Role.findOne({ where: { nombre: 'vendedor' }, attributes: ['id'], transaction });
  const eligibleIds = users.filter((user) => user.activo && !user.salesAccessAll && user.roleId === sellerRole?.id && user.id !== target.ownerId)
    .map((user) => user.id);
  if (!eligibleIds.length) return;
  // Current locking read after User locks prevents an own/reset from resurrecting access.
  const sources = await SalesAccessGrant.findAll({
    where: {
      userId: eligibleIds, scopeType: source.scopeType, targetId: source.targetId,
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    }, transaction, lock: transaction.LOCK.UPDATE,
  });
  if (!sources.length) return;
  await SalesAccessGrant.bulkCreate(sources.map((grant) => ({
    userId: grant.userId, scopeType: target.scopeType, targetId: target.targetId,
    expiresAt: grant.expiresAt, grantedBy: grant.grantedBy,
  })), { transaction });
  await notifyUsers(sources.map((grant) => grant.userId), {
    tipo: 'acceso_compartido', titulo: `Acceso compartido: ${target.codigo}`,
    mensaje: `El registro compartido ahora incluye ${target.codigo}.`,
    href: target.scopeType === 'work_order' ? `/work-orders/${target.targetId}` : `/quotations/${target.targetId}`,
    workOrderId: target.scopeType === 'work_order' ? target.targetId : null,
    quotationId: target.scopeType === 'quotation' ? target.targetId : null,
    actorId,
  }, transaction);
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
  await sequelize.transaction(async (transaction) => {
    await User.findByPk(granteeId, { attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
    const grant = await SalesAccessGrant.findOne({ where: { id: grantId, userId: granteeId }, transaction });
    if (!grant) throw ApiError.notFound('Acceso no encontrado');
    const records: Array<Pick<SalesAccessRecord, 'scopeType' | 'targetId'>> = [grant];
    // Revoke the pair even if a target was soft deleted, so restoring it cannot restore access.
    // Keep the User lock first: linking also locks this user before propagating grants.
    if (grant.scopeType === 'work_order') {
      const quotations = await Quotation.findAll({
        where: { workOrderId: grant.targetId }, attributes: ['id'], paranoid: false, transaction,
      });
      records.push(...quotations.map((quotation) => ({ scopeType: 'quotation' as const, targetId: quotation.id })));
    } else {
      const quotation = await Quotation.findByPk(grant.targetId, {
        attributes: ['workOrderId'], paranoid: false, transaction,
      });
      if (quotation?.workOrderId) records.push({ scopeType: 'work_order', targetId: quotation.workOrderId });
    }
    await SalesAccessGrant.destroy({
      where: { userId: granteeId, [Op.or]: records.map(({ scopeType, targetId }) => ({ scopeType, targetId })) },
      transaction,
    });
  });
};

export const revokeRecordSalesAccessGrant = async (
  scopeType: SalesAccessScopeType,
  targetId: number,
  grantId: number,
): Promise<void> => {
  const grant = await SalesAccessGrant.findOne({ where: { id: grantId, scopeType, targetId } });
  if (!grant) throw ApiError.notFound('Acceso no encontrado');
  await revokeUserSalesAccessGrant(grant.userId, grant.id);
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
