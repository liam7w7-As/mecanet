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
export async function returnExpressPurchaseToStock(id: number, motivo: string, userId: number) {
  const source = await Purchase.findByPk(id, { attributes: ['id', 'workOrderId', 'expressKey'] });
  if (!source) throw ApiError.notFound('Compra no encontrada');
  if (!source.expressKey || !source.workOrderId) throw ApiError.badRequest('Esta acción corresponde a una compra express de taller');
  await assertWorkOrderAccess(source.workOrderId, userId);
  await withWorkshopTransaction(async (transaction) => {
    const order = await WorkOrder.findByPk(source.workOrderId!, { transaction, lock: transaction.LOCK.UPDATE });
    const quotation = await Quotation.findOne({ where: { workOrderId: source.workOrderId }, transaction, lock: transaction.LOCK.UPDATE });
    const purchase = await Purchase.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order || !quotation || !purchase || purchase.estado !== 'registrada') {
      throw ApiError.conflict('La compra debe estar vigente y vinculada a su OT y cotización');
    }
    const lines = await PurchaseItem.findAll({ where: { purchaseId: id }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    if (!lines.length) throw ApiError.conflict('La compra no tiene un accesorio para enviar a stock');
    if (lines.every((line) => line.stockReturnedAt !== null)) return;
    if (['entregada', 'cancelada'].includes(order.estado) || quotation.estadoPago === 'total') {
      throw ApiError.conflict('La OT está cerrada o la cotización está pagada. Regulariza el cobro antes de retirar el accesorio');
    }
    const [warehouse] = await Warehouse.findOrCreate({
      where: { codigo: 'CENTRAL' },
      defaults: { codigo: 'CENTRAL', nombre: 'Stock general', direccion: null, activo: true },
      transaction,
    });
    if (!warehouse.activo) throw ApiError.conflict('El stock general está inactivo. Administración debe reactivarlo antes de registrar el ingreso');
    const discounts = new Map<number, { descuentoTipo: null; descuentoValor: number }>();
    for (const line of lines) {
      if (line.stockReturnedAt) continue;
      const item = line.workOrderItemId ? await WorkOrderItem.findOne({
        where: { id: line.workOrderItemId, workOrderId: order.id }, transaction, lock: transaction.LOCK.UPDATE,
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
      discounts.set(item.id, { descuentoTipo: null, descuentoValor: 0 });
      await WorkOrderRequest.update({ estado: 'cancelada', reviewNote: `Accesorio enviado al stock general: ${motivo}` }, {
        where: { workOrderItemId: item.id, tipo: 'repuesto', estado: { [Op.in]: ['pendiente', 'aprobada', 'entregada'] } }, transaction,
      });
      await line.update({ catalogItemId: catalog.id, warehouseId: warehouse.id,
        stockReturnedAt: returnedAt, stockReturnedBy: userId, stockReturnReason: motivo,
      }, { transaction });
    }
    await syncMirrorQuotationFromWorkOrder(order.id, transaction, false, { items: discounts });
    await WorkOrderEvent.create({ workOrderId: order.id, actorUserId: userId, tipo: 'actualizacion',
      descripcion: `Compra ${purchase.codigo}: accesorio no utilizado enviado al stock general`,
      metadata: { purchaseId: id, warehouseId: warehouse.id, motivo, expensePreserved: true },
    }, { transaction });
  });
  return getPurchaseById(id);
}
