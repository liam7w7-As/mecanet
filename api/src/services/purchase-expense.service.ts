import { createHash } from 'node:crypto';

import { expressMinimumSale, expressNetSale } from '@unithor/shared';
import { Op, UniqueConstraintError } from 'sequelize';

import { removeStoredFile } from './file-storage.service.js';
import { hasPermission } from './permission.service.js';
import {
  assertPurchaseVisible,
  createCashMovement,
  getPurchaseById,
  resolveSupplier,
  storePurchaseReceipt,
} from './purchase.service.js';
import { revokeFinalQuality } from './work-order-quality-state.js';
import { assertWorkOrderAccess, syncMirrorQuotationFromWorkOrder } from './work-order.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { FleetVehicle } from '../models/FleetVehicle.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseItem } from '../models/PurchaseItem.js';
import { Quotation } from '../models/Quotation.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { ApiError } from '../utils/ApiError.js';
import { generatePurchaseCode } from '../utils/generateCode.js';
import { plateSearch } from '../utils/plate-search.js';

import type { PurchaseViewer } from './purchase.service.js';
import type { CompleteExpressExpenseInput, CreateExpressExpenseInput } from '@unithor/shared';

export async function listExpenseFleetVehicles(search?: string) {
  const pattern = `%${search ?? ''}%`;
  const results = await FleetVehicle.findAll({
    attributes: ['id', 'patente', 'marca', 'modelo'],
    where: search
      ? {
          [Op.or]: [
            plateSearch('patente', search),
            { marca: { [Op.like]: pattern } },
            { modelo: { [Op.like]: pattern } },
          ],
        }
      : undefined,
    order: [['patente', 'ASC']],
    limit: 12,
  });
  return results.map(({ id, patente, marca, modelo }) => ({ id, patente, marca, modelo }));
}

const receiptFields = (receipt: Awaited<ReturnType<typeof storePurchaseReceipt>>) => ({
  comprobanteNombre: receipt.nombre,
  comprobanteStorageKey: receipt.storageKey,
  comprobanteMimeType: receipt.mimeType,
  comprobanteSizeBytes: receipt.sizeBytes,
});

