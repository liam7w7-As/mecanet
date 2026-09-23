import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { getFinancialReportData } from './financial-analytics.service.js';

import type { FinancialAnalytics, FinancialReportData } from './financial-analytics.service.js';
import type { FinancialReportFilters } from '@unithor/shared';
import type { PDFFont, PDFPage } from 'pdf-lib';

const PRIMARY = 'FF0E2B4E';
const WHITE = 'FFFFFFFF';
const BORDER = 'FFD9E1EA';
const SOFT = 'FFF4F6F9';
const CURRENCY = '"$"#,##0';
const PERCENT = '0.0%';
const DATE_FORMAT = 'dd-mm-yyyy';

const money = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

const humanize = (value: string): string =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const filtersLabel = (filters: FinancialReportFilters): string => {
  const active = [
    `${filters.fechaDesde} al ${filters.fechaHasta}`,
    filters.asesorId ? `Asesor #${filters.asesorId}` : null,
    filters.clientId ? `Cliente #${filters.clientId}` : null,
    filters.estadoPago ? `Estado: ${humanize(filters.estadoPago)}` : null,
    filters.metodo ? `Método: ${humanize(filters.metodo)}` : null,
    filters.catalogType ? `Catálogo: ${humanize(filters.catalogType)}` : null,
    filters.movimientoTipo ? `Movimiento: ${humanize(filters.movimientoTipo)}` : null,
    filters.movimientoCategoria
      ? `Categoría: ${humanize(filters.movimientoCategoria)}`
      : null,
  ].filter((value): value is string => Boolean(value));
  return active.join(' | ');
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER } },
  left: { style: 'thin', color: { argb: BORDER } },
  bottom: { style: 'thin', color: { argb: BORDER } },
  right: { style: 'thin', color: { argb: BORDER } },
};

