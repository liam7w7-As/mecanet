import { Op } from 'sequelize';

import { getPurchaseById } from './purchase.service.js';
import { registerMovement } from './warehouse.service.js';
import { assertWorkOrderAccess, syncMirrorQuotationFromWorkOrder } from './work-order.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseItem } from '../models/PurchaseItem.js';
import { Quotation } from '../models/Quotation.js';
import { Warehouse } from '../models/Warehouse.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';
import { ApiError } from '../utils/ApiError.js';

/** Return unused goods, preserving both the paid expense and all workshop history. */
export async function returnExpressPurchaseToStock(id: number, motivo: string, userId: number, itemIds?: number[]) {
  if (itemIds !== undefined && (!Array.isArray(itemIds) || !itemIds.length || itemIds.some((itemId) => !Number.isSafeInteger(itemId) || itemId <= 0))) {
    throw ApiError.badRequest('Selecciona al menos un producto válido para enviar a stock');
  }
  const selectedIds = itemIds === undefined ? undefined : new Set(itemIds);
  const source = await Purchase.findByPk(id, { attributes: ['id', 'workOrderId', 'expressKey'] });
  if (!source) throw ApiError.notFound('Compra no encontrada');
  if (!source.expressKey) throw ApiError.badRequest('Esta acción corresponde a una compra express de taller');
  // Discover the target OTs before locking: every OT, then every quotation, then the purchase/lines.
  const snapshot = await PurchaseItem.findAll({ where: { purchaseId: id }, order: [['id', 'ASC']] });
  const assertSelection = (lines: PurchaseItem[]) => {
    if (selectedIds && [...selectedIds].some((itemId) => !lines.some((line) => line.id === itemId))) {
      throw ApiError.badRequest('Los productos seleccionados deben pertenecer a esta compra');
    }
    if (!lines.length) throw ApiError.conflict('La compra no tiene un accesorio para enviar a stock');
  };
  assertSelection(snapshot);
  // Legacy callers select every line for access checks, even when the retry is a no-op.
  const targets = snapshot.filter((line) => !selectedIds || selectedIds.has(line.id));
  const targetOrders = new Map(targets.map((line) => [line.id, line.workOrderId ?? source.workOrderId]));
  if ([...targetOrders.values()].some((orderId) => orderId == null)) {
    throw ApiError.conflict('El producto no tiene una OT vinculada');
  }
  const orderIds = [...new Set([...targetOrders.values()].filter((orderId): orderId is number => orderId != null))].sort((a, b) => a - b);
  for (const orderId of orderIds) await assertWorkOrderAccess(orderId, userId);
  await withWorkshopTransaction(async (transaction) => {
    const orders = new Map<number, WorkOrder | null>();
    const quotations = new Map<number, Quotation | null>();
    for (const orderId of orderIds) {
      orders.set(orderId, await WorkOrder.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE }));
    }
    for (const orderId of orderIds) {
      quotations.set(orderId, await Quotation.findOne({ where: { workOrderId: orderId }, transaction, lock: transaction.LOCK.UPDATE }));
    }
    const purchase = await Purchase.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!purchase || !purchase.expressKey || purchase.estado !== 'registrada') {
      throw ApiError.conflict('La compra debe estar vigente y vinculada a su OT y cotización');
    }
    const lines = await PurchaseItem.findAll({ where: { purchaseId: id }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    assertSelection(lines);
    const pending = lines.filter((line) => (!selectedIds || selectedIds.has(line.id)) && !line.stockReturnedAt);
    const affectedOrderIds = new Set<number>();
    for (const line of pending) {
      const orderId = line.workOrderId ?? purchase.workOrderId;
      if (orderId == null || targetOrders.get(line.id) !== orderId) {
        throw ApiError.conflict('El vínculo del producto cambió. Revisa la compra antes de enviarlo a stock');
      }
      const order = orders.get(orderId);
      const quotation = quotations.get(orderId);
      if (!order || !quotation) throw ApiError.conflict('La compra debe estar vigente y vinculada a su OT y cotización');
      if (['entregada', 'cancelada'].includes(order.estado) || quotation.estadoPago === 'total') {
        throw ApiError.conflict('La OT está cerrada o la cotización está pagada. Regulariza el cobro antes de retirar el accesorio');
      }
      affectedOrderIds.add(orderId);
    }
    if (!pending.length) return;
    const [warehouse] = await Warehouse.findOrCreate({
      where: { codigo: 'CENTRAL' },
      defaults: { codigo: 'CENTRAL', nombre: 'Stock general', direccion: null, activo: true },
      transaction,
    });
    if (!warehouse.activo) throw ApiError.conflict('El stock general está inactivo. Administración debe reactivarlo antes de registrar el ingreso');
    const discountsByOrder = new Map<number, Map<number, { descuentoTipo: null; descuentoValor: number }>>();
    for (const line of pending) {
      const orderId = (line.workOrderId ?? purchase.workOrderId)!;
      const item = line.workOrderItemId ? await WorkOrderItem.findOne({
        where: { id: line.workOrderItemId, workOrderId: orderId }, transaction, lock: transaction.LOCK.UPDATE,
      }) : null;
      if (!item || item.expressPurchaseId !== id || Number(item.cantidad) !== Number(line.cantidad)) {
        throw ApiError.conflict('El vínculo o la cantidad del accesorio cambió. Revisa la OT antes de enviarlo a stock');
      }
      if (item.stockConsumido || item.estadoOperativo === 'completado') {
        throw ApiError.conflict('El accesorio ya fue utilizado. Solo se pueden enviar a stock accesorios sin usar');
      }
      const active = await WorkOrderItemSession.count({ where: { workOrderItemId: item.id, status: 'abierta' }, transaction });
      if (active) throw ApiError.conflict('Pausa el trabajo antes de enviar el accesorio a stock. Sus horas e historial se conservarán');
      let catalog = line.catalogItemId ? await CatalogItem.findByPk(line.catalogItemId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
      if (!catalog) {
        catalog = await CatalogItem.create({
          tipo: 'parte', division: 'ACC', subtipo: 'en_stock', codigo: `EXP-${purchase.id}-${line.id}`,
          nombre: line.descripcion.slice(0, 180), descripcion: line.descripcion, unidadMedida: item.unidadMedida,
          precio: Number(line.ventaUnitario ?? item.precioUnitario), stock: 0, horasHombreEstandar: null,
        }, { transaction });
      }
      if (catalog.tipo !== 'parte' || catalog.division !== 'ACC') throw ApiError.conflict('El accesorio debe pertenecer al catálogo ACC');
      await registerMovement({ catalogItemId: catalog.id, warehouseId: warehouse.id, tipo: 'ingreso',
        cantidad: Number(line.cantidad), motivo: `Compra ${purchase.codigo} no utilizada: ${motivo}`.slice(0, 255),
      }, userId, { transaction, referencia: `EXP-STOCK-${id}-${line.id}` });
      const returnedAt = new Date();
      await item.update({ estadoOperativo: 'omitido', precioUnitario: 0, subtotal: 0, minimumSalePrice: null, expressStockReturnedAt: returnedAt }, { transaction });
      const discounts = discountsByOrder.get(orderId) ?? new Map<number, { descuentoTipo: null; descuentoValor: number }>();
      discounts.set(item.id, { descuentoTipo: null, descuentoValor: 0 });
      discountsByOrder.set(orderId, discounts);
      await WorkOrderRequest.update({ estado: 'cancelada', reviewNote: `Accesorio enviado al stock general: ${motivo}` }, {
        where: { workOrderItemId: item.id, tipo: 'repuesto', estado: { [Op.in]: ['pendiente', 'aprobada', 'entregada'] } }, transaction,
      });
      await line.update({ catalogItemId: catalog.id, warehouseId: warehouse.id,
        stockReturnedAt: returnedAt, stockReturnedBy: userId, stockReturnReason: motivo,
      }, { transaction });
    }
    for (const orderId of [...affectedOrderIds].sort((a, b) => a - b)) {
      await syncMirrorQuotationFromWorkOrder(orderId, transaction, false, { items: discountsByOrder.get(orderId) });
      await WorkOrderEvent.create({ workOrderId: orderId, actorUserId: userId, tipo: 'actualizacion',
        descripcion: `Compra ${purchase.codigo}: productos no utilizados enviados al stock general`,
        metadata: { purchaseId: id, warehouseId: warehouse.id, motivo, expensePreserved: true,
          itemIds: pending.filter((line) => (line.workOrderId ?? purchase.workOrderId) === orderId).map((line) => line.id) },
      }, { transaction });
    }
  });
  return getPurchaseById(id);
}
