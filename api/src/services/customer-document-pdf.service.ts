import {
  QUOTATION_BANK_ACCOUNTS,
  QUOTATION_BANK_RECIPIENT,
  QUOTATION_PAYMENT_LABELS,
  getWorkOrderStatusLabel,
} from '@unithor/shared';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';

import { getWorkOrderServiceConditions } from './documents/work-order-terms.js';
import { getQuotationById } from './quotation.service.js';
import { getReportBranding } from './reports/report-branding.js';
import { readInspectionPhotoBytes } from './work-order-inspection-photo.service.js';
import { getWorkOrderById } from './work-order.service.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';

import type { CustomerEmailKind } from '../models/CustomerEmail.js';
import type { PDFFont, PDFPage } from 'pdf-lib';

const BLUE = rgb(14 / 255, 43 / 255, 78 / 255);
const GRAY = rgb(0.35, 0.4, 0.46);
const LINE = rgb(0.84, 0.87, 0.9);
const SOFT = rgb(0.96, 0.97, 0.98);
const money = (value: number) =>
  '$' + Number(value).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const date = (value: Date | string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '-';
const clean = (value: unknown) =>
  String(value ?? '-')
    .replace(/\s+/g, ' ')
    .trim();
const safe = (font: PDFFont, value: unknown) =>
  [...clean(value)]
    .map((char) => {
      try {
        font.encodeText(char);
        return char;
      } catch {
        return '?';
      }
    })
    .join('');
const lines = (value: unknown, font: PDFFont, size: number, width: number): string[] => {
  const output: string[] = [];
  for (const paragraph of String(value ?? '-').split('\n')) {
    let line = '';
    for (const word of safe(font, paragraph).split(' ')) {
      const candidate = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) output.push(line);
      line = '';
      // Only split an individual token when it cannot fit a complete line.
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width) {
          output.push(line);
          line = '';
        }
        line += char;
      }
    }
    output.push(line);
  }
  return output;
};

class Document {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly width = 595.28,
    readonly height = 841.89,
  ) {}
  get contentWidth() {
    return this.width - 64;
  }
  addPage(title: string, code: string): void {
    this.page = this.pdf.addPage([this.width, this.height]);
    this.y = this.height - 35;
    this.text(title, 32, this.y, 18, true);
    this.text(code, 32, this.y - 21, 12, true);
    this.y -= 38;
    this.page.drawLine({
      start: { x: 32, y: this.y },
      end: { x: this.width - 32, y: this.y },
      color: BLUE,
      thickness: 1.4,
    });
    this.y -= 18;
  }
  text(value: unknown, x: number, y: number, size = 9, bold = false, color = BLUE): void {
    const font = bold ? this.bold : this.regular;
    this.page.drawText(safe(font, value), { x, y, font, size, color });
  }
  ensure(height: number): void {
    if (this.y - height < 48) this.addPage('CONTINUACIÓN', '');
  }
  paragraph(value: unknown, size = 9, bold = false, indent = 0): void {
    for (const line of lines(
      value,
      bold ? this.bold : this.regular,
      size,
      this.contentWidth - indent,
    )) {
      this.ensure(size + 5);
      this.text(line, 32 + indent, this.y, size, bold, bold ? BLUE : GRAY);
      this.y -= size + 4;
    }
  }
  section(title: string): void {
    this.ensure(30);
    this.y -= 6;
    this.page.drawRectangle({
      x: 32,
      y: this.y - 5,
      width: this.contentWidth,
      height: 20,
      color: SOFT,
    });
    this.text(title, 38, this.y + 1, 9, true);
    this.y -= 23;
  }
  table(headers: string[], rows: string[][], widths: number[]): void {
    const header = () => {
      this.page.drawRectangle({
        x: 32,
        y: this.y - 6,
        width: this.contentWidth,
        height: 22,
        color: BLUE,
      });
      let x = 36;
      headers.forEach((name, i) => {
        this.text(name, x, this.y + 1, 7.5, true, rgb(1, 1, 1));
        x += widths[i];
      });
      this.y -= 23;
    };
    this.ensure(50);
    header();
    rows.forEach((row, index) => {
      const wrapped = row.map((cell, i) => lines(cell, this.regular, 8, widths[i] - 9));
      const rowHeight = Math.max(...wrapped.map((cell) => cell.length)) * 11 + 10;
      if (this.y - rowHeight < 50) {
        this.addPage('CONTINUACIÓN', '');
        header();
      }
      if (index % 2 === 0)
        this.page.drawRectangle({
          x: 32,
          y: this.y - rowHeight + 8,
          width: this.contentWidth,
          height: rowHeight,
          color: SOFT,
        });
      let x = 36;
      wrapped.forEach((cell, i) => {
        cell.forEach((line, j) => this.text(line, x, this.y - j * 11 - 4, 8, i === row.length - 1));
        x += widths[i];
      });
      this.y -= rowHeight;
      this.page.drawLine({
        start: { x: 32, y: this.y + 7 },
        end: { x: this.width - 32, y: this.y + 7 },
        color: LINE,
        thickness: 0.4,
      });
    });
    this.y -= 9;
  }
  footer(company: string): void {
    this.pdf.getPages().forEach((page, index, all) => {
      page.drawText(safe(this.regular, company).slice(0, 90), {
        x: 32,
        y: 22,
        font: this.regular,
        size: 6.5,
        color: GRAY,
      });
      page.drawText('Página ' + (index + 1) + ' de ' + all.length, {
        x: this.width - 112,
        y: 22,
        font: this.regular,
        size: 7,
        color: GRAY,
      });
    });
  }
}

