import ExcelJS from 'exceljs';
import { Op } from 'sequelize';

import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Permission } from '../models/Permission.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Role } from '../models/Role.js';
import { StockBalance } from '../models/StockBalance.js';
import { StockMovement } from '../models/StockMovement.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { Warehouse } from '../models/Warehouse.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderProgressReport } from '../models/WorkOrderProgressReport.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';
import { getReportBranding } from './reports/report-branding.js';
import { ReportDocument } from './reports/report-layout.js';

import type {
  CatalogReportFilters,
  CommercialReportFilters,
  AdministrationReportFilters,
  FleetReportFilters,
  InventoryReportFilters,
  WorkshopReportFilters,
} from '@unithor/shared';
import type { Includeable, InferAttributes, WhereOptions } from 'sequelize';

type QuotationWhere = WhereOptions<InferAttributes<Quotation>> & {
  [Op.or]?: WhereOptions<InferAttributes<Quotation>>[];
};
type WorkOrderWhere = WhereOptions<InferAttributes<WorkOrder>> & {
  [Op.or]?: WhereOptions<InferAttributes<WorkOrder>>[];
};
type CatalogWhere = WhereOptions<InferAttributes<CatalogItem>> & {
  [Op.or]?: WhereOptions<InferAttributes<CatalogItem>>[];
};
type ClientWhere = WhereOptions<InferAttributes<Client>> & {
  [Op.or]?: WhereOptions<InferAttributes<Client>>[];
};
type VehicleWhere = WhereOptions<InferAttributes<Vehicle>> & {
  [Op.or]?: WhereOptions<InferAttributes<Vehicle>>[];
};
type UserWhere = WhereOptions<InferAttributes<User>> & {
  [Op.or]?: WhereOptions<InferAttributes<User>>[];
};

const PRIMARY = 'FF0E2B4E';
const ACCENT = 'FFFFD600';
const WHITE = 'FFFFFFFF';
const BORDER = 'FFD6DEE8';
const SOFT = 'FFF4F6F9';
const CURRENCY_FORMAT = '"$"#,##0';
const DATE_FORMAT = 'dd-mm-yyyy';

const startOfDayUtc = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const endOfDayUtc = (date: string): Date => new Date(`${date}T23:59:59.999Z`);

const asNumber = (value: number | string | null | undefined): number => Number(value ?? 0);

const money = (value: number | string | null | undefined): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(asNumber(value));

const dateText = (value: Date | string | null | undefined): string => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-CL').format(new Date(value));
};

const humanize = (value: string | null | undefined): string => {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const vehicleLabel = (vehicle: Vehicle | undefined | null): string => {
  if (!vehicle) return 'Sin vehículo';
  const detail = [vehicle.marca, vehicle.modelo].filter(Boolean).join(' ');
  return detail ? `${vehicle.patente} - ${detail}` : vehicle.patente;
};

const quotationVehicleLabel = (quotation: Quotation): string => vehicleLabel(quotation.vehicle);

const workOrderVehicleLabel = (workOrder: WorkOrder): string => vehicleLabel(workOrder.vehicle);

const buildCommercialWhere = (
  filters: CommercialReportFilters,
  includeCreatedRange = true,
): QuotationWhere => {
  const where: QuotationWhere = includeCreatedRange
    ? {
        createdAt: {
          [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)],
        },
      }
    : {};
  if (filters.estadoPago !== undefined) where.estadoPago = filters.estadoPago;
  if (filters.asesorId !== undefined) where.asesorId = filters.asesorId;
  if (filters.clientId !== undefined) where.clientId = filters.clientId;
  if (filters.vehicleId !== undefined) where.vehicleId = filters.vehicleId;
  if (filters.workOrderId !== undefined) where.workOrderId = filters.workOrderId;
  if (filters.workOrderLinked !== undefined) {
    where.workOrderId = filters.workOrderLinked ? { [Op.not]: null } : { [Op.is]: null };
  }
  if (filters.search) {
    const like = `%${filters.search}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: like } },
      { notas: { [Op.like]: like } },
    ];
  }
  return where;
};

const buildWorkshopWhere = (filters: WorkshopReportFilters): WorkOrderWhere => {
  const where: WorkOrderWhere = {
    fechaIngreso: { [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)] },
  };
  if (filters.estado !== undefined) where.estado = filters.estado;
  if (filters.mechanicId !== undefined) where.assignedMechanicId = filters.mechanicId;
  if (filters.clientId !== undefined) where.clientId = filters.clientId;
  if (filters.vehicleId !== undefined) where.vehicleId = filters.vehicleId;
  if (filters.search) {
    const like = `%${filters.search}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: like } },
      { descripcion: { [Op.like]: like } },
      { contactName: { [Op.like]: like } },
      { billingName: { [Op.like]: like } },
    ];
  }
  return where;
};

const commercialIncludes: Includeable[] = [
  { model: Client, as: 'client', attributes: ['id', 'rut', 'nombre', 'telefono'], required: false },
  { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente', 'marca', 'modelo'], required: false },
  { model: User, as: 'asesor', attributes: ['id', 'nombre'], required: false },
  { model: WorkOrder, as: 'workOrder', attributes: ['id', 'codigo', 'estado'], required: false },
  {
    model: QuotationItem,
    as: 'items',
    attributes: [
      'id',
      'descripcion',
      'tipoLinea',
      'unidadMedida',
      'cantidad',
      'precioUnitario',
      'subtotal',
      'estadoOperativo',
      'notasOperativas',
    ],
    include: [{ model: CatalogItem, as: 'catalogItem', attributes: ['id', 'codigo', 'nombre', 'tipo'], required: false }],
  },
  {
    model: Payment,
    as: 'payments',
    attributes: ['id', 'monto', 'metodo', 'estado', 'fecha', 'bancoOrigen', 'numeroTransaccion'],
    required: false,
    include: [{ model: User, as: 'creator', attributes: ['id', 'nombre'], required: false }],
  },
];

const workshopIncludes: Includeable[] = [
  { model: Client, as: 'client', attributes: ['id', 'rut', 'nombre', 'telefono'], required: false },
  { model: Client, as: 'contactClient', attributes: ['id', 'rut', 'nombre', 'telefono'], required: false },
  { model: Client, as: 'billingClient', attributes: ['id', 'rut', 'nombre', 'telefono'], required: false },
  { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente', 'marca', 'modelo'], required: false },
  { model: User, as: 'creator', attributes: ['id', 'nombre'], required: false },
  { model: User, as: 'assignedMechanic', attributes: ['id', 'nombre'], required: false },
  {
    model: WorkOrderItem,
    as: 'items',
    attributes: [
      'id',
      'descripcion',
      'tipoLinea',
      'unidadMedida',
      'cantidad',
      'precioUnitario',
      'subtotal',
      'estadoOperativo',
      'notasOperativas',
      'stockConsumido',
      'stockConsumidoCantidad',
    ],
    include: [{ model: CatalogItem, as: 'catalogItem', attributes: ['id', 'codigo', 'nombre', 'tipo'], required: false }],
  },
  {
    model: Quotation,
    as: 'quotation',
    attributes: ['id', 'codigo', 'estadoPago', 'total', 'pagado'],
    required: false,
    include: [
      {
        model: Payment,
        as: 'payments',
        attributes: ['id', 'monto', 'metodo', 'estado', 'fecha'],
        required: false,
        include: [{ model: User, as: 'creator', attributes: ['id', 'nombre'], required: false }],
      },
    ],
  },
  {
    model: WorkOrderProgressReport,
    as: 'progressReports',
    attributes: ['id', 'porcentaje', 'comentario', 'bloqueos', 'createdAt'],
    required: false,
    include: [{ model: User, as: 'mechanic', attributes: ['id', 'nombre'], required: false }],
  },
  {
    model: WorkOrderRequest,
    as: 'requests',
    attributes: [
      'id',
      'tipo',
      'estado',
      'motivo',
      'cantidad',
      'precioSugerido',
      'precioAprobado',
      'createdAt',
      'reviewedAt',
      'deliveredAt',
    ],
    required: false,
    include: [
      { model: CatalogItem, as: 'catalogItem', attributes: ['id', 'codigo', 'nombre', 'tipo'], required: false },
      { model: User, as: 'requester', attributes: ['id', 'nombre'], required: false },
      { model: User, as: 'reviewer', attributes: ['id', 'nombre'], required: false },
    ],
  },
];

const getCommercialQuotations = (filters: CommercialReportFilters): Promise<Quotation[]> =>
  Quotation.findAll({
    where: buildCommercialWhere(filters),
    include: commercialIncludes,
    order: [
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
      [{ model: QuotationItem, as: 'items' }, 'id', 'ASC'],
      [{ model: Payment, as: 'payments' }, 'fecha', 'ASC'],
    ],
  });

const getCommercialPayments = (filters: CommercialReportFilters): Promise<Payment[]> =>
  Payment.findAll({
    where: {
      fecha: { [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)] },
    },
    include: [
      { model: User, as: 'creator', attributes: ['id', 'nombre'], required: false },
      {
        model: Quotation,
        as: 'quotation',
        attributes: ['id', 'codigo', 'estadoPago', 'asesorId', 'clientId', 'vehicleId', 'workOrderId'],
        where: buildCommercialWhere(filters, false),
        required: true,
        include: [
          { model: Client, as: 'client', attributes: ['id', 'nombre', 'rut'], required: false },
          { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente', 'marca', 'modelo'], required: false },
        ],
      },
    ],
    order: [
      ['fecha', 'ASC'],
      ['id', 'ASC'],
    ],
  });

const getWorkshopWorkOrders = (filters: WorkshopReportFilters): Promise<WorkOrder[]> =>
  WorkOrder.findAll({
    where: buildWorkshopWhere(filters),
    include: workshopIncludes,
    order: [
      ['fechaIngreso', 'ASC'],
      ['id', 'ASC'],
      [{ model: WorkOrderItem, as: 'items' }, 'id', 'ASC'],
      [{ model: WorkOrderProgressReport, as: 'progressReports' }, 'createdAt', 'ASC'],
      [{ model: WorkOrderRequest, as: 'requests' }, 'createdAt', 'ASC'],
    ],
  });

const setupWorkbook = (): ExcelJS.Workbook => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UNITHOR';
  workbook.company = 'UNITHOR';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
};

const serializeWorkbook = async (workbook: ExcelJS.Workbook): Promise<Buffer> => {
  const branding = await getReportBranding();
  workbook.creator = branding.companyName;
  workbook.company = branding.legalName;

  if (branding.logoPng) {
    const imageId = workbook.addImage({ base64: branding.logoPng.toString('base64'), extension: 'png' });
    workbook.eachSheet((sheet) => {
      const startColumn = Math.max(0, sheet.columnCount - 2.15);
      sheet.addImage(imageId, {
        tl: { col: startColumn, row: 0.12 },
        ext: { width: 104, height: 28 },
        editAs: 'oneCell',
      });
    });
  }

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
};

const createReportDocument = async (title: string, subtitle: string): Promise<ReportDocument> => {
  const branding = await getReportBranding();
  const detail = [
    branding.rut ? `RUT ${branding.rut}` : null,
    branding.address || null,
    branding.contact || null,
  ].filter((value): value is string => Boolean(value)).join(' | ');

  return ReportDocument.create({
    company: branding.companyName,
    companyDetail: detail,
    logo: branding.logoPng,
    title,
    subtitle,
    page: { width: 841.89, height: 595.28, marginTop: 54, marginBottom: 42, marginX: 34 },
  });
};

const styleTitle = (sheet: ExcelJS.Worksheet, lastColumn: string, title: string, subtitle: string): void => {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  sheet.getCell('A1').font = { name: 'Arial', size: 15, bold: true, color: { argb: WHITE } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 30;
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { name: 'Arial', size: 9, color: { argb: PRIMARY } };
  sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
};

const styleHeader = (row: ExcelJS.Row): void => {
  row.height = 28;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER } },
      left: { style: 'thin', color: { argb: BORDER } },
      bottom: { style: 'thin', color: { argb: BORDER } },
      right: { style: 'thin', color: { argb: BORDER } },
    };
  });
};

const addSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  subtitle: string,
  columns: Array<{ header: string; key: string; width: number; currency?: boolean; date?: boolean }>,
  rows: Array<Record<string, string | number | Date | null>>,
  totalLabel = 'TOTALES GENERALES',
): void => {
  const sheet = workbook.addWorksheet(name);
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }));
  const lastColumn = String.fromCharCode(64 + columns.length);
  styleTitle(sheet, lastColumn, title, subtitle);
  const header = sheet.getRow(4);
  header.values = columns.map((column) => column.header);
  styleHeader(header);
  sheet.autoFilter = `A4:${lastColumn}4`;

  rows.forEach((rowData, index) => {
    const row = sheet.getRow(index + 5);
    row.values = columns.map((column) => rowData[column.key] ?? '');
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: BORDER } },
        left: { style: 'thin', color: { argb: BORDER } },
        bottom: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
      };
      if (index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
      }
    });
    columns.forEach((column, columnIndex) => {
      if (column.currency) row.getCell(columnIndex + 1).numFmt = CURRENCY_FORMAT;
      if (column.date) row.getCell(columnIndex + 1).numFmt = DATE_FORMAT;
    });
  });

  const totalRow = sheet.getRow(rows.length + 5);
  totalRow.getCell(1).value = totalLabel;
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    cell.font = { name: 'Arial', size: 9, bold: true };
  });
};

const commercialSubtitle = (filters: CommercialReportFilters): string =>
  [
    `${filters.fechaDesde} al ${filters.fechaHasta}`,
    filters.estadoPago ? `Estado: ${humanize(filters.estadoPago)}` : null,
    filters.workOrderLinked === true ? 'Solo con OT' : null,
    filters.workOrderLinked === false ? 'Solo sin OT' : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
  ].filter((value): value is string => Boolean(value)).join(' | ');

const workshopSubtitle = (filters: WorkshopReportFilters): string =>
  [
    `${filters.fechaDesde} al ${filters.fechaHasta}`,
    filters.estado ? `Estado: ${humanize(filters.estado)}` : null,
    filters.mechanicId ? `Mecánico #${filters.mechanicId}` : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
  ].filter((value): value is string => Boolean(value)).join(' | ');

