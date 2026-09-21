import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { Client } from '../models/Client.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { ApiError } from '../utils/ApiError.js';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 42;
const PRIMARY = rgb(14 / 255, 43 / 255, 78 / 255);
const ACCENT = rgb(1, 214 / 255, 0);
const TEXT = rgb(33 / 255, 37 / 255, 41 / 255);
const MUTED = rgb(95 / 255, 103 / 255, 112 / 255);
const BORDER = rgb(222 / 255, 226 / 255, 230 / 255);
const TABLE_HEADER = rgb(240 / 255, 244 / 255, 248 / 255);

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface PdfContext {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fonts: PdfFonts;
  pageNumber: number;
}

const formatDate = (date?: Date | string | null): string => {
  if (!date) {
    return 'No definida';
  }

  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
};

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
};

const numberValue = (value: number | string): number => Number(value);

const sanitize = (value?: string | number | null): string => {
  if (value === undefined || value === null || value === '') {
    return 'No registrado';
  }

  return String(value);
};

const wrapText = (
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] => {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
};

const drawTextLines = (
  page: PDFPage,
  lines: string[],
  x: number,
  y: number,
  options: {
    font: PDFFont;
    size: number;
    color?: ReturnType<typeof rgb>;
    lineHeight?: number;
  },
): number => {
  const lineHeight = options.lineHeight ?? options.size + 4;
  let cursorY = y;

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size: options.size,
      font: options.font,
      color: options.color ?? TEXT,
    });
    cursorY -= lineHeight;
  }

  return cursorY;
};

