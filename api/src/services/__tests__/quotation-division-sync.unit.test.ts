import { calculateDpWorkQuote, createDefaultDpConfiguration, convertQuotationToWorkOrderSchema, quotationItemInputSchema, workOrderItemInputSchema } from '@unithor/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { ApiError } from '../../utils/ApiError.js';
import { calculateDpWorkPricing } from '../dp-configuration.service.js';
import { convertQuotationToWorkOrder, createQuotation, updateQuotation } from '../quotation.service.js';
import { consumeForWorkOrder, restoreForWorkOrder } from '../warehouse.service.js';
import { assertDpItemStatus, ensureDpStagesForItems } from '../work-order-dp-state.js';
import { ensureQuotationItemLinks, hasWorkItemHistory } from '../work-order-item-links.js';
import { createWorkOrderInTransaction, getWorkOrderById } from '../work-order.service.js';

import type { WorkOrderPublic } from '../work-order.service.js';
import type { CatalogDivision, CatalogSubtype, DpQuoteInput, QuotationItemInput } from '@unithor/shared';

const fixture = vi.hoisted(() => ({ transaction: { LOCK: { UPDATE: 'UPDATE' } } }));
vi.mock('../../config/database.js', () => ({ sequelize: { transaction: vi.fn(async (_options, run) => run(fixture.transaction)) } }));
vi.mock('../workshop-transaction.js', () => ({ withWorkshopTransaction: vi.fn(async (run) => run(fixture.transaction)) }));
vi.mock('../dp-configuration.service.js', () => ({ calculateDpWorkPricing: vi.fn() }));
vi.mock('../../models/CatalogItem.js', () => ({ CatalogItem: { findAll: vi.fn(), findByPk: vi.fn() } }));
vi.mock('../../models/Client.js', () => ({ Client: { findByPk: vi.fn() } }));
vi.mock('../../models/Payment.js', () => ({ Payment: { count: vi.fn() } }));
vi.mock('../../models/Quotation.js', () => ({ Quotation: { findOne: vi.fn(), findByPk: vi.fn(), create: vi.fn() } }));
vi.mock('../../models/QuotationItem.js', () => ({ QuotationItem: { findAll: vi.fn(), bulkCreate: vi.fn(), create: vi.fn(), destroy: vi.fn() } }));
vi.mock('../../models/User.js', () => ({ User: { findByPk: vi.fn() } }));
vi.mock('../../models/Vehicle.js', () => ({ Vehicle: { findByPk: vi.fn() } }));
vi.mock('../../models/WorkOrder.js', () => ({ WorkOrder: { findByPk: vi.fn() } }));
vi.mock('../../models/WorkOrderItem.js', () => ({ WorkOrderItem: { findAll: vi.fn(), create: vi.fn(), destroy: vi.fn() } }));
vi.mock('../../models/WorkOrderInspection.js', () => ({ WorkOrderInspection: {} }));
vi.mock('../../models/WorkOrderInspectionPhoto.js', () => ({ WorkOrderInspectionPhoto: {} }));
vi.mock('../customer-email-queue.service.js', () => ({ enqueueCustomerEmail: vi.fn(), enqueueWorkOrderProgress: vi.fn() }));
vi.mock('../notification.service.js', () => ({ notifyByType: vi.fn() }));
vi.mock('../sales-access-grant.service.js', () => ({ propagateLinkedSalesAccess: vi.fn() }));
vi.mock('../sales-access.service.js', () => ({ assertSalesWorkOrderAccess: vi.fn(), getSalesScope: vi.fn(), quotationWhere: () => ({}), scopeSalesAssociations: (includes: unknown) => includes }));
vi.mock('../warehouse.service.js', () => ({ consumeForWorkOrder: vi.fn(), restoreForWorkOrder: vi.fn() }));
vi.mock('../work-order-inspection-photo.service.js', () => ({ getInspectionPhoto: vi.fn() }));
vi.mock('../work-order-item-links.js', () => ({ assertWorkItemsRemovable: vi.fn(), hasWorkItemHistory: vi.fn(), ensureQuotationItemLinks: vi.fn(), itemIdentity: (item: { catalogItemId?: number | null; descripcion: string; tipoLinea: string; unidadMedida: string }) => JSON.stringify([item.catalogItemId ?? null, item.descripcion, item.tipoLinea, item.unidadMedida]) }));
vi.mock('../work-order-labor-events.js', () => ({ recordChecklistStatusChange: vi.fn() }));
vi.mock('../work-order-labor-sessions.js', () => ({ closeWorkOrderTimers: vi.fn() }));
vi.mock('../work-order-price-policy.js', () => ({ assertChiefPriceEditsAllowed: vi.fn() }));
vi.mock('../work-order-quality-state.js', () => ({ invalidateItemQuality: vi.fn(), revokeFinalQuality: vi.fn() }));
vi.mock('../work-order.service.js', () => ({ createWorkOrderInTransaction: vi.fn(), getWorkOrderById: vi.fn() }));
vi.mock('../work-order-dp-state.js', () => ({ assertDpItemStatus: vi.fn(), ensureDpStagesForItems: vi.fn(), getDpStages: vi.fn() }));
vi.mock('../work-order-division-actions.js', () => ({ ensureAccRequestsForItems: vi.fn() }));
vi.mock('../../utils/generateCode.js', () => ({ generateQuotationCode: vi.fn(async () => 'COT-26-1') }));

