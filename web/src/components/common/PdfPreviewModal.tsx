import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  LoaderCircle,
  Printer,
  X,
} from 'lucide-react';

import { formatClp, formatDateTime } from '../../lib/formatters';

import type { Quotation, WorkOrder } from '../../types/entities';

export type PdfDocType = 'work-order' | 'quotation';

export interface PdfPreviewModalProps {
  type: PdfDocType;
  workOrder?: WorkOrder | null;
  quotation?: Quotation | null;
  onClose: () => void;
  onDownload?: () => void;
}

const INVENTORY_ALL_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'botiquin', label: 'Botiquín' },
  { key: 'chaleco_reflectante', label: 'Chaleco reflectante' },
  { key: 'extintor', label: 'Extintor' },
  { key: 'triangulo', label: 'Triángulo' },
  { key: 'control_remoto', label: 'Control remoto' },
  { key: 'manual', label: 'Manual propietario' },
  { key: 'radio', label: 'Radio' },
  { key: 'usb', label: 'USB / Tarjeta' },
  { key: 'rueda_repuesto', label: 'Llanta auxilio' },
  { key: 'llave_ruedas', label: 'Llave de ruedas' },
  { key: 'gata', label: 'Gata' },
  { key: 'herramientas', label: 'Herramientas' },
  { key: 'perno_seguridad', label: 'Perno seguridad' },
  { key: 'enganche', label: 'Enganche / Acople' },
  { key: 'antena', label: 'Antena' },
  { key: 'tapa_combustible', label: 'Tapa combustible' },
  { key: 'tapas_ruedas', label: 'Tapa ruedas' },
  { key: 'limpiaparabrisas', label: 'Plumas limpia.' },
];

const TIRE_LABELS: Record<string, { code: string; text: string }> = {
  bueno: { code: 'A', text: 'Bueno' },
  regular: { code: 'B', text: 'Regular' },
  desgaste_severo: { code: 'C', text: 'Desgaste' },
  baja_presion: { code: 'D', text: 'Baja presión' },
  no_revisado: { code: '-', text: 'N/A' },
};

const FUEL_LABELS: Record<string, string> = {
  vacio: 'Vacío',
  cuarto: '1/4',
  medio: '1/2',
  tres_cuartos: '3/4',
  lleno: 'Lleno',
};

// ==========================================
// SUBCOMPONENTES DE HOJAS FÍSICAS (PAPER SHEETS)
// Reutilizados para pantalla, portal de impresión y exportación a PDF
// ==========================================

interface WorkOrderSheetPage1Props {
  workOrder: WorkOrder;
  inventorySet: Set<string>;
  rawSubtotal: number;
  rawIVA: number;
  rawTotal: number;
}

