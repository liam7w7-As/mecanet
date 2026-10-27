import {
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PURCHASE_PAYMENT_TYPE_LABELS,
  PURCHASE_STATUS_LABELS,
  PURCHASE_VEHICLE_ORIGIN_LABELS,
  type PurchaseReportQueryInput,
} from '@unithor/shared';
import ExcelJS from 'exceljs';

import { getPurchasesForReport } from './purchase.service.js';
import { getReportBranding } from './reports/report-branding.js';
import { ReportDocument } from './reports/report-layout.js';

import type { PurchasePublic } from './purchase.service.js';

const PRIMARY = 'FF0E2B4E';
const ACCENT = 'FFFFD600';
const WHITE = 'FFFFFFFF';
const BORDER = 'FFD6DEE8';
const SOFT = 'FFF4F6F9';
const CURRENCY_FORMAT = '"$"#,##0';
const DATE_FORMAT = 'dd-mm-yyyy';

const asNumber = (value: number | string | null | undefined): number => Number(value ?? 0);

const money = (value: number | string | null | undefined): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(asNumber(value));

const dateText = (value: Date | string | null | undefined): string => {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}-${month}-${year}`;
  }
  return new Intl.DateTimeFormat('es-CL').format(new Date(value));
};

const documentLabel = (purchase: PurchasePublic): string =>
  `${PURCHASE_DOCUMENT_TYPE_LABELS[purchase.tipoDocumento]} ${purchase.folio}`;

const vehicleLabel = (purchase: PurchasePublic): string => {
  const vehicle = purchase.vehicle ?? purchase.fleetVehicle;
  if (!vehicle) return 'Sin vehículo';
  return vehicle.patente;
};

const supplierContact = (purchase: PurchasePublic): string =>
  [purchase.supplier.telefono, purchase.supplier.email].filter(Boolean).join(' | ');

const subtitle = (filters: PurchaseReportQueryInput): string =>
  [
    filters.fechaDesde || filters.fechaHasta
      ? `${filters.fechaDesde ?? 'inicio'} al ${filters.fechaHasta ?? 'hoy'}`
      : 'Todo el historial',
    filters.estado ? `Estado: ${PURCHASE_STATUS_LABELS[filters.estado]}` : null,
    filters.formaPago ? `Pago: ${PURCHASE_PAYMENT_TYPE_LABELS[filters.formaPago]}` : null,
    filters.tipoDocumento
      ? `Documento: ${PURCHASE_DOCUMENT_TYPE_LABELS[filters.tipoDocumento]}`
      : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' | ');

interface ReportSummary {
  count: number;
  neto: number;
  iva: number;
  total: number;
  pendiente: number;
}

const buildSummary = (purchases: PurchasePublic[]): ReportSummary =>
  purchases.reduce<ReportSummary>(
    (summary, purchase) => {
      if (purchase.estado !== 'registrada') return summary;
      summary.count += 1;
      summary.neto += purchase.neto;
      summary.iva += purchase.iva;
      summary.total += purchase.total;
      if (purchase.formaPago === 'credito' && !purchase.pagadoAt) {
        summary.pendiente += purchase.total;
      }
      return summary;
    },
    { count: 0, neto: 0, iva: 0, total: 0, pendiente: 0 },
  );

const createReportDocument = async (
  title: string,
  reportSubtitle: string,
): Promise<ReportDocument> => {
  const branding = await getReportBranding();
  const detail = [
    branding.rut ? `RUT ${branding.rut}` : null,
    branding.address || null,
    branding.contact || null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' | ');

  return ReportDocument.create({
    company: branding.companyName,
    companyDetail: detail,
    logo: branding.logoPng,
    title,
    subtitle: reportSubtitle,
    page: { width: 841.89, height: 595.28, marginTop: 54, marginBottom: 42, marginX: 30 },
  });
};

export async function generatePurchaseReportPdf(
  filters: PurchaseReportQueryInput,
): Promise<Uint8Array> {
  const purchases = await getPurchasesForReport(filters);
  const summary = buildSummary(purchases);
  const doc = await createReportDocument('Reporte de compras', subtitle(filters));

  doc.section('Resumen').keyValues([
    ['Compras registradas', String(summary.count)],
    ['Monto neto', money(summary.neto)],
    ['IVA', money(summary.iva)],
    ['Total con IVA', money(summary.total)],
    ['Saldo pendiente', money(summary.pendiente)],
    ['Total documentos', String(purchases.length)],
  ]);

  doc.section('Detalle de compras').table(
    [
      { header: 'Código', width: 64, key: 'codigo' },
      { header: 'Registro', width: 55, key: 'registro' },
      { header: 'Proveedor', width: 108, key: 'proveedor' },
      { header: 'Documento', width: 92, key: 'documento' },
      { header: 'Emisión', width: 52, key: 'emision' },
      { header: 'Patente', width: 50, key: 'patente' },
      { header: 'OT', width: 52, key: 'ot' },
      { header: 'Ítem', width: 120, key: 'item' },
      { header: 'Cant.', width: 34, key: 'cantidad', align: 'right' },
      { header: 'P. unit.', width: 56, key: 'unitario', align: 'right' },
      { header: 'Subtotal', width: 58, key: 'subtotal', align: 'right' },
      { header: 'Total compra', width: 64, key: 'total', align: 'right' },
      { header: 'Estado', width: 48, key: 'estado' },
    ],
    purchases.flatMap((purchase) =>
      (purchase.items.length > 0
        ? purchase.items
        : [
            {
              id: 0,
              descripcion: 'Sin detalle de ítems',
              cantidad: 0,
              precioUnitario: 0,
              subtotal: 0,
            },
          ]
      ).map((item) => ({
        codigo: purchase.codigo,
        registro: dateText(purchase.createdAt),
        proveedor: purchase.supplier.nombre,
        documento: documentLabel(purchase),
        emision: dateText(purchase.fechaEmision),
        patente: vehicleLabel(purchase),
        ot: purchase.workOrder?.codigo ?? '-',
        item: item.descripcion,
        cantidad: String(item.cantidad),
        unitario: money(item.precioUnitario),
        subtotal: money(item.subtotal),
        total: money(purchase.total),
        estado: PURCHASE_STATUS_LABELS[purchase.estado],
      })),
    ),
  );

  return doc.finalize();
}

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
    const imageId = workbook.addImage({
      base64: branding.logoPng.toString('base64'),
      extension: 'png',
    });
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

const styleTitle = (
  sheet: ExcelJS.Worksheet,
  lastColumn: string,
  title: string,
  reportSubtitle: string,
): void => {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  sheet.getCell('A1').font = { name: 'Arial', size: 15, bold: true, color: { argb: WHITE } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 30;
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getCell('A2').value = reportSubtitle;
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
  reportSubtitle: string,
  columns: Array<{ header: string; key: string; width: number; currency?: boolean; date?: boolean }>,
  rows: Array<Record<string, string | number | Date | null>>,
  totalLabel = 'TOTALES GENERALES',
): void => {
  const sheet = workbook.addWorksheet(name);
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }));
  const lastColumn = String.fromCharCode(64 + columns.length);
  styleTitle(sheet, lastColumn, title, reportSubtitle);
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

export async function generatePurchaseReportExcel(
  filters: PurchaseReportQueryInput,
): Promise<Buffer> {
  const purchases = await getPurchasesForReport(filters);
  const summary = buildSummary(purchases);
  const workbook = setupWorkbook();
  const reportSubtitle = subtitle(filters);

  addSheet(
    workbook,
    'Resumen',
    'UNITHOR - REPORTE DE COMPRAS',
    reportSubtitle,
    [
      { header: 'Concepto', key: 'label', width: 38 },
      { header: 'Valor', key: 'value', width: 24 },
    ],
    [
      { label: 'Compras registradas', value: summary.count },
      { label: 'Monto neto', value: summary.neto },
      { label: 'IVA', value: summary.iva },
      { label: 'Total con IVA', value: summary.total },
      { label: 'Saldo pendiente de pago', value: summary.pendiente },
      { label: 'Documentos listados (incluye anulados)', value: purchases.length },
    ],
    'FIN DEL RESUMEN',
  );

  addSheet(
    workbook,
    'Compras',
    'UNITHOR - DETALLE DE COMPRAS',
    reportSubtitle,
    [
      { header: 'Código', key: 'code', width: 16 },
      { header: 'Registro', key: 'registeredAt', width: 13, date: true },
      { header: 'Proveedor', key: 'supplier', width: 32 },
      { header: 'RUT', key: 'rut', width: 15 },
      { header: 'Contacto', key: 'contact', width: 28 },
      { header: 'Tipo documento', key: 'documentType', width: 18 },
      { header: 'Folio', key: 'folio', width: 14 },
      { header: 'Emisión', key: 'emittedAt', width: 14 },
      { header: 'Monto comprobante', key: 'receiptAmount', width: 18, currency: true },
      { header: 'Neto', key: 'net', width: 16, currency: true },
      { header: 'IVA', key: 'tax', width: 16, currency: true },
      { header: 'Total', key: 'total', width: 16, currency: true },
      { header: 'Forma de pago', key: 'paymentType', width: 16 },
      { header: 'Método', key: 'method', width: 16 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Vehículo', key: 'vehicle', width: 14 },
      { header: 'Origen', key: 'origin', width: 14 },
      { header: 'OT', key: 'workOrder', width: 14 },
      { header: 'Banco', key: 'bank', width: 20 },
      { header: 'N° operación', key: 'operation', width: 18 },
      { header: 'Observaciones', key: 'notes', width: 40 },
      { header: 'Registrado por', key: 'createdBy', width: 24 },
    ],
    purchases.map((purchase) => ({
      code: purchase.codigo,
      registeredAt: purchase.createdAt,
      supplier: purchase.supplier.nombre,
      rut: purchase.supplier.rut ?? '',
      contact: supplierContact(purchase),
      documentType: PURCHASE_DOCUMENT_TYPE_LABELS[purchase.tipoDocumento],
      folio: purchase.folio,
      emittedAt: purchase.fechaEmision,
      receiptAmount: purchase.montoComprobante,
      net: purchase.neto,
      tax: purchase.iva,
      total: purchase.total,
      paymentType: PURCHASE_PAYMENT_TYPE_LABELS[purchase.formaPago],
      method: purchase.metodoPago,
      status: PURCHASE_STATUS_LABELS[purchase.estado],
      vehicle: vehicleLabel(purchase),
      origin: purchase.origenVehiculo
        ? PURCHASE_VEHICLE_ORIGIN_LABELS[purchase.origenVehiculo]
        : '',
      workOrder: purchase.workOrder?.codigo ?? '',
      bank: purchase.banco,
      operation: purchase.numeroOperacion,
      notes: purchase.observaciones ?? '',
      createdBy: purchase.creator?.nombre ?? '',
    })),
    'TOTAL DE COMPRAS',
  );

  addSheet(
    workbook,
    'Detalle ítems',
    'UNITHOR - DETALLE DE ÍTEMS COMPRADOS',
    reportSubtitle,
    [
      { header: 'Código compra', key: 'code', width: 16 },
      { header: 'Proveedor', key: 'supplier', width: 32 },
      { header: 'Documento', key: 'document', width: 24 },
      { header: 'Ítem', key: 'item', width: 42 },
      { header: 'Código repuesto', key: 'itemCode', width: 16 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Precio unitario', key: 'unitPrice', width: 16, currency: true },
      { header: 'Subtotal', key: 'subtotal', width: 16, currency: true },
      { header: 'Afecta stock', key: 'stock', width: 14 },
      { header: 'Almacén', key: 'warehouse', width: 22 },
      { header: 'Total compra', key: 'total', width: 16, currency: true },
      { header: 'Estado compra', key: 'status', width: 16 },
    ],
    purchases.flatMap((purchase) =>
      purchase.items.map((item) => ({
        code: purchase.codigo,
        supplier: purchase.supplier.nombre,
        document: documentLabel(purchase),
        item: item.descripcion,
        itemCode: item.catalogItem?.codigo ?? '',
        quantity: item.cantidad,
        unitPrice: item.precioUnitario,
        subtotal: item.subtotal,
        stock: item.afectaStock ? 'Sí' : 'No',
        warehouse: item.warehouse?.nombre ?? '',
        total: purchase.total,
        status: PURCHASE_STATUS_LABELS[purchase.estado],
      })),
    ),
    'TOTAL DE ÍTEMS',
  );

  return serializeWorkbook(workbook);
}
