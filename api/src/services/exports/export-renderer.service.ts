import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { applyReportWorkbookBranding, getReportBranding } from '../reports/report-branding.js';

import type { ExportColumn, ExportDataset, ExportTable, ExportValue } from './export-types.js';
import type { PDFFont, PDFPage } from 'pdf-lib';

const BLUE = 'FF0E2B4E';
const PALE = 'FFF4F6F9';
const WHITE = 'FFFFFFFF';
const FILTER_LABELS: Record<string, string> = {
  search: 'Búsqueda',
  tipo: 'Tipo',
  estado: 'Estado',
  estadoPago: 'Estado de pago',
  fechaDesde: 'Desde',
  fechaHasta: 'Hasta',
  fecha: 'Fecha',
  clientId: 'Cliente ID',
  vehicleId: 'Vehículo ID',
  workOrderId: 'OT ID',
  roleId: 'Rol ID',
  activo: 'Activo',
  soloActivos: 'Solo activos',
  soloConStock: 'Solo con stock',
  warehouseId: 'Almacén ID',
  catalogItemId: 'Artículo ID',
  origin: 'Origen',
  archived: 'Archivadas',
  origen: 'Origen',
  archivo: 'Archivo',
  assignedMechanicId: 'Mecánico ID',
  asesorId: 'Asesor ID',
  vencimiento: 'Vencimiento',
  metodo: 'Método',
  quotationId: 'Cotización ID',
  archiveStatus: 'Archivo', workOrderLinked: 'Vinculada a OT', proveedorId: 'Proveedor ID', soloIncompletos: 'Solo incompletos',
  formaPago: 'Forma de pago',
  tipoDocumento: 'Documento',
  supplierId: 'Proveedor ID',
};

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const dateText = (value: ExportValue, time = false): string => {
  if (!value) return '-';
  const plainDate = typeof value === 'string' && dateOnly.test(value);
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    timeZone: plainDate ? 'UTC' : 'America/Santiago',
  }).format(date);
};

const cellText = (value: ExportValue, column?: ExportColumn): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (column?.kind === 'date' || column?.kind === 'datetime' || value instanceof Date) {
    return dateText(value, column?.kind === 'datetime');
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (column?.kind === 'money') {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat('es-CL', {
          style: 'currency',
          currency: 'CLP',
          maximumFractionDigits: 0,
        }).format(amount)
      : String(value);
  }
  if (typeof value === 'number')
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 4 }).format(value);
  return String(value);
};

const filterValue = (key: string, value: ExportValue): string => {
  if (typeof value !== 'string') return cellText(value);
  if (['fecha', 'fechaDesde', 'fechaHasta'].includes(key)) return dateText(value);
  if (!['archiveStatus', 'estado', 'estadoPago', 'tipo', 'vencimiento', 'metodo', 'formaPago', 'tipoDocumento'].includes(key)) return value;
  const labels: Record<string, string> = {
    active: 'Vigentes', archived: 'Archivadas', all: 'Todas', por_pagar: 'Por pagar', parcial: 'Abono parcial',
    total: 'Pagada total', por_verificar: 'Por verificar', ot_finalizado: 'OT finalizada',
    en_progreso: 'Iniciada', esperando_repuesto: 'Esperando repuesto', finalizada: 'Finalizada',
    entregada: 'Entregada', cancelada: 'Anulada', cliente: 'Persona', empresa: 'Empresa',
    parte: 'Repuesto', estandar: 'Servicio estándar', especifico: 'Servicio específico',
    proximo: 'Por vencer', vencido: 'Vencidos', transferencia: 'Transferencia', efectivo: 'Efectivo',
    tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito', cheque: 'Cheque', otro: 'Otro',
  };
  return labels[value] ?? value.replace(/_/g, ' ');
};

const filterText = (dataset: ExportDataset): string =>
  Object.entries(dataset.filters)
    .map(([key, value]) => `${FILTER_LABELS[key] ?? key}: ${filterValue(key, value)}`)
    .join(' | ') || 'Sin filtros adicionales';

/** Excel stores a local wall-clock value, without a timezone or date-only shifts. */
const excelDate = (value: ExportValue): Date | null => {
  if (!value) return null;
  if (typeof value === 'string' && dateOnly.test(value)) return new Date(`${value}T00:00:00Z`);
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ),
  );
};

const cleanSheetName = (name: string): string =>
  Array.from(name)
    .map((character) => ('\\/*?:[]'.includes(character) ? ' ' : character))
    .join('')
    .slice(0, 31) || 'Datos';

