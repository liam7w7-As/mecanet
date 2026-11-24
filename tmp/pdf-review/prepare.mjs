import fs from 'node:fs';
const fixtures = fs.readFileSync('web/src/components/common/__tests__/PdfPreviewModal.test.tsx', 'utf8');
const source = fixtures.slice(fixtures.indexOf('const mockWorkOrder:'), fixtures.indexOf("describe('PdfPreviewModal'"));
const header = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WORK_ORDER_INSPECTION_PHOTO_SLOTS } from '@unithor/shared';
import { OfficialDocumentSheets } from '../../web/src/components/common/PdfPreviewModal';
import { renderOfficialPdf } from '../../web/src/lib/official-pdf';
import type { WorkOrder, Quotation } from '../../web/src/types/entities';
import '../../web/src/index.css';
`;
const body = `
const photo = (index: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = index % 2 ? 400 : 240;
  canvas.height = index % 2 ? 240 : 400;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = ['#397286', '#31577a', '#4a7778'][index % 3];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white'; ctx.font = '28px Arial';
  ctx.fillText('Vehículo - vista ' + (index + 1), 12, 64);
  ctx.fillRect(24, 130, canvas.width - 48, 50);
  return '/qa-photo-' + index + '.png';
};
const photos = WORK_ORDER_INSPECTION_PHOTO_SLOTS.map((slot, index) => ({
  id: index + 1, slot, mimeType: 'image/png', sizeBytes: 1024, uploadedBy: 1,
  createdAt: mockWorkOrder.createdAt, updatedAt: mockWorkOrder.updatedAt, url: photo(index),
}));
const items: NonNullable<WorkOrder['items']> = [
  { ...mockWorkOrder.items![0], id: 3, division: 'MEC', cantidad: 1, precioUnitario: 10000, subtotal: 10000, descripcion: 'Diagnóstico mecánico y revisión de motor' },
  { ...mockWorkOrder.items![1], id: 2, division: 'ACC', precioUnitario: 30000, subtotal: 27000, descuentoTipo: 'porcentaje', descuentoValor: 10, descripcion: 'Repuesto encargado - filtro original' },
  { ...mockWorkOrder.items![0], id: 1, division: 'DP', cantidad: 2, precioUnitario: 10000, subtotal: 19000, descuentoTipo: 'fijo', descuentoValor: 1000, descripcion: 'Preparación y pintura de puerta delantera' },
];
const workOrder: WorkOrder = { ...mockWorkOrder, items, descuentoTipo: 'porcentaje', descuentoValor: 10, inspection: { ...mockWorkOrder.inspection!, photos } };
const quotation: Quotation = { ...mockQuotation, items, subtotal: 60000, total: 50400, descuentoTipo: 'porcentaje', descuentoValor: 10,
  workOrder: { ...mockQuotation.workOrder!, inspectionPhotos: photos }, notas: 'Trabajo sujeto a revisión de las piezas. Se conservan los descuentos y condiciones acordados.' };
const longQuote: Quotation = { ...quotation, subtotal: 720000, total: 604800, items: Array.from({ length: 36 }, (_, index) => ({ ...items[index % 3], id: index + 1, descripcion: 'Concepto ' + (index + 1) + ': ' + 'Revisión y reparación de la pieza. '.repeat(4) })), workOrder: null, notas: 'Observaciones. '.repeat(150) };
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}>
  <section data-qa="ot"><OfficialDocumentSheets type="work-order" workOrder={workOrder} /></section>
  <section data-qa="cot"><OfficialDocumentSheets type="quotation" quotation={quotation} /></section>
  <section data-qa="long"><OfficialDocumentSheets type="quotation" quotation={longQuote} /></section>
</QueryClientProvider>);
Object.assign(window, { qa: { async export(name: string) {
  const blob = await renderOfficialPdf(document.querySelector('[data-qa="' + name + '"]')!);
  return await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob); });
} } });
`;
fs.writeFileSync('tmp/pdf-review/main.tsx', header + source + body);
