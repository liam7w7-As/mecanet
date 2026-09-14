import ExcelJS from 'exceljs';
import { Op } from 'sequelize';

import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';

import type { CommercialReportFilters } from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

type QuotationWhere = WhereOptions<InferAttributes<Quotation>>;

interface PaymentReportRow {
  quotationCode: string;
  paymentDate: Date;
  clientName: string;
  method: string;
  amount: number;
  receiverName: string;
}

const PRIMARY_COLOR = 'FF0E2B4E';
const ACCENT_COLOR = 'FFFFD600';
const WHITE_COLOR = 'FFFFFFFF';
const BORDER_COLOR = 'FFD6DEE8';
const ALT_ROW_COLOR = 'FFF5F7FA';
const CURRENCY_FORMAT = '"$"#,##0';
const DATE_FORMAT = 'yyyy-mm-dd';
const HEADER_ROW_NUMBER = 4;
const FIRST_DATA_ROW_NUMBER = HEADER_ROW_NUMBER + 1;

const HEADER_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: PRIMARY_COLOR },
};

const TOTAL_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: ACCENT_COLOR },
};

const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
};

const numberValue = (value: number | string): number => Number(value);

const startOfDayUtc = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

const endOfDayUtc = (date: string): Date => new Date(`${date}T23:59:59.999Z`);