const quotationFixture = () => {
  const quotation = {
    id: 70, codigo: 'COT-26-1', workOrderId: null as number | null,
    clientId: 1, vehicleId: null, asesorId: 5, estadoPago: 'por_pagar',
    subtotal: 10000, total: 10000, pagado: 0, notas: null, archivedAt: null,
    descuentoTipo: null, descuentoValor: 0, formaPago: 'transferencia', validezDias: 5,
    createdAt: new Date(), updatedAt: new Date(), items: [] as QuotationItem[],
    update: vi.fn(async (payload: object) => Object.assign(quotation, payload)),
  };
  return quotation as unknown as Quotation;
};

const lineInput = (extra: Partial<QuotationItemInput> = {}): QuotationItemInput => ({
  descripcion: 'Reparación puerta', cantidad: 1, precioUnitario: 10000,
  tipoLinea: 'estandar', unidadMedida: 'unidad', estadoOperativo: 'pendiente', ...extra,
});

const dpSelection = (): DpQuoteInput => ({ configurationRevision: 1, bodyTypeId: 'hatchback', sizeId: 'S',
  pieceId: 'parachoque', positionId: 'F', scope: 'piece', operations: [{ operationId: 'painting_full' }] });
const dpSnapshot = () => calculateDpWorkQuote(createDefaultDpConfiguration(), dpSelection(), 1);

const lineFixture = (division: CatalogDivision, subtipo: CatalogSubtype, extra: Partial<QuotationItem> = {}): QuotationItem => {
  const line = {
    ...lineInput(), id: 71, quotationId: 70, workOrderItemId: 81 as number | null,
    catalogItemId: null, division, subtipo, subtotal: 10000,
    notasOperativas: null, descuentoTipo: null, descuentoValor: 0,
    ...extra,
    update: vi.fn(async (payload: object) => Object.assign(line, payload)),
    reload: vi.fn(async () => line),
  };
  return line as unknown as QuotationItem;
};

const workItemFixture = (line: QuotationItem): WorkOrderItem => {
  const item = {
    ...line, id: 81, workOrderId: 80, horasHombreEstimadas: 3,
    horasHombreReales: 5, stockConsumido: false, stockConsumidoCantidad: 0,
    qualityStatus: 'pendiente', ccfStatus: 'pendiente',
    esAPedido: line.subtipo === 'a_pedido',
    update: vi.fn(async (payload: object) => Object.assign(item, payload)),
  };
  return item as unknown as WorkOrderItem;
};

