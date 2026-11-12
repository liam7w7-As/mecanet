import { QUOTATION_BANK_ACCOUNTS, QUOTATION_BANK_RECIPIENT, QUOTATION_PAYMENT_LABELS, getQuotationTaxBreakdown } from '@unithor/shared';

import { formatClp, formatDateTime } from '../../lib/formatters';
import { useCompanyBranding } from '../common/BrandingContext';
import BrandLogo from '../common/BrandLogo';

import type { Quotation, QuotationItem, WorkOrderBilling } from '../../types/entities';

type DocumentPage = { items: QuotationItem[]; offset: number; notes: string; summary: boolean; notesOnly?: boolean };

const wrapNoteLines = (text: string): string[] => text.split('\n').flatMap((line) => {
  const lines: string[] = [];
  let rest = line;
  while (rest.length > 95) {
    const boundary = rest.lastIndexOf(' ', 95);
    const end = boundary > 0 ? boundary + 1 : 95;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  lines.push(rest);
  return lines;
});

// Bound the content of each physical sheet instead of shrinking a long quote onto one page.
export function getQuotationDocumentPages(quotation: Quotation): DocumentPage[] {
  const pages: DocumentPage[] = [];
  let page: DocumentPage = { items: [], offset: 0, notes: '', summary: false };
  let height = 0;
  const estimateRowHeight = (item: QuotationItem) => {
    const rawLines = item.descripcion.split('\n');
    const visualLines = rawLines.reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / 40)), 0);
    return 14 + visualLines * 16;
  };
  for (const item of quotation.items ?? []) {
    const rowHeight = estimateRowHeight(item);
    if (page.items.length && height + rowHeight > 640) {
      pages.push(page);
      page = { items: [], offset: page.offset + page.items.length, notes: '', summary: false };
      height = 0;
    }
    page.items.push(item);
    height += rowHeight;
  }
  // Only the final sheet reserves space for totals, conditions and bank details.
  if (height > 300) {
    let finalHeight = 0;
    let split = page.items.length;
    while (split > 0 && finalHeight + estimateRowHeight(page.items[split - 1]) <= 300) {
      split -= 1;
      finalHeight += estimateRowHeight(page.items[split]);
    }
    const finalItems = page.items.splice(split);
    pages.push(page);
    page = { items: finalItems, offset: page.offset + split, notes: '', summary: false };
  }
  page.summary = true;
  const notes = wrapNoteLines(quotation.notas ?? '');
  page.notes = notes.slice(0, 6).join('\n');
  pages.push(page);
  for (let offset = 6; offset < notes.length; offset += 35) {
    pages.push({ items: [], offset: 0, notes: notes.slice(offset, offset + 35).join('\n'), summary: false, notesOnly: true });
  }
  return pages;
}

const discountLabel = (type: Quotation['descuentoTipo'], value: number | undefined) =>
  type === 'porcentaje' ? `${Number(value ?? 0).toLocaleString('es-CL')}%` : formatClp(value ?? 0);

