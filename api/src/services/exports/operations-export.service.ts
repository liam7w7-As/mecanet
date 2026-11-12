import {
  financeDayQuerySchema,
  PAYMENT_METHODS,
  paymentQuerySchema,
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PURCHASE_PAYMENT_TYPE_LABELS,
  PURCHASE_STATUS_LABELS,
  PURCHASE_VEHICLE_ORIGIN_LABELS,
  purchaseQuerySchema,
  quotationQuerySchema,
  supplierQuerySchema,
  WORK_ORDER_STATUS,
  WORK_ORDER_STATUS_LABELS,
  workOrderQuerySchema,
} from '@unithor/shared';

import { collectExportPages, exportFilters, exportQuery } from './export-utils.js';
import { getDailyCashSummary } from '../cash-closure.service.js';
import { listCashMovements } from '../cash-movement.service.js';
import { listPayments } from '../payment.service.js';
import { listPurchases, listSuppliers } from '../purchase.service.js';
import { listQuotations } from '../quotation.service.js';
import { listWorkOrders } from '../work-order.service.js';

import type { ExportBuilder, ExportColumn, ExportTable, ExportValue } from './export-types.js';
import type { DailyCashSummary } from '../cash-closure.service.js';
import type { CashMovementPublic } from '../cash-movement.service.js';
import type { PaymentPublic } from '../payment.service.js';
import type { PurchasePublic, SupplierPublic } from '../purchase.service.js';
import type { QuotationPublic } from '../quotation.service.js';
import type { WorkOrderPublic } from '../work-order.service.js';
import type {
  CashMovementCategory,
  PaymentMethod,
  PaymentStatus,
  QuotationStatus,
  WorkOrderEntryType,
} from '@unithor/shared';

const paymentMethods: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
  otro: 'Otro',
};
const paymentStatuses: Record<PaymentStatus, string> = {
  confirmado: 'Confirmado',
  por_verificar: 'Por verificar',
  rechazado: 'Rechazado',
};
const quotationStatuses: Record<QuotationStatus, string> = {
  total: 'Pagada total',
  parcial: 'Abono parcial',
  por_verificar: 'Por verificar',
  por_pagar: 'Por pagar',
  ot_finalizado: 'OT finalizada',
};
const entryTypes: Record<WorkOrderEntryType, string> = {
  normal: 'Normal',
  garantia: 'Garantía',
  reingreso: 'Reingreso',
};
const movementCategories: Record<CashMovementCategory, string> = {
  apertura_caja: 'Apertura de caja',
  gasto_operativo: 'Gasto operativo',
  compra_repuesto: 'Compra de repuesto',
  pago_proveedor: 'Pago a proveedor',
  devolucion: 'Devolución',
  retiro: 'Retiro de caja',
  ajuste: 'Ajuste contable',
  otro: 'Otro',
};
const methodLabel = (method: string | null): string => {
  const knownMethod = PAYMENT_METHODS.find((value) => value === method);
  return knownMethod ? paymentMethods[knownMethod] : (method ?? 'Sin método');
};
const workOrderStatusLabel = (status: string | undefined): string | null => {
  const knownStatus = WORK_ORDER_STATUS.find((value) => value === status);
  return knownStatus
    ? knownStatus === 'cancelada'
      ? 'Anulada'
      : WORK_ORDER_STATUS_LABELS[knownStatus]
    : null;
};

/** Only declared columns leave the adapter, including when a role hides financials. */
const table = <Row extends Record<string, ExportValue>>(
  name: string,
  rows: Row[],
  columns: (ExportColumn & { key: keyof Row & string })[],
): ExportTable => ({
  name,
  columns,
  rows: rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.key, row[column.key]])),
  ),
});