export async function generateDetailedCommercialReportExcel(filters: CommercialReportFilters): Promise<Buffer> {
  const [quotations, payments] = await Promise.all([
    getCommercialQuotations(filters),
    getCommercialPayments(filters),
  ]);
  const workbook = setupWorkbook();
  const subtitle = commercialSubtitle(filters);

  addSheet(
    workbook,
    'Resumen Comercial',
    'UNITHOR - INFORME DE VENTAS Y COBRANZAS',
    subtitle,
    [
      { header: 'Código COT', key: 'code', width: 18 },
      { header: 'Fecha', key: 'date', width: 14, date: true },
      { header: 'Cliente', key: 'client', width: 30 },
      { header: 'RUT', key: 'rut', width: 14 },
      { header: 'Vehículo', key: 'vehicle', width: 24 },
      { header: 'Asesor', key: 'advisor', width: 22 },
      { header: 'OT vinculada', key: 'workOrder', width: 18 },
      { header: 'Estado pago', key: 'status', width: 18 },
      { header: 'Total', key: 'total', width: 16, currency: true },
      { header: 'Pagado', key: 'paid', width: 16, currency: true },
      { header: 'Saldo', key: 'balance', width: 16, currency: true },
      { header: 'Notas', key: 'notes', width: 42 },
    ],
    quotations.map((quotation) => ({
      code: quotation.codigo,
      date: quotation.createdAt,
      client: quotation.client?.nombre ?? 'Sin cliente',
      rut: quotation.client?.rut ?? '',
      vehicle: quotationVehicleLabel(quotation),
      advisor: quotation.asesor?.nombre ?? '',
      workOrder: quotation.workOrder?.codigo ?? 'Sin OT',
      status: humanize(quotation.estadoPago),
      total: asNumber(quotation.total),
      paid: asNumber(quotation.pagado),
      balance: Math.max(0, asNumber(quotation.total) - asNumber(quotation.pagado)),
      notes: quotation.notas ?? '',
    })),
    'TOTALES GENERALES',
  );

  addSheet(
    workbook,
    'Servicios y repuestos',
    'UNITHOR - SERVICIOS OFRECIDOS EN COTIZACIONES',
    subtitle,
    [
      { header: 'COT', key: 'quotation', width: 18 },
      { header: 'Cliente', key: 'client', width: 28 },
      { header: 'Código item', key: 'itemCode', width: 16 },
      { header: 'Descripción', key: 'description', width: 42 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Estado operativo', key: 'operationalStatus', width: 18 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Precio unitario', key: 'unitPrice', width: 16, currency: true },
      { header: 'Subtotal', key: 'subtotal', width: 16, currency: true },
      { header: 'Notas taller', key: 'notes', width: 34 },
    ],
    quotations.flatMap((quotation) =>
      (quotation.items ?? []).map((item) => ({
        quotation: quotation.codigo,
        client: quotation.client?.nombre ?? '',
        itemCode: item.catalogItem?.codigo ?? '',
        description: item.descripcion,
        type: humanize(item.tipoLinea),
        operationalStatus: humanize(item.estadoOperativo),
        quantity: asNumber(item.cantidad),
        unitPrice: asNumber(item.precioUnitario),
        subtotal: asNumber(item.subtotal),
        notes: item.notasOperativas ?? '',
      })),
    ),
    'TOTAL SERVICIOS Y REPUESTOS',
  );

  addSheet(
    workbook,
    'Detalle de Pagos - Abonos',
    'UNITHOR - PAGOS ASOCIADOS A COTIZACIONES',
    subtitle,
    [
      { header: 'COT', key: 'quotation', width: 18 },
      { header: 'Fecha pago', key: 'date', width: 14, date: true },
      { header: 'Cliente', key: 'client', width: 28 },
      { header: 'Método', key: 'method', width: 18 },
      { header: 'Monto', key: 'amount', width: 16, currency: true },
      { header: 'Recibido por', key: 'receiver', width: 22 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Banco', key: 'bank', width: 18 },
      { header: 'Nro. transacción', key: 'transaction', width: 22 },
    ],
    payments.map((payment) => ({
        quotation: payment.quotation?.codigo ?? '',
        date: payment.fecha,
        client: payment.quotation?.client?.nombre ?? '',
        method: humanize(payment.metodo),
        status: humanize(payment.estado),
        bank: payment.bancoOrigen ?? '',
        transaction: payment.numeroTransaccion ?? '',
        amount: asNumber(payment.monto),
        receiver: payment.creator?.nombre ?? '',
      })),
    'TOTAL PAGOS RECIBIDOS',
  );

  return serializeWorkbook(workbook);
}

export async function generateCommercialReportPdf(filters: CommercialReportFilters): Promise<Uint8Array> {
  const [quotations, payments] = await Promise.all([
    getCommercialQuotations(filters),
    getCommercialPayments(filters),
  ]);
  const total = quotations.reduce((sum, quotation) => sum + asNumber(quotation.total), 0);
  const paid = quotations.reduce((sum, quotation) => sum + asNumber(quotation.pagado), 0);
  const pending = Math.max(0, total - paid);
  const doc = await createReportDocument(
    'Reporte comercial detallado',
    commercialSubtitle(filters),
  );

  doc.section('Resumen ejecutivo').keyValues([
    ['Cotizaciones', String(quotations.length)],
    ['Total vendido', money(total)],
    ['Pagado', money(paid)],
    ['Saldo pendiente', money(pending)],
  ]);
  doc.section('Cotizaciones').table(
    [
      { header: 'COT', width: 70, key: 'code' },
      { header: 'Fecha', width: 58, key: 'date' },
      { header: 'Cliente', width: 115, key: 'client' },
      { header: 'Vehículo', width: 100, key: 'vehicle' },
      { header: 'OT', width: 65, key: 'workOrder' },
      { header: 'Estado', width: 75, key: 'status' },
      { header: 'Total', width: 72, key: 'total', align: 'right' },
    ],
    quotations.map((quotation) => ({
      code: quotation.codigo,
      date: dateText(quotation.createdAt),
      client: quotation.client?.nombre ?? 'Sin cliente',
      vehicle: quotationVehicleLabel(quotation),
      workOrder: quotation.workOrder?.codigo ?? 'Sin OT',
      status: humanize(quotation.estadoPago),
      total: money(quotation.total),
    })),
  );
  doc.section('Servicios y repuestos ofrecidos').table(
    [
      { header: 'COT', width: 65, key: 'quotation' },
      { header: 'Descripción', width: 190, key: 'description' },
      { header: 'Tipo', width: 70, key: 'type' },
      { header: 'Estado', width: 70, key: 'status' },
      { header: 'Cant.', width: 45, key: 'quantity', align: 'right' },
      { header: 'Subtotal', width: 80, key: 'subtotal', align: 'right' },
    ],
    quotations.flatMap((quotation) =>
      (quotation.items ?? []).map((item) => ({
        quotation: quotation.codigo,
        description: item.descripcion,
        type: humanize(item.tipoLinea),
        status: humanize(item.estadoOperativo),
        quantity: asNumber(item.cantidad).toLocaleString('es-CL'),
        subtotal: money(item.subtotal),
      })),
    ),
  );
  doc.section('Pagos y abonos').table(
    [
      { header: 'COT', width: 70, key: 'quotation' },
      { header: 'Fecha', width: 60, key: 'date' },
      { header: 'Método', width: 90, key: 'method' },
      { header: 'Banco', width: 90, key: 'bank' },
      { header: 'Transacción', width: 95, key: 'transaction' },
      { header: 'Monto', width: 85, key: 'amount', align: 'right' },
    ],
    payments.map((payment) => ({
        quotation: payment.quotation?.codigo ?? '',
        date: dateText(payment.fecha),
        method: humanize(payment.metodo),
        bank: payment.bancoOrigen ?? '-',
        transaction: payment.numeroTransaccion ?? '-',
        amount: money(payment.monto),
      })),
  );
  return doc.finalize();
}

const workOrderProgress = (workOrder: WorkOrder): number => {
  const items = workOrder.items ?? [];
  if (items.length === 0) return 0;
  const completed = items.filter((item) => item.estadoOperativo === 'completado').length;
  return Math.round((completed / items.length) * 100);
};

export async function generateWorkshopReportExcel(filters: WorkshopReportFilters): Promise<Buffer> {
  const workOrders = await getWorkshopWorkOrders(filters);
  const workbook = setupWorkbook();
  const subtitle = workshopSubtitle(filters);

  addSheet(
    workbook,
    'Órdenes de trabajo',
    'UNITHOR - REPORTE DE TALLER',
    subtitle,
    [
      { header: 'Código OT', key: 'code', width: 18 },
      { header: 'Ingreso', key: 'date', width: 14, date: true },
      { header: 'Cliente', key: 'client', width: 30 },
      { header: 'Contacto', key: 'contact', width: 24 },
      { header: 'Facturación', key: 'billing', width: 28 },
      { header: 'Vehículo', key: 'vehicle', width: 24 },
      { header: 'Mecánico', key: 'mechanic', width: 24 },
      { header: 'Estado OT', key: 'status', width: 18 },
      { header: 'Progreso', key: 'progress', width: 12 },
      { header: 'COT vinculada', key: 'quotation', width: 18 },
      { header: 'Total COT', key: 'total', width: 16, currency: true },
      { header: 'Pagado', key: 'paid', width: 16, currency: true },
      { header: 'Saldo', key: 'balance', width: 16, currency: true },
      { header: 'Motivo / diagnóstico', key: 'description', width: 42 },
    ],
    workOrders.map((workOrder) => {
      const quotation = workOrder.quotation;
      const total = quotation ? asNumber(quotation.total) : 0;
      const paid = quotation ? asNumber(quotation.pagado) : 0;
      return {
        code: workOrder.codigo,
        date: workOrder.fechaIngreso ?? workOrder.createdAt,
        client: workOrder.client?.nombre ?? 'Sin cliente',
        contact: workOrder.contactName ?? workOrder.contactClient?.nombre ?? '',
        billing: workOrder.billingName ?? workOrder.billingClient?.nombre ?? '',
        vehicle: workOrderVehicleLabel(workOrder),
        mechanic: workOrder.assignedMechanic?.nombre ?? 'Sin asignar',
        status: humanize(workOrder.estado),
        progress: `${workOrderProgress(workOrder)}%`,
        quotation: quotation?.codigo ?? 'Sin COT',
        total,
        paid,
        balance: Math.max(0, total - paid),
        description: workOrder.descripcion ?? '',
      };
    }),
    'TOTALES GENERALES',
  );

  addSheet(
    workbook,
    'Servicios y progreso',
    'UNITHOR - EJECUCIÓN DE SERVICIOS Y REPUESTOS',
    subtitle,
    [
      { header: 'OT', key: 'workOrder', width: 18 },
      { header: 'Patente', key: 'plate', width: 14 },
      { header: 'Descripción', key: 'description', width: 42 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Precio', key: 'price', width: 16, currency: true },
      { header: 'Subtotal', key: 'subtotal', width: 16, currency: true },
      { header: 'Stock usado', key: 'stock', width: 16 },
      { header: 'Notas', key: 'notes', width: 36 },
    ],
    workOrders.flatMap((workOrder) =>
      (workOrder.items ?? []).map((item) => ({
        workOrder: workOrder.codigo,
        plate: workOrder.vehicle?.patente ?? '',
        description: item.descripcion,
        type: humanize(item.tipoLinea),
        status: humanize(item.estadoOperativo),
        quantity: asNumber(item.cantidad),
        price: asNumber(item.precioUnitario),
        subtotal: asNumber(item.subtotal),
        stock: item.stockConsumido ? `${item.stockConsumidoCantidad} unidades` : 'No',
        notes: item.notasOperativas ?? '',
      })),
    ),
    'TOTAL SERVICIOS Y REPUESTOS',
  );

  addSheet(
    workbook,
    'Pagos vinculados',
    'UNITHOR - PAGOS DE OTS VÍA COTIZACIÓN',
    subtitle,
    [
      { header: 'OT', key: 'workOrder', width: 18 },
      { header: 'COT', key: 'quotation', width: 18 },
      { header: 'Fecha pago', key: 'date', width: 14, date: true },
      { header: 'Método', key: 'method', width: 18 },
      { header: 'Estado pago', key: 'status', width: 16 },
      { header: 'Monto', key: 'amount', width: 16, currency: true },
      { header: 'Receptor', key: 'receiver', width: 24 },
    ],
    workOrders.flatMap((workOrder) =>
      (workOrder.quotation?.payments ?? []).map((payment) => ({
        workOrder: workOrder.codigo,
        quotation: workOrder.quotation?.codigo ?? '',
        date: payment.fecha,
        method: humanize(payment.metodo),
        status: humanize(payment.estado),
        amount: asNumber(payment.monto),
        receiver: payment.creator?.nombre ?? '',
      })),
    ),
    'TOTAL PAGOS VINCULADOS',
  );

  addSheet(
    workbook,
    'Avances y solicitudes',
    'UNITHOR - AVANCES Y SOLICITUDES DE TALLER',
    subtitle,
    [
      { header: 'OT', key: 'workOrder', width: 18 },
      { header: 'Tipo registro', key: 'kind', width: 18 },
      { header: 'Fecha', key: 'date', width: 14, date: true },
      { header: 'Responsable', key: 'owner', width: 24 },
      { header: 'Estado / avance', key: 'status', width: 20 },
      { header: 'Detalle', key: 'detail', width: 56 },
    ],
    workOrders.flatMap((workOrder) => [
      ...(workOrder.progressReports ?? []).map((report) => ({
        workOrder: workOrder.codigo,
        kind: 'Avance',
        date: report.createdAt,
        owner: report.mechanic?.nombre ?? '',
        status: `${report.porcentaje}%`,
        detail: [report.comentario, report.bloqueos ? `Bloqueos: ${report.bloqueos}` : null]
          .filter(Boolean)
          .join(' | '),
      })),
      ...(workOrder.requests ?? []).map((request) => ({
        workOrder: workOrder.codigo,
        kind: humanize(request.tipo),
        date: request.createdAt,
        owner: request.requester?.nombre ?? '',
        status: humanize(request.estado),
        detail: [
          request.catalogItem?.nombre ?? '',
          request.motivo,
          request.precioSugerido ? `Sugerido ${money(request.precioSugerido)}` : null,
          request.precioAprobado ? `Aprobado ${money(request.precioAprobado)}` : null,
        ].filter(Boolean).join(' | '),
      })),
    ]),
    'TOTAL AVANCES Y SOLICITUDES',
  );

  return serializeWorkbook(workbook);
}

export async function generateWorkshopReportPdf(filters: WorkshopReportFilters): Promise<Uint8Array> {
  const workOrders = await getWorkshopWorkOrders(filters);
  const active = workOrders.filter((order) => !['entregada', 'cancelada'].includes(order.estado)).length;
  const linkedQuotationTotal = workOrders.reduce((sum, order) => sum + asNumber(order.quotation?.total), 0);
  const linkedPaid = workOrders.reduce((sum, order) => sum + asNumber(order.quotation?.pagado), 0);
  const doc = await createReportDocument(
    'Reporte de taller y progreso de OT',
    workshopSubtitle(filters),
  );

  doc.section('Resumen operativo').keyValues([
    ['Órdenes', String(workOrders.length)],
    ['Activas', String(active)],
    ['Monto COT vinculado', money(linkedQuotationTotal)],
    ['Pagado', money(linkedPaid)],
  ]);
  doc.section('Órdenes de trabajo').table(
    [
      { header: 'OT', width: 70, key: 'code' },
      { header: 'Ingreso', width: 58, key: 'date' },
      { header: 'Cliente', width: 110, key: 'client' },
      { header: 'Vehículo', width: 95, key: 'vehicle' },
      { header: 'Mecánico', width: 85, key: 'mechanic' },
      { header: 'Estado', width: 70, key: 'status' },
      { header: 'Progreso', width: 58, key: 'progress', align: 'right' },
    ],
    workOrders.map((workOrder) => ({
      code: workOrder.codigo,
      date: dateText(workOrder.fechaIngreso ?? workOrder.createdAt),
      client: workOrder.client?.nombre ?? 'Sin cliente',
      vehicle: workOrderVehicleLabel(workOrder),
      mechanic: workOrder.assignedMechanic?.nombre ?? 'Sin asignar',
      status: humanize(workOrder.estado),
      progress: `${workOrderProgress(workOrder)}%`,
    })),
  );
  doc.section('Servicios y repuestos').table(
    [
      { header: 'OT', width: 65, key: 'workOrder' },
      { header: 'Descripción', width: 180, key: 'description' },
      { header: 'Tipo', width: 70, key: 'type' },
      { header: 'Estado', width: 80, key: 'status' },
      { header: 'Cant.', width: 45, key: 'quantity', align: 'right' },
      { header: 'Subtotal', width: 80, key: 'subtotal', align: 'right' },
    ],
    workOrders.flatMap((workOrder) =>
      (workOrder.items ?? []).map((item) => ({
        workOrder: workOrder.codigo,
        description: item.descripcion,
        type: humanize(item.tipoLinea),
        status: humanize(item.estadoOperativo),
        quantity: asNumber(item.cantidad).toLocaleString('es-CL'),
        subtotal: money(item.subtotal),
      })),
    ),
  );
  doc.section('Pagos vinculados a OT').table(
    [
      { header: 'OT', width: 65, key: 'workOrder' },
      { header: 'COT', width: 70, key: 'quotation' },
      { header: 'Fecha', width: 60, key: 'date' },
      { header: 'Método', width: 95, key: 'method' },
      { header: 'Estado', width: 80, key: 'status' },
      { header: 'Monto', width: 90, key: 'amount', align: 'right' },
    ],
    workOrders.flatMap((workOrder) =>
      (workOrder.quotation?.payments ?? []).map((payment) => ({
        workOrder: workOrder.codigo,
        quotation: workOrder.quotation?.codigo ?? '',
        date: dateText(payment.fecha),
        method: humanize(payment.metodo),
        status: humanize(payment.estado),
        amount: money(payment.monto),
      })),
    ),
  );
  doc.section('Avances y solicitudes').table(
    [
      { header: 'OT', width: 65, key: 'workOrder' },
      { header: 'Tipo', width: 75, key: 'kind' },
      { header: 'Fecha', width: 60, key: 'date' },
      { header: 'Responsable', width: 95, key: 'owner' },
      { header: 'Estado', width: 75, key: 'status' },
      { header: 'Detalle', width: 180, key: 'detail' },
    ],
    workOrders.flatMap((workOrder) => [
      ...(workOrder.progressReports ?? []).map((report) => ({
        workOrder: workOrder.codigo,
        kind: 'Avance',
        date: dateText(report.createdAt),
        owner: report.mechanic?.nombre ?? '',
        status: `${report.porcentaje}%`,
        detail: report.comentario,
      })),
      ...(workOrder.requests ?? []).map((request) => ({
        workOrder: workOrder.codigo,
        kind: humanize(request.tipo),
        date: dateText(request.createdAt),
        owner: request.requester?.nombre ?? '',
        status: humanize(request.estado),
        detail: [request.catalogItem?.nombre, request.motivo].filter(Boolean).join(' | '),
      })),
    ]),
  );
  return doc.finalize();
}

const stockLabel = (cantidad: number, minimo: number): string => {
  if (cantidad <= 0) return 'Sin stock';
  if (cantidad <= minimo || cantidad <= 5) return 'Crítico';
  return 'Disponible';
};

const buildCatalogWhere = (
  filters: Pick<CatalogReportFilters, 'tipo' | 'stock' | 'search'>,
): CatalogWhere => {
  const where: CatalogWhere = {};
  if (filters.tipo !== undefined) where.tipo = filters.tipo;
  if (filters.stock === 'con_stock') where.stock = { [Op.gt]: 0 };
  if (filters.stock === 'sin_stock') where.stock = 0;
  if (filters.stock === 'critico') where.stock = { [Op.lte]: 5 };
  if (filters.search) {
    const like = `%${filters.search}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: like } },
      { nombre: { [Op.like]: like } },
      { descripcion: { [Op.like]: like } },
    ];
  }
  return where;
};

const inventorySubtitle = (filters: InventoryReportFilters): string =>
  [
    `${filters.fechaDesde} al ${filters.fechaHasta}`,
    filters.warehouseId ? `Almacén #${filters.warehouseId}` : null,
    filters.tipo ? `Movimiento: ${humanize(filters.tipo)}` : null,
    filters.stock !== 'todos' ? `Stock: ${humanize(filters.stock)}` : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
  ].filter((value): value is string => Boolean(value)).join(' | ');

const catalogSubtitle = (filters: CatalogReportFilters): string =>
  [
    `${filters.fechaDesde} al ${filters.fechaHasta}`,
    filters.tipo ? `Tipo: ${humanize(filters.tipo)}` : null,
    filters.stock !== 'todos' ? `Stock: ${humanize(filters.stock)}` : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
  ].filter((value): value is string => Boolean(value)).join(' | ');

const fleetSubtitle = (filters: FleetReportFilters): string =>
  [
    `${filters.fechaDesde} al ${filters.fechaHasta}`,
    filters.scope === 'clients' ? 'Solo clientes' : null,
    filters.scope === 'vehicles' ? 'Solo vehículos' : null,
    filters.clientType ? `Tipo cliente: ${humanize(filters.clientType)}` : null,
    filters.onlyWithHistory ? 'Solo con historial' : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
  ].filter((value): value is string => Boolean(value)).join(' | ');

const getInventoryData = async (filters: InventoryReportFilters) => {
  const catalogWhere = buildCatalogWhere({
    tipo: 'parte',
    stock: 'todos',
    search: filters.search,
  });
  const balanceWhere: WhereOptions<InferAttributes<StockBalance>> = {};
  if (filters.warehouseId !== undefined) balanceWhere.warehouseId = filters.warehouseId;
  if (filters.catalogItemId !== undefined) balanceWhere.catalogItemId = filters.catalogItemId;

  const movementWhere: WhereOptions<InferAttributes<StockMovement>> = {
    fecha: { [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)] },
  };
  if (filters.warehouseId !== undefined) movementWhere.warehouseId = filters.warehouseId;
  if (filters.catalogItemId !== undefined) movementWhere.catalogItemId = filters.catalogItemId;
  if (filters.tipo !== undefined) movementWhere.tipo = filters.tipo;

  const [warehouses, balances, movements] = await Promise.all([
    Warehouse.findAll({ order: [['nombre', 'ASC']] }),
    StockBalance.findAll({
      where: balanceWhere,
      include: [
        { model: Warehouse, as: 'warehouse', attributes: ['id', 'codigo', 'nombre'], required: true },
        {
          model: CatalogItem,
          as: 'catalogItem',
          attributes: ['id', 'codigo', 'nombre', 'precio', 'stockMinimo', 'stock'],
          where: catalogWhere,
          required: true,
        },
      ],
      order: [
        [{ model: Warehouse, as: 'warehouse' }, 'nombre', 'ASC'],
        [{ model: CatalogItem, as: 'catalogItem' }, 'nombre', 'ASC'],
      ],
    }),
    StockMovement.findAll({
      where: movementWhere,
      include: [
        {
          model: CatalogItem,
          as: 'catalogItem',
          attributes: ['id', 'codigo', 'nombre'],
          where: filters.search
            ? {
                [Op.or]: [
                  { codigo: { [Op.like]: `%${filters.search}%` } },
                  { nombre: { [Op.like]: `%${filters.search}%` } },
                ],
              }
            : undefined,
          required: Boolean(filters.search),
        },
        { model: Warehouse, as: 'warehouse', attributes: ['id', 'codigo', 'nombre'], required: true },
        { model: User, as: 'creator', attributes: ['id', 'nombre'], required: false },
      ],
      order: [
        ['fecha', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
  ]);

  const filteredBalances = balances.filter((balance) => {
    const quantity = Number(balance.cantidad);
    const minimum = Number(balance.catalogItem?.stockMinimo ?? 0);
    if (filters.stock === 'con_stock') return quantity > 0;
    if (filters.stock === 'sin_stock') return quantity <= 0;
    if (filters.stock === 'critico') return quantity > 0 && (quantity <= minimum || quantity <= 5);
    return true;
  });

  return { warehouses, balances: filteredBalances, movements };
};

export async function generateInventoryReportExcel(filters: InventoryReportFilters): Promise<Buffer> {
  const { warehouses, balances, movements } = await getInventoryData(filters);
  const workbook = setupWorkbook();
  const subtitle = inventorySubtitle(filters);

  addSheet(
    workbook,
    'Saldos por almacén',
    'UNITHOR - REPORTE DE ALMACENES E INVENTARIO',
    subtitle,
    [
      { header: 'Almacén', key: 'warehouse', width: 24 },
      { header: 'Código almacén', key: 'warehouseCode', width: 16 },
      { header: 'Código repuesto', key: 'itemCode', width: 18 },
      { header: 'Repuesto', key: 'itemName', width: 38 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Mínimo', key: 'minimum', width: 12 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Valor unitario', key: 'unitValue', width: 16, currency: true },
      { header: 'Valor stock', key: 'stockValue', width: 16, currency: true },
    ],
    balances.map((balance) => {
      const quantity = Number(balance.cantidad);
      const minimum = Number(balance.catalogItem?.stockMinimo ?? 0);
      const price = asNumber(balance.catalogItem?.precio);
      return {
        warehouse: balance.warehouse?.nombre ?? '',
        warehouseCode: balance.warehouse?.codigo ?? '',
        itemCode: balance.catalogItem?.codigo ?? '',
        itemName: balance.catalogItem?.nombre ?? '',
        quantity,
        minimum,
        status: stockLabel(quantity, minimum),
        unitValue: price,
        stockValue: price * quantity,
      };
    }),
    'TOTAL SALDOS',
  );

  addSheet(
    workbook,
    'Movimientos',
    'UNITHOR - KARDEX Y MOVIMIENTOS DE ALMACÉN',
    subtitle,
    [
      { header: 'Fecha', key: 'date', width: 14, date: true },
      { header: 'Almacén', key: 'warehouse', width: 24 },
      { header: 'Repuesto', key: 'itemName', width: 36 },
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Saldo resultante', key: 'balance', width: 16 },
      { header: 'Motivo', key: 'reason', width: 42 },
      { header: 'Referencia', key: 'reference', width: 20 },
      { header: 'Responsable', key: 'owner', width: 24 },
    ],
    movements.map((movement) => ({
      date: movement.fecha,
      warehouse: movement.warehouse?.nombre ?? '',
      itemName: movement.catalogItem?.nombre ?? '',
      type: humanize(movement.tipo),
      quantity: Number(movement.cantidad),
      balance: Number(movement.saldoResultante),
      reason: movement.motivo,
      reference: movement.referencia ?? '',
      owner: movement.creator?.nombre ?? '',
    })),
    'TOTAL MOVIMIENTOS',
  );

  addSheet(
    workbook,
    'Resumen de almacenes',
    'UNITHOR - RESUMEN DE ALMACENES',
    subtitle,
    [
      { header: 'Código', key: 'code', width: 16 },
      { header: 'Almacén', key: 'warehouse', width: 28 },
      { header: 'Dirección', key: 'address', width: 36 },
      { header: 'Activo', key: 'active', width: 12 },
      { header: 'Items con saldo', key: 'items', width: 16 },
      { header: 'Unidades', key: 'units', width: 14 },
    ],
    warehouses.map((warehouse) => {
      const warehouseBalances = balances.filter((balance) => balance.warehouseId === warehouse.id);
      return {
        code: warehouse.codigo,
        warehouse: warehouse.nombre,
        address: warehouse.direccion ?? '',
        active: warehouse.activo ? 'Sí' : 'No',
        items: warehouseBalances.filter((balance) => balance.cantidad > 0).length,
        units: warehouseBalances.reduce((sum, balance) => sum + Number(balance.cantidad), 0),
      };
    }),
    'TOTAL ALMACENES',
  );

  return serializeWorkbook(workbook);
}

export async function generateInventoryReportPdf(filters: InventoryReportFilters): Promise<Uint8Array> {
  const { warehouses, balances, movements } = await getInventoryData(filters);
  const totalUnits = balances.reduce((sum, balance) => sum + Number(balance.cantidad), 0);
  const critical = balances.filter((balance) => {
    const quantity = Number(balance.cantidad);
    const minimum = Number(balance.catalogItem?.stockMinimo ?? 0);
    return quantity > 0 && (quantity <= minimum || quantity <= 5);
  }).length;
  const doc = await createReportDocument(
    'Reporte de almacenes e inventario',
    inventorySubtitle(filters),
  );

  doc.section('Resumen ejecutivo').keyValues([
    ['Almacenes', String(warehouses.length)],
    ['Items en reporte', String(balances.length)],
    ['Unidades totales', totalUnits.toLocaleString('es-CL')],
    ['Stock crítico', String(critical)],
  ]);
  doc.section('Saldos por almacén').table(
    [
      { header: 'Almacén', width: 90, key: 'warehouse' },
      { header: 'Código', width: 60, key: 'code' },
      { header: 'Repuesto', width: 185, key: 'item' },
      { header: 'Cant.', width: 45, key: 'quantity', align: 'right' },
      { header: 'Mín.', width: 40, key: 'minimum', align: 'right' },
      { header: 'Estado', width: 80, key: 'status' },
    ],
    balances.map((balance) => {
      const quantity = Number(balance.cantidad);
      const minimum = Number(balance.catalogItem?.stockMinimo ?? 0);
      return {
        warehouse: balance.warehouse?.codigo ?? '',
        code: balance.catalogItem?.codigo ?? '',
        item: balance.catalogItem?.nombre ?? '',
        quantity: quantity.toLocaleString('es-CL'),
        minimum: minimum.toLocaleString('es-CL'),
        status: stockLabel(quantity, minimum),
      };
    }),
  );
  doc.section('Movimientos del período').table(
    [
      { header: 'Fecha', width: 60, key: 'date' },
      { header: 'Almacén', width: 75, key: 'warehouse' },
      { header: 'Repuesto', width: 160, key: 'item' },
      { header: 'Tipo', width: 85, key: 'type' },
      { header: 'Cant.', width: 45, key: 'quantity', align: 'right' },
      { header: 'Referencia', width: 80, key: 'reference' },
    ],
    movements.map((movement) => ({
      date: dateText(movement.fecha),
      warehouse: movement.warehouse?.codigo ?? '',
      item: movement.catalogItem?.nombre ?? '',
      type: humanize(movement.tipo),
      quantity: Number(movement.cantidad).toLocaleString('es-CL'),
      reference: movement.referencia ?? '-',
    })),
  );
  return doc.finalize();
}

const getCatalogUsageData = async (filters: CatalogReportFilters) => {
  const catalogWhere = buildCatalogWhere(filters);
  const [items, quotedItems, workItems] = await Promise.all([
    CatalogItem.findAll({
      where: catalogWhere,
      order: [['nombre', 'ASC']],
    }),
    QuotationItem.findAll({
      include: [
        {
          model: Quotation,
          as: 'quotation',
          attributes: ['id', 'codigo', 'createdAt'],
          where: {
            createdAt: { [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)] },
          },
          required: true,
        },
        {
          model: CatalogItem,
          as: 'catalogItem',
          attributes: ['id', 'codigo', 'nombre', 'tipo'],
          where: catalogWhere,
          required: false,
        },
      ],
      order: [['createdAt', 'ASC']],
    }),
    WorkOrderItem.findAll({
      include: [
        {
          model: WorkOrder,
          as: 'workOrder',
          attributes: ['id', 'codigo', 'fechaIngreso'],
          where: {
            fechaIngreso: { [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)] },
          },
          required: true,
        },
        {
          model: CatalogItem,
          as: 'catalogItem',
          attributes: ['id', 'codigo', 'nombre', 'tipo'],
          where: catalogWhere,
          required: false,
        },
      ],
      order: [['createdAt', 'ASC']],
    }),
  ]);

  return { items, quotedItems, workItems };
};

interface UsageSummary {
  quotedQuantity: number;
  quotedRevenue: number;
  workQuantity: number;
  workRevenue: number;
}

const summarizeUsage = (
  items: CatalogItem[],
  quotedItems: QuotationItem[],
  workItems: WorkOrderItem[],
): Map<number, UsageSummary> => {
  const summary = new Map<number, UsageSummary>();
  const ensure = (id: number): UsageSummary => {
    const current = summary.get(id) ?? {
      quotedQuantity: 0,
      quotedRevenue: 0,
      workQuantity: 0,
      workRevenue: 0,
    };
    summary.set(id, current);
    return current;
  };

  items.forEach((item) => ensure(item.id));
  quotedItems.forEach((item) => {
    if (item.catalogItemId === null) return;
    const current = ensure(item.catalogItemId);
    current.quotedQuantity += asNumber(item.cantidad);
    current.quotedRevenue += asNumber(item.subtotal);
  });
  workItems.forEach((item) => {
    if (item.catalogItemId === null) return;
    const current = ensure(item.catalogItemId);
    current.workQuantity += asNumber(item.cantidad);
    current.workRevenue += asNumber(item.subtotal);
  });
  return summary;
};

export async function generateCatalogReportExcel(filters: CatalogReportFilters): Promise<Buffer> {
  const { items, quotedItems, workItems } = await getCatalogUsageData(filters);
  const usage = summarizeUsage(items, quotedItems, workItems);
  const workbook = setupWorkbook();
  const subtitle = catalogSubtitle(filters);

  addSheet(
    workbook,
    'Catálogo',
    'UNITHOR - REPORTE DE CATÁLOGO Y OFERTA',
    subtitle,
    [
      { header: 'Código', key: 'code', width: 18 },
      { header: 'Nombre', key: 'name', width: 38 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Precio', key: 'price', width: 16, currency: true },
      { header: 'Stock global', key: 'stock', width: 14 },
      { header: 'Stock mínimo', key: 'minimum', width: 14 },
      { header: 'Estado stock', key: 'stockStatus', width: 16 },
      { header: 'Ofrecido COT', key: 'quotedQuantity', width: 14 },
      { header: 'Venta ofrecida', key: 'quotedRevenue', width: 16, currency: true },
      { header: 'Usado OT', key: 'workQuantity', width: 14 },
      { header: 'Valor OT', key: 'workRevenue', width: 16, currency: true },
    ],
    items.map((item) => {
      const itemUsage = usage.get(item.id);
      return {
        code: item.codigo ?? '',
        name: item.nombre,
        type: humanize(item.tipo),
        price: asNumber(item.precio),
        stock: Number(item.stock),
        minimum: Number(item.stockMinimo),
        stockStatus: item.tipo === 'parte' ? stockLabel(Number(item.stock), Number(item.stockMinimo)) : '-',
        quotedQuantity: itemUsage?.quotedQuantity ?? 0,
        quotedRevenue: itemUsage?.quotedRevenue ?? 0,
        workQuantity: itemUsage?.workQuantity ?? 0,
        workRevenue: itemUsage?.workRevenue ?? 0,
      };
    }),
    'TOTAL CATÁLOGO',
  );

  addSheet(
    workbook,
    'Ofrecidos en COT',
    'UNITHOR - SERVICIOS Y REPUESTOS OFRECIDOS',
    subtitle,
    [
      { header: 'COT', key: 'quotation', width: 18 },
      { header: 'Código', key: 'code', width: 18 },
      { header: 'Descripción', key: 'description', width: 42 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Precio', key: 'price', width: 16, currency: true },
      { header: 'Subtotal', key: 'subtotal', width: 16, currency: true },
    ],
    quotedItems.map((item) => ({
      quotation: item.quotation?.codigo ?? '',
      code: item.catalogItem?.codigo ?? '',
      description: item.descripcion,
      type: humanize(item.tipoLinea),
      quantity: asNumber(item.cantidad),
      price: asNumber(item.precioUnitario),
      subtotal: asNumber(item.subtotal),
    })),
    'TOTAL COTIZADO',
  );

  addSheet(
    workbook,
    'Usados en OT',
    'UNITHOR - SERVICIOS Y REPUESTOS EN TALLER',
    subtitle,
    [
      { header: 'OT', key: 'workOrder', width: 18 },
      { header: 'Código', key: 'code', width: 18 },
      { header: 'Descripción', key: 'description', width: 42 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Subtotal', key: 'subtotal', width: 16, currency: true },
    ],
    workItems.map((item) => ({
      workOrder: item.workOrder?.codigo ?? '',
      code: item.catalogItem?.codigo ?? '',
      description: item.descripcion,
      type: humanize(item.tipoLinea),
      status: humanize(item.estadoOperativo),
      quantity: asNumber(item.cantidad),
      subtotal: asNumber(item.subtotal),
    })),
    'TOTAL USADO EN OT',
  );

  return serializeWorkbook(workbook);
}

export async function generateCatalogReportPdf(filters: CatalogReportFilters): Promise<Uint8Array> {
  const { items, quotedItems, workItems } = await getCatalogUsageData(filters);
  const usage = summarizeUsage(items, quotedItems, workItems);
  const critical = items.filter((item) => item.tipo === 'parte' && Number(item.stock) <= Math.max(5, Number(item.stockMinimo))).length;
  const rankedItems = [...items]
    .sort((left, right) => (usage.get(right.id)?.quotedRevenue ?? 0) - (usage.get(left.id)?.quotedRevenue ?? 0));
  const doc = await createReportDocument(
    'Reporte de catálogo, servicios y repuestos',
    catalogSubtitle(filters),
  );

  doc.section('Resumen ejecutivo').keyValues([
    ['Items activos', String(items.length)],
    ['Ofertas en COT', String(quotedItems.length)],
    ['Líneas en OT', String(workItems.length)],
    ['Stock crítico', String(critical)],
  ]);
  doc.section('Catálogo y uso').table(
    [
      { header: 'Código', width: 65, key: 'code' },
      { header: 'Nombre', width: 180, key: 'name' },
      { header: 'Tipo', width: 70, key: 'type' },
      { header: 'Stock', width: 48, key: 'stock', align: 'right' },
      { header: 'COT', width: 48, key: 'quoted', align: 'right' },
      { header: 'Venta', width: 85, key: 'revenue', align: 'right' },
    ],
    rankedItems.map((item) => ({
      code: item.codigo ?? '',
      name: item.nombre,
      type: humanize(item.tipo),
      stock: Number(item.stock).toLocaleString('es-CL'),
      quoted: (usage.get(item.id)?.quotedQuantity ?? 0).toLocaleString('es-CL'),
      revenue: money(usage.get(item.id)?.quotedRevenue ?? 0),
    })),
  );
  doc.section('Servicios y repuestos más usados en taller').table(
    [
      { header: 'OT', width: 70, key: 'workOrder' },
      { header: 'Descripción', width: 220, key: 'description' },
      { header: 'Tipo', width: 70, key: 'type' },
      { header: 'Estado', width: 80, key: 'status' },
      { header: 'Subtotal', width: 90, key: 'subtotal', align: 'right' },
    ],
    workItems.map((item) => ({
      workOrder: item.workOrder?.codigo ?? '',
      description: item.descripcion,
      type: humanize(item.tipoLinea),
      status: humanize(item.estadoOperativo),
      subtotal: money(item.subtotal),
    })),
  );
  return doc.finalize();
}

interface HistoryCounters {
  workOrders: number;
  quotations: number;
  paid: number;
  total: number;
  lastActivity: Date | null;
}

const emptyCounters = (): HistoryCounters => ({
  workOrders: 0,
  quotations: 0,
  paid: 0,
  total: 0,
  lastActivity: null,
});

const bumpDate = (current: Date | null, candidate: Date | null | undefined): Date | null => {
  if (!candidate) return current;
  if (!current || candidate.getTime() > current.getTime()) return candidate;
  return current;
};

const getFleetData = async (filters: FleetReportFilters) => {
  const clientWhere: ClientWhere = {};
  const vehicleWhere: VehicleWhere = {};
  const activityRange = {
    [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)],
  };

  if (filters.clientType !== undefined) clientWhere.tipo = filters.clientType;
  if (filters.clientId !== undefined) clientWhere.id = filters.clientId;
  if (filters.vehicleId !== undefined) vehicleWhere.id = filters.vehicleId;
  if (filters.search) {
    const like = `%${filters.search}%`;
    clientWhere[Op.or] = [
      { nombre: { [Op.like]: like } },
      { rut: { [Op.like]: like } },
      { email: { [Op.like]: like } },
      { telefono: { [Op.like]: like } },
    ];
    vehicleWhere[Op.or] = [
      { patente: { [Op.like]: like } },
      { marca: { [Op.like]: like } },
      { modelo: { [Op.like]: like } },
      { vinChasis: { [Op.like]: like } },
    ];
  }

  const [clients, vehicles, workOrders, quotations] = await Promise.all([
    Client.findAll({ where: clientWhere, order: [['nombre', 'ASC']] }),
    Vehicle.findAll({
      where: vehicleWhere,
      include: [{ model: Client, as: 'client', attributes: ['id', 'rut', 'nombre'], required: false }],
      order: [['patente', 'ASC']],
    }),
    WorkOrder.findAll({
      where: { fechaIngreso: activityRange },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'rut', 'nombre'], required: false },
        { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente', 'marca', 'modelo'], required: false },
      ],
      order: [['fechaIngreso', 'ASC']],
    }),
    Quotation.findAll({
      where: { createdAt: activityRange },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'rut', 'nombre'], required: false },
        { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente', 'marca', 'modelo'], required: false },
      ],
      order: [['createdAt', 'ASC']],
    }),
  ]);

  const clientCounters = new Map<number, HistoryCounters>();
  const vehicleCounters = new Map<number, HistoryCounters>();
  clients.forEach((client) => clientCounters.set(client.id, emptyCounters()));
  vehicles.forEach((vehicle) => vehicleCounters.set(vehicle.id, emptyCounters()));

  workOrders.forEach((workOrder) => {
    if (workOrder.clientId !== null) {
      const current = clientCounters.get(workOrder.clientId) ?? emptyCounters();
      current.workOrders += 1;
      current.lastActivity = bumpDate(current.lastActivity, workOrder.fechaIngreso ?? workOrder.createdAt);
      clientCounters.set(workOrder.clientId, current);
    }
    if (workOrder.vehicleId !== null) {
      const current = vehicleCounters.get(workOrder.vehicleId) ?? emptyCounters();
      current.workOrders += 1;
      current.lastActivity = bumpDate(current.lastActivity, workOrder.fechaIngreso ?? workOrder.createdAt);
      vehicleCounters.set(workOrder.vehicleId, current);
    }
  });

  quotations.forEach((quotation) => {
    if (quotation.clientId !== null) {
      const current = clientCounters.get(quotation.clientId) ?? emptyCounters();
      current.quotations += 1;
      current.total += asNumber(quotation.total);
      current.paid += asNumber(quotation.pagado);
      current.lastActivity = bumpDate(current.lastActivity, quotation.createdAt);
      clientCounters.set(quotation.clientId, current);
    }
    if (quotation.vehicleId !== null) {
      const current = vehicleCounters.get(quotation.vehicleId) ?? emptyCounters();
      current.quotations += 1;
      current.total += asNumber(quotation.total);
      current.paid += asNumber(quotation.pagado);
      current.lastActivity = bumpDate(current.lastActivity, quotation.createdAt);
      vehicleCounters.set(quotation.vehicleId, current);
    }
  });

  const filteredClients = filters.onlyWithHistory
    ? clients.filter((client) => {
        const counters = clientCounters.get(client.id);
        return Boolean(counters && (counters.workOrders > 0 || counters.quotations > 0));
      })
    : clients;
  const filteredVehicles = filters.onlyWithHistory
    ? vehicles.filter((vehicle) => {
        const counters = vehicleCounters.get(vehicle.id);
        return Boolean(counters && (counters.workOrders > 0 || counters.quotations > 0));
      })
    : vehicles;

  return { clients: filteredClients, vehicles: filteredVehicles, workOrders, quotations, clientCounters, vehicleCounters };
};

export async function generateFleetReportExcel(filters: FleetReportFilters): Promise<Buffer> {
  const { clients, vehicles, workOrders, quotations, clientCounters, vehicleCounters } = await getFleetData(filters);
  const workbook = setupWorkbook();
  const subtitle = fleetSubtitle(filters);

  if (filters.scope !== 'vehicles') {
    addSheet(
      workbook,
      'Clientes',
      'UNITHOR - REPORTE DE CLIENTES',
      subtitle,
      [
      { header: 'RUT', key: 'rut', width: 16 },
      { header: 'Cliente / Razón social', key: 'name', width: 36 },
      { header: 'Tipo', key: 'type', width: 14 },
      { header: 'Teléfono', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Dirección', key: 'address', width: 36 },
      { header: 'OTs', key: 'workOrders', width: 10 },
      { header: 'COTs', key: 'quotations', width: 10 },
      { header: 'Total cotizado', key: 'total', width: 16, currency: true },
      { header: 'Pagado', key: 'paid', width: 16, currency: true },
      { header: 'Última actividad', key: 'lastActivity', width: 16, date: true },
    ],
      clients.map((client) => {
        const counters = clientCounters.get(client.id) ?? emptyCounters();
        return {
        rut: client.rut ?? '',
        name: client.nombre,
        type: humanize(client.tipo),
        phone: client.telefono ?? '',
        email: client.email ?? '',
        address: [client.direccion, client.comuna, client.region].filter(Boolean).join(', '),
        workOrders: counters.workOrders,
        quotations: counters.quotations,
        total: counters.total,
        paid: counters.paid,
        lastActivity: counters.lastActivity,
        };
      }),
      'TOTAL CLIENTES',
    );
  }

  if (filters.scope !== 'clients') {
    addSheet(
      workbook,
      'Vehículos',
      'UNITHOR - REPORTE DE VEHÍCULOS',
      subtitle,
      [
      { header: 'Patente', key: 'plate', width: 16 },
      { header: 'Marca', key: 'brand', width: 18 },
      { header: 'Modelo', key: 'model', width: 18 },
      { header: 'Año', key: 'year', width: 10 },
      { header: 'Dueño', key: 'owner', width: 34 },
      { header: 'RUT dueño', key: 'ownerRut', width: 16 },
      { header: 'Kilometraje', key: 'mileage', width: 14 },
      { header: 'OTs', key: 'workOrders', width: 10 },
      { header: 'COTs', key: 'quotations', width: 10 },
      { header: 'Total cotizado', key: 'total', width: 16, currency: true },
      { header: 'Última actividad', key: 'lastActivity', width: 16, date: true },
    ],
      vehicles.map((vehicle) => {
        const counters = vehicleCounters.get(vehicle.id) ?? emptyCounters();
        return {
        plate: vehicle.patente,
        brand: vehicle.marca ?? '',
        model: vehicle.modelo ?? '',
        year: vehicle.ano ?? '',
        owner: vehicle.client?.nombre ?? '',
        ownerRut: vehicle.client?.rut ?? '',
        mileage: vehicle.kilometraje ?? '',
        workOrders: counters.workOrders,
        quotations: counters.quotations,
        total: counters.total,
        lastActivity: counters.lastActivity,
        };
      }),
      'TOTAL VEHÍCULOS',
    );
  }

  addSheet(
    workbook,
    'Historial OT',
    'UNITHOR - HISTORIAL DE ÓRDENES POR CLIENTE Y VEHÍCULO',
    subtitle,
    [
      { header: 'OT', key: 'code', width: 18 },
      { header: 'Fecha ingreso', key: 'date', width: 14, date: true },
      { header: 'Cliente', key: 'client', width: 32 },
      { header: 'Vehículo', key: 'vehicle', width: 24 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Motivo', key: 'description', width: 46 },
    ],
    workOrders.map((workOrder) => ({
      code: workOrder.codigo,
      date: workOrder.fechaIngreso ?? workOrder.createdAt,
      client: workOrder.client?.nombre ?? '',
      vehicle: workOrderVehicleLabel(workOrder),
      status: humanize(workOrder.estado),
      description: workOrder.descripcion ?? '',
    })),
    'TOTAL HISTORIAL OT',
  );

  addSheet(
    workbook,
    'Historial COT',
    'UNITHOR - HISTORIAL DE COTIZACIONES POR CLIENTE Y VEHÍCULO',
    subtitle,
    [
      { header: 'COT', key: 'code', width: 18 },
      { header: 'Fecha', key: 'date', width: 14, date: true },
      { header: 'Cliente', key: 'client', width: 32 },
      { header: 'Vehículo', key: 'vehicle', width: 24 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Total', key: 'total', width: 16, currency: true },
      { header: 'Pagado', key: 'paid', width: 16, currency: true },
    ],
    quotations.map((quotation) => ({
      code: quotation.codigo,
      date: quotation.createdAt,
      client: quotation.client?.nombre ?? '',
      vehicle: quotationVehicleLabel(quotation),
      status: humanize(quotation.estadoPago),
      total: asNumber(quotation.total),
      paid: asNumber(quotation.pagado),
    })),
    'TOTAL HISTORIAL COT',
  );

  return serializeWorkbook(workbook);
}

export async function generateFleetReportPdf(filters: FleetReportFilters): Promise<Uint8Array> {
  const { clients, vehicles, workOrders, quotations, clientCounters, vehicleCounters } = await getFleetData(filters);
  const quotedTotal = quotations.reduce((sum, quotation) => sum + asNumber(quotation.total), 0);
  const doc = await createReportDocument(
    'Reporte de clientes, vehículos e historial',
    fleetSubtitle(filters),
  );

  doc.section('Resumen ejecutivo').keyValues([
    ['Clientes', String(clients.length)],
    ['Vehículos', String(vehicles.length)],
    ['OTs período', String(workOrders.length)],
    ['COT período', `${quotations.length} / ${money(quotedTotal)}`],
  ]);
  if (filters.scope !== 'vehicles') {
    doc.section('Clientes con historial').table(
      [
      { header: 'Cliente', width: 170, key: 'client' },
      { header: 'RUT', width: 75, key: 'rut' },
      { header: 'Tipo', width: 65, key: 'type' },
      { header: 'OTs', width: 45, key: 'workOrders', align: 'right' },
      { header: 'COTs', width: 45, key: 'quotations', align: 'right' },
      { header: 'Total', width: 85, key: 'total', align: 'right' },
    ],
      clients.map((client) => {
        const counters = clientCounters.get(client.id) ?? emptyCounters();
        return {
        client: client.nombre,
        rut: client.rut ?? '-',
        type: humanize(client.tipo),
        workOrders: String(counters.workOrders),
        quotations: String(counters.quotations),
        total: money(counters.total),
        };
      }),
    );
  }
  if (filters.scope !== 'clients') {
    doc.section('Vehículos con actividad').table(
      [
      { header: 'Patente', width: 70, key: 'plate' },
      { header: 'Vehículo', width: 145, key: 'vehicle' },
      { header: 'Dueño', width: 150, key: 'owner' },
      { header: 'OTs', width: 45, key: 'workOrders', align: 'right' },
      { header: 'COTs', width: 45, key: 'quotations', align: 'right' },
      { header: 'Última', width: 65, key: 'last' },
    ],
      vehicles.map((vehicle) => {
        const counters = vehicleCounters.get(vehicle.id) ?? emptyCounters();
        return {
        plate: vehicle.patente,
        vehicle: [vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || '-',
        owner: vehicle.client?.nombre ?? 'Sin dueño',
        workOrders: String(counters.workOrders),
        quotations: String(counters.quotations),
        last: dateText(counters.lastActivity),
        };
      }),
    );
  }
  return doc.finalize();
}

const administrationSubtitle = (filters: AdministrationReportFilters): string =>
  [
    `Sesiones del ${filters.fechaDesde} al ${filters.fechaHasta}`,
    filters.roleId ? `Rol ID: ${filters.roleId}` : null,
    filters.activo === true ? 'Solo activos' : null,
    filters.activo === false ? 'Solo inactivos' : null,
    filters.includeDeleted ? 'Incluye eliminados' : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
  ].filter(Boolean).join(' · ');

const permissionLabel = (permission: Permission): string =>
  `${humanize(permission.modulo)}:${humanize(permission.accion)}`;

const rolePermissionsText = (role: Role | undefined | null): string =>
  role?.permissions?.map(permissionLabel).sort((a, b) => a.localeCompare(b)).join(', ') ?? '';

const buildUserWhere = (filters: AdministrationReportFilters): UserWhere => {
  const where: UserWhere = {};
  if (filters.roleId !== undefined) where.roleId = filters.roleId;
  if (filters.activo !== undefined) where.activo = filters.activo;
  if (filters.search) {
    const like = `%${filters.search}%`;
    where[Op.or] = [
      { nombre: { [Op.like]: like } },
      { username: { [Op.like]: like } },
      { email: { [Op.like]: like } },
    ];
  }
  return where;
};

const getAdministrationReportData = async (filters: AdministrationReportFilters) => {
  const users = await User.findAll({
    where: buildUserWhere(filters),
    include: [
      {
        model: Role,
        attributes: ['id', 'nombre', 'descripcion'],
        include: [
          {
            model: Permission,
            attributes: ['id', 'modulo', 'accion'],
            through: { attributes: [] },
          },
        ],
      },
    ],
    attributes: ['id', 'nombre', 'username', 'email', 'roleId', 'activo', 'createdAt', 'updatedAt', 'deletedAt'],
    paranoid: !filters.includeDeleted,
    order: [['nombre', 'ASC']],
  });

  const userIds = users.map((user) => user.id);
  const tokens = userIds.length > 0
    ? await RefreshToken.findAll({
        where: {
          userId: userIds,
          createdAt: {
            [Op.between]: [startOfDayUtc(filters.fechaDesde), endOfDayUtc(filters.fechaHasta)],
          },
        },
        attributes: ['id', 'userId', 'expiresAt', 'revokedAt', 'deviceInfo', 'createdAt'],
        order: [['createdAt', 'DESC']],
      })
    : [];

  const roles = await Role.findAll({
    include: [
      {
        model: Permission,
        attributes: ['id', 'modulo', 'accion'],
        through: { attributes: [] },
      },
    ],
    order: [['nombre', 'ASC']],
  });

  const now = new Date();
  const sessionSummary = new Map<number, { total: number; active: number; revoked: number; expired: number }>();
  tokens.forEach((token) => {
    const current = sessionSummary.get(token.userId) ?? { total: 0, active: 0, revoked: 0, expired: 0 };
    current.total += 1;
    if (token.revokedAt) current.revoked += 1;
    else if (token.expiresAt < now) current.expired += 1;
    else current.active += 1;
    sessionSummary.set(token.userId, current);
  });

  return { users, tokens, roles, sessionSummary };
};

export async function generateAdministrationReportExcel(filters: AdministrationReportFilters): Promise<Buffer> {
  const { users, tokens, roles, sessionSummary } = await getAdministrationReportData(filters);
  const workbook = setupWorkbook();
  const subtitle = administrationSubtitle(filters);

  addSheet(
    workbook,
    'Cuentas',
    'UNITHOR - REPORTE DE CUENTAS Y ACCESOS',
    subtitle,
    [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Usuario', key: 'username', width: 22 },
      { header: 'Correo', key: 'email', width: 34 },
      { header: 'Rol', key: 'role', width: 20 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Sesiones activas', key: 'activeSessions', width: 16 },
      { header: 'Sesiones período', key: 'totalSessions', width: 16 },
      { header: 'Creada', key: 'createdAt', width: 14, date: true },
      { header: 'Actualizada', key: 'updatedAt', width: 14, date: true },
      { header: 'Eliminada', key: 'deletedAt', width: 14, date: true },
      { header: 'Permisos del rol', key: 'permissions', width: 70 },
    ],
    users.map((user) => {
      const sessions = sessionSummary.get(user.id) ?? { total: 0, active: 0 };
      return {
        id: user.id,
        name: user.nombre,
        username: user.username,
        email: user.email,
        role: user.role ? humanize(user.role.nombre) : '',
        status: user.deletedAt ? 'Eliminado' : user.activo ? 'Activo' : 'Inactivo',
        activeSessions: sessions.active,
        totalSessions: sessions.total,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletedAt: user.deletedAt,
        permissions: rolePermissionsText(user.role),
      };
    }),
    'TOTAL CUENTAS',
  );

  addSheet(
    workbook,
    'Roles y permisos',
    'UNITHOR - MATRIZ DE PERMISOS POR ROL',
    subtitle,
    [
      { header: 'Rol', key: 'role', width: 24 },
      { header: 'Descripción', key: 'description', width: 46 },
      { header: 'Cantidad permisos', key: 'permissionCount', width: 18 },
      { header: 'Permisos', key: 'permissions', width: 92 },
    ],
    roles.map((role) => ({
      role: humanize(role.nombre),
      description: role.descripcion ?? '',
      permissionCount: role.permissions?.length ?? 0,
      permissions: rolePermissionsText(role),
    })),
    'TOTAL ROLES',
  );

  addSheet(
    workbook,
    'Sesiones',
    'UNITHOR - SESIONES DEL PERÍODO',
    subtitle,
    [
      { header: 'Usuario', key: 'user', width: 30 },
      { header: 'Correo', key: 'email', width: 34 },
      { header: 'Rol', key: 'role', width: 20 },
      { header: 'Creada', key: 'createdAt', width: 16, date: true },
      { header: 'Expira', key: 'expiresAt', width: 16, date: true },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Dispositivo', key: 'device', width: 50 },
    ],
    tokens.map((token) => {
      const user = users.find((item) => item.id === token.userId);
      const status = token.revokedAt ? 'Revocada' : token.expiresAt < new Date() ? 'Expirada' : 'Activa';
      return {
        user: user?.nombre ?? `Usuario ${token.userId}`,
        email: user?.email ?? '',
        role: user?.role ? humanize(user.role.nombre) : '',
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        status,
        device: token.deviceInfo ?? '',
      };
    }),
    'TOTAL SESIONES',
  );

  return serializeWorkbook(workbook);
}

export async function generateAdministrationReportPdf(filters: AdministrationReportFilters): Promise<Uint8Array> {
  const { users, tokens, roles, sessionSummary } = await getAdministrationReportData(filters);
  const activeUsers = users.filter((user) => user.activo && !user.deletedAt).length;
  const activeSessions = [...sessionSummary.values()].reduce((sum, sessions) => sum + sessions.active, 0);
  const doc = await createReportDocument(
    'Reporte de cuentas y accesos',
    administrationSubtitle(filters),
  );

  doc.section('Resumen ejecutivo').keyValues([
    ['Cuentas', String(users.length)],
    ['Activas', String(activeUsers)],
    ['Inactivas/eliminadas', String(users.length - activeUsers)],
    ['Roles', String(roles.length)],
    ['Sesiones del período', String(tokens.length)],
    ['Sesiones activas', String(activeSessions)],
  ]);

  doc.section('Cuentas').table(
    [
      { header: 'Usuario', width: 150, key: 'user' },
      { header: 'Correo', width: 170, key: 'email' },
      { header: 'Rol', width: 90, key: 'role' },
      { header: 'Estado', width: 70, key: 'status' },
      { header: 'Ses.', width: 45, key: 'sessions', align: 'right' },
    ],
    users.map((user) => ({
      user: user.nombre,
      email: user.email,
      role: user.role ? humanize(user.role.nombre) : '-',
      status: user.deletedAt ? 'Eliminado' : user.activo ? 'Activo' : 'Inactivo',
      sessions: String(sessionSummary.get(user.id)?.active ?? 0),
    })),
  );

  doc.section('Roles y permisos').table(
    [
      { header: 'Rol', width: 90, key: 'role' },
      { header: 'Descripción', width: 150, key: 'description' },
      { header: 'Permisos', width: 70, key: 'count', align: 'right' },
      { header: 'Detalle', width: 215, key: 'permissions' },
    ],
    roles.map((role) => ({
      role: humanize(role.nombre),
      description: role.descripcion ?? '-',
      count: String(role.permissions?.length ?? 0),
      permissions: rolePermissionsText(role) || '-',
    })),
  );

  return doc.finalize();
}