export default function QuotationDocument({ quotation, totalPages }: { quotation: Quotation; totalPages: number }) {
  const company = useCompanyBranding();
  const pages = getQuotationDocumentPages(quotation);
  const gross = Number(quotation.subtotal);
  const lineNet = (quotation.items ?? []).reduce((sum, item) => sum + Number(item.subtotal), 0);
  const lineDiscount = Math.max(0, gross - lineNet);
  const generalDiscount = Math.max(0, lineNet - Number(quotation.total));
  const neto = Math.max(0, Number(quotation.total));
  const { iva, total: finalTotal } = getQuotationTaxBreakdown(neto);
  const billing: WorkOrderBilling | null | undefined = quotation.billing ?? quotation.workOrder?.billing;
  const billingRut = billing?.rut ?? quotation.client?.rut ?? '-';
  const billingNombre = billing?.nombre ?? quotation.client?.nombre ?? '-';
  const billingEmail = billing?.email ?? quotation.client?.email;
  const billingDireccion = billing?.direccion ?? quotation.client?.direccion;
  const expiresAt = new Date(new Date(quotation.createdAt).getTime() + (quotation.validezDias ?? 5) * 86400000);

  return <>{pages.map((page, pageIndex) => <div key={pageIndex} data-quotation-sheet
    className="pdf-paper-sheet mx-auto mb-6 flex flex-col justify-between bg-white text-slate-800 shadow-2xl"
    style={{ width: 816, minHeight: 1056, padding: '26px 34px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', letterSpacing: 0 }}>
    <div>
      <header className="flex items-start justify-between gap-8 border-b-2 border-[#0E2B4E] pb-4">
        <div className="min-w-0 max-w-[440px]">
          <BrandLogo heightClassName="h-10" alt={company.nombreComercial} />
          <p className="mt-2 text-[10px] font-bold">{company.razonSocial}</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-600">{company.rutLine}<br />{company.addressLine}</p>
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-[25px] font-bold text-[#0E2B4E]">COTIZACIÓN</h1>
          <p className="mt-1 text-[17px] font-bold text-[#0E2B4E]">{quotation.codigo}</p>
          <p className="mt-2 text-[10px]">Emisión: {formatDateTime(quotation.createdAt)}</p>
          {quotation.workOrder && <p className="mt-1 text-[10px]">Según OT: {quotation.workOrder.codigo}</p>}
        </div>
      </header>
      <section className={`grid gap-5 border-b border-slate-200 py-3 text-[11px] leading-[17px] ${quotation.vehicle ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <div className="min-w-0 break-words">
          <h2 className="mb-1 text-[9px] font-bold text-slate-500">DATOS DEL CLIENTE</h2>
          <p className="text-[12px] font-bold text-[#0E2B4E]">{quotation.client?.nombre ?? 'Sin cliente asignado'}</p>
          <p>RUT: {quotation.client?.rut ?? '-'}</p>
          {quotation.client?.telefono && <p>Teléfono: {quotation.client.telefono}</p>}
          {quotation.client?.email && <p>{quotation.client.email}</p>}
          {quotation.client?.direccion && <p>{quotation.client.direccion}</p>}
          <p className="text-[10px] text-slate-600">Asesor Asignado: {quotation.asesor?.nombre ?? '-'}</p>
        </div>
        <div className="min-w-0 break-words">
          <h2 className="mb-1 text-[9px] font-bold text-slate-500">DATOS DE FACTURACIÓN</h2>
          <p className="text-[12px] font-bold text-[#0E2B4E]">{billingNombre}</p>
          <p>RUT Fact: {billingRut}</p>
          {billingEmail && <p>Correo: {billingEmail}</p>}
          {billingDireccion && <p>Dirección: {billingDireccion}</p>}
        </div>
        {quotation.vehicle && <div className="min-w-0 break-words">
          <h2 className="mb-1 text-[9px] font-bold text-slate-500">DATOS DEL VEHÍCULO</h2>
          <p className="text-[14px] font-bold text-[#0E2B4E]">{quotation.vehicle.patente}</p>
          <p>{[quotation.vehicle.marca, quotation.vehicle.modelo].filter(Boolean).join(' ')}</p>
        </div>}
      </section>
      {page.notesOnly ? <section className="mt-5"><h2 className="text-xs font-bold text-[#0E2B4E]">OBSERVACIONES / CONTINUACIÓN</h2><p className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-[18px]">{page.notes}</p></section> : <>
        <table className="mt-4 w-full table-fixed border-collapse text-[10.5px] leading-[15px]">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '44%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead><tr className="bg-[#0E2B4E] text-white">
            <th className="py-2">#</th>
            <th className="px-2 py-2 text-left">SERVICIO / REPUESTO</th>
            <th className="py-2 text-center">CANT.</th>
            <th className="px-2 py-2 text-right">P. UNITARIO</th>
            <th className="px-2 py-2 text-right">DESCUENTO</th>
            <th className="px-2 py-2 text-right">IMPORTE</th>
          </tr></thead>
          <tbody>{page.items.map((item, index) => <tr key={item.id ?? index} className="border-b border-slate-200 align-top even:bg-slate-50">
            <td className="py-2 text-center text-slate-500">{page.offset + index + 1}</td>
            <td className="break-words px-2 py-2 font-medium whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{item.descripcion}</td>
            <td className="py-2 text-center whitespace-nowrap">{item.cantidad}</td>
            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatClp(item.precioUnitario)}</td>
            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{item.descuentoTipo && Number(item.descuentoValor) > 0 ? discountLabel(item.descuentoTipo, item.descuentoValor) : '-'}</td>
            <td className="px-2 py-2 text-right font-bold tabular-nums whitespace-nowrap">{formatClp(item.subtotal)}</td>
          </tr>)}{page.items.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-500">Sin conceptos registrados</td></tr>}</tbody>
        </table>
        {page.summary ? <>
          <section className="mt-4 grid grid-cols-[1fr_250px] gap-6 text-[11px] leading-[17px]">
            <div className="min-w-0 break-words">
              <h2 className="mb-2 text-[10px] font-bold text-[#0E2B4E]">CONDICIONES DE LA OFERTA</h2>
              <p><strong>Forma de pago:</strong> {QUOTATION_PAYMENT_LABELS[quotation.formaPago ?? 'transferencia']}</p>
              <p><strong>Disponibilidad:</strong> {quotation.disponibilidadTrabajo || 'Previa coordinación'}</p>
              <p><strong>Validez:</strong> {quotation.validezDias ?? 5} días corridos</p>
              <p><strong>Válida hasta:</strong> {expiresAt.toLocaleDateString('es-CL')}</p>
            </div>
            <dl className="space-y-1 tabular-nums">
              {(lineDiscount > 0 || generalDiscount > 0) && (
                <>
                  <div className="flex justify-between gap-2"><dt>Importe sin descuentos</dt><dd>{formatClp(gross)}</dd></div>
                  {lineDiscount > 0 && <div className="flex justify-between gap-2"><dt>Descuentos por ítem</dt><dd>- {formatClp(lineDiscount)}</dd></div>}
                  {generalDiscount > 0 && <div className="flex justify-between gap-2"><dt>Dto. general{quotation.descuentoTipo === 'porcentaje' ? ` (${discountLabel(quotation.descuentoTipo, quotation.descuentoValor)})` : ''}</dt><dd>- {formatClp(generalDiscount)}</dd></div>}
                </>
              )}
              <div className="flex justify-between gap-2"><dt>Subtotal Neto</dt><dd>{formatClp(neto)}</dd></div>
              <div className="flex justify-between gap-2"><dt>IVA (19%)</dt><dd>{formatClp(iva)}</dd></div>
              <div className="mt-2 flex justify-between gap-2 border-t-2 border-[#0E2B4E] py-2 text-[15px] font-bold text-[#0E2B4E]"><dt>TOTAL CLP</dt><dd>{formatClp(finalTotal)}</dd></div>
            </dl>
          </section>
          {page.notes && <section className="mt-3 border-t border-slate-200 pt-2 text-[10.5px] leading-[16px]"><h2 className="font-bold text-[#0E2B4E]">OBSERVACIONES</h2><p className="mt-1 whitespace-pre-wrap break-words">{page.notes}</p></section>}
          <section className="mt-3" aria-label="Datos para transferencia bancaria">
            <div className="grid grid-cols-2 gap-3 text-[9.5px] leading-[15px]">
              {QUOTATION_BANK_ACCOUNTS.map((account) => (
                <div key={account.banco} className="border border-black p-2 font-bold uppercase text-black">
                  <p>EMPRESA: {QUOTATION_BANK_RECIPIENT.empresa.toUpperCase()}</p>
                  <p>RUT: {QUOTATION_BANK_RECIPIENT.rut}</p>
                  <p>BANCO: {account.banco.toUpperCase()}</p>
                  <p>CTA. CORRIENTE Nº {account.cuenta}</p>
                  <p>ENVÍO DE COMPROBANTE: {QUOTATION_BANK_RECIPIENT.contacto.toUpperCase()}</p>
                </div>
              ))}
            </div>
          </section>
        </> : <p className="mt-3 text-right text-[10px] text-slate-500">Detalle continúa en la página siguiente</p>}
      </>}
    </div>
    <footer className="mt-4 flex items-end justify-between gap-4 border-t border-slate-300 pt-2 text-[9px] leading-[14px] text-slate-500">
      <div className="max-w-[580px]">{company.contactLine}<br />Documento de cotización. No constituye factura ni comprobante de pago.</div>
      <div className="shrink-0">Página {pageIndex + 1} de {totalPages}</div>
    </footer>
  </div>)}</>;
}