const drawFooter = (ctx: PdfContext): void => {
  const { page, fonts, pageNumber } = ctx;
  page.drawLine({
    start: { x: MARGIN, y: 64 },
    end: { x: MARGIN + 180, y: 64 },
    thickness: 0.8,
    color: MUTED,
  });
  page.drawText('Conforme recepción de vehículo', {
    x: MARGIN,
    y: 48,
    size: 9,
    font: fonts.regular,
    color: MUTED,
  });
  page.drawText('Garantía sujeta a condiciones del taller y repuestos instalados.', {
    x: MARGIN,
    y: 26,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
  page.drawText(`Página ${pageNumber}`, {
    x: A4_WIDTH - MARGIN - 48,
    y: 26,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
};

const addPage = (ctx: PdfContext): void => {
  drawFooter(ctx);
  ctx.page = ctx.pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  ctx.pageNumber += 1;
};

const ensureSpace = (ctx: PdfContext, cursorY: number, requiredHeight: number): number => {
  if (cursorY - requiredHeight >= 96) {
    return cursorY;
  }

  addPage(ctx);
  return A4_HEIGHT - MARGIN;
};

const drawLabelValue = (
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  fonts: PdfFonts,
): number => {
  page.drawText(label, {
    x,
    y,
    size: 8,
    font: fonts.bold,
    color: MUTED,
  });
  const valueLines = wrapText(value, fonts.regular, 10, width);
  return drawTextLines(page, valueLines, x, y - 13, {
    font: fonts.regular,
    size: 10,
    lineHeight: 13,
  });
};

const drawInfoBox = (
  ctx: PdfContext,
  title: string,
  entries: Array<{ label: string; value: string }>,
  x: number,
  y: number,
  width: number,
): void => {
  const height = 138;
  const { page, fonts } = ctx;

  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor: BORDER,
    borderWidth: 1,
  });
  page.drawRectangle({
    x,
    y: y - 24,
    width,
    height: 24,
    color: TABLE_HEADER,
  });
  page.drawText(title, {
    x: x + 12,
    y: y - 16,
    size: 11,
    font: fonts.bold,
    color: PRIMARY,
  });

  let cursorY = y - 42;
  for (const entry of entries) {
    cursorY = drawLabelValue(page, entry.label, entry.value, x + 12, cursorY, width - 24, fonts) - 4;
  }
};

const getWorkOrderForPdf = async (workOrderId: number): Promise<WorkOrder> => {
  const workOrder = await WorkOrder.findByPk(workOrderId, {
    include: [
      {
        model: Client,
        as: 'client',
        attributes: ['rut', 'nombre', 'telefono', 'email', 'direccion'],
      },
      {
        model: Vehicle,
        as: 'vehicle',
        attributes: ['patente', 'marca', 'modelo', 'ano', 'vinChasis', 'kilometraje'],
      },
      {
        model: WorkOrderItem,
        as: 'items',
        attributes: ['descripcion', 'cantidad', 'precioUnitario', 'subtotal'],
      },
      {
        model: User,
        as: 'creator',
        attributes: ['nombre'],
      },
    ],
  });

  if (!workOrder) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }

  return workOrder;
};

export async function generateWorkOrderPdf(workOrderId: number): Promise<Uint8Array> {
  const workOrder = await getWorkOrderForPdf(workOrderId);
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const ctx: PdfContext = {
    pdfDoc,
    page: pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]),
    fonts,
    pageNumber: 1,
  };

  let { page } = ctx;

  page.drawRectangle({ x: 0, y: A4_HEIGHT - 92, width: A4_WIDTH, height: 92, color: PRIMARY });
  page.drawRectangle({ x: 0, y: A4_HEIGHT - 96, width: A4_WIDTH, height: 4, color: ACCENT });
  page.drawText('UNITHOR - TALLER MECÁNICO', {
    x: MARGIN,
    y: A4_HEIGHT - 42,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`Orden de Trabajo ${workOrder.codigo}`, {
    x: MARGIN,
    y: A4_HEIGHT - 68,
    size: 12,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  });
  page.drawText(workOrder.estado.replace(/_/g, ' ').toUpperCase(), {
    x: A4_WIDTH - MARGIN - 150,
    y: A4_HEIGHT - 50,
    size: 13,
    font: fonts.bold,
    color: ACCENT,
  });

  let cursorY = A4_HEIGHT - 122;
  const dateEntries = [
    `Emisión: ${formatDate(new Date())}`,
    `Ingreso: ${formatDate(workOrder.fechaIngreso)}`,
    `Entrega: ${formatDate(workOrder.fechaEntrega)}`,
    `Asesor: ${sanitize(workOrder.creator?.nombre)}`,
  ];
  page.drawText(dateEntries.join('    '), {
    x: MARGIN,
    y: cursorY,
    size: 9,
    font: fonts.regular,
    color: MUTED,
  });

  cursorY -= 24;
  const boxWidth = (A4_WIDTH - MARGIN * 2 - 16) / 2;
  drawInfoBox(
    ctx,
    'Datos del Cliente',
    [
      { label: 'Nombre / Razón Social', value: sanitize(workOrder.client?.nombre) },
      { label: 'RUT', value: sanitize(workOrder.client?.rut) },
      { label: 'Teléfono', value: sanitize(workOrder.client?.telefono) },
      { label: 'Email', value: sanitize(workOrder.client?.email) },
      { label: 'Dirección', value: sanitize(workOrder.client?.direccion) },
    ],
    MARGIN,
    cursorY,
    boxWidth,
  );
  drawInfoBox(
    ctx,
    'Datos del Vehículo',
    [
      { label: 'Patente', value: sanitize(workOrder.vehicle?.patente) },
      {
        label: 'Marca / Modelo',
        value: `${sanitize(workOrder.vehicle?.marca)} / ${sanitize(workOrder.vehicle?.modelo)}`,
      },
      { label: 'Año', value: sanitize(workOrder.vehicle?.ano) },
      { label: 'VIN / Chasis', value: sanitize(workOrder.vehicle?.vinChasis) },
      { label: 'Kilometraje', value: sanitize(workOrder.vehicle?.kilometraje) },
    ],
    MARGIN + boxWidth + 16,
    cursorY,
    boxWidth,
  );

  cursorY -= 164;
  page.drawText('Trabajos y Repuestos', {
    x: MARGIN,
    y: cursorY,
    size: 13,
    font: fonts.bold,
    color: PRIMARY,
  });
  cursorY -= 22;

  const tableX = MARGIN;
  const colDescription = 285;
  const colQuantity = 60;
  const colPrice = 92;

  const drawTableHeader = (): void => {
    page = ctx.page;
    page.drawRectangle({
      x: tableX,
      y: cursorY - 20,
      width: A4_WIDTH - MARGIN * 2,
      height: 24,
      color: TABLE_HEADER,
      borderColor: BORDER,
      borderWidth: 1,
    });
    page.drawText('Descripción', { x: tableX + 8, y: cursorY - 12, size: 9, font: fonts.bold, color: PRIMARY });
    page.drawText('Cant.', { x: tableX + colDescription + 8, y: cursorY - 12, size: 9, font: fonts.bold, color: PRIMARY });
    page.drawText('Precio Unit.', {
      x: tableX + colDescription + colQuantity + 8,
      y: cursorY - 12,
      size: 9,
      font: fonts.bold,
      color: PRIMARY,
    });
    page.drawText('Subtotal', {
      x: tableX + colDescription + colQuantity + colPrice + 8,
      y: cursorY - 12,
      size: 9,
      font: fonts.bold,
      color: PRIMARY,
    });
    cursorY -= 24;
  };

  drawTableHeader();
  const items = workOrder.items && workOrder.items.length > 0 ? workOrder.items : [];
  let total = 0;

  if (items.length === 0) {
    cursorY = ensureSpace(ctx, cursorY, 34);
    page = ctx.page;
    page.drawRectangle({
      x: tableX,
      y: cursorY - 26,
      width: A4_WIDTH - MARGIN * 2,
      height: 30,
      borderColor: BORDER,
      borderWidth: 0.8,
    });
    page.drawText('Diagnóstico inicial / Sin repuestos cargados', {
      x: tableX + 8,
      y: cursorY - 15,
      size: 10,
      font: fonts.regular,
      color: TEXT,
    });
    cursorY -= 34;
  } else {
    for (const item of items.slice().sort((left, right) => left.id - right.id)) {
      const subtotal = numberValue(item.subtotal);
      total += subtotal;
      const descriptionLines = wrapText(item.descripcion, fonts.regular, 9, colDescription - 16);
      const rowHeight = Math.max(28, descriptionLines.length * 12 + 12);
      cursorY = ensureSpace(ctx, cursorY, rowHeight + 8);
      page = ctx.page;

      if (cursorY === A4_HEIGHT - MARGIN) {
        drawTableHeader();
      }

      page.drawRectangle({
        x: tableX,
        y: cursorY - rowHeight + 4,
        width: A4_WIDTH - MARGIN * 2,
        height: rowHeight,
        borderColor: BORDER,
        borderWidth: 0.6,
      });

      drawTextLines(page, descriptionLines, tableX + 8, cursorY - 9, {
        font: fonts.regular,
        size: 9,
        lineHeight: 12,
      });
      page.drawText(String(numberValue(item.cantidad)), {
        x: tableX + colDescription + 8,
        y: cursorY - 9,
        size: 9,
        font: fonts.regular,
        color: TEXT,
      });
      page.drawText(formatMoney(numberValue(item.precioUnitario)), {
        x: tableX + colDescription + colQuantity + 8,
        y: cursorY - 9,
        size: 9,
        font: fonts.regular,
        color: TEXT,
      });
      page.drawText(formatMoney(subtotal), {
        x: tableX + colDescription + colQuantity + colPrice + 8,
        y: cursorY - 9,
        size: 9,
        font: fonts.regular,
        color: TEXT,
      });
      cursorY -= rowHeight;
    }
  }

  cursorY = ensureSpace(ctx, cursorY, 112);
  page = ctx.page;
  cursorY -= 10;
  page.drawRectangle({
    x: A4_WIDTH - MARGIN - 190,
    y: cursorY - 34,
    width: 190,
    height: 34,
    color: TABLE_HEADER,
    borderColor: BORDER,
    borderWidth: 1,
  });
  page.drawText('Total', {
    x: A4_WIDTH - MARGIN - 178,
    y: cursorY - 22,
    size: 11,
    font: fonts.bold,
    color: PRIMARY,
  });
  page.drawText(formatMoney(total), {
    x: A4_WIDTH - MARGIN - 90,
    y: cursorY - 22,
    size: 11,
    font: fonts.bold,
    color: PRIMARY,
  });

  cursorY -= 58;
  page.drawText('Observaciones / Motivo de Ingreso', {
    x: MARGIN,
    y: cursorY,
    size: 12,
    font: fonts.bold,
    color: PRIMARY,
  });
  cursorY -= 18;
  const observationLines = wrapText(
    sanitize(workOrder.descripcion),
    fonts.regular,
    10,
    A4_WIDTH - MARGIN * 2,
  );
  drawTextLines(page, observationLines.slice(0, 8), MARGIN, cursorY, {
    font: fonts.regular,
    size: 10,
    lineHeight: 13,
  });

  drawFooter(ctx);
  return pdfDoc.save();
}