const workOrdersTable = (orders: WorkOrderPublic[], showFinancials: boolean): ExportTable => {
  const rows = orders.map((order) => {
    // Same checklist calculation as the workshop cards; omitted tasks do not penalize progress.
    const tasks = (order.items ?? []).filter((item) => item.estadoOperativo !== 'omitido');
    const completed = tasks.filter((item) => item.estadoOperativo === 'completado').length;
    const progress =
      tasks.length === 0
        ? 0
        : completed === tasks.length
          ? 100
          : Math.min(99, Math.round((completed / tasks.length) * 100));
    return {
      id: order.id,
      codigo: order.codigo,
      fechaIngreso: order.fechaIngreso,
      cliente: order.client?.nombre ?? 'Sin cliente',
      patente: order.vehicle?.patente ?? 'Sin patente',
      vehiculo: [order.vehicle?.marca, order.vehicle?.modelo].filter(Boolean).join(' '),
      estado: order.estado === 'cancelada' ? 'Anulada' : WORK_ORDER_STATUS_LABELS[order.estado],
      mecanico: order.assignedMechanic?.nombre ?? 'Sin mecánico',
      tareas: `${completed}/${tasks.length}`,
      avance: progress,
      tipoIngreso: entryTypes[order.tipoIngreso],
      origen: order.quotation?.codigo ?? 'OT directa',
      total: order.items?.reduce((sum, item) => sum + item.subtotal, 0) ?? null,
      pagado: order.quotation?.pagado ?? null,
      saldo: order.quotation?.saldoPendiente ?? null,
      fechaEntrega: order.fechaEntrega,
      descripcion: order.descripcion,
    };
  });
  type Row = (typeof rows)[number];
  const columns: (ExportColumn & { key: keyof Row })[] = [
    { key: 'id', header: 'ID', kind: 'number', width: 12, pdf: false },
    { key: 'codigo', header: 'OT', width: 20 },
    { key: 'fechaIngreso', header: 'Ingreso', kind: 'date', width: 14 },
    { key: 'cliente', header: 'Cliente', width: 28 },
    { key: 'patente', header: 'Patente', width: 14 },
    { key: 'estado', header: 'Estado', width: 22 },
    { key: 'mecanico', header: 'Mecánico', width: 24 },
    { key: 'tareas', header: 'Tareas completadas', width: 20, pdf: false },
    { key: 'avance', header: 'Avance (%)', kind: 'number', width: 14 },
    { key: 'vehiculo', header: 'Marca y modelo', width: 28, pdf: false },
    { key: 'tipoIngreso', header: 'Tipo de ingreso', width: 18, pdf: false },
    { key: 'origen', header: 'Origen', width: 22, pdf: false },
    ...(showFinancials
      ? ([
          { key: 'total', header: 'Total estimado', kind: 'money', width: 18 },
          { key: 'pagado', header: 'Pagado', kind: 'money', width: 18, pdf: false },
          { key: 'saldo', header: 'Saldo pendiente', kind: 'money', width: 18, pdf: false },
        ] satisfies (ExportColumn & { key: keyof Row })[])
      : []),
    { key: 'fechaEntrega', header: 'Entrega prevista', kind: 'date', width: 18, pdf: false },
    { key: 'descripcion', header: 'Descripción', width: 50, pdf: false },
  ];
  return table('Órdenes de trabajo', rows, columns);
};

const quotationsTable = (quotations: QuotationPublic[]): ExportTable =>
  table(
    'Cotizaciones',
    quotations.map((quotation) => ({
      id: quotation.id,
      codigo: quotation.codigo,
      fecha: quotation.createdAt,
      cliente: quotation.client?.nombre ?? 'Sin cliente',
      patente: quotation.vehicle?.patente ?? 'Sin patente',
      ordenTrabajo:
        quotation.workOrder?.codigo ?? (quotation.workOrderId === null ? 'Sin OT' : 'OT vinculada'),
      estadoOT: workOrderStatusLabel(quotation.workOrder?.estado),
      asesor: quotation.asesor?.nombre ?? 'Sin asesor',
      estadoPago: quotationStatuses[quotation.estadoPago],
      total: quotation.total,
      pagado: quotation.pagado,
      saldo: Math.max(0, quotation.total - quotation.pagado),
      archivadaManualmente: quotation.archivedAt,
      notas: quotation.notas,
    })),
    [
      { key: 'id', header: 'ID', kind: 'number', width: 12, pdf: false },
      { key: 'codigo', header: 'Cotización', width: 22 },
      { key: 'fecha', header: 'Fecha', kind: 'date', width: 14 },
      { key: 'cliente', header: 'Cliente', width: 28 },
      { key: 'patente', header: 'Patente', width: 14 },
      { key: 'ordenTrabajo', header: 'OT', width: 22 },
      { key: 'asesor', header: 'Asesor', width: 24 },
      { key: 'estadoPago', header: 'Estado de pago', width: 20 },
      { key: 'total', header: 'Total', kind: 'money', width: 18 },
      { key: 'pagado', header: 'Pagado', kind: 'money', width: 18, pdf: false },
      { key: 'saldo', header: 'Saldo pendiente', kind: 'money', width: 18 },
      { key: 'estadoOT', header: 'Estado de OT', width: 20, pdf: false },
      {
        key: 'archivadaManualmente',
        header: 'Archivo manual',
        kind: 'datetime',
        width: 22,
        pdf: false,
      },
      { key: 'notas', header: 'Notas', width: 50, pdf: false },
    ],
  );