describe('quotation division synchronization without a database', () => {
  let quotation: Quotation;

  beforeEach(() => {
    vi.clearAllMocks();
    quotation = quotationFixture();
    vi.mocked(Quotation.findByPk).mockResolvedValue(quotation);
    vi.mocked(Quotation.findOne).mockResolvedValue(quotation);
    vi.mocked(Quotation.create).mockResolvedValue(quotation);
    vi.mocked(QuotationItem.findAll).mockResolvedValue([]);
    vi.mocked(WorkOrderItem.findAll).mockResolvedValue([]);
    vi.mocked(CatalogItem.findAll).mockResolvedValue([]);
    vi.mocked(Client.findByPk).mockResolvedValue({ id: 1, nombre: 'Cliente', email: null } as Client);
    vi.mocked(User.findByPk).mockResolvedValue({ nombre: 'Asesor' } as User);
    vi.mocked(Payment.count).mockResolvedValue(0);
    vi.mocked(WorkOrder.findByPk).mockResolvedValue({ id: 80, codigo: 'OT-26-1', estado: 'en_progreso' } as WorkOrder);
    vi.mocked(assertDpItemStatus).mockResolvedValue(undefined);
    vi.mocked(hasWorkItemHistory).mockResolvedValue(false);
    vi.mocked(calculateDpWorkPricing).mockResolvedValue(dpSnapshot());
  });

  it('ignores a forged unit price and stores the authoritative D&P calculation in the same transaction', async () => {
    await createQuotation({ clientId: 1, items: [lineInput({ division: 'DP', dpPricing: dpSelection(), precioUnitario: 1 })] }, 5);
    expect(calculateDpWorkPricing).toHaveBeenCalledWith(dpSelection(), fixture.transaction);
    expect(QuotationItem.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ precioUnitario: 84150, subtotal: 84150, dpPricingSnapshot: dpSnapshot() }),
    ], { transaction: fixture.transaction });
    expect(Quotation.create).toHaveBeenCalledWith(expect.objectContaining({ total: 84150 }), { transaction: fixture.transaction });
  });

  it('keeps the accepted revision and original snapshot when editing a linked quotation without requesting recalculation', async () => {
    const snapshot = dpSnapshot();
    const line = lineFixture('DP', 'servicio_dp', { precioUnitario: 84150, subtotal: 84150, dpPricingSnapshot: snapshot });
    const workItem = workItemFixture(line);
    quotation.workOrderId = 80;
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [workItem] });
    await updateQuotation(70, { items: [lineInput({ id: 71, cantidad: 2, precioUnitario: 84150 })] }, 5);
    expect(calculateDpWorkPricing).not.toHaveBeenCalled();
    expect(line.dpPricingSnapshot).toEqual(snapshot);
    expect(workItem.update).toHaveBeenCalledWith(expect.objectContaining({ dpPricingSnapshot: snapshot, precioUnitario: 84150 }), { transaction: fixture.transaction });
  });

  it('clears the snapshot on both sides when an untouched DP job is reclassified as MEC', async () => {
    const line = lineFixture('DP', 'servicio_dp', { dpPricingSnapshot: dpSnapshot() });
    const workItem = workItemFixture(line);
    workItem.horasHombreReales = null;
    quotation.workOrderId = 80;
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [workItem] });
    await updateQuotation(70, { items: [lineInput({ id: 71, division: 'MEC', subtipo: 'estandar' })] }, 5);
    expect(line.dpPricingSnapshot).toBeNull();
    expect(workItem.update).toHaveBeenCalledWith(expect.objectContaining({ division: 'MEC', dpPricingSnapshot: null }), { transaction: fixture.transaction });
    expect(workItem.dpPricingSnapshot).toBeNull();
    expect(calculateDpWorkPricing).not.toHaveBeenCalled();
  });

  it('propagates a new explicit calculation to the linked work order', async () => {
    const line = lineFixture('DP', 'servicio_dp');
    const workItem = workItemFixture(line);
    quotation.workOrderId = 80;
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [workItem] });
    await updateQuotation(70, { items: [lineInput({ id: 71, dpPricing: dpSelection(), precioUnitario: 1 })] }, 5);
    expect(workItem.update).toHaveBeenCalledWith(expect.objectContaining({ precioUnitario: 84150, dpPricingSnapshot: dpSnapshot() }), { transaction: fixture.transaction });
  });

  it('rejects an obsolete configuration before writing a quotation', async () => {
    vi.mocked(calculateDpWorkPricing).mockRejectedValueOnce(ApiError.conflict('La configuración D&P cambió', 'DP_CONFIGURATION_CHANGED'));
    await expect(createQuotation({ clientId: 1, items: [lineInput({ division: 'DP', dpPricing: dpSelection() })] }, 5)).rejects.toMatchObject({ statusCode: 409 });
    expect(Quotation.create).not.toHaveBeenCalled();
    expect(QuotationItem.bulkCreate).not.toHaveBeenCalled();
  });

  it.each(['parte', 'estandar'] as const)('rejects D&P pricing on a non-DP %s line', async (tipoLinea) => {
    await expect(createQuotation({ clientId: 1, items: [lineInput({ tipoLinea, dpPricing: dpSelection() })] }, 5)).rejects.toThrow('solo corresponde');
    expect(calculateDpWorkPricing).not.toHaveBeenCalled();
    expect(Quotation.create).not.toHaveBeenCalled();
  });

  it('never accepts a client-supplied snapshot through either item schema', () => {
    for (const schema of [quotationItemInputSchema, workOrderItemInputSchema]) {
      const parsed = schema.parse({ ...lineInput(), dpPricing: dpSelection(), dpPricingSnapshot: { precioUnitario: 1 } });
      expect(parsed).not.toHaveProperty('dpPricingSnapshot');
      expect(parsed.dpPricing).toEqual(dpSelection());
    }
  });

  it('passes the accepted snapshot to COT conversion without consulting current tariffs', async () => {
    const snapshot = dpSnapshot();
    const line = lineFixture('DP', 'servicio_dp', { workOrderItemId: null, precioUnitario: snapshot.precioUnitario, dpPricingSnapshot: snapshot });
    quotation.items = [line];
    vi.mocked(createWorkOrderInTransaction).mockResolvedValue({ id: 80, codigo: 'OT-26-1', vehicleId: 2 } as WorkOrder);
    vi.mocked(WorkOrderItem.findAll).mockResolvedValue([workItemFixture(line)]);
    vi.mocked(getWorkOrderById).mockResolvedValue({ id: 80 } as WorkOrderPublic);
    await convertQuotationToWorkOrder(70, 5, convertQuotationToWorkOrderSchema.parse({ clientId: 1, vehicleId: 2 }));
    expect(createWorkOrderInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ precioUnitario: snapshot.precioUnitario })],
    }), 5, fixture.transaction, false, new Map([[0, snapshot]]));
    expect(calculateDpWorkPricing).not.toHaveBeenCalled();
  });

  it('inherits ACC metadata from the catalog without changing a zero price or line discount', async () => {
    vi.mocked(CatalogItem.findAll).mockResolvedValue([
      { id: 10, tipo: 'parte', division: 'ACC', subtipo: 'a_pedido' } as CatalogItem,
    ]);
    await createQuotation({ clientId: 1, items: [lineInput({ catalogItemId: 10, precioUnitario: 0, descuentoTipo: 'porcentaje', descuentoValor: 10 })] }, 5);
    expect(QuotationItem.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ division: 'ACC', subtipo: 'a_pedido', tipoLinea: 'parte', precioUnitario: 0, descuentoTipo: 'porcentaje', descuentoValor: 10 }),
    ], { transaction: fixture.transaction });
  });

  it('classifies a free part as ACC and a specific service as MEC', async () => {
    await createQuotation({ clientId: 1, items: [lineInput({ tipoLinea: 'parte' }), lineInput({ tipoLinea: 'especifico' })] }, 5);
    expect(QuotationItem.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ division: 'ACC', subtipo: 'en_stock' }),
      expect.objectContaining({ division: 'MEC', subtipo: 'especifico' }),
    ], { transaction: fixture.transaction });
  });

  it('keeps existing DP classification, discounts, IDs and recorded hours when ordinary fields change', async () => {
    const line = lineFixture('DP', 'servicio_dp', { descuentoTipo: 'porcentaje', descuentoValor: 10 });
    const workItem = workItemFixture(line);
    quotation.workOrderId = 80;
    quotation.items = [line];
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [workItem] });
    await updateQuotation(70, { items: [lineInput({ id: 71, cantidad: 2 })] }, 5);
    expect(workItem.update).toHaveBeenCalledWith(expect.objectContaining({ division: 'DP', subtipo: 'servicio_dp', cantidad: 2 }), { transaction: fixture.transaction });
    expect(workItem.id).toBe(81);
    expect(workItem.horasHombreReales).toBe(5);
    expect(workItem.horasHombreEstimadas).toBe(3);
    expect(line.descuentoValor).toBe(10);
    expect(quotation.total).toBe(18000);
    expect(ensureDpStagesForItems).toHaveBeenCalledWith(80, [workItem], fixture.transaction);
    expect(WorkOrderItem.destroy).not.toHaveBeenCalled();
  });

  it('initializes stages and catalog hours for a newly linked DP job, starting pending', async () => {
    const line = lineFixture('DP', 'servicio_dp', { workOrderItemId: null, catalogItemId: 10, estadoOperativo: 'completado' });
    const catalogItem = { id: 10, tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp', horasHombreEstandar: 4 } as CatalogItem;
    quotation.workOrderId = 80;
    vi.mocked(CatalogItem.findAll).mockResolvedValue([catalogItem]);
    vi.mocked(CatalogItem.findByPk).mockResolvedValue(catalogItem);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [] });
    vi.mocked(QuotationItem.create).mockResolvedValue(line);
    const created = workItemFixture(line);
    vi.mocked(WorkOrderItem.create).mockResolvedValue(created);
    await updateQuotation(70, { items: [lineInput({ catalogItemId: 10, estadoOperativo: 'completado' })] }, 5);
    expect(WorkOrderItem.create).toHaveBeenCalledWith(expect.objectContaining({ division: 'DP', subtipo: 'servicio_dp', horasHombreEstimadas: 4, estadoOperativo: 'pendiente' }), { transaction: fixture.transaction });
    expect(line.update).toHaveBeenCalledWith({ estadoOperativo: 'pendiente' }, { transaction: fixture.transaction });
    expect(ensureDpStagesForItems).toHaveBeenCalledWith(80, [created], fixture.transaction);
  });

  it('checks DP stage completion before changing the operative status from the quotation', async () => {
    const line = lineFixture('DP', 'servicio_dp');
    const workItem = workItemFixture(line);
    quotation.workOrderId = 80;
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [workItem] });
    vi.mocked(assertDpItemStatus).mockRejectedValueOnce(new Error('Las cinco etapas deben estar completadas'));
    await expect(updateQuotation(70, { items: [lineInput({ id: 71, estadoOperativo: 'completado' })] }, 5)).rejects.toThrow('Las cinco etapas');
    expect(assertDpItemStatus).toHaveBeenCalledWith(workItem, 'completado', fixture.transaction);
    expect(workItem.update).not.toHaveBeenCalled();
  });

  it('does not hide DP assignments or stage history through reclassification in the quotation', async () => {
    const line = lineFixture('DP', 'servicio_dp');
    const workItem = workItemFixture(line);
    quotation.workOrderId = 80;
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [workItem] });
    vi.mocked(hasWorkItemHistory).mockResolvedValue(true);
    await expect(updateQuotation(70, { items: [lineInput({ id: 71, division: 'MEC', subtipo: 'estandar' })] }, 5)).rejects.toThrow('asignaciones o historial');
    expect(workItem.update).not.toHaveBeenCalled();
    expect(workItem.horasHombreReales).toBe(5);
  });

  it('converts DP and ACC lines retaining metadata and discounts, and starts new DP execution pending', async () => {
    const dp = lineFixture('DP', 'servicio_dp', { workOrderItemId: null, estadoOperativo: 'completado', descuentoTipo: 'fijo', descuentoValor: 1000 });
    const part = lineFixture('ACC', 'a_pedido', { id: 72, workOrderItemId: null, tipoLinea: 'parte' });
    quotation.items = [dp, part];
    const createdDp = workItemFixture(dp);
    createdDp.estadoOperativo = 'pendiente';
    const createdPart = workItemFixture(part);
    createdPart.id = 82;
    vi.mocked(createWorkOrderInTransaction).mockResolvedValue({ id: 80, codigo: 'OT-26-1', vehicleId: 2 } as WorkOrder);
    vi.mocked(WorkOrderItem.findAll).mockResolvedValue([createdDp, createdPart]);
    vi.mocked(getWorkOrderById).mockResolvedValue({ id: 80 } as WorkOrderPublic);
    await convertQuotationToWorkOrder(70, 5, convertQuotationToWorkOrderSchema.parse({ clientId: 1, vehicleId: 2 }));
    expect(createWorkOrderInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({ division: 'DP', subtipo: 'servicio_dp', estadoOperativo: 'pendiente', descuentoTipo: 'fijo', descuentoValor: 1000 }),
        expect.objectContaining({ division: 'ACC', subtipo: 'a_pedido', esAPedido: true }),
      ],
    }), 5, fixture.transaction, false);
    expect(dp.workOrderItemId).toBe(81);
    expect(dp.estadoOperativo).toBe('pendiente');
    expect(dp.descuentoValor).toBe(1000);
    expect(part.workOrderItemId).toBe(82);
  });

  it('keeps consumed stock, warehouse and physical signatures when editing a delivered pending part', async () => {
    const line = lineFixture('ACC', 'en_stock', { tipoLinea: 'parte', catalogItemId: 10 });
    const item = workItemFixture(line);
    const deliveredAt = new Date('2026-11-20T15:00:00Z');
    Object.assign(item, { stockConsumido: true, stockConsumidoCantidad: 1, stockConsumidoWarehouseId: 4, stockConsumidoAt: deliveredAt, entregadoBodega: true, entregadoBodegaAt: deliveredAt, bodegueroUserId: 8 });
    quotation.workOrderId = 80;
    vi.mocked(CatalogItem.findAll).mockResolvedValue([{ id: 10, tipo: 'parte', division: 'ACC', subtipo: 'en_stock' } as CatalogItem]);
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: [line], workOrderItems: [item] });
    await updateQuotation(70, { items: [lineInput({ id: 71, tipoLinea: 'parte', catalogItemId: 10, precioUnitario: 12000 })] }, 5);
    expect(restoreForWorkOrder).not.toHaveBeenCalled();
    expect(consumeForWorkOrder).not.toHaveBeenCalled();
    expect(item.stockConsumido).toBe(true);
    expect(item.stockConsumidoWarehouseId).toBe(4);
    expect(item.stockConsumidoCantidad).toBe(1);
    expect(item.entregadoBodegaAt).toEqual(deliveredAt);
    expect(item.bodegueroUserId).toBe(8);
  });

  it.each(['quantity', 'catalog', 'remove'] as const)('blocks a %s change for a physically delivered part before changing inventory', async (change) => {
    const line = lineFixture('ACC', 'en_stock', { tipoLinea: 'parte', catalogItemId: 10 });
    const item = workItemFixture(line);
    Object.assign(item, { stockConsumido: true, stockConsumidoCantidad: 1, entregadoBodega: true });
    quotation.workOrderId = 80;
    vi.mocked(CatalogItem.findAll).mockResolvedValue(change === 'remove' ? [] : [{ id: change === 'catalog' ? 11 : 10, tipo: 'parte', division: 'ACC', subtipo: 'en_stock' } as CatalogItem]);
    vi.mocked(QuotationItem.findAll).mockResolvedValue([line]);
    vi.mocked(ensureQuotationItemLinks).mockResolvedValue({ quotationItems: change === 'remove' ? [] : [line], workOrderItems: [item] });
    await expect(updateQuotation(70, { items: change === 'remove' ? [] : [lineInput({ id: 71, tipoLinea: 'parte', catalogItemId: change === 'catalog' ? 11 : 10, cantidad: change === 'quantity' ? 2 : 1 })] }, 5)).rejects.toThrow('devolución');
    expect(restoreForWorkOrder).not.toHaveBeenCalled();
    expect(consumeForWorkOrder).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(WorkOrderItem.destroy).not.toHaveBeenCalled();
  });
});
