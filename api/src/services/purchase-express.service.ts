import { createHash } from 'node:crypto';

import {
  expressMinimumSale,
  expressNetSale,
  getQuotationGrossTotal,
  PURCHASE_TAX_RATE,
} from '@unithor/shared';
import { Op, Transaction } from 'sequelize';

import { removeStoredFile } from './file-storage.service.js';
import { purchaseScannerConfigured } from './purchase-scan.service.js';
import {
  createCashMovement,
  getPurchaseById,
  resolveSupplier,
  storePurchaseReceipt,
} from './purchase.service.js';
import { getSalesScope, workOrderWhere } from './sales-access.service.js';
import { revokeFinalQuality } from './work-order-quality-state.js';
import { assertWorkOrderAccess, syncMirrorQuotationFromWorkOrder } from './work-order.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseItem } from '../models/PurchaseItem.js';
import { Quotation } from '../models/Quotation.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';
import { ApiError } from '../utils/ApiError.js';
import { generatePurchaseCode } from '../utils/generateCode.js';
import { plateSearch } from '../utils/plate-search.js';

import type {
  CreateExpressPurchaseSubmission,
  CreatePurchaseInput,
  ExpressOrderOption,
  ExpressPurchaseRequest,
} from '@unithor/shared';
import type { WhereOptions } from 'sequelize';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const orderIncludes = [
  {
    model: Vehicle,
    as: 'vehicle',
    required: true,
    attributes: ['id', 'patente', 'marca', 'modelo'],
  },
  { model: Client, as: 'client', attributes: ['id', 'nombre'], required: false },
  {
    model: Quotation,
    as: 'quotation',
    required: true,
    attributes: ['id', 'estadoPago'],
    where: { estadoPago: { [Op.ne]: 'total' } },
  },
];
const orderOption = (order: WorkOrder): ExpressOrderOption => ({
  id: order.id,
  codigo: order.codigo,
  estado: order.estado,
  vehicleId: order.vehicleId!,
  patente: order.vehicle?.patente ?? '',
  vehiculo: [order.vehicle?.marca, order.vehicle?.modelo].filter(Boolean).join(' '),
  cliente: order.client?.nombre ?? null,
});
export async function listExpressOrders(search: string | undefined, userId: number) {
  const scope = await getSalesScope(userId);
  const conditions: WhereOptions<WorkOrder>[] = [
    workOrderWhere(scope),
    { estado: { [Op.notIn]: ['entregada', 'cancelada'] } },
  ];
  if (search)
    conditions.push({
      [Op.or]: [{ codigo: { [Op.like]: `%${search}%` } }, plateSearch('vehicle.patente', search)],
    } as WhereOptions<WorkOrder>);
  const rows = await WorkOrder.findAll({
    where: { [Op.and]: conditions },
    include: orderIncludes,
    order: [['id', 'DESC']],
    limit: 12,
    subQuery: false,
  });
  const allowed: ExpressOrderOption[] = [];
  for (const order of rows) {
    try {
      await assertWorkOrderAccess(order.id, userId);
      allowed.push(orderOption(order));
    } catch {
      /* Respect assigned-order visibility. */
    }
  }
  return { items: allowed };
}
export async function listExpressRequests(search: string | undefined, userId: number) {
  const scope = await getSalesScope(userId);
  const conditions: WhereOptions<WorkOrder>[] = [
    workOrderWhere(scope),
    { estado: { [Op.notIn]: ['entregada', 'cancelada'] } },
  ];
  const rows = await WorkOrderRequest.findAll({
    where: {
      tipo: 'repuesto',
      estado: { [Op.in]: ['pendiente', 'aprobada'] },
      ...(search
        ? {
            [Op.or]: [
              { '$workOrder.codigo$': { [Op.like]: `%${search}%` } },
              plateSearch('workOrder->vehicle.patente', search),
            ],
          }
        : {}),
    },
    include: [
      {
        model: WorkOrder,
        as: 'workOrder',
        required: true,
        where: { [Op.and]: conditions },
        include: orderIncludes,
      },
      { model: CatalogItem, as: 'catalogItem', required: true },
      { model: User, as: 'requester', attributes: ['id', 'nombre'] },
      { model: WorkOrderItem, as: 'workOrderItem', required: false },
    ],
    order: [['id', 'DESC']],
    limit: 80,
    subQuery: false,
  });
  const used = rows.length
    ? await PurchaseItem.findAll({
        attributes: ['sourceRequestId'],
        where: { sourceRequestId: { [Op.in]: rows.map((row) => row.id) } },
        include: [
          {
            model: Purchase,
            as: 'purchase',
            attributes: ['id'],
            required: true,
            where: { estado: 'registrada' },
          },
        ],
      })
    : [];
  const usedIds = new Set(used.map((item) => item.sourceRequestId));
  const items: ExpressPurchaseRequest[] = [];
  for (const row of rows) {
    if (!row.workOrder || !row.catalogItem || usedIds.has(row.id)) continue;
    if (row.workOrderItem?.entregadoBodega || row.workOrderItem?.stockConsumido) continue;
    try {
      await assertWorkOrderAccess(row.workOrder.id, userId);
    } catch {
      continue;
    }
    items.push({
      id: row.id,
      estado: row.estado,
      descripcion: row.catalogItem.nombre,
      cantidad: Number(row.cantidad ?? 1),
      detalle: row.motivo,
      solicitadoPor: row.requester?.nombre ?? null,
      createdAt: row.createdAt.toISOString(),
      order: orderOption(row.workOrder),
      porComprar:
        row.estado === 'aprobada' &&
        (row.catalogItem.subtipo === 'a_pedido' || Number(row.catalogItem.stock) <= 0),
    });
  }
  return { items, scannerConfigured: purchaseScannerConfigured() };
}