const purchasesTable = (purchases: PurchasePublic[]): ExportTable =>
  table(
    'Compras',
    purchases.map((purchase) => ({
      id: purchase.id,
      codigo: purchase.codigo,
      registro: purchase.createdAt,
      proveedor: purchase.supplier.nombre,
      proveedorCompleto: purchase.supplier.datosCompletos,
      documento: PURCHASE_DOCUMENT_TYPE_LABELS[purchase.tipoDocumento],
      folio: purchase.folio,
      fechaEmision: purchase.fechaEmision,
      patente: purchase.vehicle?.patente ?? purchase.fleetVehicle?.patente ?? 'Sin vehículo',
      origen: purchase.origenVehiculo
        ? PURCHASE_VEHICLE_ORIGIN_LABELS[purchase.origenVehiculo]
        : null,
      ordenTrabajo: purchase.workOrder?.codigo ?? null,
      formaPago: PURCHASE_PAYMENT_TYPE_LABELS[purchase.formaPago],
      pago:
        purchase.formaPago === 'contado'
          ? 'Egreso al registrar'
          : purchase.estado === 'registrada' && !purchase.pagadoAt
            ? 'Pendiente'
            : 'Pagada',
      neto: purchase.neto,
      iva: purchase.iva,
      total: purchase.total,
      estado: PURCHASE_STATUS_LABELS[purchase.estado],
      cantidadItems: purchase.items.length,
    })),
    [
      { key: 'id', header: 'ID', kind: 'number', width: 12, pdf: false },
      { key: 'codigo', header: 'Compra', width: 22 },
      { key: 'registro', header: 'Registro', kind: 'datetime', width: 22 },
      { key: 'proveedor', header: 'Proveedor', width: 28 },
      { key: 'documento', header: 'Documento', width: 20 },
      { key: 'folio', header: 'Folio', width: 18, pdf: false },
      { key: 'patente', header: 'Patente', width: 14 },
      { key: 'formaPago', header: 'Forma de pago', width: 18 },
      { key: 'pago', header: 'Pago', width: 22, pdf: false },
      { key: 'total', header: 'Total', kind: 'money', width: 18 },
      { key: 'estado', header: 'Estado', width: 16 },
      { key: 'fechaEmision', header: 'Emisión', kind: 'date', width: 14, pdf: false },
      {
        key: 'proveedorCompleto',
        header: 'Proveedor con datos completos',
        kind: 'boolean',
        width: 28,
        pdf: false,
      },
      { key: 'origen', header: 'Origen del vehículo', width: 22, pdf: false },
      { key: 'ordenTrabajo', header: 'OT', width: 22, pdf: false },
      { key: 'neto', header: 'Neto', kind: 'money', width: 18, pdf: false },
      { key: 'iva', header: 'IVA', kind: 'money', width: 18, pdf: false },
      { key: 'cantidadItems', header: 'Cantidad de ítems', kind: 'number', width: 20, pdf: false },
    ],
  );

const suppliersTable = (suppliers: SupplierPublic[]): ExportTable =>
  table(
    'Proveedores',
    suppliers.map((supplier) => ({
      id: supplier.id,
      nombre: supplier.nombre,
      rut: supplier.rut,
      telefono: supplier.telefono,
      email: supplier.email,
      direccion: supplier.direccion,
      contacto: supplier.contactoNombre,
      datosCompletos: supplier.datosCompletos,
      notas: supplier.notas,
    })),
    [
      { key: 'id', header: 'ID', kind: 'number', width: 12, pdf: false },
      { key: 'nombre', header: 'Proveedor', width: 30 },
      { key: 'rut', header: 'RUT', width: 18 },
      { key: 'telefono', header: 'Teléfono', width: 22 },
      { key: 'email', header: 'Correo electrónico', width: 32 },
      { key: 'contacto', header: 'Contacto', width: 26 },
      { key: 'datosCompletos', header: 'Datos completos', kind: 'boolean', width: 18 },
      { key: 'direccion', header: 'Dirección', width: 40, pdf: false },
      { key: 'notas', header: 'Notas', width: 50, pdf: false },
    ],
  );

