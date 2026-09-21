import {
  VEHICLE_INVENTORY_ITEMS,
  WORK_ORDER_INSPECTION_PHOTO_SLOTS,
  type FuelLevel,
  type TireCondition,
  type VehicleInventoryItem,
  type WorkOrderInspectionPhotoSlot,
} from '@unithor/shared';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { readInspectionPhotoBytes } from './work-order-inspection-photo.service.js';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 38;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 52;
const PRIMARY = rgb(14 / 255, 43 / 255, 78 / 255);
const ACCENT = rgb(1, 214 / 255, 0);
const TEXT = rgb(32 / 255, 40 / 255, 50 / 255);
const MUTED = rgb(100 / 255, 112 / 255, 126 / 255);
const BORDER = rgb(216 / 255, 224 / 255, 232 / 255);
const SOFT = rgb(244 / 255, 247 / 255, 250 / 255);
const SUCCESS = rgb(31 / 255, 122 / 255, 83 / 255);
const WARNING = rgb(173 / 255, 102 / 255, 0);

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface PdfContext {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fonts: PdfFonts;
  workOrderCode: string;
}

interface InfoEntry {
  label: string;
  value: string;
}

const FUEL_LABELS: Record<FuelLevel, string> = {
  vacio: 'Vacío',
  cuarto: '1/4',
  medio: '1/2',
  tres_cuartos: '3/4',
  lleno: 'Lleno',
};

const TIRE_LABELS: Record<TireCondition, string> = {
  no_revisado: 'No revisado',
  bueno: 'Bueno',
  regular: 'Regular',
  desgaste_severo: 'Desgaste severo',
  baja_presion: 'Baja presión',
};

const INVENTORY_LABELS: Record<VehicleInventoryItem, string> = {
  botiquin: 'Botiquín',
  chaleco_reflectante: 'Chaleco reflectante',
  extintor: 'Extintor',
  triangulo: 'Triángulo',
  control_remoto: 'Control remoto',
  manual: 'Manual',
  radio: 'Radio',
  usb: 'USB',
  rueda_repuesto: 'Rueda de repuesto',
  llave_ruedas: 'Llave de ruedas',
  gata: 'Gata',
  herramientas: 'Herramientas',
  perno_seguridad: 'Perno de seguridad',
  enganche: 'Enganche',
  antena: 'Antena',
  tapa_combustible: 'Tapa de combustible',
  tapas_ruedas: 'Tapas de ruedas',
  limpiaparabrisas: 'Limpiaparabrisas',
};

const PHOTO_LABELS: Record<WorkOrderInspectionPhotoSlot, string> = {
  frontal: 'Frontal',
  trasera: 'Trasera',
  lateral_izquierdo: 'Lateral izquierdo',
  lateral_derecho: 'Lateral derecho',
  frontal_izquierdo: 'Frontal izquierdo',
  frontal_derecho: 'Frontal derecho',
  trasero_izquierdo: 'Trasero izquierdo',
  trasero_derecho: 'Trasero derecho',
  interior: 'Interior',
};

const formatDate = (date?: Date | string | null, includeTime = false): string => {
  if (!date) return 'No definida';

  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(date));
};

const formatMoney = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number | string): string =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(value));

const valueOrFallback = (
  value?: string | number | null,
  fallback: string | null | undefined = 'No registrado',
): string => {
  if (value === undefined || value === null || value === '') {
    return fallback || 'No registrado';
  }
  return String(value);
};