const WorkOrderSheetPage1: React.FC<WorkOrderSheetPage1Props> = ({
  workOrder,
  inventorySet,
  rawSubtotal,
  rawIVA,
  rawTotal,
}) => {
  const items = workOrder.items ?? [];

  return (
    <div
      id="pdf-sheet-page-1"
      className="pdf-paper-sheet mx-auto mb-6 flex flex-col justify-between bg-white text-slate-800 shadow-2xl"
      style={{
        width: '816px',
        minHeight: '1056px',
        padding: '26px 34px',
        boxSizing: 'border-box',
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      <div>
        {/* Header Anverso OT */}
        <div className="flex items-start justify-between border-b-2 border-[#0E2B4E] pb-2">
          <div>
            <img
              src="/marca.webp"
              alt="UNITHOR"
              className="h-8 object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="text-[10px] text-slate-500">R.U.T. 77.374.788-1</div>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black tracking-tight text-[#0E2B4E]">
              ORDEN DE TRABAJO
            </h1>
          </div>
          <div className="text-right text-xs">
            <div>
              Nro: <strong className="text-sm font-black text-[#0E2B4E]">{workOrder.codigo}</strong>
            </div>
            <div>
              Tipo: <strong className="text-[#0E2B4E]">{workOrder.vehicle?.marca ? 'Automotriz' : 'General'}</strong>
            </div>
          </div>
        </div>

        {/* 4 Cards Grid Info OT */}
        <div className="mt-2.5 grid grid-cols-4 gap-2 text-[10.5px] leading-tight">
          {/* Cliente */}
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="mb-1 text-[9px] font-black uppercase text-[#0E2B4E]">
              INFORMACIÓN CLIENTE
            </div>
            <div><strong>Cliente:</strong> {workOrder.client?.nombre ?? 'Sin cliente'}</div>
            <div><strong>RUT:</strong> {workOrder.client?.rut ?? 'Sin RUT'}</div>
            <div><strong>Contacto:</strong> {workOrder.contact?.nombre ?? workOrder.client?.nombre ?? '-'}</div>
            <div><strong>Celular:</strong> {workOrder.client?.telefono ?? '-'}</div>
          </div>

          {/* Facturación */}
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="mb-1 text-[9px] font-black uppercase text-[#0E2B4E]">
              DATOS DE FACTURACIÓN
            </div>
            <div><strong>R.U.T. Fact:</strong> {workOrder.billing?.rut ?? workOrder.client?.rut ?? '-'}</div>
            <div><strong>Nombre Fact:</strong> {workOrder.billing?.nombre ?? workOrder.client?.nombre ?? '-'}</div>
            <div><strong>Correo:</strong> {workOrder.billing?.email ?? workOrder.client?.email ?? '-'}</div>
            <div><strong>Dirección:</strong> {workOrder.billing?.direccion ?? '-'}</div>
          </div>

          {/* Vehículo */}
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="mb-1 text-[9px] font-black uppercase text-[#0E2B4E]">
              INFORMACIÓN VEHÍCULO
            </div>
            <div>
              <strong>Patente:</strong> <strong className="text-[#0E2B4E]">{workOrder.vehicle?.patente ?? '-'}</strong>
            </div>
            <div><strong>Marca/Mod:</strong> {[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || '-'}</div>
            <div><strong>Año:</strong> {(workOrder.vehicle as { ano?: number | null })?.ano ?? '-'} | <strong>Color:</strong> {(workOrder.vehicle as { color?: string | null })?.color ?? '-'}</div>
            <div><strong>Combustible:</strong> {(workOrder.vehicle as { combustible?: string | null })?.combustible ?? '-'}</div>
          </div>

          {/* Recepción */}
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="mb-1 text-[9px] font-black uppercase text-[#0E2B4E]">
              DATOS DE RECEPCIÓN
            </div>
            <div>
              <strong>Km:</strong> {workOrder.kilometrajeIngreso !== null ? `${workOrder.kilometrajeIngreso.toLocaleString('es-CL')} km` : '-'}
            </div>
            <div>
              <strong>Tanque:</strong> {workOrder.inspection?.nivelCombustible ? (FUEL_LABELS[workOrder.inspection.nivelCombustible] ?? workOrder.inspection.nivelCombustible) : '-'}
            </div>
            <div><strong>Asesor:</strong> {workOrder.creator?.nombre ?? 'Recepción'}</div>
            <div><strong>Fecha:</strong> {formatDateTime(workOrder.fechaIngreso)}</div>
          </div>
        </div>

        {/* Tabla: TRABAJOS A REALIZAR */}
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-[#0E2B4E]">
            TRABAJOS A REALIZAR / REPUESTOS
          </div>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-[#0E2B4E] text-white">
                <th className="p-1.5 text-center font-bold">#</th>
                <th className="p-1.5 text-left font-bold">DESCRIPCIÓN</th>
                <th className="p-1.5 text-center font-bold">CANT.</th>
                <th className="p-1.5 text-right font-bold">PRECIO</th>
                <th className="p-1.5 text-right font-bold">SUBT.</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item, idx) => (
                  <tr key={item.id ?? idx} className="border-b border-slate-200">
                    <td className="p-1.5 text-center text-slate-500">{idx + 1}</td>
                    <td className="p-1.5 font-bold text-[#0E2B4E]">{item.descripcion}</td>
                    <td className="p-1.5 text-center">{item.cantidad}</td>
                    <td className="p-1.5 text-right">{formatClp(item.precioUnitario)}</td>
                    <td className="p-1.5 text-right font-bold text-[#0E2B4E]">{formatClp(item.subtotal)}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-b border-slate-200">
                  <td colSpan={5} className="p-2 text-center text-slate-400">
                    Evaluación inicial de taller / Diagnóstico general
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Resumen Totales */}
          <div className="mt-1 flex justify-end">
            <div className="w-48 text-[10px]">
              <div className="flex justify-between py-0.5">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-bold">{formatClp(rawSubtotal)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-600">IVA (19%):</span>
                <span className="font-bold">{formatClp(rawIVA)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-300 py-0.5 text-[11px] font-black text-[#0E2B4E]">
                <span>TOTAL:</span>
                <span>{formatClp(rawTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BLOQUE INSPECCIÓN DE RECEPCIÓN */}
        <div className="mt-2.5 rounded border border-slate-300 bg-slate-50/50 p-2 text-[9.5px]">
          <div className="mb-1.5 flex items-center justify-between border-b border-slate-200 pb-1">
            <span className="font-black uppercase tracking-wider text-[#0E2B4E]">
              INSPECCIÓN DE INGRESO
            </span>
            <div className="flex items-center gap-3 font-semibold text-slate-700">
              <span>
                Llantas: DI: <strong>{TIRE_LABELS[workOrder.inspection?.llantaDelanteraIzquierda ?? '']?.text ?? '-'}</strong> |
                DD: <strong>{TIRE_LABELS[workOrder.inspection?.llantaDelanteraDerecha ?? '']?.text ?? '-'}</strong> |
                TI: <strong>{TIRE_LABELS[workOrder.inspection?.llantaTraseraIzquierda ?? '']?.text ?? '-'}</strong> |
                TD: <strong>{TIRE_LABELS[workOrder.inspection?.llantaTraseraDerecha ?? '']?.text ?? '-'}</strong>
              </span>
            </div>
          </div>

          {/* Inventario 18 items */}
          <div className="grid grid-cols-6 gap-x-2 gap-y-1">
            {INVENTORY_ALL_ITEMS.map((inv) => {
              const checked = inventorySet.has(inv.key);
              return (
                <div key={inv.key} className="flex items-center gap-1">
                  <span
                    className={`flex h-3 w-3 items-center justify-center rounded-sm border text-[8px] font-black ${
                      checked
                        ? 'border-[#0E2B4E] bg-[#0E2B4E] text-white'
                        : 'border-slate-300 bg-white text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className={`truncate ${checked ? 'font-bold text-slate-900' : 'text-slate-400'}`}>
                    {inv.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Observaciones y Objetos de Valor */}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-1.5">
            <div>
              <strong className="text-[#0E2B4E]">Objetos de valor:</strong>{' '}
              <span className="text-slate-700">{workOrder.inspection?.objetosValor || 'Ninguno'}</span>
            </div>
            <div>
              <strong className="text-[#0E2B4E]">Observaciones:</strong>{' '}
              <span className="text-slate-700">{workOrder.inspection?.observaciones || workOrder.descripcion || 'Sin observaciones'}</span>
            </div>
          </div>

          {/* Registro Fotográfico Pericial (1 a 6 fotos) */}
          {workOrder.inspection?.photos && workOrder.inspection.photos.length > 0 && (
            <div className="mt-2 border-t border-slate-200 pt-1.5">
              <div className="mb-1 font-bold text-[#0E2B4E]">Fotos periciales de recepción:</div>
              <div className="grid grid-cols-6 gap-1.5">
                {workOrder.inspection.photos.slice(0, 6).map((photo) => (
                  <div key={photo.id} className="relative aspect-video overflow-hidden rounded border border-slate-300 bg-slate-100">
                    <img
                      src={photo.url}
                      alt={`Foto ${photo.slot}`}
                      crossOrigin="anonymous"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-center text-[7px] font-bold text-white capitalize">
                      {photo.slot.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Anverso */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-1 text-[9px] text-slate-500">
        <div>Arturo Fernández 2101, Iquique | Fono: +56 9 2375 7478 | contacto@unithor.cl</div>
        <div>Página 1 de 2</div>
      </div>
    </div>
  );
};

interface WorkOrderSheetPage2Props {
  workOrder: WorkOrder;
}

const WorkOrderSheetPage2: React.FC<WorkOrderSheetPage2Props> = ({ workOrder }) => {
  return (
    <div
      id="pdf-sheet-page-2"
      className="pdf-paper-sheet mx-auto flex flex-col justify-between bg-white text-slate-800 shadow-2xl"
      style={{
        width: '816px',
        minHeight: '1056px',
        padding: '26px 34px',
        boxSizing: 'border-box',
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      <div>
        {/* Header Reverso OT */}
        <div className="flex items-start justify-between border-b-2 border-[#0E2B4E] pb-2">
          <div>
            <img
              src="/marca.webp"
              alt="UNITHOR"
              className="h-8 object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="text-[10px] text-slate-500">R.U.T. 77.374.788-1</div>
          </div>
          <div className="text-right">
            <h2 className="text-sm font-black text-[#0E2B4E]">
              ORDEN DE TRABAJO N°: {workOrder.codigo}
            </h2>
            <div className="text-xs font-bold text-slate-600">
              CONDICIONES GENERALES DEL SERVICIO
            </div>
          </div>
        </div>

        {/* 12 Cláusulas Legales Oficiales */}
        <div className="mt-3 text-justify text-[9px] leading-relaxed text-slate-700">
          <p className="mb-1.5">
            <strong>1.</strong> El presente contrato de Prestación de Servicios es convenido entre UNITHOR SERVICIOS INTEGRALES SPA, y la persona nombrada en el anverso de este documento "Orden de trabajo" denominado CLIENTE.
          </p>
          <p className="mb-1.5">
            <strong>2.</strong> El CLIENTE declara que es propietario del automóvil especificado en la Orden de Trabajo, o tener autorización escrita del propietario para encargar trabajos y entregar el vehículo a UNITHOR SERVICIOS INTEGRALES SPA.
          </p>
          <p className="mb-1.5">
            <strong>3.</strong> El CLIENTE contrata los servicios de UNITHOR SERVICIOS INTEGRALES SPA., para que realice trabajos especificados en la Orden de Trabajo bajo el rubro "Trabajos a realizar", el trabajo incluye: repuestos, material y servicios terceros necesarios. También autoriza a UNITHOR SERVICIOS INTEGRALES SPA a realizar los traslados del vehículo individualizado en el formulario Orden de Trabajo por los recorridos calles, carreteras, autopistas y otros lugares dentro del radio urbano a fin de efectuar pruebas e inspecciones necesarias.
          </p>
          <p className="mb-1.5">
            <strong>4.</strong> El CLIENTE a tiempo de hacer la entrega del vehículo en el taller, se obliga a retirar todo objeto de valor en el interior de la movilidad, quedando establecido que todos los accesorios serán dejados bajo inventario; asimismo el CLIENTE, se obliga a informar al taller sobre trabajos anteriores en otros talleres y proporcionar información que ayude en la ejecución óptima del trabajo. Así mismo UNITHOR SERVICIOS INTEGRALES SPA no será responsable por los defectos no visibles, que puedan tener el vehículo al momento de la recepción.
          </p>
          <p className="mb-1.5">
            <strong>5.</strong> Los precios cotizados en la Orden de Trabajo incluyen impuestos fiscales y se refieren al servicio específico cotizado. Reparaciones y/o materiales cotizados en la orden de trabajo con valor referencial están en evaluación para definir su valor que será informado al cliente previo a su compra o realización. No incluyen reparaciones ni materiales que no estuvieran considerados ni especificados en la Orden de Trabajo o sea que no son parte de este mismo servicio. En caso de requerir trabajos o repuestos adicionales estos serán cobrados de acuerdo con la tasa de mano de obra vigente y los repuestos por los precios de venta normales y vigentes a la fecha.
          </p>
          <p className="mb-1.5">
            <strong>6.</strong> En el caso que se requiera la importación de repuestos, para la ejecución de los servicios encargados, el CLIENTE pagará el 50% (cincuenta por ciento) del valor de los repuestos en el momento de la confirmación del pedido.
          </p>
          <p className="mb-1.5">
            <strong>7.</strong> Una vez que se ha informado al CLIENTE que los trabajos están concluidos, el CLIENTE deberá recoger el vehículo dentro de diez días hábiles siguientes a su notificación. A partir del onceavo día, UNITHOR SERVICIOS INTEGRALES SPA se reserva el derecho de cobrar estacionamiento por valor de diez mil pesos más IVA por día calendario e incluir el valor en la facturación del servicio prestado.
          </p>
          <p className="mb-1.5">
            <strong>8.</strong> Para proceder al retiro del vehículo, el CLIENTE debe proceder al pago total del valor del trabajo encomendado de acuerdo a la factura que le extienda UNITHOR SERVICIOS INTEGRALES SPA, por los trabajos, servicios y materiales de la Orden de Trabajo presente, otras cotizaciones y/o adiciones que se sumen al requerimiento del cliente y por adiciones que autorice el CLIENTE incluso verbalmente. En el caso que el CLIENTE no cancele su deuda en su totalidad y no cuente con una línea de crédito vigente, el automóvil no será devuelto y quedará como garantía de pago en UNITHOR SERVICIOS INTEGRALES SPA hasta que sea cancelada toda la deuda.
          </p>
          <p className="mb-1.5">
            <strong>9.</strong> La entrega del vehículo se realizará exclusivamente a la persona que figura como CLIENTE en la Orden de trabajo presentando su ejemplar de la Orden de trabajo emitido por UNITHOR SERVICIOS INTEGRALES SPA. En caso contrario la persona que recoge la movilidad tiene el deber de identificarse como propietario legítimo o presentar el poder correspondiente.
          </p>
          <p className="mb-1.5">
            <strong>10.</strong> Los repuestos cuyo reemplazo fue pagado por el CLIENTE están a su disposición en el momento de la entrega del vehículo. Los repuestos no reclamados en ese momento son destruidos y por lo tanto, no se puede tomar consideración posterior al respecto, no se podrá imputar al costo de la reparación parte alguna de los repuestos reemplazados.
          </p>
          <p className="mb-1.5">
            <strong>11.</strong> El CLIENTE a tiempo de recibir el vehículo, deberá firmar la Orden de trabajo, dando su conformidad por la recepción del vehículo y la inexistencia de daños y/o objetos perdidos. Cualquier reclamo el CLIENTE tiene que hacer presente en el momento de la entrega, reclamos posteriores acerca de daños y/o objetos perdidos serán rechazados.
          </p>
          <p className="mb-1.5">
            <strong>12.</strong> El CLIENTE autoriza a UNITHOR SERVICIOS INTEGRALES SPA guardar los datos que contiene la Orden de trabajo y los datos de la factura correspondiente en su base de datos.
          </p>
        </div>

        {/* Doble Recuadro de Firmas */}
        <div className="mt-8 grid grid-cols-2 gap-8 text-[10px]">
          <div className="rounded border border-slate-300 p-4 text-center">
            <div className="h-14"></div>
            <div className="border-t border-slate-400 pt-1.5 font-black text-[#0E2B4E]">
              FIRMA ASESOR UNITHOR
            </div>
            <div className="text-[9px] text-slate-500">UNITHOR SERVICIOS INTEGRALES SPA</div>
          </div>

          <div className="rounded border border-slate-300 p-4 text-center">
            <div className="h-14"></div>
            <div className="border-t border-slate-400 pt-1.5 font-black text-[#0E2B4E]">
              FIRMA CLIENTE / CONFORMIDAD
            </div>
            <div className="text-[9px] text-slate-500">
              RUT: ____________________ Fecha: ___/___/______
            </div>
          </div>
        </div>
      </div>

      {/* Footer Reverso */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-1 text-[9px] text-slate-500">
        <div>Arturo Fernández 2101, Iquique | Fono: +56 9 2375 7478</div>
        <div>Página 2 de 2</div>
      </div>
    </div>
  );
};

interface QuotationSheetPageProps {
  quotation: Quotation;
  rawSubtotal: number;
  rawIVA: number;
  rawTotal: number;
}

const QuotationSheetPage: React.FC<QuotationSheetPageProps> = ({
  quotation,
  rawSubtotal,
  rawIVA,
  rawTotal,
}) => {
  const items = quotation.items ?? [];

  return (
    <div
      id="pdf-sheet-quotation"
      className="pdf-paper-sheet mx-auto flex flex-col justify-between bg-white text-slate-800 shadow-2xl"
      style={{
        width: '816px',
        minHeight: '1056px',
        padding: '26px 34px',
        boxSizing: 'border-box',
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      <div>
        {/* Header Cotización */}
        <div className="flex items-start justify-between border-b-2 border-[#0E2B4E] pb-2">
          <div>
            <img
              src="/marca.webp"
              alt="UNITHOR"
              className="h-8 object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="text-[10px] text-slate-500">R.U.T. 77.374.788-1</div>
            <div className="text-[10px] text-slate-500">Arturo Fernández 2101, Iquique</div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black tracking-tight text-[#0E2B4E]">
              COTIZACIÓN COMERCIAL
            </h1>
            <div className="text-sm font-black text-[#00A8E8]">{quotation.codigo}</div>
            {quotation.workOrder && (
              <div className="text-xs font-bold text-slate-600">
                Según OT: {quotation.workOrder.codigo}
              </div>
            )}
            <div className="text-[10px] text-slate-500">
              Fecha: {formatDateTime(quotation.createdAt)}
            </div>
          </div>
        </div>

        {/* 2 Cajas de Datos: Cliente y Vehículo */}
        <div className="mt-3 grid grid-cols-2 gap-3 text-[10.5px]">
          <div className="rounded border border-slate-200 bg-slate-50/50 p-2.5">
            <div className="mb-1 text-[9.5px] font-black uppercase tracking-wider text-[#0E2B4E]">
              DATOS DEL CLIENTE
            </div>
            <div><strong>Señor(es):</strong> {quotation.client?.nombre ?? 'Sin cliente asignado'}</div>
            <div><strong>R.U.T.:</strong> {quotation.client?.rut ?? 'Sin RUT'}</div>
            <div><strong>Teléfono:</strong> {quotation.client?.telefono ?? '-'}</div>
            <div><strong>Email:</strong> {(quotation.client as { email?: string | null })?.email ?? '-'}</div>
            <div><strong>Dirección:</strong> {(quotation.client as { direccion?: string | null })?.direccion ?? '-'}</div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/50 p-2.5">
            <div className="mb-1 text-[9.5px] font-black uppercase tracking-wider text-[#0E2B4E]">
              DATOS DEL VEHÍCULO
            </div>
            <div>
              <strong>Patente:</strong> <strong className="text-[#0E2B4E]">{quotation.vehicle?.patente ?? '-'}</strong>
            </div>
            <div><strong>Marca/Modelo:</strong> {[quotation.vehicle?.marca, quotation.vehicle?.modelo].filter(Boolean).join(' ') || '-'}</div>
            <div><strong>Año:</strong> {(quotation.vehicle as { ano?: number | null })?.ano ?? '-'} | <strong>Color:</strong> {(quotation.vehicle as { color?: string | null })?.color ?? '-'}</div>
            <div><strong>Asesor Asignado:</strong> {quotation.asesor?.nombre ?? 'Ventas'}</div>
          </div>
        </div>

        {/* Tabla de Conceptos Cotizados */}
        <div className="mt-4">
          <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-[#0E2B4E]">
            DESGLOSE DE SERVICIOS Y REPUESTOS
          </div>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-[#0E2B4E] text-white">
                <th className="p-2 text-center font-bold">#</th>
                <th className="p-2 text-left font-bold">DESCRIPCIÓN DEL TRABAJO / PRODUCTO</th>
                <th className="p-2 text-center font-bold">CANT.</th>
                <th className="p-2 text-right font-bold">PRECIO UNIT.</th>
                <th className="p-2 text-right font-bold">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item, idx) => (
                  <tr key={item.id ?? idx} className="border-b border-slate-200">
                    <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                    <td className="p-2 font-bold text-[#0E2B4E]">{item.descripcion}</td>
                    <td className="p-2 text-center">{item.cantidad}</td>
                    <td className="p-2 text-right">{formatClp(item.precioUnitario)}</td>
                    <td className="p-2 text-right font-bold text-[#0E2B4E]">{formatClp(item.subtotal)}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-b border-slate-200">
                  <td colSpan={5} className="p-4 text-center text-slate-400">
                    Sin conceptos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Resumen Totales Cotización */}
          <div className="mt-3 flex justify-end">
            <div className="w-56 rounded border border-slate-200 bg-slate-50 p-2.5 text-[10.5px]">
              <div className="flex justify-between py-0.5">
                <span className="text-slate-600">Subtotal Neto:</span>
                <span className="font-bold">{formatClp(rawSubtotal)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-600">IVA (19%):</span>
                <span className="font-bold">{formatClp(rawIVA)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-300 py-1 text-sm font-black text-[#0E2B4E]">
                <span>TOTAL:</span>
                <span>{formatClp(rawTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Condiciones Comerciales y Notas */}
        <div className="mt-6 rounded border border-slate-200 p-3 text-[10px] text-slate-600">
          <div className="font-black uppercase tracking-wider text-[#0E2B4E]">
            CONDICIONES COMERCIALES:
          </div>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5">
            <li>Precios sujetos a confirmación y disponibilidad al momento de compra de repuestos.</li>
            <li>Validez de la oferta: 15 días corridos a contar de la fecha de emisión.</li>
            <li>Formas de pago: Efectivo, Transferencia Electrónica o Tarjetas de Débito/Crédito.</li>
            {quotation.notas && (
              <li className="font-semibold text-slate-800">
                Notas especiales: {quotation.notas}
              </li>
            )}
          </ul>
        </div>

        {/* Firma Asesor Comercial */}
        <div className="mt-10 flex justify-end text-[10px]">
          <div className="w-64 border-t border-slate-400 pt-1.5 text-center">
            <div className="font-black text-[#0E2B4E]">
              {quotation.asesor?.nombre ?? 'UNITHOR SERVICIOS INTEGRALES'}
            </div>
            <div className="text-[9px] text-slate-500">Asesor Comercial / Atención a Clientes</div>
          </div>
        </div>
      </div>

      {/* Footer Cotización */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-1 text-[9px] text-slate-500">
        <div>Arturo Fernández 2101, Iquique | Fono: +56 9 2375 7478 | contacto@unithor.cl</div>
        <div>Página 1 de 1</div>
      </div>
    </div>
  );
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  type,
  workOrder,
  quotation,
  onClose,
  onDownload,
}) => {
  const [activeTab, setActiveTab] = useState<'pag1' | 'pag2'>('pag1');
  const [isGrayscale, setIsGrayscale] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const isOT = type === 'work-order';
  const displayCode = isOT
    ? workOrder?.codigo ?? 'OT-S/N'
    : quotation?.codigo ?? 'COT-S/N';

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Cálculos financieros
  const items = isOT ? workOrder?.items ?? [] : quotation?.items ?? [];
  const rawSubtotal = items.reduce(
    (acc, item) => acc + Number(item.subtotal ?? 0),
    0,
  );
  const rawIVA = Math.round(rawSubtotal * 0.19);
  const rawTotal = isOT
    ? rawSubtotal + rawIVA
    : Number(quotation?.total ?? rawSubtotal + rawIVA);

  const inventorySet = new Set(workOrder?.inspection?.inventario ?? []);

  // Medidas del papel: Letter a 96DPI (8.5in x 11in). Debe coincidir con
  // el estilo inline de .pdf-paper-sheet (width 816px, minHeight 1056px).
  const SHEET_WIDTH = 816;
  const SHEET_HEIGHT = 1056;

  // Impresión nativa del navegador.
  // Usa el mismo portal (#unithor-print-portal) que la vista previa,
  // por lo que el papel impreso es idéntico al que se ve en pantalla.
  const handlePrint = () => {
    window.print();
  };

  // Descarga directa como archivo PDF con el mismo diseño de la vista previa.
  // Usa html-to-image (SVG foreignObject, soporta Tailwind grid/flex) + jsPDF.
  // html2canvas/html2pdf generaba hojas en blanco, por eso se cambió de librería.
  const handleDownloadPdf = async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    const portal = document.getElementById('unithor-print-portal');
    if (!portal) {
      window.print();
      return;
    }

    const sheets = Array.from(
      portal.querySelectorAll<HTMLElement>('.pdf-paper-sheet'),
    );
    if (sheets.length === 0) {
      window.print();
      return;
    }

    setIsGeneratingPdf(true);

    // El portal está oculto en pantalla (display:none). Lo mostramos in-place
    // detrás del backdrop (z-40 vs z-50 del modal) para que el navegador
    // calcule layout real antes de rasterizar. Se restaura en finally.
    portal.style.setProperty('display', 'block', 'important');
    portal.style.setProperty('position', 'fixed', 'important');
    portal.style.setProperty('top', '0', 'important');
    portal.style.setProperty('left', '0', 'important');
    portal.style.setProperty('width', `${SHEET_WIDTH}px`, 'important');
    portal.style.setProperty('z-index', '40', 'important');
    portal.style.setProperty('background-color', '#ffffff', 'important');
    portal.style.setProperty('pointer-events', 'none', 'important');

    try {
      // Espera a que el navegador pinte + carguen imágenes/fuentes
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 150)),
      );
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Las fuentes son mejora progresiva, no bloquean la descarga
        }
      }

      const pdf = new jsPDF({
        unit: 'px',
        format: [SHEET_WIDTH, SHEET_HEIGHT],
        orientation: 'portrait',
        hotfixes: ['px_scaling'],
        compress: true,
      });

      for (let index = 0; index < sheets.length; index += 1) {
        const sheet = sheets[index];
        // Las fotos de inspección usan cookies de sesión (same-origin /api),
        // por eso se reenvían credenciales al inlinear imágenes.
        const dataUrl = await toPng(sheet, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          style: isGrayscale ? { filter: 'grayscale(100%)' } : {},
          fetchRequestInit: { credentials: 'include' },
        });

        if (index > 0) {
          pdf.addPage([SHEET_WIDTH, SHEET_HEIGHT], 'portrait');
        }
        pdf.addImage(dataUrl, 'PNG', 0, 0, SHEET_WIDTH, SHEET_HEIGHT, undefined, 'FAST');
      }

      pdf.save(`${displayCode}.pdf`);
    } catch (err) {
      console.error('Error al generar PDF directo, recurriendo a impresión:', err);
      window.print();
    } finally {
      portal.style.removeProperty('display');
      portal.style.removeProperty('position');
      portal.style.removeProperty('top');
      portal.style.removeProperty('left');
      portal.style.removeProperty('width');
      portal.style.removeProperty('z-index');
      portal.style.removeProperty('background-color');
      portal.style.removeProperty('pointer-events');
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
    >
      {/* Estilos CSS nativos de impresión Letter a 96DPI sin bordes ni elementos externos */}
      <style>{`
        @media screen {
          #unithor-print-portal {
            display: none !important;
          }
        }
        @media print {
          @page {
            size: letter portrait;
            margin: 0;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* Ocultar todo el árbol de React excepto el portal de impresión */
          body > *:not(#unithor-print-portal) {
            display: none !important;
          }
          #unithor-print-portal {
            display: block !important;
            position: static !important;
            left: 0 !important;
            top: 0 !important;
            width: 816px !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #ffffff !important;
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #unithor-print-portal .pdf-print-wrapper {
            display: block !important;
            width: 816px !important;
            margin: 0 auto !important;
          }
          #unithor-print-portal .pdf-paper-sheet {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 auto !important;
            width: 816px !important;
            max-width: 816px !important;
            min-height: 1056px !important;
            height: 1056px !important;
            padding: 26px 34px !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #unithor-print-portal .pdf-paper-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      {/* Contenedor Modal en Pantalla */}
      <motion.div
        id="unithor-pdf-preview-root"
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative flex h-[95vh] w-full max-w-[940px] flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl border border-slate-700/50"
      >
        {/* Barra superior de herramientas */}
        <header className="flex flex-col gap-2 border-b border-blue-950 bg-[#0E2B4E] px-4 py-3 text-white sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/marca.webp"
                alt="UNITHOR"
                className="h-6 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <h2
                id="pdf-modal-title"
                className="text-base font-extrabold tracking-tight text-white sm:text-lg"
              >
                Vista Previa PDF: <span className="text-brand-yellow">{displayCode}</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-red-600 focus:outline-none"
              aria-label="Cerrar vista previa"
              title="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Fila de controles: Pestañas, Color y Acciones */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              {/* Paginador para OT */}
              {isOT && (
                <div className="flex rounded-lg border border-slate-700 bg-slate-800/90 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('pag1')}
                    className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                      activeTab === 'pag1'
                        ? 'bg-brand-blue text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Pág 1 (Anverso)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pag2')}
                    className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                      activeTab === 'pag2'
                        ? 'bg-brand-blue text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Pág 2 (Reverso Legal)
                  </button>
                </div>
              )}

              {/* Selector Color / B&N */}
              <div className="flex rounded-lg border border-slate-700 bg-slate-800/90 p-1">
                <button
                  type="button"
                  onClick={() => setIsGrayscale(false)}
                  className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                    !isGrayscale
                      ? 'bg-slate-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Color
                </button>
                <button
                  type="button"
                  onClick={() => setIsGrayscale(true)}
                  className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                    isGrayscale
                      ? 'bg-slate-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  B/N
                </button>
              </div>
            </div>

            {/* Botones de acción: Imprimir y Descargar PDF */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20"
                title="Imprimir documento físico o mediante diálogo de impresión del sistema"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Imprimir</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#00A8E8] px-3 text-xs font-bold text-white transition hover:bg-sky-500 disabled:opacity-75"
                title="Descargar archivo PDF directamente a tu equipo"
              >
                {isGeneratingPdf ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    <span>Generando PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>Descargar PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Lienzo con fondo oscuro de mesa de trabajo (Previsualización en Pantalla) */}
        <div
          className="flex-1 overflow-auto bg-slate-800/80 p-4 sm:p-6"
          style={{
            filter: isGrayscale ? 'grayscale(100%)' : 'none',
          }}
        >
          {isOT && workOrder && (
            <div className="pdf-print-wrapper mx-auto">
              {activeTab === 'pag1' ? (
                <WorkOrderSheetPage1
                  workOrder={workOrder}
                  inventorySet={inventorySet}
                  rawSubtotal={rawSubtotal}
                  rawIVA={rawIVA}
                  rawTotal={rawTotal}
                />
              ) : (
                <WorkOrderSheetPage2 workOrder={workOrder} />
              )}
            </div>
          )}

          {!isOT && quotation && (
            <div className="pdf-print-wrapper mx-auto">
              <QuotationSheetPage
                quotation={quotation}
                rawSubtotal={rawSubtotal}
                rawIVA={rawIVA}
                rawTotal={rawTotal}
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* PORTAL DE IMPRESIÓN Y EXPORTACIÓN
          Se renderiza directamente en document.body para evitar que las reglas @media print
          oculten los elementos al apagar #root. Siempre incluye todas las páginas. */}
      {createPortal(
        <div id="unithor-print-portal" aria-hidden="true">
          {isOT && workOrder && (
            <div
              className="pdf-print-wrapper"
              style={{
                filter: isGrayscale ? 'grayscale(100%)' : 'none',
              }}
            >
              <WorkOrderSheetPage1
                workOrder={workOrder}
                inventorySet={inventorySet}
                rawSubtotal={rawSubtotal}
                rawIVA={rawIVA}
                rawTotal={rawTotal}
              />
              <WorkOrderSheetPage2 workOrder={workOrder} />
            </div>
          )}

          {!isOT && quotation && (
            <div
              className="pdf-print-wrapper"
              style={{
                filter: isGrayscale ? 'grayscale(100%)' : 'none',
              }}
            >
              <QuotationSheetPage
                quotation={quotation}
                rawSubtotal={rawSubtotal}
                rawIVA={rawIVA}
                rawTotal={rawTotal}
              />
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default PdfPreviewModal;