const paymentsTable = (payments: PaymentPublic[]): ExportTable =>
  table(
    'Abonos',
    payments.map((payment) => ({
      id: payment.id,
      fecha: payment.fecha,
      cotizacion: payment.quotation?.codigo ?? `COT #${payment.quotationId}`,
      cliente: payment.quotation?.client?.nombre ?? 'Sin cliente',
      metodo: methodLabel(payment.metodo),
      estado: paymentStatuses[payment.estado],
      monto: payment.monto,
      referencia: payment.referencia,
      banco: payment.bancoOrigen,
      numeroTransaccion: payment.numeroTransaccion,
      comprobanteDisponible: Boolean(payment.comprobantePago),
    })),
    [
      { key: 'id', header: 'ID', kind: 'number', width: 12, pdf: false },
      { key: 'fecha', header: 'Fecha', kind: 'datetime', width: 22 },
      { key: 'cotizacion', header: 'Cotización', width: 22 },
      { key: 'cliente', header: 'Cliente', width: 28 },
      { key: 'metodo', header: 'Método de pago', width: 22 },
      { key: 'estado', header: 'Estado', width: 18 },
      { key: 'monto', header: 'Monto', kind: 'money', width: 18 },
      { key: 'referencia', header: 'Referencia', width: 28 },
      { key: 'banco', header: 'Banco de procedencia', width: 26, pdf: false },
      { key: 'numeroTransaccion', header: 'Número de transacción', width: 28, pdf: false },
      {
        key: 'comprobanteDisponible',
        header: 'Comprobante disponible',
        kind: 'boolean',
        width: 26,
        pdf: false,
      },
    ],
  );

const cashTables = (daily: DailyCashSummary, movements: CashMovementPublic[]): ExportTable[] => [
  table(
    'Resumen diario',
    [
      {
        fecha: daily.fecha,
        estado: daily.isClosed ? 'Cerrada' : 'Abierta',
        confirmado: daily.totals.confirmedTotal,
        ingresosManuales: daily.totals.manualIncomeTotal,
        egresos: daily.totals.expenseTotal,
        neto: daily.totals.netTotal,
        efectivoEsperado: daily.totals.expectedCash,
        transferenciasPendientes: daily.totals.pendingTransferCount,
        montoPendiente: daily.totals.pendingTransferAmount,
        efectivoDeclarado: daily.closure?.efectivoDeclarado ?? null,
        diferencia: daily.closure?.diferenciaEfectivo ?? null,
        cerradoPor: daily.closure?.closer?.nombre ?? null,
        cerradoAt: daily.closure?.closedAt ?? null,
      },
    ],
    [
      { key: 'fecha', header: 'Fecha contable', kind: 'date', width: 16 },
      { key: 'estado', header: 'Caja', width: 14 },
      { key: 'confirmado', header: 'Abonos confirmados', kind: 'money', width: 22 },
      { key: 'ingresosManuales', header: 'Ingresos manuales', kind: 'money', width: 22 },
      { key: 'egresos', header: 'Egresos', kind: 'money', width: 18 },
      { key: 'neto', header: 'Neto del día', kind: 'money', width: 18 },
      { key: 'efectivoEsperado', header: 'Efectivo esperado', kind: 'money', width: 22 },
      {
        key: 'transferenciasPendientes',
        header: 'Transferencias por verificar',
        kind: 'number',
        width: 28,
        pdf: false,
      },
      {
        key: 'montoPendiente',
        header: 'Monto por verificar',
        kind: 'money',
        width: 22,
        pdf: false,
      },
      {
        key: 'efectivoDeclarado',
        header: 'Efectivo declarado',
        kind: 'money',
        width: 22,
        pdf: false,
      },
      { key: 'diferencia', header: 'Diferencia de efectivo', kind: 'money', width: 24, pdf: false },
      { key: 'cerradoPor', header: 'Cerrada por', width: 26, pdf: false },
      { key: 'cerradoAt', header: 'Fecha de cierre', kind: 'datetime', width: 22, pdf: false },
    ],
  ),
  table(
    'Totales por método',
    PAYMENT_METHODS.map((method) => ({
      metodo: paymentMethods[method],
      confirmado: daily.totals.byMethod[method],
    })),
    [
      { key: 'metodo', header: 'Método de pago', width: 26 },
      { key: 'confirmado', header: 'Abonos confirmados', kind: 'money', width: 24 },
    ],
  ),
  table(
    'Movimientos de caja',
    movements.map((movement) => ({
      fecha: movement.fecha,
      tipo: movement.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      categoria: movementCategories[movement.categoria],
      descripcion: movement.descripcion,
      referencia: movement.referencia,
      metodo: paymentMethods[movement.metodo],
      registradoPor: movement.creator?.nombre ?? 'Usuario eliminado',
      monto: movement.monto,
      estado: movement.voidedAt ? 'Anulado' : 'Vigente',
      motivoAnulacion: movement.voidReason,
    })),
    [
      { key: 'fecha', header: 'Fecha', kind: 'datetime', width: 22 },
      { key: 'tipo', header: 'Tipo', width: 14 },
      { key: 'descripcion', header: 'Descripción', width: 40 },
      { key: 'metodo', header: 'Método de pago', width: 22 },
      { key: 'registradoPor', header: 'Registrado por', width: 24 },
      { key: 'monto', header: 'Monto', kind: 'money', width: 18 },
      { key: 'estado', header: 'Estado', width: 14 },
      { key: 'categoria', header: 'Categoría', width: 24, pdf: false },
      { key: 'referencia', header: 'Referencia', width: 28, pdf: false },
      { key: 'motivoAnulacion', header: 'Motivo de anulación', width: 45, pdf: false },
    ],
  ),
];