const createDocument = async (width?: number, height?: number) => {
  const pdf = await PDFDocument.create();
  return new Document(
    pdf,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
    width,
    height,
  );
};

const brandHeader = async (doc: Document, title: string, code: string) => {
  const brand = await getReportBranding();
  doc.addPage(title, code);
  if (brand.logoPng) {
    const logo = await doc.pdf.embedPng(brand.logoPng);
    const scale = Math.min(135 / logo.width, 38 / logo.height);
    doc.page.drawImage(logo, {
      x: doc.width - 32 - logo.width * scale,
      y: doc.height - 65,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  }
  doc.paragraph(brand.legalName, 8, true);
  doc.paragraph([brand.rut, brand.address, brand.contact].filter(Boolean).join(' | '), 7);
  doc.y -= 5;
  return brand;
};

const drawPhotos = async (doc: Document, workOrderId: number, maxHeight = 150): Promise<void> => {
  const inspection = await WorkOrderInspection.findOne({
    where: { workOrderId },
    include: [{ model: WorkOrderInspectionPhoto, as: 'photos' }],
  });
  const photos = inspection?.photos ?? [];
  if (!photos.length) return;
  doc.section('REGISTRO FOTOGRÁFICO DE RECEPCIÓN');
  const width = (doc.contentWidth - 16) / 3;
  for (let offset = 0; offset < photos.length; offset += 3) {
    const row = await Promise.all(
      photos.slice(offset, offset + 3).map(async (photo) => {
        // A missing object must fail the job, rather than email an incomplete document.
        const source = await readInspectionPhotoBytes(photo.storageKey);
        const jpeg = await sharp(source)
          .rotate()
          .resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 78 })
          .toBuffer();
        const image = await doc.pdf.embedJpg(jpeg);
        const scale = Math.min(width / image.width, maxHeight / image.height);
        return {
          image,
          width: image.width * scale,
          height: image.height * scale,
          label: photo.slot.replace(/_/g, ' '),
        };
      }),
    );
    const height = Math.max(...row.map((photo) => photo.height)) + 17;
    doc.ensure(height);
    row.forEach((photo, index) => {
      const x = 32 + index * (width + 8);
      doc.page.drawImage(photo.image, {
        x: x + (width - photo.width) / 2,
        y: doc.y - photo.height,
        width: photo.width,
        height: photo.height,
      });
      doc.text(photo.label, x + 2, doc.y - height + 5, 6.5, false, GRAY);
    });
    doc.y -= height + 6;
  }
};

