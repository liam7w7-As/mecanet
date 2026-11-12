import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkOrder } from '../../../models/WorkOrder.js';
import { readInspectionPhotoBytes } from '../../work-order-inspection-photo.service.js';
import { generateWorkOrderPdf } from '../../work-order-pdf.service.js';
import { generateWorkOrderReceptionPdf } from '../../work-order-reception-pdf.service.js';
import { getWorkOrderDocumentPricing } from '../work-order-document-pricing.js';

vi.mock('../report-branding.js', () => ({ getReportBranding: async () => ({
  companyName: 'UNITHOR', legalName: 'Empresa de prueba', rut: null, address: '', contact: '', logoPng: null,
}) }));
vi.mock('../../work-order-inspection-photo.service.js', () => ({ readInspectionPhotoBytes: vi.fn() }));

const textFromPdf = async (bytes: Uint8Array): Promise<string> => {
  const document = await PDFDocument.load(bytes);
  const text: string[] = [];
  for (const page of document.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index, PDFRawStream))
      : contents instanceof PDFRawStream ? [contents] : [];
    for (const stream of streams) {
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      for (const match of operators.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) text.push(Buffer.from(match[1], 'hex').toString('latin1'));
    }
  }
  return text.join('\n');
};

const lines = () => [
  { id: 1, catalogItemId: null, tipoLinea: 'servicio', unidadMedida: 'unidad', descripcion: 'Servicio A', cantidad: 2, precioUnitario: 10000, subtotal: 20000, estadoOperativo: 'completado', stockConsumidoCantidad: 0 },
  { id: 2, catalogItemId: null, tipoLinea: 'servicio', unidadMedida: 'unidad', descripcion: 'Servicio B', cantidad: 1, precioUnitario: 30000, subtotal: 30000, estadoOperativo: 'pendiente', stockConsumidoCantidad: 0 },
];
const fixture = () => ({
  id: 1, codigo: 'OT-SYNTHETIC-001', estado: 'en_progreso', fechaIngreso: new Date('2002-03-04T12:00:00Z'),
  kilometrajeIngreso: null, vehicleId: null, vehicle: undefined, fechaEntrega: null,
  client: { nombre: 'Cliente sintético', rut: null, telefono: null, email: null, direccion: null },
  creator: { nombre: 'Usuario de prueba' }, descripcion: 'Solo datos sintéticos', items: lines(),
  quotation: { descuentoTipo: 'porcentaje' as const, descuentoValor: 10, items: [
    { ...lines()[1], workOrderItemId: 2, descuentoTipo: 'porcentaje' as const, descuentoValor: 10 },
    { ...lines()[0], workOrderItemId: 1, descuentoTipo: 'fijo' as const, descuentoValor: 1000 },
  ] },
});

afterEach(() => { vi.restoreAllMocks(); vi.mocked(readInspectionPhotoBytes).mockReset(); });

describe('OT document monetary and photo regressions (synthetic, no DB/storage)', () => {
  it('applies linked line discounts, then general discount, then the same rounded IVA', () => {
    const order = fixture();
    const { pricing, tax } = getWorkOrderDocumentPricing(order.items, order.quotation);
    expect(pricing.lines.map((line) => line.subtotal)).toEqual([19000, 27000]);
    expect(pricing.descuentoLineas).toBe(4000);
    expect(pricing.descuentoGeneral).toBe(4600);
    expect(tax).toEqual({ neto: 41400, iva: 7866, total: 49266 });
  });

  it('keeps legacy identity discounts only when there is a single unambiguous match', () => {
    const order = fixture();
    const quotation = { items: [{ ...order.quotation.items[0], workOrderItemId: null }] };
    expect(getWorkOrderDocumentPricing(order.items, quotation).pricing.descuentoLineas).toBe(3000);
    const duplicate = { ...order.items[1], id: 3 };
    expect(getWorkOrderDocumentPricing([...order.items, duplicate], quotation).pricing.descuentoLineas).toBe(0);
  });

  it.each([generateWorkOrderPdf, generateWorkOrderReceptionPdf])('prints the same gross total and hides vehicle-only sections without a vehicle', async (generate) => {
    vi.spyOn(WorkOrder, 'findByPk').mockResolvedValue(fixture() as unknown as WorkOrder);
    const text = await textFromPdf(await generate(1));
    expect(text).toContain('$49.266');
    expect(text).toContain('$41.400');
    expect(text).toContain('$7.866');
    expect(text).not.toContain('Datos del Vehículo');
    expect(text).not.toContain('Vehículo recibido');
    expect(text).not.toContain('INVENTARIO INTERIOR');
  });

  it('embeds a WebP photo supplied through the storage adapter, preserving its aspect ratio', async () => {
    const photo = { id: 1, slot: 'frontal', mimeType: 'image/webp', storageKey: 'r2-synthetic/frontal.webp' };
    const source = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#356caa' } }).webp().toBuffer();
    vi.mocked(readInspectionPhotoBytes).mockResolvedValue(source);
    vi.spyOn(WorkOrder, 'findByPk').mockResolvedValue({ ...fixture(), inspection: { photos: [photo] } } as unknown as WorkOrder);
    const bytes = await generateWorkOrderReceptionPdf(1);
    const document = await PDFDocument.load(bytes);
    const images = document.getPages().flatMap((page) => {
      const objects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      return objects ? objects.keys().map((key) => objects.lookup(key))
        .filter((object): object is PDFRawStream => object instanceof PDFRawStream) : [];
    });
    expect(readInspectionPhotoBytes).toHaveBeenCalledWith(photo.storageKey);
    expect(images.some((image) => image.dict.get(PDFName.of('Width'))?.toString() === '80'
      && image.dict.get(PDFName.of('Height'))?.toString() === '40')).toBe(true);
    expect(await textFromPdf(bytes)).not.toContain('Vista WebP disponible');
  });
});