/** Listing reports only. Access policy and rendering belong to the generic export route. */
export const buildOperationsExport: ExportBuilder = async (target, rawQuery, actor) => {
  switch (target) {
    case 'work-orders': {
      const query = workOrderQuerySchema.parse(exportQuery(rawQuery));
      const rows = await collectExportPages((page) => listWorkOrders({ ...query, page }, actor.id));
      return {
        title: 'Listado de órdenes de trabajo',
        filters: exportFilters(query),
        tables: [workOrdersTable(rows, actor.role !== 'mecanico')],
      };
    }
    case 'quotations': {
      const query = quotationQuerySchema.parse(exportQuery(rawQuery));
      const rows = await collectExportPages((page) => listQuotations({ ...query, page }, actor.id));
      const scope =
        query.workOrderId !== undefined || query.workOrderLinked === true
          ? 'con OT'
          : query.workOrderLinked === false
            ? 'sin OT'
            : 'generales';
      const archive =
        query.archiveStatus === 'archived'
          ? ' archivadas'
          : query.archiveStatus === 'active'
            ? ' activas'
            : '';
      return {
        title: `Listado de cotizaciones ${scope}${archive}`,
        filters: exportFilters(query),
        tables: [quotationsTable(rows)],
      };
    }
    case 'purchases': {
      const query = purchaseQuerySchema.parse(exportQuery(rawQuery));
      const rows = await collectExportPages((page) => listPurchases({ ...query, page }));
      return {
        title: 'Listado de compras',
        filters: exportFilters(query),
        tables: [purchasesTable(rows)],
      };
    }
    case 'suppliers': {
      const query = supplierQuerySchema.parse(exportQuery(rawQuery));
      const rows = await collectExportPages((page) => listSuppliers({ ...query, page }));
      return {
        title: 'Listado de proveedores',
        filters: exportFilters(query),
        tables: [suppliersTable(rows)],
      };
    }
    case 'payments': {
      const query = paymentQuerySchema.parse(exportQuery(rawQuery));
      const rows = await collectExportPages((page) => listPayments({ ...query, page }, actor.id, actor.role));
      return {
        title: 'Listado de abonos',
        filters: exportFilters(query),
        tables: [paymentsTable(rows)],
      };
    }
    case 'cash-day': {
      const query = financeDayQuerySchema.parse(rawQuery);
      const [daily, rows] = await Promise.all([
        getDailyCashSummary(query.fecha),
        // The current movements view is not paginated and includes voided records.
        // Still apply the shared export limit instead of truncating the selected day.
        collectExportPages(async () => {
          const items = await listCashMovements(query.fecha);
          return { items, total: items.length, totalPages: 1 };
        }),
      ]);
      return {
        title: 'Caja diaria',
        filters: exportFilters(query),
        tables: cashTables(daily, rows),
        notes: ['Los movimientos anulados se muestran y no se suman a los totales de caja.'],
      };
    }
    default:
      return null;
  }
};