const humanizeValue = (value: string | null): string => {
  if (!value) {
    return '';
  }

  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const vehicleLabel = (vehicle: Vehicle | undefined): string => {
  if (!vehicle) {
    return '';
  }

  const description = [vehicle.marca, vehicle.modelo].filter(Boolean).join(' ');
  return description ? `${vehicle.patente} - ${description}` : vehicle.patente;
};

const applySheetBaseStyle = (worksheet: ExcelJS.Worksheet): void => {
  worksheet.properties.defaultRowHeight = 20;
  worksheet.views = [{ state: 'frozen', ySplit: HEADER_ROW_NUMBER }];
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
};

const applyTitle = (
  worksheet: ExcelJS.Worksheet,
  lastColumn: string,
  title: string,
  subtitle: string,
): void => {
  worksheet.mergeCells(`A1:${lastColumn}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.fill = HEADER_FILL;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE_COLOR } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells(`A2:${lastColumn}2`);
  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: PRIMARY_COLOR } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 22;
};

const applyHeaderStyle = (worksheet: ExcelJS.Worksheet): void => {
  const headerRow = worksheet.getRow(HEADER_ROW_NUMBER);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: WHITE_COLOR } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN_BORDER;
  });
};

const applyDataRowStyle = (row: ExcelJS.Row, isAlternate: boolean): void => {
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11 };
    cell.alignment = { vertical: 'middle' };
    cell.border = THIN_BORDER;
    if (isAlternate) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: ALT_ROW_COLOR },
      };
    }
  });
};

const applyTotalStyle = (row: ExcelJS.Row): void => {
  row.height = 24;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = TOTAL_FILL;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle' };
    cell.border = THIN_BORDER;
  });
};

const setSumFormula = (
  cell: ExcelJS.Cell,
  column: string,
  lastDataRow: number,
  result: number,
): void => {
  cell.value =
    lastDataRow >= FIRST_DATA_ROW_NUMBER
      ? {
          formula: `SUM(${column}${FIRST_DATA_ROW_NUMBER}:${column}${lastDataRow})`,
          result,
        }
      : 0;
  cell.numFmt = CURRENCY_FORMAT;
};

const buildSummarySheet = (
  workbook: ExcelJS.Workbook,
  quotations: Quotation[],
  filters: CommercialReportFilters,
  emittedAt: Date,
): void => {
  const worksheet = workbook.addWorksheet('Resumen Comercial');
  applySheetBaseStyle(worksheet);
  worksheet.columns = [
    { key: 'codigo', width: 16 },
    { key: 'fecha', width: 14 },
    { key: 'cliente', width: 30 },
    { key: 'rut', width: 14 },
    { key: 'vehiculo', width: 22 },
    { key: 'asesor', width: 20 },
    { key: 'estado', width: 16 },
    { key: 'subtotal', width: 16 },
    { key: 'total', width: 16 },
    { key: 'pagado', width: 16 },
    { key: 'saldo', width: 16 },
  ];

  applyTitle(
    worksheet,
    'K',
    'UNITHOR - INFORME DE VENTAS Y COBRANZAS',
    `Rango: ${filters.fechaDesde} al ${filters.fechaHasta} | Emitido: ${emittedAt.toISOString()}`,
  );

  worksheet.getRow(HEADER_ROW_NUMBER).values = [
    'Código COT',
    'Fecha Emisión',
    'Cliente / Razón Social',
    'RUT',
    'Vehículo (Patente - Modelo)',
    'Asesor Comercial',
    'Estado Pago',
    'Subtotal',
    'Total',
    'Monto Pagado',
    'Saldo Pendiente',
  ];
  applyHeaderStyle(worksheet);
  worksheet.autoFilter = `A${HEADER_ROW_NUMBER}:K${HEADER_ROW_NUMBER}`;

  let subtotalGeneral = 0;
  let totalGeneral = 0;
  let pagadoGeneral = 0;
  let saldoGeneral = 0;

  quotations.forEach((quotation, index) => {
    const rowNumber = FIRST_DATA_ROW_NUMBER + index;
    const subtotal = numberValue(quotation.subtotal);
    const total = numberValue(quotation.total);
    const pagado = numberValue(quotation.pagado);
    const saldo = Math.max(0, total - pagado);
    const row = worksheet.getRow(rowNumber);

    row.values = [
      quotation.codigo,
      quotation.createdAt,
      quotation.client?.nombre ?? '',
      quotation.client?.rut ?? '',
      vehicleLabel(quotation.vehicle),
      quotation.asesor?.nombre ?? '',
      humanizeValue(quotation.estadoPago),
      subtotal,
      total,
      pagado,
      { formula: `I${rowNumber}-J${rowNumber}`, result: saldo },
    ];
    row.getCell(2).numFmt = DATE_FORMAT;
    for (let column = 8; column <= 11; column += 1) {
      row.getCell(column).numFmt = CURRENCY_FORMAT;
    }
    applyDataRowStyle(row, index % 2 === 1);
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };

    subtotalGeneral += subtotal;
    totalGeneral += total;
    pagadoGeneral += pagado;
    saldoGeneral += saldo;
  });

  const lastDataRow = FIRST_DATA_ROW_NUMBER + quotations.length - 1;
  const totalRow = worksheet.getRow(lastDataRow + 1);
  worksheet.mergeCells(`A${totalRow.number}:G${totalRow.number}`);
  totalRow.getCell(1).value = 'TOTALES GENERALES';
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };
  setSumFormula(totalRow.getCell(8), 'H', lastDataRow, subtotalGeneral);
  setSumFormula(totalRow.getCell(9), 'I', lastDataRow, totalGeneral);
  setSumFormula(totalRow.getCell(10), 'J', lastDataRow, pagadoGeneral);
  setSumFormula(totalRow.getCell(11), 'K', lastDataRow, saldoGeneral);
  applyTotalStyle(totalRow);
};

const getPaymentRows = (payments: Payment[]): PaymentReportRow[] => {
  return payments
    .map((payment) => ({
      quotationCode: payment.quotation?.codigo ?? '',
      paymentDate: payment.fecha,
      clientName: payment.quotation?.client?.nombre ?? '',
      method: humanizeValue(payment.metodo),
      amount: numberValue(payment.monto),
      receiverName: payment.creator?.nombre ?? '',
    }))
    .sort((left, right) => left.paymentDate.getTime() - right.paymentDate.getTime());
};

const buildPaymentsSheet = (
  workbook: ExcelJS.Workbook,
  payments: Payment[],
  filters: CommercialReportFilters,
  emittedAt: Date,
): void => {
  const worksheet = workbook.addWorksheet('Detalle de Pagos - Abonos');
  applySheetBaseStyle(worksheet);
  worksheet.columns = [
    { key: 'codigo', width: 16 },
    { key: 'fecha', width: 14 },
    { key: 'cliente', width: 30 },
    { key: 'metodo', width: 22 },
    { key: 'monto', width: 18 },
    { key: 'receptor', width: 24 },
  ];

  applyTitle(
    worksheet,
    'F',
    'UNITHOR - DETALLE DE PAGOS Y ABONOS',
    `Rango: ${filters.fechaDesde} al ${filters.fechaHasta} | Emitido: ${emittedAt.toISOString()}`,
  );

  worksheet.getRow(HEADER_ROW_NUMBER).values = [
    'Código COT',
    'Fecha Pago',
    'Cliente',
    'Método de Pago',
    'Monto Recibido',
    'Usuario Receptor',
  ];
  applyHeaderStyle(worksheet);
  worksheet.autoFilter = `A${HEADER_ROW_NUMBER}:F${HEADER_ROW_NUMBER}`;

  const paymentRows = getPaymentRows(payments);
  paymentRows.forEach((payment, index) => {
    const row = worksheet.getRow(FIRST_DATA_ROW_NUMBER + index);
    row.values = [
      payment.quotationCode,
      payment.paymentDate,
      payment.clientName,
      payment.method,
      payment.amount,
      payment.receiverName,
    ];
    row.getCell(2).numFmt = DATE_FORMAT;
    applyDataRowStyle(row, index % 2 === 1);
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(5).numFmt = CURRENCY_FORMAT;
  });

  const lastDataRow = FIRST_DATA_ROW_NUMBER + paymentRows.length - 1;
  const totalRow = worksheet.getRow(lastDataRow + 1);
  worksheet.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
  totalRow.getCell(1).value = 'TOTAL PAGOS RECIBIDOS';
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };
  setSumFormula(
    totalRow.getCell(5),
    'E',
    lastDataRow,
    paymentRows.reduce((total, payment) => total + payment.amount, 0),
  );
  applyTotalStyle(totalRow);
};

export async function generateCommercialReportExcel(
  filters: CommercialReportFilters,
): Promise<Buffer> {
  const startDate = startOfDayUtc(filters.fechaDesde);
  const endDate = endOfDayUtc(filters.fechaHasta);
  const quotationFilters: QuotationWhere = {};

  if (filters.estadoPago !== undefined) {
    quotationFilters.estadoPago = filters.estadoPago;
  }
  if (filters.asesorId !== undefined) {
    quotationFilters.asesorId = filters.asesorId;
  }

  const [quotations, payments] = await Promise.all([
    Quotation.findAll({
      attributes: [
        'id',
        'codigo',
        'estadoPago',
        'subtotal',
        'total',
        'pagado',
        'createdAt',
      ],
      where: {
        ...quotationFilters,
        createdAt: { [Op.between]: [startDate, endDate] },
      },
      include: [
        {
          model: Client,
          attributes: ['id', 'nombre', 'rut'],
          required: false,
        },
        {
          model: Vehicle,
          attributes: ['id', 'patente', 'marca', 'modelo'],
          required: false,
        },
        {
          model: User,
          as: 'asesor',
          attributes: ['id', 'nombre'],
          required: false,
        },
      ],
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
    Payment.findAll({
      attributes: ['id', 'monto', 'fecha', 'metodo', 'createdBy'],
      where: { fecha: { [Op.between]: [startDate, endDate] } },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'nombre'],
          required: false,
        },
        {
          model: Quotation,
          attributes: ['id', 'codigo', 'estadoPago', 'asesorId'],
          where: quotationFilters,
          required: true,
          include: [
            {
              model: Client,
              attributes: ['id', 'nombre'],
              required: false,
            },
          ],
        },
      ],
      order: [
        ['fecha', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const emittedAt = new Date();
  workbook.creator = 'UNITHOR';
  workbook.company = 'UNITHOR';
  workbook.created = emittedAt;
  workbook.modified = emittedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  buildSummarySheet(workbook, quotations, filters, emittedAt);
  buildPaymentsSheet(workbook, payments, filters, emittedAt);

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