export async function createExpressPurchase(
  data: CreateExpressPurchaseSubmission,
  userId: number,
  file?: Express.Multer.File,
) {
  // Hash the original submission: legacy operation keys must retain their exact fingerprint.
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const lines = ('items' in data ? data.items : [data]).map((line) => ({
    ...line,
    workOrderId: line.workOrderId ?? data.workOrderId,
  }));
  if (!lines.length) throw ApiError.badRequest('Agrega al menos un accesorio a la compra');
  const orderIds = [...new Set([data.workOrderId, ...lines.map((line) => line.workOrderId)])].sort(
    (a, b) => a - b,
  );
  const requestIds = new Set<number>();
  for (const line of lines) {
    if (!line.requestId) continue;
    if (requestIds.has(line.requestId))
      throw ApiError.conflict('La solicitud aparece más de una vez en esta compra');
    requestIds.add(line.requestId);
  }
  const grossCents = lines.map((line) => Math.round(line.costoUnitario * line.cantidad * 100));
  const totalCents = grossCents.reduce((sum, value) => sum + value, 0);
  const netCents = data.conIva ? Math.round(totalCents / (1 + PURCHASE_TAX_RATE)) : totalCents;
  const exactNetCents = grossCents.map((value) =>
    data.conIva ? value / (1 + PURCHASE_TAX_RATE) : value,
  );
  const lineNetCents = exactNetCents.map(Math.floor);
  // Allocate the header's rounding cents to the largest remainders, keeping every line in cents.
  const remainderOrder = exactNetCents
    .map((value, index) => ({ index, remainder: value - lineNetCents[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const roundingCents = netCents - lineNetCents.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < roundingCents; index += 1)
    lineNetCents[remainderOrder[index].index] += 1;
  const total = totalCents / 100;
  const neto = netCents / 100;
  const assertRetry = (purchase: Purchase) => {
    if (
      purchase.createdBy !== userId ||
      purchase.workOrderId !== data.workOrderId ||
      purchase.expressFingerprint !== fingerprint ||
      purchase.estado !== 'registrada'
    ) {
      throw ApiError.conflict(
        'Esta captura ya se registró con otros datos o fue anulada. Revisa el historial antes de empezar otra compra.',
      );
    }
  };
  for (const orderId of orderIds) await assertWorkOrderAccess(orderId, userId);
  const previous = await Purchase.findOne({ where: { expressKey: data.operationKey } });
  if (previous) {
    assertRetry(previous);
    return getPurchaseById(previous.id);
  }
  const receipt = file ? await storePurchaseReceipt(file) : null;
  let committed = false;
  try {
    const id = await withWorkshopTransaction(async (transaction) => {
      // Acquire every OT lock in the same order, regardless of the submitted line order.
      const orders = new Map<number, WorkOrder>();
      for (const orderId of orderIds) {
        const order = await WorkOrder.findByPk(orderId, {
          transaction,
          lock: Transaction.LOCK.UPDATE,
        });
        if (!order || order.vehicleId === null)
          throw ApiError.badRequest('La OT no tiene un vehículo válido');
        orders.set(orderId, order);
      }
      const repeated = await Purchase.findOne({
        where: { expressKey: data.operationKey },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (repeated) {
        assertRetry(repeated);
        return repeated.id;
      }
      for (const order of orders.values()) {
        if (['entregada', 'cancelada'].includes(order.estado))
          throw ApiError.badRequest('La OT está cerrada. No se registró ningún egreso.');
        const quotation = await Quotation.findOne({
          where: { workOrderId: order.id },
          transaction,
          lock: Transaction.LOCK.UPDATE,
        });
        if (!quotation || quotation.estadoPago === 'total')
          throw ApiError.badRequest(
            'La OT necesita una cotización vinculada y pendiente de pago. No se registró ningún egreso.',
          );
      }
      const order = orders.get(data.workOrderId)!;
      const codigo = await generatePurchaseCode(transaction);
      const supplier = await resolveSupplier(
        {
          proveedorNombre: data.proveedorNombre?.trim() || `Proveedor por identificar · ${codigo}`,
        } as CreatePurchaseInput,
        transaction,
      );
      const itemIds = new Set<number>();
      const prepared: Array<{
        line: (typeof lines)[number];
        item: WorkOrderItem;
        request: WorkOrderRequest | null;
        venta: number;
        previousSale: number | null;
        createdItem: boolean;
      }> = [];
      for (const line of lines) {
        let item: WorkOrderItem | null = null;
        let request: WorkOrderRequest | null = null;
        if (line.requestId) {
          request = await WorkOrderRequest.findOne({
            where: { id: line.requestId, workOrderId: line.workOrderId, tipo: 'repuesto' },
            transaction,
            lock: Transaction.LOCK.UPDATE,
          });
          if (!request || request.estado !== 'aprobada' || !request.workOrderItemId)
            throw ApiError.badRequest(
              'La solicitud debe estar aprobada y vinculada a un accesorio de esta OT',
            );
          if (itemIds.has(request.workOrderItemId))
            throw ApiError.conflict('El accesorio aparece más de una vez en esta compra');
          item = await WorkOrderItem.findOne({
            where: { id: request.workOrderItemId, workOrderId: line.workOrderId },
            transaction,
            lock: Transaction.LOCK.UPDATE,
          });
          if (
            !item ||
            item.entregadoBodega ||
            item.stockConsumido ||
            ['completado', 'omitido'].includes(item.estadoOperativo)
          )
            throw ApiError.conflict('El accesorio ya fue entregado o no admite una compra');
          if (Number(request.cantidad) !== line.cantidad || Number(item.cantidad) !== line.cantidad)
            throw ApiError.badRequest(
              `La compra debe cubrir la cantidad completa: solicitud aprobada ${Number(request.cantidad)}, accesorio en la OT ${Number(item.cantidad)}, compra ${line.cantidad}. ` +
                'Actualiza la solicitud y la OT para que las cantidades coincidan y vuelve a cargar la compra. No se registró ninguna compra ni egreso.',
            );
          const existing = await PurchaseItem.findOne({
            where: { [Op.or]: [{ workOrderItemId: item.id }, { sourceRequestId: request.id }] },
            transaction,
            include: [
              { model: Purchase, as: 'purchase', required: true, where: { estado: 'registrada' } },
            ],
          });
          if (existing) throw ApiError.conflict('Este accesorio ya tiene una compra registrada');
        }
        const venta = expressNetSale(line.ventaUnitario, line.cantidad);
        const previousSale = item ? Number(item.precioUnitario) : null;
        const createdItem = !item;
        const pricing = {
          precioUnitario: venta,
          subtotal: money(venta * line.cantidad),
          minimumSalePrice: expressNetSale(expressMinimumSale(line.costoUnitario), line.cantidad),
        };
        if (item) {
          await item.update(pricing, { transaction });
        } else {
          item = await WorkOrderItem.create(
            {
              workOrderId: line.workOrderId,
              catalogItemId: null,
              tipoLinea: 'parte',
              division: 'ACC',
              subtipo: 'a_pedido',
              esAPedido: true,
              descripcion: line.descripcion,
              cantidad: line.cantidad,
              unidadMedida: 'unidad',
              ...pricing,
              estadoOperativo: 'pendiente',
              notasOperativas: line.detalle ?? null,
            },
            { transaction },
          );
        }
        itemIds.add(item.id);
        if (request) await request.update({ precioAprobado: venta }, { transaction });
        prepared.push({ line, item, request, venta, previousSale, createdItem });
      }
      const affectedOrderIds = new Set(lines.map((line) => line.workOrderId));
      for (const orderId of orderIds) {
        if (!affectedOrderIds.has(orderId)) continue;
        await revokeFinalQuality(
          orderId,
          userId,
          'Compra express vinculada a un accesorio',
          transaction,
        );
        // Validate margins after all new prices are present, including the final general discount.
        await syncMirrorQuotationFromWorkOrder(orderId, transaction);
      }
      const purchase = await Purchase.create(
        {
          codigo,
          expressKey: data.operationKey,
          expressFingerprint: fingerprint,
          supplierId: supplier.id,
          vehicleId: order.vehicleId,
          fleetVehicleId: null,
          workOrderId: order.id,
          origenVehiculo: 'taller',
          conIva: data.conIva,
          neto,
          iva: money(total - neto),
          total,
          formaPago: 'contado',
          metodoPago: data.metodoPago,
          estado: 'registrada',
          tipoDocumento: data.tipoDocumento,
          folio: data.folio || codigo,
          fechaEmision: data.fechaEmision ?? new Date().toISOString().slice(0, 10),
          montoComprobante: total,
          numeroOperacion: '',
          banco: '',
          comprobanteNombre: receipt?.nombre ?? 'Sin foto · registro manual',
          comprobanteStorageKey: receipt?.storageKey ?? '',
          comprobanteMimeType: receipt?.mimeType ?? '',
          comprobanteSizeBytes: receipt?.sizeBytes ?? 0,
          observaciones: data.detalle ?? null,
          cashMovementId: null,
          pagadoAt: new Date(),
          createdBy: userId,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
        },
        { transaction },
      );
      for (const [index, entry] of prepared.entries()) {
        const { line, item, request, venta, previousSale, createdItem } = entry;
        const lineNeto = lineNetCents[index] / 100;
        await PurchaseItem.create(
          {
            purchaseId: purchase.id,
            workOrderId: line.workOrderId,
            sourceRequestId: request?.id ?? null,
            workOrderItemId: item.id,
            catalogItemId: item.catalogItemId,
            descripcion: line.descripcion,
            cantidad: line.cantidad,
            precioUnitario: money(lineNeto / line.cantidad),
            subtotal: lineNeto,
            ventaUnitario: venta,
            previousSalePrice: previousSale,
            expressCreatedItem: createdItem,
            afectaStock: false,
            warehouseId: null,
          },
          { transaction },
        );
        await item.update({ expressPurchaseId: purchase.id }, { transaction });
        await WorkOrderEvent.create(
          {
            workOrderId: line.workOrderId,
            actorUserId: userId,
            tipo: 'actualizacion',
            descripcion: `Compra express ${codigo}: ${line.descripcion}`.slice(0, 255),
            metadata: {
              purchaseId: purchase.id,
              requestId: request?.id,
              itemId: item.id,
              ventaUnitario: venta,
              totalCliente: getQuotationGrossTotal(venta * line.cantidad),
            },
          },
          { transaction },
        );
      }
      const movement = await createCashMovement(
        {
          categoria: 'compra_repuesto',
          monto: total,
          metodo: data.metodoPago,
          descripcion: `Compra express ${codigo} · ${order.codigo} · ${'items' in data ? `${lines.length} accesorios` : data.descripcion}`,
          referencia: codigo,
          userId,
        },
        transaction,
      );
      await purchase.update({ cashMovementId: movement.id }, { transaction });
      return purchase.id;
    });
    committed = true;
    // A concurrent retry can win after this request stored its photo; remove only the unused upload.
    if (receipt) {
      const stored = await Purchase.findByPk(id, { attributes: ['comprobanteStorageKey'] });
      if (stored?.comprobanteStorageKey !== receipt.storageKey)
        await removeStoredFile(receipt.storageKey, false);
    }
    return await getPurchaseById(id);
  } finally {
    if (!committed && receipt) await removeStoredFile(receipt.storageKey, false);
  }
}