export const generateListExportExcel = async (dataset: ExportDataset): Promise<Buffer> => {
  const branding = await getReportBranding();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.companyName;
  workbook.created = new Date();
  workbook.title = dataset.title;
  const summary = workbook.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 28 }, { width: 105 }];
  summary.mergeCells('A1:B1');
  summary.getCell('A1').value = dataset.title;
  summary.getCell('A1').font = { name: 'Calibri', size: 17, bold: true, color: { argb: WHITE } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
  summary.getRow(1).height = 38;
  summary.addRow(['Empresa', branding.legalName || branding.companyName]);
  summary.addRow(['RUT', branding.rut]);
  summary.addRow(['Emisión (Chile)', dateText(new Date(), true)]);
  summary.addRow(['Filtros aplicados', filterText(dataset)]);
  summary.addRow([
    'Alcance',
    'Todos los registros filtrados, incluyendo todas las páginas del listado.',
  ]);
  for (const table of dataset.tables)
    summary.addRow([table.name, `${table.rows.length} registros`]);
  for (const note of dataset.notes ?? []) summary.addRow(['Observación', note]);
  summary.eachRow((row, index) => {
    if (index > 1) row.font = { name: 'Calibri', size: 11 };
    row.alignment = { vertical: 'top', wrapText: true };
    if (index > 1) row.height = index === 5 ? 48 : 32;
  });
  if (branding.logoPng) {
    summary.getColumn(3).width = 26;
    summary.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:C${summary.rowCount}` };
  }
  await applyReportWorkbookBranding(workbook, branding, {
    sheets: [summary],
    logoArea: { column: 2, row: 0, width: 187, height: 50 },
  });
  const usedNames = new Set(['Resumen']);
  dataset.tables.forEach((table, index) => {
    const base = index === 0 ? 'Datos' : cleanSheetName(table.name);
    let name = base;
    for (let suffix = 2; usedNames.has(name); suffix++) name = `${base.slice(0, 26)} ${suffix}`;
    usedNames.add(name);
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: {
        paperSize: 9,
        orientation: table.columns.length > 6 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    sheet.columns = table.columns.map((column) => ({
      key: column.key,
      header: column.header,
      width: Math.min(60, column.width ?? 20),
    }));
    sheet.getRow(1).height = 30;
    sheet.getRow(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, table.rows.length + 1), column: table.columns.length },
    };
    sheet.pageSetup.printTitlesRow = '1:1';
    table.rows.forEach((record, rowIndex) => {
      const row = sheet.addRow(
        table.columns.map((column) => {
          const value = record[column.key];
          if (value === undefined || value === null) return null;
          if (column.kind === 'date' || column.kind === 'datetime') return excelDate(value);
          if (column.kind === 'boolean' || typeof value === 'boolean') return value ? 'Sí' : 'No';
          // Strings stay literal, including leading zeros and strings starting '='.
          return typeof value === 'number' && !Number.isFinite(value) ? null : value;
        }),
      );
      row.font = { name: 'Calibri', size: 11, color: { argb: BLUE } };
      row.alignment = { vertical: 'top', wrapText: true };
      if (rowIndex % 2 === 1)
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE } };
      table.columns.forEach((column, col) => {
        const cell = row.getCell(col + 1);
        cell.numFmt =
          column.kind === 'money'
            ? '"$"#,##0'
            : column.kind === 'date'
              ? 'yyyy-mm-dd'
              : column.kind === 'datetime'
                ? 'yyyy-mm-dd hh:mm'
                : column.kind === 'number'
                  ? '#,##0.####'
                  : '@';
      });
    });
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

/** Text is restricted to the embedded standard font, never crashing on emoji or controls. */
const printable = (text: string, font: PDFFont): string =>
  Array.from(
    text
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .replace(/[\u2010-\u2015]/g, '-'),
  )
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .map((character) => {
      try {
        font.encodeText(character);
        return character;
      } catch {
        return '?';
      }
    })
    .join('');

const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of printable(text, font).replace(/\s+/g, ' ').split(' ')) {
    if (font.widthOfTextAtSize(`${line}${line ? ' ' : ''}${word}`, size) <= width) {
      line += `${line ? ' ' : ''}${word}`;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line || lines.length === 0) lines.push(line || '-');
  return lines;
};

export const generateListExportPdf = async (dataset: ExportDataset): Promise<Uint8Array> => {
  const branding = await getReportBranding();
  const pdf = await PDFDocument.create();
  pdf.setTitle(dataset.title);
  pdf.setAuthor(branding.companyName);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = branding.logoPng ? await pdf.embedPng(branding.logoPng) : null;
  const blue = rgb(14 / 255, 43 / 255, 78 / 255);
  const gray = rgb(0.38, 0.43, 0.5);
  const landscape = dataset.tables.some(
    (table) => table.columns.filter((column) => column.pdf !== false).length > 6,
  );
  const [width, height] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const margin = 28;
  const contentWidth = width - 2 * margin;
  const bottom = 39;
  let page: PDFPage;
  let y = 0;
  const text = (
    value: string,
    x: number,
    baseline: number,
    size = 8,
    font = regular,
    color = blue,
  ) => {
    page.drawText(printable(value, font), { x, y: baseline, size, font, color });
  };
  const newPage = () => {
    page = pdf.addPage([width, height]);
    let x = margin;
    if (logo) {
      const scale = Math.min(92 / logo.width, 31 / logo.height);
      page.drawImage(logo, {
        x,
        y: height - 53 + (31 - logo.height * scale) / 2,
        width: logo.width * scale,
        height: logo.height * scale,
      });
      x += 107;
    }
    text(branding.companyName, x, height - 29, 8, bold, gray);
    const titleLines = wrap(dataset.title, bold, 13, width - x - margin);
    titleLines.forEach((line, i) => text(line, x, height - 44 - i * 15, 13, bold));
    const lineY = height - 57 - (titleLines.length - 1) * 15;
    page.drawLine({
      start: { x: margin, y: lineY },
      end: { x: width - margin, y: lineY },
      color: blue,
      thickness: 1,
    });
    y = lineY - 13;
    text(`Emitido: ${dateText(new Date(), true)} (Chile)`, margin, y, 7, regular, gray);
    y -= 14;
  };
  newPage();
  const paragraph = (value: string) => {
    for (const line of wrap(value, regular, 7.2, contentWidth)) {
      if (y < bottom + 15) newPage();
      text(line, margin, y, 7.2, regular, gray);
      y -= 10;
    }
    y -= 5;
  };
  paragraph(`Filtros: ${filterText(dataset)}`);
  for (const note of dataset.notes ?? []) paragraph(note);
  const drawTable = (table: ExportTable) => {
    const columns = table.columns.filter((column) => column.pdf !== false);
    if (!columns.length) return;
    const totalWeight = columns.reduce((sum, column) => sum + (column.width ?? 20), 0);
    const widths = columns.map((column) => (contentWidth * (column.width ?? 20)) / totalWeight);
    const xOf = (index: number) =>
      margin + widths.slice(0, index).reduce((sum, size) => sum + size, 0);
    const headers = columns.map((column, i) => wrap(column.header, bold, 7.3, widths[i] - 10));
    const headerHeight = Math.max(...headers.map((lines) => lines.length)) * 9 + 11;
    const drawHeader = () => {
      page.drawRectangle({
        x: margin,
        y: y - headerHeight,
        width: contentWidth,
        height: headerHeight,
        color: blue,
      });
      headers.forEach((lines, i) =>
        lines.forEach((line, j) => text(line, xOf(i) + 5, y - 12 - j * 9, 7.3, bold, rgb(1, 1, 1))),
      );
      y -= headerHeight;
    };
    if (y < bottom + headerHeight + 35) newPage();
    text(`${table.name} - ${table.rows.length} registros`, margin, y, 10, bold);
    y -= 14;
    drawHeader();
    if (!table.rows.length) {
      y -= 18;
      text('No hay registros con estos filtros.', margin + 5, y, 8, regular, gray);
      y -= 15;
    }
    table.rows.forEach((record, rowIndex) => {
      const lines = columns.map((column, i) =>
        wrap(cellText(record[column.key], column), regular, 7.5, widths[i] - 10),
      );
      const lineCount = Math.max(...lines.map((cell) => cell.length));
      let offset = 0;
      while (offset < lineCount) {
        const desired = (lineCount - offset) * 9 + 7;
        if (y < bottom + Math.min(desired, height - 145 - headerHeight)) {
          newPage();
          drawHeader();
        }
        const capacity = Math.max(1, Math.floor((y - bottom - 7) / 9));
        const count = Math.min(lineCount - offset, capacity);
        const rowHeight = count * 9 + 7;
        if (rowIndex % 2 === 1)
          page.drawRectangle({
            x: margin,
            y: y - rowHeight,
            width: contentWidth,
            height: rowHeight,
            color: rgb(0.955, 0.965, 0.98),
          });
        lines.forEach((cellLines, i) =>
          cellLines.slice(offset, offset + count).forEach((line, j) => {
            const numeric = columns[i].kind === 'money' || columns[i].kind === 'number';
            const x = numeric
              ? xOf(i) + widths[i] - 5 - regular.widthOfTextAtSize(line, 7.5)
              : xOf(i) + 5;
            text(line, x, y - 11 - j * 9, 7.5);
          }),
        );
        y -= rowHeight;
        page.drawLine({
          start: { x: margin, y },
          end: { x: width - margin, y },
          thickness: 0.3,
          color: rgb(0.85, 0.89, 0.94),
        });
        offset += count;
      }
    });
    y -= 22;
  };
  dataset.tables.forEach(drawTable);
  const pages = pdf.getPages();
  pages.forEach((current, i) => {
    current.drawLine({
      start: { x: margin, y: 28 },
      end: { x: width - margin, y: 28 },
      color: rgb(0.85, 0.89, 0.94),
      thickness: 0.5,
    });
    current.drawText(printable(`${branding.companyName} - Listado filtrado | Uso interno`, regular), {
      x: margin,
      y: 16,
      size: 7,
      font: regular,
      color: gray,
    });
    const label = `Página ${i + 1} de ${pages.length}`;
    current.drawText(label, {
      x: width - margin - regular.widthOfTextAtSize(label, 7),
      y: 16,
      size: 7,
      font: regular,
      color: gray,
    });
  });
  return pdf.save();
};
