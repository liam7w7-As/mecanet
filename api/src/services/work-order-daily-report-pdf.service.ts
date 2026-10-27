import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import type { WorkshopDailyReport } from './work-order-labor.service.js';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 42;
const PRIMARY = rgb(14 / 255, 43 / 255, 78 / 255);
const MUTED = rgb(95 / 255, 103 / 255, 112 / 255);
const TEXT = rgb(33 / 255, 37 / 255, 41 / 255);
const BORDER = rgb(222 / 255, 226 / 255, 230 / 255);
const HEADER = rgb(240 / 255, 244 / 255, 248 / 255);

interface RenderContext {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

const createContext = async (): Promise<RenderContext> => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, font, bold, y: A4_HEIGHT - MARGIN };
};

const newPage = async (context: RenderContext): Promise<void> => {
  context.page = context.doc.addPage([A4_WIDTH, A4_HEIGHT]);
  context.y = A4_HEIGHT - MARGIN;
};

const ensureSpace = async (context: RenderContext, needed: number): Promise<void> => {
  if (context.y - needed < MARGIN) {
    await newPage(context);
  }
};

const drawText = (
  context: RenderContext,
  text: string,
  options: { x?: number; size?: number; bold?: boolean; color?: typeof TEXT } = {},
): void => {
  context.page.drawText(text, {
    x: options.x ?? MARGIN,
    y: context.y,
    size: options.size ?? 9,
    font: options.bold ? context.bold : context.font,
    color: options.color ?? TEXT,
  });
};

const truncate = (text: string, maxWidth: number, font: PDFFont, size: number): string => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}…`, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
};

const drawSectionTitle = async (
  context: RenderContext,
  title: string,
): Promise<void> => {
  await ensureSpace(context, 30);
  context.y -= 16;
  drawText(context, title.toUpperCase(), { size: 9, bold: true, color: PRIMARY });
  context.page.drawLine({
    start: { x: MARGIN, y: context.y - 4 },
    end: { x: A4_WIDTH - MARGIN, y: context.y - 4 },
    thickness: 0.8,
    color: BORDER,
  });
  context.y -= 14;
};

const drawRow = async (
  context: RenderContext,
  columns: Array<{ text: string; width: number; bold?: boolean }>,
): Promise<void> => {
  await ensureSpace(context, 18);
  let x = MARGIN;
  for (const column of columns) {
    drawText(
      context,
      truncate(column.text, column.width - 6, column.bold ? context.bold : context.font, 8.5),
      { x, size: 8.5, bold: column.bold },
    );
    x += column.width;
  }
  context.y -= 13;
};

const drawHeaderRow = async (
  context: RenderContext,
  columns: Array<{ text: string; width: number }>,
): Promise<void> => {
  await ensureSpace(context, 22);
  context.page.drawRectangle({
    x: MARGIN - 4,
    y: context.y - 4,
    width: A4_WIDTH - MARGIN * 2 + 8,
    height: 16,
    color: HEADER,
  });
  let x = MARGIN;
  for (const column of columns) {
    drawText(context, column.text, { x, size: 8, bold: true, color: MUTED });
    x += column.width;
  }
  context.y -= 16;
};

export const generateWorkshopDailyReportPdf = async (
  report: WorkshopDailyReport,
): Promise<Uint8Array> => {
  const context = await createContext();
  drawText(context, 'UNITHOR - Reporte diario de taller', { size: 16, bold: true, color: PRIMARY });
  context.y -= 16;
  drawText(context, `Fecha: ${report.fecha}`, { size: 10, color: MUTED });
  context.y -= 12;
  drawText(
    context,
    `Horas registradas: ${report.totalHoras.toFixed(2)} h   |   Trabajos completados: ${report.totalItemsCompletados}   |   Sesiones: ${report.totalSesiones}`,
    { size: 9, color: MUTED },
  );

  await drawSectionTitle(context, 'Avance por persona');
  await drawHeaderRow(context, [
    { text: 'Persona', width: 150 },
    { text: 'Rol', width: 60 },
    { text: 'Horas', width: 45 },
    { text: 'Sesiones', width: 50 },
    { text: 'Completados', width: 65 },
    { text: 'Estado', width: 90 },
  ]);
  for (const user of report.usuarios) {
    await drawRow(context, [
      { text: user.nombre, width: 150, bold: true },
      { text: user.rol, width: 60 },
      { text: user.horas.toFixed(2), width: 45 },
      { text: String(user.sesiones), width: 50 },
      { text: String(user.itemsCompletados), width: 65 },
      { text: user.enCurso ? 'En curso' : user.sesiones > 0 ? 'Con actividad' : 'Sin actividad', width: 90 },
    ]);
    for (const detail of user.detalle.slice(0, 8)) {
      await drawRow(context, [
        { text: `   ${detail.workOrderCodigo}`, width: 150 },
        { text: detail.itemDescripcion, width: 250 },
        { text: `${detail.minutos} min`, width: 70 },
        { text: detail.estado, width: 60 },
      ]);
    }
  }

  await drawSectionTitle(context, 'Órdenes con actividad');
  await drawHeaderRow(context, [
    { text: 'OT', width: 90 },
    { text: 'Patente', width: 80 },
    { text: 'Estado', width: 90 },
    { text: 'Horas', width: 50 },
    { text: 'Compl.', width: 45 },
    { text: 'Mecánicos', width: 130 },
  ]);
  if (report.ordenes.length === 0) {
    await drawRow(context, [{ text: 'Sin actividad registrada en la fecha.', width: 480 }]);
  }
  for (const order of report.ordenes) {
    await drawRow(context, [
      { text: order.codigo, width: 90, bold: true },
      { text: order.patente ?? '-', width: 80 },
      { text: order.estado, width: 90 },
      { text: order.horas.toFixed(2), width: 50 },
      { text: String(order.completados), width: 45 },
      { text: order.mecanicos.join(', ') || '-', width: 130 },
    ]);
  }

  context.y -= 16;
  drawText(context, 'Documento interno de control de horas. No incluye precios.', {
    size: 8,
    color: MUTED,
  });

  return context.doc.save();
};
