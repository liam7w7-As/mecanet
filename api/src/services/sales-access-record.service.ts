import { Op } from 'sequelize';

import { Client } from '../models/Client.js';
import { Quotation } from '../models/Quotation.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';

import type { SalesAccessRecordsQuery, SalesAccessScopeType } from '@unithor/shared';
import type { Transaction } from 'sequelize';

export interface SalesAccessRecord {
  scopeType: SalesAccessScopeType;
  targetId: number;
  codigo: string;
}

export interface SalesAccessTarget extends SalesAccessRecord {
  clientName: string | null;
  patente: string | null;
  ownerName: string | null;
  ownerId: number | null;
  linkedRecord: SalesAccessRecord | null;
}

export const salesRecordKey = (record: Pick<SalesAccessRecord, 'scopeType' | 'targetId'>): string =>
  `${record.scopeType}:${record.targetId}`;

const recordIncludes = [
  { model: Client, as: 'client', attributes: ['nombre'], required: false },
  { model: Vehicle, as: 'vehicle', attributes: ['patente'], required: false },
];
const workOrderIncludes = [
  ...recordIncludes,
  { model: User, as: 'creator', attributes: ['nombre'], required: false },
];
const quotationIncludes = [
  ...recordIncludes,
  { model: User, as: 'asesor', attributes: ['nombre'], required: false },
];

/** Lock existing source records before User locks, matching quotation creation/conversion. */
export const lockSalesAccessTargets = async (
  records: Array<Pick<SalesAccessRecord, 'scopeType' | 'targetId'>>,
  transaction: Transaction,
): Promise<void> => {
  const workOrderIds = records.filter((record) => record.scopeType === 'work_order').map((record) => record.targetId);
  const quotationIds = records.filter((record) => record.scopeType === 'quotation').map((record) => record.targetId);
  if (workOrderIds.length) await WorkOrder.findAll({
    attributes: ['id'], where: { id: workOrderIds }, order: [['id', 'ASC']],
    transaction, lock: transaction.LOCK.UPDATE,
  });
  if (quotationIds.length) await Quotation.findAll({
    attributes: ['id'], where: { id: quotationIds }, order: [['id', 'ASC']],
    transaction, lock: transaction.LOCK.UPDATE,
  });
};

/** Loads targets and their active counterparts in at most four queries, regardless of batch size. */
export const loadSalesAccessTargets = async (
  records: Array<Pick<SalesAccessRecord, 'scopeType' | 'targetId'>>,
  transaction?: Transaction,
  includeDeleted = false,
): Promise<Map<string, SalesAccessTarget>> => {
  const workOrderIds = records.filter((record) => record.scopeType === 'work_order').map((record) => record.targetId);
  const quotationIds = records.filter((record) => record.scopeType === 'quotation').map((record) => record.targetId);
  const [workOrders, quotations] = await Promise.all([
    workOrderIds.length ? WorkOrder.findAll({
      where: { id: workOrderIds },
      attributes: ['id', 'codigo', 'createdBy', 'deletedAt'],
      include: workOrderIncludes,
      paranoid: !includeDeleted,
      transaction,
    }) : [],
    quotationIds.length ? Quotation.findAll({
      where: { id: quotationIds },
      attributes: ['id', 'codigo', 'asesorId', 'workOrderId', 'deletedAt'],
      include: quotationIncludes,
      paranoid: !includeDeleted,
      transaction,
    }) : [],
  ]);
  const linkedOrderIds = [...new Set(quotations.flatMap((quotation) => quotation.workOrderId ? [quotation.workOrderId] : []))];
  const [linkedOrders, linkedQuotations] = await Promise.all([
    linkedOrderIds.length ? WorkOrder.findAll({
      where: { id: linkedOrderIds },
      attributes: ['id', 'codigo', 'createdBy', 'deletedAt'],
      include: workOrderIncludes,
      transaction,
    }) : [],
    workOrderIds.length ? Quotation.findAll({
      where: { workOrderId: workOrderIds },
      attributes: ['id', 'codigo', 'asesorId', 'workOrderId', 'deletedAt'],
      include: quotationIncludes,
      order: [['id', 'ASC']],
      transaction,
    }) : [],
  ]);
  const orderMap = new Map([...workOrders, ...linkedOrders].map((order) => [order.id, order]));
  const quotationMap = new Map([...quotations, ...linkedQuotations].map((quotation) => [quotation.id, quotation]));
  const quotationByOrder = new Map<number, Quotation>();
  for (const quotation of [...quotationMap.values()].sort((a, b) => a.id - b.id)) {
    if (!quotation.deletedAt && quotation.workOrderId && !quotationByOrder.has(quotation.workOrderId)) {
      quotationByOrder.set(quotation.workOrderId, quotation);
    }
  }
  const targets = new Map<string, SalesAccessTarget>();
  for (const order of orderMap.values()) {
    const linked = quotationByOrder.get(order.id);
    const target: SalesAccessTarget = {
      scopeType: 'work_order', targetId: order.id, codigo: order.codigo,
      clientName: order.client?.nombre ?? null, patente: order.vehicle?.patente ?? null,
      ownerName: order.creator?.nombre ?? null, ownerId: order.createdBy,
      linkedRecord: linked ? { scopeType: 'quotation', targetId: linked.id, codigo: linked.codigo } : null,
    };
    targets.set(salesRecordKey(target), target);
  }
  for (const quotation of quotationMap.values()) {
    const linked = quotation.workOrderId ? orderMap.get(quotation.workOrderId) : undefined;
    const target: SalesAccessTarget = {
      scopeType: 'quotation', targetId: quotation.id, codigo: quotation.codigo,
      clientName: quotation.client?.nombre ?? null, patente: quotation.vehicle?.patente ?? null,
      ownerName: quotation.asesor?.nombre ?? null, ownerId: quotation.asesorId,
      linkedRecord: linked && !linked.deletedAt ? { scopeType: 'work_order', targetId: linked.id, codigo: linked.codigo } : null,
    };
    targets.set(salesRecordKey(target), target);
  }
  return targets;
};

export const searchSalesAccessRecords = async (granteeId: number, query: SalesAccessRecordsQuery) => {
  const { scopeType, search, page, pageSize } = query;
  const where = search ? {
    [Op.or]: [
      { codigo: { [Op.like]: `%${search}%` } },
      { '$client.nombre$': { [Op.like]: `%${search}%` } },
      { '$vehicle.patente$': { [Op.like]: `%${search}%` } },
    ],
  } : {};
  const options = {
    where, limit: pageSize, offset: (page - 1) * pageSize,
    order: [['id', 'DESC']] as [string, string][],
    distinct: true, subQuery: false,
  };
  const result = scopeType === 'work_order'
    ? await WorkOrder.findAndCountAll({ ...options, attributes: ['id'], include: recordIncludes })
    : await Quotation.findAndCountAll({ ...options, attributes: ['id'], include: recordIncludes });
  const targets = await loadSalesAccessTargets(result.rows.map((row) => ({ scopeType, targetId: row.id })));
  const items = result.rows.flatMap((row) => {
    const target = targets.get(salesRecordKey({ scopeType, targetId: row.id }));
    return target ? [{
      scopeType, targetId: target.targetId, codigo: target.codigo,
      clientName: target.clientName, patente: target.patente, ownerName: target.ownerName,
      owned: target.ownerId === granteeId, linkedRecord: target.linkedRecord,
    }] : [];
  });
  return { items, total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) };
};