const splitLongWord = (
  word: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] => {
  const pieces: string[] = [];
  let current = '';

  for (const character of word) {
    const candidate = `${current}${character}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) pieces.push(current);
      current = character;
    }
  }
  if (current) pieces.push(current);
  return pieces;
};

const wrapText = (
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] => {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = '';
    for (const rawWord of words) {
      const wordParts =
        font.widthOfTextAtSize(rawWord, fontSize) > maxWidth
          ? splitLongWord(rawWord, font, fontSize, maxWidth)
          : [rawWord];

      for (const word of wordParts) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          currentLine = candidate;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
};

const drawLines = (
  page: PDFPage,
  lines: string[],
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = TEXT,
  lineHeight = size + 3,
): number => {
  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cursorY, size, font, color });
    cursorY -= lineHeight;
  }
  return cursorY;
};

const drawDocumentHeader = (ctx: PdfContext, section?: string): number => {
  const { page, fonts, workOrderCode } = ctx;
  const height = section ? 58 : 94;
  page.drawRectangle({ x: 0, y: A4_HEIGHT - height, width: A4_WIDTH, height, color: PRIMARY });
  page.drawRectangle({ x: 0, y: A4_HEIGHT - height - 4, width: A4_WIDTH, height: 4, color: ACCENT });
  page.drawText('UNITHOR', {
    x: MARGIN,
    y: A4_HEIGHT - (section ? 27 : 38),
    size: section ? 16 : 22,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(section ?? 'ORDEN DE TRABAJO', {
    x: MARGIN,
    y: A4_HEIGHT - (section ? 45 : 65),
    size: section ? 9 : 12,
    font: fonts.regular,
    color: section ? rgb(0.82, 0.87, 0.92) : ACCENT,
  });
  page.drawText(workOrderCode, {
    x: A4_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize(workOrderCode, 13),
    y: A4_HEIGHT - (section ? 34 : 48),
    size: 13,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  return A4_HEIGHT - height - 22;
};

const addPage = (ctx: PdfContext, section: string): number => {
  ctx.page = ctx.pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  return drawDocumentHeader(ctx, section);
};

const drawSectionTitle = (ctx: PdfContext, title: string, y: number): number => {
  ctx.page.drawRectangle({ x: MARGIN, y: y - 6, width: 4, height: 17, color: ACCENT });
  ctx.page.drawText(title, {
    x: MARGIN + 11,
    y,
    size: 12,
    font: ctx.fonts.bold,
    color: PRIMARY,
  });
  return y - 21;
};

const measureInfoCard = (entries: InfoEntry[], fonts: PdfFonts, width: number): number => {
  const contentWidth = width - 22;
  return (
    34 +
    entries.reduce((height, entry) => {
      const lines = wrapText(entry.value, fonts.regular, 8.5, contentWidth);
      return height + 12 + Math.max(1, lines.length) * 11;
    }, 0) +
    8
  );
};

const drawInfoCard = (
  ctx: PdfContext,
  title: string,
  entries: InfoEntry[],
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const { page, fonts } = ctx;
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: rgb(1, 1, 1),
    borderColor: BORDER,
    borderWidth: 0.8,
  });
  page.drawRectangle({ x, y: y - 25, width, height: 25, color: SOFT });
  page.drawText(title, { x: x + 11, y: y - 17, size: 10, font: fonts.bold, color: PRIMARY });

  let entryY = y - 42;
  for (const entry of entries) {
    page.drawText(entry.label.toUpperCase(), {
      x: x + 11,
      y: entryY,
      size: 6.8,
      font: fonts.bold,
      color: MUTED,
    });
    entryY -= 11;
    entryY =
      drawLines(
        page,
        wrapText(entry.value, fonts.regular, 8.5, width - 22),
        x + 11,
        entryY,
        fonts.regular,
        8.5,
        TEXT,
        11,
      ) - 3;
  }
};

const parseInventory = (value: unknown): VehicleInventoryItem[] => {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is VehicleInventoryItem =>
      typeof item === 'string' &&
      VEHICLE_INVENTORY_ITEMS.includes(item as VehicleInventoryItem),
  );
};

const getWorkOrderForPdf = async (workOrderId: number): Promise<WorkOrder> => {
  const workOrder = await WorkOrder.findByPk(workOrderId, {
    include: [
      {
        model: Client,
        as: 'client',
        attributes: [
          'id',
          'rut',
          'nombre',
          'tipo',
          'telefono',
          'email',
          'direccion',
          'region',
          'comuna',
        ],
      },
      {
        model: Vehicle,
        as: 'vehicle',
        attributes: [
          'id',
          'patente',
          'marca',
          'modelo',
          'ano',
          'color',
          'vinChasis',
          'motor',
          'kilometraje',
          'combustible',
          'transmision',
        ],
      },
      {
        model: WorkOrderItem,
        as: 'items',
        attributes: [
          'id',
          'catalogItemId',
          'descripcion',
          'cantidad',
          'precioUnitario',
          'subtotal',
          'estadoOperativo',
          'notasOperativas',
          'stockConsumido',
          'stockConsumidoCantidad',
          'stockConsumidoAt',
        ],
        include: [
          {
            model: CatalogItem,
            as: 'catalogItem',
            attributes: ['id', 'tipo', 'codigo', 'nombre'],
            paranoid: false,
          },
        ],
      },
      { model: User, as: 'creator', attributes: ['id', 'nombre', 'email'] },
      {
        model: WorkOrderInspection,
        as: 'inspection',
        include: [
          { model: User, as: 'inspector', attributes: ['id', 'nombre'] },
          { model: WorkOrderInspectionPhoto, as: 'photos' },
        ],
      },
    ],
  });

  if (!workOrder) throw ApiError.notFound('Orden de trabajo no encontrada');
  return workOrder;
};

const embedPhoto = async (
  pdfDoc: PDFDocument,
  photo: WorkOrderInspectionPhoto,
): Promise<PDFImage | null> => {
  if (photo.mimeType !== 'image/jpeg' && photo.mimeType !== 'image/png') return null;

  try {
    const bytes = await readInspectionPhotoBytes(photo.storageKey);
    return photo.mimeType === 'image/jpeg'
      ? await pdfDoc.embedJpg(bytes)
      : await pdfDoc.embedPng(bytes);
  } catch (error: unknown) {
    logger.warn({ err: error, photoId: photo.id }, 'No se pudo incrustar una foto en el PDF de OT');
    return null;
  }
};

const drawPhotoCard = (
  ctx: PdfContext,
  photo: WorkOrderInspectionPhoto,
  image: PDFImage | null,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const { page, fonts } = ctx;
  page.drawRectangle({ x, y: y - height, width, height, borderColor: BORDER, borderWidth: 0.8 });
  page.drawRectangle({ x, y: y - 24, width, height: 24, color: SOFT });
  page.drawText(PHOTO_LABELS[photo.slot], {
    x: x + 10,
    y: y - 16,
    size: 9,
    font: fonts.bold,
    color: PRIMARY,
  });

  const imageX = x + 8;
  const imageY = y - height + 8;
  const imageWidth = width - 16;
  const imageHeight = height - 40;
  if (image) {
    const scale = Math.min(imageWidth / image.width, imageHeight / image.height);
    const renderedWidth = image.width * scale;
    const renderedHeight = image.height * scale;
    page.drawImage(image, {
      x: imageX + (imageWidth - renderedWidth) / 2,
      y: imageY + (imageHeight - renderedHeight) / 2,
      width: renderedWidth,
      height: renderedHeight,
    });
  } else {
    page.drawRectangle({ x: imageX, y: imageY, width: imageWidth, height: imageHeight, color: SOFT });
    const message =
      photo.mimeType === 'image/webp'
        ? 'Vista WebP disponible en la ficha digital'
        : 'Imagen no disponible';
    const lines = wrapText(message, fonts.regular, 8.5, imageWidth - 20);
    drawLines(
      page,
      lines,
      imageX + 10,
      imageY + imageHeight / 2 + lines.length * 5,
      fonts.regular,
      8.5,
      MUTED,
      11,
    );
  }
};

const drawReceptionAndVehicle = (ctx: PdfContext, workOrder: WorkOrder, startY: number): number => {
  let cursorY = drawSectionTitle(ctx, 'Recepción, facturación y vehículo', startY);
  const gap = 10;
  const width = (CONTENT_WIDTH - gap) / 2;
  const contactEntries: InfoEntry[] = [
    {
      label: 'Persona que entrega',
      value: valueOrFallback(workOrder.contactName, workOrder.client?.nombre),
    },
    {
      label: 'RUT / Identificación',
      value: valueOrFallback(workOrder.contactRut, workOrder.client?.rut),
    },
    {
      label: 'Teléfono',
      value: valueOrFallback(workOrder.contactPhone, workOrder.client?.telefono),
    },
    { label: 'Email', value: valueOrFallback(workOrder.contactEmail, workOrder.client?.email) },
  ];
  const billingAddress = [workOrder.billingAddress, workOrder.billingComuna, workOrder.billingRegion]
    .filter(Boolean)
    .join(', ');
  const billingEntries: InfoEntry[] = [
    {
      label: 'Nombre / Razón social',
      value: valueOrFallback(workOrder.billingName, workOrder.client?.nombre),
    },
    { label: 'RUT', value: valueOrFallback(workOrder.billingRut, workOrder.client?.rut) },
    { label: 'Tipo', value: valueOrFallback(workOrder.billingType, workOrder.client?.tipo) },
    {
      label: 'Contacto',
      value:
        [workOrder.billingPhone, workOrder.billingEmail].filter(Boolean).join(' / ') ||
        valueOrFallback(workOrder.client?.telefono),
    },
    {
      label: 'Dirección',
      value: billingAddress || valueOrFallback(workOrder.client?.direccion),
    },
  ];
  const cardHeight = Math.max(
    measureInfoCard(contactEntries, ctx.fonts, width),
    measureInfoCard(billingEntries, ctx.fonts, width),
  );
  drawInfoCard(ctx, 'Contacto de recepción', contactEntries, MARGIN, cursorY, width, cardHeight);
  drawInfoCard(
    ctx,
    'Datos de facturación',
    billingEntries,
    MARGIN + width + gap,
    cursorY,
    width,
    cardHeight,
  );
  cursorY -= cardHeight + 14;

  const vehicle = workOrder.vehicle;
  const vehicleEntries: InfoEntry[] = [
    { label: 'Patente', value: valueOrFallback(vehicle?.patente) },
    {
      label: 'Marca / Modelo',
      value: `${valueOrFallback(vehicle?.marca)} / ${valueOrFallback(vehicle?.modelo)}`,
    },
    {
      label: 'Año / Color',
      value: `${valueOrFallback(vehicle?.ano)} / ${valueOrFallback(vehicle?.color)}`,
    },
    { label: 'VIN / Chasis', value: valueOrFallback(vehicle?.vinChasis) },
    { label: 'Motor', value: valueOrFallback(vehicle?.motor) },
    {
      label: 'Combustible / Transmisión',
      value: `${valueOrFallback(vehicle?.combustible)} / ${valueOrFallback(vehicle?.transmision)}`,
    },
    {
      label: 'Kilometraje de ingreso',
      value:
        workOrder.kilometrajeIngreso === null
          ? valueOrFallback(vehicle?.kilometraje)
          : `${formatNumber(workOrder.kilometrajeIngreso)} km`,
    },
  ];
  const vehicleHeight = measureInfoCard(vehicleEntries, ctx.fonts, CONTENT_WIDTH);
  drawInfoCard(ctx, 'Vehículo recibido', vehicleEntries, MARGIN, cursorY, CONTENT_WIDTH, vehicleHeight);
  return cursorY - vehicleHeight - 15;
};

const drawInspection = (ctx: PdfContext, workOrder: WorkOrder, startY: number): number => {
  const inspection = workOrder.inspection;
  let cursorY = startY;
  if (cursorY < 390) cursorY = addPage(ctx, 'INSPECCIÓN DE RECEPCIÓN');
  cursorY = drawSectionTitle(ctx, 'Inspección de recepción', cursorY);

  if (!inspection) {
    ctx.page.drawText('No se registró una inspección para esta orden.', {
      x: MARGIN,
      y: cursorY - 2,
      size: 9.5,
      font: ctx.fonts.regular,
      color: MUTED,
    });
    return cursorY - 28;
  }

  const tireValue = (value: TireCondition | null): string =>
    value ? TIRE_LABELS[value] : 'No registrado';
  const inspectionEntries: InfoEntry[] = [
    {
      label: 'Combustible',
      value: inspection.nivelCombustible
        ? FUEL_LABELS[inspection.nivelCombustible]
        : 'No registrado',
    },
    { label: 'Delantera izquierda', value: tireValue(inspection.llantaDelanteraIzquierda) },
    { label: 'Delantera derecha', value: tireValue(inspection.llantaDelanteraDerecha) },
    { label: 'Trasera izquierda', value: tireValue(inspection.llantaTraseraIzquierda) },
    { label: 'Trasera derecha', value: tireValue(inspection.llantaTraseraDerecha) },
    { label: 'Inspeccionado por', value: valueOrFallback(inspection.inspector?.nombre) },
  ];
  const inspectionHeight = measureInfoCard(inspectionEntries, ctx.fonts, CONTENT_WIDTH);
  drawInfoCard(
    ctx,
    'Estado exterior y niveles',
    inspectionEntries,
    MARGIN,
    cursorY,
    CONTENT_WIDTH,
    inspectionHeight,
  );
  cursorY -= inspectionHeight + 15;

  const inventory = parseInventory(inspection.getDataValue('inventario'));
  ctx.page.drawText('INVENTARIO INTERIOR', {
    x: MARGIN,
    y: cursorY,
    size: 8,
    font: ctx.fonts.bold,
    color: MUTED,
  });
  cursorY -= 15;
  const inventoryText =
    inventory.length > 0
      ? inventory.map((item) => INVENTORY_LABELS[item]).join('  |  ')
      : 'Sin elementos declarados';
  const inventoryLines = wrapText(inventoryText, ctx.fonts.regular, 9, CONTENT_WIDTH - 18);
  const inventoryHeight = Math.max(30, inventoryLines.length * 12 + 14);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: cursorY - inventoryHeight + 4,
    width: CONTENT_WIDTH,
    height: inventoryHeight,
    color: SOFT,
    borderColor: BORDER,
    borderWidth: 0.6,
  });
  drawLines(
    ctx.page,
    inventoryLines,
    MARGIN + 9,
    cursorY - 9,
    ctx.fonts.regular,
    9,
    TEXT,
    12,
  );
  cursorY -= inventoryHeight + 12;

  for (const [label, text] of [
    [
      'OBJETOS DE VALOR',
      valueOrFallback(inspection.objetosValor, 'Sin objetos de valor declarados'),
    ],
    [
      'OBSERVACIONES DE INSPECCIÓN',
      valueOrFallback(inspection.observaciones, 'Sin observaciones adicionales'),
    ],
  ] as const) {
    const lines = wrapText(text, ctx.fonts.regular, 9, CONTENT_WIDTH);
    const needed = 15 + lines.length * 12 + 8;
    if (cursorY - needed < CONTENT_BOTTOM) cursorY = addPage(ctx, 'INSPECCIÓN DE RECEPCIÓN');
    ctx.page.drawText(label, {
      x: MARGIN,
      y: cursorY,
      size: 8,
      font: ctx.fonts.bold,
      color: MUTED,
    });
    cursorY =
      drawLines(
        ctx.page,
        lines,
        MARGIN,
        cursorY - 14,
        ctx.fonts.regular,
        9,
        TEXT,
        12,
      ) - 10;
  }

  return cursorY;
};

const drawPhotos = async (ctx: PdfContext, workOrder: WorkOrder): Promise<void> => {
  const photos = (workOrder.inspection?.photos ?? [])
    .slice()
    .sort(
      (left, right) =>
        WORK_ORDER_INSPECTION_PHOTO_SLOTS.indexOf(left.slot) -
        WORK_ORDER_INSPECTION_PHOTO_SLOTS.indexOf(right.slot),
    );
  if (photos.length === 0) return;

  const embedded = await Promise.all(
    photos.map(async (photo) => ({ photo, image: await embedPhoto(ctx.pdfDoc, photo) })),
  );
  let cursorY = addPage(ctx, 'EVIDENCIA FOTOGRÁFICA');
  const gap = 12;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  const cardHeight = 212;
  let column = 0;

  for (const entry of embedded) {
    if (cursorY - cardHeight < CONTENT_BOTTOM) {
      cursorY = addPage(ctx, 'EVIDENCIA FOTOGRÁFICA');
      column = 0;
    }
    const x = MARGIN + column * (cardWidth + gap);
    drawPhotoCard(ctx, entry.photo, entry.image, x, cursorY, cardWidth, cardHeight);
    if (column === 0) {
      column = 1;
    } else {
      column = 0;
      cursorY -= cardHeight + 12;
    }
  }
};

const drawItems = (ctx: PdfContext, workOrder: WorkOrder): void => {
  let cursorY = addPage(ctx, 'SERVICIOS Y REPUESTOS');
  cursorY = drawSectionTitle(ctx, 'Detalle operativo y valorización', cursorY);
  const items = (workOrder.items ?? []).slice().sort((left, right) => left.id - right.id);
  const widths = [62, 194, 70, 40, 74, 79];
  const xPositions = widths.reduce<number[]>((positions, width) => {
    positions.push(positions[positions.length - 1] + width);
    return positions;
  }, [MARGIN]);

  const drawTableHeader = (): void => {
    ctx.page.drawRectangle({
      x: MARGIN,
      y: cursorY - 22,
      width: CONTENT_WIDTH,
      height: 24,
      color: PRIMARY,
    });
    ['Tipo', 'Descripción', 'Estado', 'Cant.', 'P. unitario', 'Subtotal'].forEach(
      (label, index) => {
        ctx.page.drawText(label, {
          x: xPositions[index] + 5,
          y: cursorY - 14,
          size: 7.4,
          font: ctx.fonts.bold,
          color: rgb(1, 1, 1),
        });
      },
    );
    cursorY -= 24;
  };

  drawTableHeader();
  let total = 0;
  let completed = 0;
  let consumedParts = 0;

  if (items.length === 0) {
    ctx.page.drawRectangle({
      x: MARGIN,
      y: cursorY - 31,
      width: CONTENT_WIDTH,
      height: 31,
      borderColor: BORDER,
      borderWidth: 0.7,
    });
    ctx.page.drawText('Diagnóstico inicial / Sin servicios ni repuestos cargados', {
      x: MARGIN + 8,
      y: cursorY - 19,
      size: 9,
      font: ctx.fonts.regular,
      color: MUTED,
    });
    cursorY -= 42;
  }

  for (const item of items) {
    const description = item.notasOperativas
      ? `${item.descripcion}\nNota: ${item.notasOperativas}`
      : item.descripcion;
    const descriptionLines = wrapText(description, ctx.fonts.regular, 8, widths[1] - 10);
    const rowHeight = Math.max(31, descriptionLines.length * 10 + 12);
    if (cursorY - rowHeight < CONTENT_BOTTOM + 70) {
      cursorY = addPage(ctx, 'SERVICIOS Y REPUESTOS');
      drawTableHeader();
    }

    const type =
      item.catalogItem?.tipo === 'parte'
        ? 'Repuesto'
        : item.catalogItem?.tipo === 'estandar'
          ? 'Estándar'
          : item.catalogItem?.tipo === 'especifico'
            ? 'Específico'
            : 'Libre';
    const status = item.estadoOperativo.replace(/_/g, ' ');
    const subtotal = Number(item.subtotal);
    total += subtotal;
    if (item.estadoOperativo === 'completado') completed += 1;
    if (item.stockConsumido) consumedParts += item.stockConsumidoCantidad;

    ctx.page.drawRectangle({
      x: MARGIN,
      y: cursorY - rowHeight,
      width: CONTENT_WIDTH,
      height: rowHeight,
      color: rgb(1, 1, 1),
      borderColor: BORDER,
      borderWidth: 0.5,
    });
    for (let index = 1; index < xPositions.length - 1; index += 1) {
      ctx.page.drawLine({
        start: { x: xPositions[index], y: cursorY },
        end: { x: xPositions[index], y: cursorY - rowHeight },
        thickness: 0.4,
        color: BORDER,
      });
    }
    drawLines(
      ctx.page,
      wrapText(type, ctx.fonts.regular, 7.5, widths[0] - 10),
      xPositions[0] + 5,
      cursorY - 12,
      ctx.fonts.regular,
      7.5,
      TEXT,
      9,
    );
    drawLines(
      ctx.page,
      descriptionLines,
      xPositions[1] + 5,
      cursorY - 12,
      ctx.fonts.regular,
      8,
      TEXT,
      10,
    );
    drawLines(
      ctx.page,
      wrapText(status, ctx.fonts.regular, 7.5, widths[2] - 10),
      xPositions[2] + 5,
      cursorY - 12,
      ctx.fonts.regular,
      7.5,
      item.estadoOperativo === 'completado' ? SUCCESS : WARNING,
      9,
    );
    ctx.page.drawText(formatNumber(item.cantidad), {
      x: xPositions[3] + 5,
      y: cursorY - 12,
      size: 7.5,
      font: ctx.fonts.regular,
      color: TEXT,
    });
    ctx.page.drawText(formatMoney(Number(item.precioUnitario)), {
      x: xPositions[4] + 5,
      y: cursorY - 12,
      size: 7.1,
      font: ctx.fonts.regular,
      color: TEXT,
    });
    ctx.page.drawText(formatMoney(subtotal), {
      x: xPositions[5] + 5,
      y: cursorY - 12,
      size: 7.1,
      font: ctx.fonts.regular,
      color: TEXT,
    });
    cursorY -= rowHeight;
  }

  if (cursorY < 210) cursorY = addPage(ctx, 'RESUMEN Y CONFORMIDAD');
  cursorY -= 14;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: cursorY - 56,
    width: CONTENT_WIDTH,
    height: 56,
    color: SOFT,
    borderColor: BORDER,
    borderWidth: 0.8,
  });
  ctx.page.drawText(`Avance: ${completed} de ${items.length} ítems completados`, {
    x: MARGIN + 12,
    y: cursorY - 21,
    size: 9,
    font: ctx.fonts.bold,
    color: PRIMARY,
  });
  ctx.page.drawText(`Repuestos consumidos: ${consumedParts} unidades`, {
    x: MARGIN + 12,
    y: cursorY - 40,
    size: 8.5,
    font: ctx.fonts.regular,
    color: MUTED,
  });
  const totalText = formatMoney(total);
  ctx.page.drawText('TOTAL ESTIMADO', {
    x: A4_WIDTH - MARGIN - 175,
    y: cursorY - 21,
    size: 8,
    font: ctx.fonts.bold,
    color: MUTED,
  });
  ctx.page.drawText(totalText, {
    x: A4_WIDTH - MARGIN - ctx.fonts.bold.widthOfTextAtSize(totalText, 15),
    y: cursorY - 43,
    size: 15,
    font: ctx.fonts.bold,
    color: PRIMARY,
  });
  cursorY -= 79;

  ctx.page.drawText('MOTIVO DE INGRESO / DIAGNÓSTICO', {
    x: MARGIN,
    y: cursorY,
    size: 8,
    font: ctx.fonts.bold,
    color: MUTED,
  });
  const descriptionLines = wrapText(
    valueOrFallback(workOrder.descripcion, 'Sin descripción registrada'),
    ctx.fonts.regular,
    9,
    CONTENT_WIDTH,
  );
  cursorY =
    drawLines(
      ctx.page,
      descriptionLines,
      MARGIN,
      cursorY - 15,
      ctx.fonts.regular,
      9,
      TEXT,
      12,
    ) - 30;
  if (cursorY < 112) cursorY = addPage(ctx, 'CONFORMIDAD');

  const signatureY = Math.min(cursorY - 18, 120);
  const signatureWidth = 205;
  for (const [x, label] of [
    [MARGIN, 'Firma cliente / persona que entrega'],
    [A4_WIDTH - MARGIN - signatureWidth, 'Firma y sello taller'],
  ] as const) {
    ctx.page.drawLine({
      start: { x, y: signatureY },
      end: { x: x + signatureWidth, y: signatureY },
      thickness: 0.8,
      color: MUTED,
    });
    ctx.page.drawText(label, {
      x,
      y: signatureY - 15,
      size: 8,
      font: ctx.fonts.regular,
      color: MUTED,
    });
  }
};

const drawFooters = (ctx: PdfContext): void => {
  const pages = ctx.pdfDoc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN, y: 35 },
      end: { x: A4_WIDTH - MARGIN, y: 35 },
      thickness: 0.5,
      color: BORDER,
    });
    page.drawText('Documento operativo UNITHOR - La recepción no implica diagnóstico definitivo.', {
      x: MARGIN,
      y: 20,
      size: 6.8,
      font: ctx.fonts.regular,
      color: MUTED,
    });
    const pageText = `Página ${index + 1} de ${pages.length}`;
    page.drawText(pageText, {
      x: A4_WIDTH - MARGIN - ctx.fonts.regular.widthOfTextAtSize(pageText, 7),
      y: 20,
      size: 7,
      font: ctx.fonts.regular,
      color: MUTED,
    });
  });
};

export async function generateWorkOrderReceptionPdf(
  workOrderId: number,
): Promise<Uint8Array> {
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
    workOrderCode: workOrder.codigo,
  };

  let cursorY = drawDocumentHeader(ctx);
  const stateText = workOrder.estado.replace(/_/g, ' ').toUpperCase();
  ctx.page.drawText(stateText, {
    x: MARGIN,
    y: cursorY,
    size: 11,
    font: fonts.bold,
    color: PRIMARY,
  });
  ctx.page.drawText(`Emisión: ${formatDate(new Date(), true)}`, {
    x: MARGIN + 155,
    y: cursorY,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
  ctx.page.drawText(`Ingreso: ${formatDate(workOrder.fechaIngreso, true)}`, {
    x: MARGIN + 300,
    y: cursorY,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
  ctx.page.drawText(`Responsable: ${valueOrFallback(workOrder.creator?.nombre)}`, {
    x: MARGIN,
    y: cursorY - 17,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
  ctx.page.drawText(`Entrega: ${formatDate(workOrder.fechaEntrega, true)}`, {
    x: MARGIN + 300,
    y: cursorY - 17,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
  cursorY -= 41;

  cursorY = drawReceptionAndVehicle(ctx, workOrder, cursorY);
  drawInspection(ctx, workOrder, cursorY);
  await drawPhotos(ctx, workOrder);
  drawItems(ctx, workOrder);
  drawFooters(ctx);

  pdfDoc.setTitle(`Orden de Trabajo ${workOrder.codigo}`);
  pdfDoc.setAuthor('UNITHOR');
  pdfDoc.setSubject('Comprobante operativo de orden de trabajo');
  pdfDoc.setCreator('UNITHOR');
  return pdfDoc.save();
}