const styleTitle = (
  sheet: ExcelJS.Worksheet,
  lastColumn: string,
  title: string,
  subtitle: string,
): void => {
  sheet.mergeCells(`A1:${lastColumn}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 32;

  sheet.mergeCells(`A2:${lastColumn}2`);
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: 'Arial', size: 9, color: { argb: PRIMARY } };
  subtitleCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet.getRow(2).height = 28;
};

const styleHeader = (row: ExcelJS.Row): void => {
  row.height = 28;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });
};

const styleDataRows = (
  sheet: ExcelJS.Worksheet,
  start: number,
  end: number,
  currencyColumns: number[] = [],
): void => {
  for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 21;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { vertical: 'middle' };
      cell.border = thinBorder;
      if ((rowNumber - start) % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
      }
    });
    currencyColumns.forEach((column) => {
      row.getCell(column).numFmt = CURRENCY;
    });
  }
};

const addTableSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  subtitle: string,
  columns: Array<{ header: string; key: string; width: number; currency?: boolean; date?: boolean }>,
  rows: Array<Record<string, string | number | Date | boolean>>,
): void => {
  const sheet = workbook.addWorksheet(name);
  sheet.properties.defaultRowHeight = 20;
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));
  const lastColumn = String.fromCharCode(64 + columns.length);
  styleTitle(sheet, lastColumn, title, subtitle);
  const headerRow = sheet.getRow(4);
  headerRow.values = columns.map((column) => column.header);
  styleHeader(headerRow);
  sheet.autoFilter = `A4:${lastColumn}4`;

  rows.forEach((data, index) => {
    const row = sheet.getRow(5 + index);
    row.values = columns.map((column) => data[column.key] ?? '');
    columns.forEach((column, columnIndex) => {
      if (column.currency) row.getCell(columnIndex + 1).numFmt = CURRENCY;
      if (column.date) row.getCell(columnIndex + 1).numFmt = DATE_FORMAT;
    });
  });
  styleDataRows(
    sheet,
    5,
    Math.max(5, 4 + rows.length),
    columns
      .map((column, index) => (column.currency ? index + 1 : 0))
      .filter((index) => index > 0),
  );
};

const buildExecutiveSheet = (
  workbook: ExcelJS.Workbook,
  data: FinancialReportData,
  filters: FinancialReportFilters,
): void => {
  const sheet = workbook.addWorksheet('Resumen Ejecutivo');
  sheet.columns = Array.from({ length: 12 }, () => ({ width: 15 }));
  sheet.views = [{ state: 'frozen', ySplit: 3 }];
  styleTitle(
    sheet,
    'L',
    'UNITHOR - INFORME FINANCIERO EJECUTIVO',
    `${filtersLabel(filters)} | Emitido: ${new Date().toLocaleString('es-CL')}`,
  );

  const metrics = [
    ['Ventas emitidas', data.analytics.kpis.grossSales, 'Recaudación', data.analytics.kpis.collected],
    ['Egresos', data.analytics.kpis.expenses, 'Flujo neto', data.analytics.kpis.netCash],
    ['Saldo por cobrar', data.analytics.kpis.receivable, 'Ticket promedio', data.analytics.kpis.averageTicket],
    ['Tasa de cobro', data.analytics.kpis.collectionRate / 100, 'Conversión a OT', data.analytics.kpis.conversionRate / 100],
  ];
  metrics.forEach((metric, index) => {
    const row = sheet.getRow(4 + index);
    row.values = [metric[0], metric[1], '', '', metric[2], metric[3]];
    row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: PRIMARY } };
    row.getCell(2).font = { name: 'Arial', size: 13, bold: true };
    row.getCell(5).font = { name: 'Arial', size: 10, bold: true, color: { argb: PRIMARY } };
    row.getCell(6).font = { name: 'Arial', size: 13, bold: true };
    row.getCell(2).numFmt = index === 3 ? PERCENT : CURRENCY;
    row.getCell(6).numFmt = index === 3 ? PERCENT : CURRENCY;
  });

  sheet.getCell('H4').value = 'Cotizaciones';
  sheet.getCell('I4').value = data.analytics.kpis.quotationCount;
  sheet.getCell('H5').value = 'Pagadas';
  sheet.getCell('I5').value = data.analytics.kpis.paidQuotationCount;
  sheet.getCell('H6').value = 'Convertidas a OT';
  sheet.getCell('I6').value = data.analytics.kpis.workOrderConversionCount;
  sheet.getCell('H7').value = 'Ingresos manuales';
  sheet.getCell('I7').value = data.analytics.kpis.manualIncome;
  sheet.getCell('I7').numFmt = CURRENCY;
  ['H4', 'H5', 'H6', 'H7'].forEach((cell) => {
    sheet.getCell(cell).font = { name: 'Arial', size: 10, bold: true, color: { argb: PRIMARY } };
  });

  const sellerHeader = sheet.getRow(10);
  sellerHeader.values = ['VENDEDORES', 'Cotizaciones', 'Ventas', 'Recaudado', 'Ticket promedio'];
  styleHeader(sellerHeader);
  data.analytics.topSellers.slice(0, 10).forEach((seller, index) => {
    const row = sheet.getRow(11 + index);
    row.values = [
      seller.nombre,
      seller.quotationCount,
      seller.grossSales,
      seller.collected,
      seller.averageTicket,
    ];
  });
  styleDataRows(sheet, 11, Math.max(11, 10 + data.analytics.topSellers.slice(0, 10).length), [3, 4, 5]);

  const itemHeader = sheet.getRow(23);
  itemHeader.values = ['PRODUCTOS Y SERVICIOS', 'Tipo', 'Cantidad', 'Venta asociada'];
  styleHeader(itemHeader);
  data.analytics.topItems.slice(0, 12).forEach((item, index) => {
    const row = sheet.getRow(24 + index);
    row.values = [item.nombre, humanize(item.tipo), item.quantity, item.revenue];
  });
  styleDataRows(sheet, 24, Math.max(24, 23 + data.analytics.topItems.slice(0, 12).length), [4]);

  const trendHeader = sheet.getRow(38);
  trendHeader.values = ['TENDENCIA', 'Ventas', 'Recaudación', 'Ingresos caja', 'Egresos', 'Neto'];
  styleHeader(trendHeader);
  data.analytics.trend.forEach((item, index) => {
    const row = sheet.getRow(39 + index);
    row.values = [
      item.label,
      item.grossSales,
      item.collected,
      item.manualIncome,
      item.expenses,
      item.netCash,
    ];
  });
  styleDataRows(sheet, 39, Math.max(39, 38 + data.analytics.trend.length), [2, 3, 4, 5, 6]);
};

export async function generateFinancialReportExcel(
  filters: FinancialReportFilters,
): Promise<Buffer> {
  const data = await getFinancialReportData(filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UNITHOR';
  workbook.company = 'UNITHOR';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const subtitle = filtersLabel(filters);

  buildExecutiveSheet(workbook, data, filters);
  addTableSheet(
    workbook,
    'Ventas',
    'UNITHOR - VENTAS Y COTIZACIONES',
    subtitle,
    [
      { header: 'Código', key: 'codigo', width: 18 },
      { header: 'Fecha', key: 'fecha', width: 14, date: true },
      { header: 'Cliente', key: 'clientName', width: 30 },
      { header: 'RUT', key: 'clientRut', width: 15 },
      { header: 'Vehículo', key: 'vehicle', width: 24 },
      { header: 'Asesor', key: 'advisor', width: 22 },
      { header: 'Estado', key: 'status', width: 17 },
      { header: 'Total', key: 'total', width: 16, currency: true },
      { header: 'Pagado', key: 'paid', width: 16, currency: true },
      { header: 'Saldo', key: 'receivable', width: 16, currency: true },
      { header: 'Con OT', key: 'workOrderLinked', width: 10 },
    ],
    data.quotations.map((item) => ({
      ...item,
      status: humanize(item.status),
      workOrderLinked: item.workOrderLinked ? 'Sí' : 'No',
    })),
  );
  addTableSheet(
    workbook,
    'Pagos',
    'UNITHOR - RECAUDACIÓN',
    subtitle,
    [
      { header: 'Fecha', key: 'fecha', width: 14, date: true },
      { header: 'Cotización', key: 'quotationCode', width: 18 },
      { header: 'Cliente', key: 'clientName', width: 30 },
      { header: 'Asesor', key: 'advisor', width: 22 },
      { header: 'Método', key: 'method', width: 20 },
      { header: 'Monto', key: 'amount', width: 18, currency: true },
      { header: 'Receptor', key: 'receiver', width: 22 },
    ],
    data.payments.map((item) => ({ ...item, method: humanize(item.method) })),
  );
  addTableSheet(
    workbook,
    'Caja',
    'UNITHOR - MOVIMIENTOS DE CAJA',
    subtitle,
    [
      { header: 'Fecha', key: 'fecha', width: 14, date: true },
      { header: 'Tipo', key: 'type', width: 14 },
      { header: 'Categoría', key: 'category', width: 22 },
      { header: 'Método', key: 'method', width: 20 },
      { header: 'Descripción', key: 'description', width: 38 },
      { header: 'Referencia', key: 'reference', width: 20 },
      { header: 'Monto', key: 'amount', width: 18, currency: true },
      { header: 'Responsable', key: 'creator', width: 24 },
    ],
    data.movements.map((item) => ({
      ...item,
      type: humanize(item.type),
      category: humanize(item.category),
      method: humanize(item.method),
    })),
  );
  addTableSheet(
    workbook,
    'Productos y Servicios',
    'UNITHOR - PRODUCTOS Y SERVICIOS COTIZADOS',
    subtitle,
    [
      { header: 'Cotización', key: 'quotationCode', width: 18 },
      { header: 'Código', key: 'catalogCode', width: 16 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Tipo', key: 'catalogType', width: 18 },
      { header: 'Cantidad', key: 'quantity', width: 14 },
      { header: 'Precio unitario', key: 'unitPrice', width: 18, currency: true },
      { header: 'Subtotal', key: 'subtotal', width: 18, currency: true },
    ],
    data.items.map((item) => ({ ...item, catalogType: humanize(item.catalogType) })),
  );

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

const PDF_WIDTH = 841.89;
const PDF_HEIGHT = 595.28;
const PDF_MARGIN = 34;
const PDF_PRIMARY = rgb(14 / 255, 43 / 255, 78 / 255);
const PDF_ACCENT = rgb(1, 214 / 255, 0);
const PDF_TEXT = rgb(31 / 255, 41 / 255, 55 / 255);
const PDF_MUTED = rgb(100 / 255, 116 / 255, 139 / 255);
const PDF_BORDER = rgb(218 / 255, 226 / 255, 236 / 255);
const PDF_SOFT = rgb(244 / 255, 246 / 255, 249 / 255);

interface PdfContext {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  pageNumber: number;
  title: string;
  subtitle: string;
}

const shorten = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : value.slice(0, Math.max(0, maxLength - 3)) + '...';

const drawPdfHeader = (ctx: PdfContext): void => {
  ctx.page.drawRectangle({
    x: 0,
    y: PDF_HEIGHT - 66,
    width: PDF_WIDTH,
    height: 66,
    color: PDF_PRIMARY,
  });
  ctx.page.drawRectangle({
    x: 0,
    y: PDF_HEIGHT - 70,
    width: PDF_WIDTH,
    height: 4,
    color: PDF_ACCENT,
  });
  ctx.page.drawText(ctx.title, {
    x: PDF_MARGIN,
    y: PDF_HEIGHT - 31,
    size: 17,
    font: ctx.bold,
    color: rgb(1, 1, 1),
  });
  ctx.page.drawText(shorten(ctx.subtitle, 125), {
    x: PDF_MARGIN,
    y: PDF_HEIGHT - 50,
    size: 8,
    font: ctx.regular,
    color: rgb(1, 1, 1),
  });
};

const drawPdfFooters = (ctx: PdfContext): void => {
  const pages = ctx.document.getPages();
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: PDF_MARGIN, y: 24 },
      end: { x: PDF_WIDTH - PDF_MARGIN, y: 24 },
      thickness: 0.5,
      color: PDF_BORDER,
    });
    page.drawText('UNITHOR - Uso interno y confidencial', {
      x: PDF_MARGIN,
      y: 11,
      size: 7,
      font: ctx.regular,
      color: PDF_MUTED,
    });
    page.drawText(`Página ${index + 1} de ${pages.length}`, {
      x: PDF_WIDTH - PDF_MARGIN - 62,
      y: 11,
      size: 7,
      font: ctx.regular,
      color: PDF_MUTED,
    });
  });
};

const addPdfPage = (ctx: PdfContext): number => {
  ctx.page = ctx.document.addPage([PDF_WIDTH, PDF_HEIGHT]);
  ctx.pageNumber += 1;
  drawPdfHeader(ctx);
  return PDF_HEIGHT - 92;
};

const drawKpi = (
  ctx: PdfContext,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  detail: string,
): void => {
  ctx.page.drawRectangle({
    x,
    y: y - 62,
    width,
    height: 62,
    color: PDF_SOFT,
    borderColor: PDF_BORDER,
    borderWidth: 0.8,
  });
  ctx.page.drawText(label, {
    x: x + 10,
    y: y - 17,
    size: 8,
    font: ctx.bold,
    color: PDF_MUTED,
  });
  ctx.page.drawText(shorten(value, 22), {
    x: x + 10,
    y: y - 38,
    size: 14,
    font: ctx.bold,
    color: PDF_PRIMARY,
  });
  ctx.page.drawText(shorten(detail, 30), {
    x: x + 10,
    y: y - 53,
    size: 7,
    font: ctx.regular,
    color: PDF_MUTED,
  });
};

interface PdfColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

const drawPdfTable = (
  ctx: PdfContext,
  title: string,
  columns: PdfColumn[],
  rows: string[][],
  startY: number,
): number => {
  let y = startY;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  if (y < 105) y = addPdfPage(ctx);

  ctx.page.drawText(title, {
    x: PDF_MARGIN,
    y,
    size: 11,
    font: ctx.bold,
    color: PDF_PRIMARY,
  });
  y -= 18;

  const drawHeader = (): void => {
    ctx.page.drawRectangle({
      x: PDF_MARGIN,
      y: y - 18,
      width: tableWidth,
      height: 18,
      color: PDF_PRIMARY,
    });
    let x = PDF_MARGIN;
    columns.forEach((column) => {
      ctx.page.drawText(shorten(column.header, Math.max(5, Math.floor(column.width / 5))), {
        x: x + 5,
        y: y - 12,
        size: 7,
        font: ctx.bold,
        color: rgb(1, 1, 1),
      });
      x += column.width;
    });
    y -= 18;
  };
  drawHeader();

  const displayRows = rows.length > 0 ? rows : [['Sin datos para los filtros seleccionados']];
  displayRows.forEach((row, rowIndex) => {
    if (y < 42) {
      y = addPdfPage(ctx);
      drawHeader();
    }
    ctx.page.drawRectangle({
      x: PDF_MARGIN,
      y: y - 17,
      width: tableWidth,
      height: 17,
      color: rowIndex % 2 === 1 ? PDF_SOFT : rgb(1, 1, 1),
      borderColor: PDF_BORDER,
      borderWidth: 0.4,
    });
    let x = PDF_MARGIN;
    columns.forEach((column, columnIndex) => {
      const text = row[columnIndex] ?? '';
      const maxLength = Math.max(5, Math.floor((column.width - 10) / 4.2));
      const displayed = shorten(text, maxLength);
      const textWidth = ctx.regular.widthOfTextAtSize(displayed, 7.5);
      ctx.page.drawText(displayed, {
        x:
          column.align === 'right'
            ? x + column.width - textWidth - 5
            : x + 5,
        y: y - 11.5,
        size: 7.5,
        font: ctx.regular,
        color: PDF_TEXT,
      });
      x += column.width;
    });
    y -= 17;
  });
  return y - 16;
};

const percentageDetail = (
  comparison: FinancialAnalytics['comparison'],
  key: keyof NonNullable<FinancialAnalytics['comparison']>,
): string => {
  const value = comparison?.[key].variationPercent;
  if (value === null || value === undefined) return 'Sin base comparable';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs. período anterior`;
};

export async function generateFinancialReportPdf(
  filters: FinancialReportFilters,
): Promise<Uint8Array> {
  const data = await getFinancialReportData(filters);
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const ctx: PdfContext = {
    document,
    page: document.addPage([PDF_WIDTH, PDF_HEIGHT]),
    regular,
    bold,
    pageNumber: 1,
    title: 'UNITHOR - INFORME FINANCIERO EJECUTIVO',
    subtitle: filtersLabel(filters),
  };
  drawPdfHeader(ctx);

  const cardWidth = (PDF_WIDTH - PDF_MARGIN * 2 - 18) / 4;
  const firstY = PDF_HEIGHT - 92;
  const kpis = data.analytics.kpis;
  [
    ['Ventas', money(kpis.grossSales), percentageDetail(data.analytics.comparison, 'grossSales')],
    ['Recaudación', money(kpis.collected), percentageDetail(data.analytics.comparison, 'collected')],
    ['Egresos', money(kpis.expenses), percentageDetail(data.analytics.comparison, 'expenses')],
    ['Flujo neto', money(kpis.netCash), percentageDetail(data.analytics.comparison, 'netCash')],
  ].forEach(([label, value, detail], index) => {
    drawKpi(ctx, PDF_MARGIN + index * (cardWidth + 6), firstY, cardWidth, label, value, detail);
  });
  [
    ['Saldo por cobrar', money(kpis.receivable), `${kpis.quotationCount} cotizaciones emitidas`],
    ['Ticket promedio', money(kpis.averageTicket), 'Promedio por cotización'],
    ['Tasa de cobro', `${kpis.collectionRate.toFixed(1)}%`, `${kpis.paidQuotationCount} pagadas totalmente`],
    ['Conversión a OT', `${kpis.conversionRate.toFixed(1)}%`, `${kpis.workOrderConversionCount} vinculadas a taller`],
  ].forEach(([label, value, detail], index) => {
    drawKpi(
      ctx,
      PDF_MARGIN + index * (cardWidth + 6),
      firstY - 69,
      cardWidth,
      label,
      value,
      detail,
    );
  });

  let y = firstY - 151;
  y = drawPdfTable(
    ctx,
    'Vendedores con mayor venta',
    [
      { header: 'Asesor', width: 190 },
      { header: 'COT', width: 55, align: 'right' },
      { header: 'Ventas', width: 105, align: 'right' },
      { header: 'Recaudado', width: 105, align: 'right' },
      { header: 'Ticket prom.', width: 105, align: 'right' },
    ],
    data.analytics.topSellers.slice(0, 8).map((item) => [
      item.nombre,
      String(item.quotationCount),
      money(item.grossSales),
      money(item.collected),
      money(item.averageTicket),
    ]),
    y,
  );
  drawPdfTable(
    ctx,
    'Productos y servicios con mayor salida',
    [
      { header: 'Producto / servicio', width: 250 },
      { header: 'Tipo', width: 95 },
      { header: 'Cantidad', width: 80, align: 'right' },
      { header: 'Venta asociada', width: 135, align: 'right' },
    ],
    data.analytics.topItems.slice(0, 10).map((item) => [
      item.nombre,
      humanize(item.tipo),
      item.quantity.toLocaleString('es-CL'),
      money(item.revenue),
    ]),
    y,
  );

  y = addPdfPage(ctx);
  y = drawPdfTable(
    ctx,
    'Tendencia financiera',
    [
      { header: 'Período', width: 100 },
      { header: 'Ventas', width: 105, align: 'right' },
      { header: 'Recaudación', width: 105, align: 'right' },
      { header: 'Ingresos caja', width: 105, align: 'right' },
      { header: 'Egresos', width: 105, align: 'right' },
      { header: 'Neto', width: 105, align: 'right' },
    ],
    data.analytics.trend.slice(-24).map((item) => [
      item.label,
      money(item.grossSales),
      money(item.collected),
      money(item.manualIncome),
      money(item.expenses),
      money(item.netCash),
    ]),
    y,
  );
  y = drawPdfTable(
    ctx,
    'Composición por método de pago',
    [
      { header: 'Método', width: 200 },
      { header: 'Operaciones', width: 100, align: 'right' },
      { header: 'Monto', width: 150, align: 'right' },
      { header: 'Participación', width: 110, align: 'right' },
    ],
    data.analytics.paymentMethods.map((item) => [
      humanize(item.metodo),
      String(item.count),
      money(item.amount),
      `${item.share.toFixed(1)}%`,
    ]),
    y,
  );
  y = drawPdfTable(
    ctx,
    'Estado de las cotizaciones',
    [
      { header: 'Estado', width: 200 },
      { header: 'Cantidad', width: 100, align: 'right' },
      { header: 'Monto', width: 150, align: 'right' },
      { header: 'Participación', width: 110, align: 'right' },
    ],
    data.analytics.quotationStatuses.map((item) => [
      humanize(item.estado),
      String(item.count),
      money(item.amount),
      `${item.share.toFixed(1)}%`,
    ]),
    y,
  );
  drawPdfTable(
    ctx,
    'Movimientos de caja por categoría',
    [
      { header: 'Tipo', width: 100 },
      { header: 'Categoría', width: 230 },
      { header: 'Movimientos', width: 100, align: 'right' },
      { header: 'Monto', width: 130, align: 'right' },
    ],
    data.analytics.movementCategories.map((item) => [
      humanize(item.tipo),
      humanize(item.categoria),
      String(item.count),
      money(item.amount),
    ]),
    y,
  );

  drawPdfFooters(ctx);
  return document.save();
}