export const generateQuotationEmailPdf = async (id: number): Promise<Uint8Array> => {
  const quotation = await getQuotationById(id);
  const doc = await createDocument();
  const brand = await brandHeader(doc, 'COTIZACIÓN', quotation.codigo);
  doc.paragraph(
    'Emisión: ' +
      date(quotation.createdAt) +
      (quotation.workOrder ? ' | Según OT: ' + quotation.workOrder.codigo : ''),
    8,
  );
  doc.section('DATOS DEL CLIENTE');
  doc.paragraph(quotation.client?.nombre ?? 'Sin cliente asignado', 10, true);
  doc.paragraph(
    [
      'RUT: ' + (quotation.client?.rut ?? '-'),
      quotation.client?.telefono,
      quotation.client?.email,
      quotation.client?.direccion,
    ]
      .filter(Boolean)
      .join(' | '),
    8,
  );
  doc.paragraph('Asesor asignado: ' + (quotation.asesor?.nombre ?? '-'), 8);
  if (quotation.vehicle) {
    doc.section('DATOS DEL VEHÍCULO');
    doc.paragraph(
      [quotation.vehicle.patente, quotation.vehicle.marca, quotation.vehicle.modelo]
        .filter(Boolean)
        .join(' | '),
      9,
      true,
    );
  }
  const items = quotation.items ?? [];
  doc.y -= 12;
  doc.table(
    ['#', 'SERVICIO / REPUESTO', 'CANT.', 'P. UNITARIO', 'DESCUENTO', 'IMPORTE'],
    items.length
      ? items.map((item, index) => [
          String(index + 1),
          item.descripcion,
          String(item.cantidad),
          money(item.precioUnitario),
          item.descuentoTipo
            ? item.descuentoTipo === 'porcentaje'
              ? item.descuentoValor + '%'
              : money(item.descuentoValor ?? 0)
            : '-',
          money(item.subtotal),
        ])
      : [['', 'Sin conceptos registrados', '', '', '', '']],
    [20, 220, 35, 85, 75, 96],
  );
  const net = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
  const lineDiscount = Math.max(0, Number(quotation.subtotal) - net);
  const generalDiscount = Math.max(0, net - Number(quotation.total));
  doc.ensure(130);
  doc.section('RESUMEN DE LA OFERTA');
  doc.paragraph('Importe sin descuentos: ' + money(quotation.subtotal));
  if (lineDiscount > 0) doc.paragraph('Descuentos por ítem: -' + money(lineDiscount));
  if (generalDiscount > 0) doc.paragraph('Descuento general: -' + money(generalDiscount));
  if (Number(quotation.total) > net)
    doc.paragraph('Impuestos registrados: ' + money(Number(quotation.total) - net));
  doc.paragraph('TOTAL CLP: ' + money(quotation.total), 13, true);
  doc.section('CONDICIONES DE LA OFERTA');
  doc.paragraph(
    'Forma de pago: ' + QUOTATION_PAYMENT_LABELS[quotation.formaPago ?? 'transferencia'],
  );
  doc.paragraph('Disponibilidad: ' + (quotation.disponibilidadTrabajo || 'Previa coordinación'));
  doc.paragraph(
    'Validez: ' +
      quotation.validezDias +
      ' días corridos. Válida hasta: ' +
      date(new Date(new Date(quotation.createdAt).getTime() + quotation.validezDias * 86400000)),
  );
  if (quotation.notas) {
    doc.section('OBSERVACIONES');
    doc.paragraph(quotation.notas);
  }
  doc.ensure(85);
  doc.section('DATOS PARA TRANSFERENCIA BANCARIA');
  for (const bank of QUOTATION_BANK_ACCOUNTS)
    doc.paragraph(bank.banco + ' | ' + bank.cuenta + ' | ' + bank.tipo, 9, true);
  doc.paragraph(
    'RUT: ' + QUOTATION_BANK_RECIPIENT.rut + ' | ' + QUOTATION_BANK_RECIPIENT.empresa,
    8,
  );
  doc.paragraph('Contacto: ' + QUOTATION_BANK_RECIPIENT.contacto, 8);
  if (quotation.workOrderId) {
    const inspection = await WorkOrderInspection.findOne({
      where: { workOrderId: quotation.workOrderId },
    });
    const count = inspection
      ? await WorkOrderInspectionPhoto.count({ where: { inspectionId: inspection.id } })
      : 0;
    if (count) {
      doc.addPage('REGISTRO FOTOGRÁFICO', quotation.codigo);
      await drawPhotos(doc, quotation.workOrderId);
    }
  }
  doc.footer(brand.legalName);
  doc.pdf.setTitle('Cotización ' + quotation.codigo);
  return doc.pdf.save();
};