export async function createExpressExpense(
  data: CreateExpressExpenseInput,
  viewer: PurchaseViewer,
  file?: Express.Multer.File,
) {
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const retry = (purchase: Purchase) => {
    if (
      purchase.createdBy !== viewer.id ||
      purchase.expressFingerprint !== fingerprint ||
      purchase.estado !== 'registrada'
    ) {
      throw ApiError.conflict('Esta captura ya fue registrada. Revisa el historial');
    }
    return purchase.id;
  };
  const existing = await Purchase.findOne({ where: { expressKey: data.operationKey } });
  if (existing) return getPurchaseById(retry(existing), viewer);
  if (data.destino === 'flota' && !(await hasPermission(viewer.id, 'flota', 'read'))) {
    throw ApiError.forbidden('No tienes acceso a los vehículos de Flota');
  }
  const receipt = file ? await storePurchaseReceipt(file) : null;
  let usedReceipt = false;
  try {
    const created = await withWorkshopTransaction(async (transaction) => {
      const repeated = await Purchase.findOne({
        where: { expressKey: data.operationKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (repeated) return { id: retry(repeated), inserted: false };
      const fleetVehicleId = data.destino === 'flota' ? data.fleetVehicleId : null;
      if (
        fleetVehicleId &&
        !(await FleetVehicle.findByPk(fleetVehicleId, {
          transaction,
          lock: transaction.LOCK.SHARE,
        }))
      ) {
        throw ApiError.badRequest('Selecciona un vehículo de Flota válido');
      }
      const codigo = await generatePurchaseCode(transaction);
      const supplier = await resolveSupplier(
        { proveedorNombre: data.proveedorNombre || 'Proveedor sin identificar' },
        transaction,
      );
      const movement = await createCashMovement(
        {
          categoria: 'gasto_operativo',
          ledger: data.destino,
          monto: data.monto,
          metodo: data.metodoPago,
          descripcion: data.concepto,
          referencia: codigo,
          userId: viewer.id,
        },
        transaction,
      );
      const purchase = await Purchase.create(
        {
          codigo,
          expressKey: data.operationKey,
          expressFingerprint: fingerprint,
          expressDestination: data.destino,
          supplierId: supplier.id,
          vehicleId: null,
          fleetVehicleId,
          workOrderId: null,
          origenVehiculo: fleetVehicleId ? 'flota' : null,
          conIva: false,
          neto: data.monto,
          iva: 0,
          total: data.monto,
          formaPago: 'contado',
          metodoPago: data.metodoPago,
          estado: 'registrada',
          tipoDocumento: data.tipoDocumento ?? 'otro',
          folio: data.folio || codigo,
          fechaEmision: data.fechaEmision ?? new Date().toISOString().slice(0, 10),
          montoComprobante: data.monto,
          numeroOperacion: '',
          banco: '',
          observaciones: data.detalle ?? null,
          ...(receipt
            ? receiptFields(receipt)
            : {
                comprobanteNombre: '',
                comprobanteStorageKey: '',
                comprobanteMimeType: '',
                comprobanteSizeBytes: 0,
              }),
          cashMovementId: movement.id,
          pagadoAt: movement.fecha,
          createdBy: viewer.id,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
        },
        { transaction },
      );
      await PurchaseItem.create(
        {
          purchaseId: purchase.id,
          descripcion: data.concepto,
          cantidad: 1,
          precioUnitario: data.monto,
          subtotal: data.monto,
          catalogItemId: null,
          warehouseId: null,
        },
        { transaction },
      );
      return { id: purchase.id, inserted: true };
    });
    usedReceipt = created.inserted;
    return await getPurchaseById(created.id, viewer);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const repeated = await Purchase.findOne({ where: { expressKey: data.operationKey } });
      if (repeated) return getPurchaseById(retry(repeated), viewer);
    }
    throw error;
  } finally {
    if (receipt && !usedReceipt) await removeStoredFile(receipt.storageKey, false);
  }
}

export async function completeExpressExpense(
  id: number,
  data: CompleteExpressExpenseInput,
  viewer: PurchaseViewer,
  file?: Express.Multer.File,
) {
  const visible = await getPurchaseById(id, viewer);
  if (visible.expressDestination !== 'taller' || visible.estado !== 'registrada')
    throw ApiError.badRequest('Esta compra no admite completar datos');
  if (visible.expressCompletedAt) return visible;
  if (data.workOrderId) await assertWorkOrderAccess(data.workOrderId, viewer.id);
  const receipt = file ? await storePurchaseReceipt(file) : null;
  let usedReceipt = false;
  try {
    const result = await withWorkshopTransaction(async (transaction) => {
      const order = data.workOrderId
        ? await WorkOrder.findByPk(data.workOrderId, { transaction, lock: transaction.LOCK.UPDATE })
        : null;
      if (
        data.workOrderId &&
        (!order || !order.vehicleId || ['entregada', 'cancelada'].includes(order.estado))
      ) {
        throw ApiError.badRequest('Selecciona una OT abierta');
      }
      if (order && data.ventaUnitario !== undefined) {
        const quotation = await Quotation.findOne({
          where: { workOrderId: order.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!quotation || quotation.estadoPago === 'total')
          throw ApiError.badRequest(
            'La OT necesita una cotización pendiente de pago para agregar un cobro',
          );
      }
      const purchase = await Purchase.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      assertPurchaseVisible(purchase, viewer);
      if (purchase.expressCompletedAt) return { usedReceipt: false, previous: null };
      if (purchase.expressDestination !== 'taller' || purchase.estado !== 'registrada')
        throw ApiError.badRequest('Esta compra no admite completar datos');
      const line = await PurchaseItem.findOne({
        where: { purchaseId: id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!line) throw ApiError.conflict('No se encontró el concepto de la compra');
      if (order) {
        await line.update({ workOrderId: order.id }, { transaction });
        if (data.ventaUnitario !== undefined) {
          const minimum = expressMinimumSale(Number(purchase.total));
          if (data.ventaUnitario < minimum)
            throw ApiError.badRequest(
              'La venta debe ser al menos un 25% mayor al precio de compra',
            );
          const sale = expressNetSale(data.ventaUnitario);
          const item = await WorkOrderItem.create(
            {
              workOrderId: order.id,
              tipoLinea: 'parte',
              division: 'ACC',
              subtipo: 'a_pedido',
              esAPedido: true,
              catalogItemId: null,
              descripcion: line.descripcion,
              cantidad: 1,
              unidadMedida: 'unidad',
              precioUnitario: sale,
              subtotal: sale,
              estadoOperativo: 'pendiente',
              expressPurchaseId: purchase.id,
              minimumSalePrice: expressNetSale(minimum),
              notasOperativas: data.detalle ?? null,
            },
            { transaction },
          );
          await line.update(
            { workOrderItemId: item.id, ventaUnitario: sale, expressCreatedItem: true },
            { transaction },
          );
          await revokeFinalQuality(
            order.id,
            viewer.id,
            'Compra express vinculada a un accesorio',
            transaction,
          );
          await syncMirrorQuotationFromWorkOrder(order.id, transaction);
        }
        await WorkOrderEvent.create(
          {
            workOrderId: order.id,
            actorUserId: viewer.id,
            tipo: 'actualizacion',
            descripcion: `Gasto de Taller vinculado · ${purchase.codigo}`,
            metadata: { purchaseId: id, conCobro: data.ventaUnitario !== undefined },
          },
          { transaction },
        );
      }
      const previous = receipt ? purchase.comprobanteStorageKey : null;
      await purchase.update(
        {
          expressCompletedAt: new Date(),
          ...(order
            ? { workOrderId: order.id, vehicleId: order.vehicleId, origenVehiculo: 'taller' }
            : {}),
          ...(data.detalle !== undefined ? { observaciones: data.detalle } : {}),
          ...(receipt ? receiptFields(receipt) : {}),
        },
        { transaction },
      );
      return { usedReceipt: Boolean(receipt), previous };
    });
    usedReceipt = result.usedReceipt;
    if (result.previous) await removeStoredFile(result.previous, false);
    return await getPurchaseById(id, viewer);
  } finally {
    if (receipt && !usedReceipt) await removeStoredFile(receipt.storageKey, false);
  }
}