export const generateOfficialWorkOrderEmailPdf = async (id: number): Promise<Uint8Array> => {
  const order = await getWorkOrderById(id);
  const items = order.items ?? [];
  const vehicle = order.vehicleId ? await Vehicle.findByPk(order.vehicleId) : null;
  // Draw the entire front on a virtual page, then fit it onto one physical front.
  // No descriptions, prices or photos are discarded to achieve the two-sided sheet.
  const estimatedHeight = Math.max(
    1600,
    1250 +
      items.reduce((sum, item) => sum + 24 + Math.ceil(item.descripcion.length / 52) * 11, 0) +
      Math.ceil((order.descripcion?.length ?? 0) / 90) * 13,
  );
  const front = await createDocument(612, estimatedHeight);
  const brand = await brandHeader(front, 'ORDEN DE TRABAJO', order.codigo);
  front.paragraph(
    'Ingreso: ' +
      date(order.fechaIngreso) +
      ' | Entrega: ' +
      date(order.fechaEntrega) +
      ' | Estado: ' +
      getWorkOrderStatusLabel(order.estado),
    9,
  );
  front.section('CLIENTE / CONTACTO / FACTURACIÓN');
  front.paragraph(
    'Cliente: ' + (order.client?.nombre ?? '-') + ' | RUT: ' + (order.client?.rut ?? '-'),
    9,
    true,
  );
  front.paragraph(
    'Contacto: ' +
      (order.contact?.nombre ?? '-') +
      ' | ' +
      (order.contact?.telefono ?? '-') +
      ' | ' +
      (order.contact?.email ?? '-'),
    8,
  );
  front.paragraph(
    'Facturación: ' + (order.billing?.nombre ?? '-') + ' | RUT: ' + (order.billing?.rut ?? '-'),
    8,
  );
  front.paragraph(
    [order.billing?.direccion, order.billing?.comuna, order.billing?.region, order.billing?.email]
      .filter(Boolean)
      .join(' | '),
    8,
  );
  front.section('VEHÍCULO');
  front.paragraph(
    [order.vehicle?.patente, order.vehicle?.marca, order.vehicle?.modelo, vehicle?.ano]
      .filter(Boolean)
      .join(' | ') +
      ' | Km ingreso: ' +
      (order.kilometrajeIngreso ?? '-'),
    9,
    true,
  );
  front.paragraph(
    'Propietario registrado: ' +
      (order.vehicleOwner?.nombre ?? '-') +
      ' | VIN: ' +
      (vehicle?.vinChasis ?? '-'),
    8,
  );
  if (order.descripcion) {
    front.section('MOTIVO DE INGRESO');
    front.paragraph(order.descripcion, 8);
  }
  front.section('TRABAJOS A REALIZAR / REPUESTOS');
  front.table(
    ['#', 'DESCRIPCIÓN', 'CANT.', 'P. UNITARIO', 'IMPORTE'],
    items.length
      ? items.map((item, index) => [
          String(index + 1),
          item.descripcion,
          String(item.cantidad),
          money(item.precioUnitario),
          money(item.subtotal),
        ])
      : [['', 'Diagnóstico inicial / Sin repuestos cargados', '', '', '']],
    [20, 290, 40, 95, 103],
  );
  front.paragraph(
    'Total estimado de trabajos: ' +
      money(items.reduce((sum, item) => sum + Number(item.subtotal), 0)),
    11,
    true,
  );
  const inspection = order.inspection;
  if (inspection) {
    front.section('INSPECCIÓN DE RECEPCIÓN');
    front.paragraph(
      'Combustible: ' +
        (inspection.nivelCombustible ?? '-') +
        ' | Neumáticos: ' +
        [
          inspection.llantaDelanteraIzquierda,
          inspection.llantaDelanteraDerecha,
          inspection.llantaTraseraIzquierda,
          inspection.llantaTraseraDerecha,
        ]
          .map((v) => clean(v).replace(/_/g, ' '))
          .join(' / '),
      8,
    );
    front.paragraph(
      'Inventario: ' +
        (inspection.inventario ?? []).map((item) => item.replace(/_/g, ' ')).join(', '),
      8,
    );
    if (inspection.objetosValor) front.paragraph('Objetos de valor: ' + inspection.objetosValor, 8);
    if (inspection.observaciones)
      front.paragraph('Notas de inspección: ' + inspection.observaciones, 8);
  }
  await drawPhotos(front, id, 75);
  front.paragraph('Asesor: ' + (order.creator?.nombre ?? '-'), 8);
  const doc = await createDocument(612, 792);
  const physical = doc.pdf.addPage([612, 792]);
  if (front.pdf.getPageCount() !== 1)
    throw new Error('La OT excede la hoja frontal; no se envía un documento incompleto');
  const sourcePdf = await PDFDocument.load(await front.pdf.save());
  const source = sourcePdf.getPages()[0];
  const embedded = await doc.pdf.embedPage(source, {
    left: 0,
    bottom: Math.max(0, front.y - 12),
    right: 612,
    top: estimatedHeight,
  });
  const scale = Math.min(1, 740 / embedded.height);
  physical.drawPage(embedded, {
    x: (612 - embedded.width * scale) / 2,
    y: 34,
    width: embedded.width * scale,
    height: embedded.height * scale,
  });
  doc.addPage('CONDICIONES GENERALES DEL SERVICIO', order.codigo);
  const clauses = getWorkOrderServiceConditions(brand.legalName);
  for (const [index, clause] of clauses.entries()) {
    doc.paragraph(String(index + 1) + '. ' + clause, 8);
    doc.y -= 3;
  }
  doc.ensure(75);
  doc.y -= 40;
  doc.paragraph(
    'FIRMA ASESOR ____________________       FIRMA CLIENTE ____________________',
    8,
    true,
  );
  doc.paragraph('RUT: ____________________       Fecha: ___/___/______', 8);
  doc.footer(brand.address + ' | ' + brand.contact);
  doc.pdf.setTitle('Orden de trabajo ' + order.codigo);
  return doc.pdf.save();
};

export const generateCustomerDocumentAttachments = async (
  kind: CustomerEmailKind,
  id: number,
  includeQuotation: boolean,
) => {
  if (kind === 'quotation') {
    const quotation = await getQuotationById(id);
    return [
      {
        filename: quotation.codigo + '.pdf',
        content: Buffer.from(await generateQuotationEmailPdf(id)),
        contentType: 'application/pdf',
      },
    ];
  }
  const order = await getWorkOrderById(id);
  const files = [
    {
      filename: order.codigo + '.pdf',
      content: Buffer.from(await generateOfficialWorkOrderEmailPdf(id)),
      contentType: 'application/pdf',
    },
  ];
  if (includeQuotation && order.quotation) {
    files.push({
      filename: order.quotation.codigo + '.pdf',
      content: Buffer.from(await generateQuotationEmailPdf(order.quotation.id)),
      contentType: 'application/pdf',
    });
  }
  return files;
};
