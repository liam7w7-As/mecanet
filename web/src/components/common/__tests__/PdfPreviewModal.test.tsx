import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WORK_ORDER_INSPECTION_PHOTO_SLOTS } from '@unithor/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PdfPreviewModal from '../PdfPreviewModal';

import type { Quotation, WorkOrder } from '../../../types/entities';

const mockWorkOrder: WorkOrder = {
  id: 101,
  codigo: 'OT-2026-0101',
  clientId: 1,
  contactClientId: 1,
  billingClientId: 1,
  vehicleId: 1,
  estado: 'en_progreso',
  descripcion: 'Revisión general y cambio de aceite',
  kilometrajeIngreso: 45000,
  fechaIngreso: '2026-09-16T10:00:00.000Z',
  fechaEntrega: null,
  createdBy: 1,
  createdAt: '2026-09-16T10:00:00.000Z',
  updatedAt: '2026-09-16T10:00:00.000Z',
  client: {
    id: 1,
    rut: '12345678-9',
    nombre: 'Transportes del Norte SpA',
    telefono: '+56 9 1111 2222',
  },
  contact: {
    clientId: 1,
    nombre: 'Carlos Choque',
    rut: '12345678-9',
    telefono: '+56 9 1111 2222',
    email: 'contacto@transnorte.cl',
  },
  billing: {
    clientId: 1,
    nombre: 'Transportes del Norte SpA',
    rut: '76543210-K',
    tipo: 'empresa',
    direccion: 'Av. Las Parcelas 123',
    telefono: '+56 9 1111 2222',
    email: 'factura@transnorte.cl',
    comuna: 'Iquique',
    region: 'Tarapacá',
  },
  vehicle: {
    id: 1,
    patente: 'HG-TR-34',
    marca: 'Toyota',
    modelo: 'Hilux',
    ano: 2022,
  },
  creator: {
    id: 1,
    nombre: 'Patricio Asesor',
    email: 'patricio@unithor.cl',
  },
  inspection: {
    id: 1,
    nivelCombustible: 'medio',
    llantaDelanteraIzquierda: 'bueno',
    llantaDelanteraDerecha: 'bueno',
    llantaTraseraIzquierda: 'regular',
    llantaTraseraDerecha: 'regular',
    inventario: ['botiquin', 'extintor', 'triangulo', 'gata', 'herramientas'],
    objetosValor: 'Herramientas personales en caja',
    observaciones: 'Golpe menor en parachoque delantero',
    inspectedBy: 1,
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    photos: [],
  },
  items: [
    {
      id: 1,
      catalogItemId: 1,
      descripcion: 'Cambio de Aceite 5W30 Sintético',
      tipoLinea: 'estandar',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 65000,
      subtotal: 65000,
      estadoOperativo: 'completado',
      notasOperativas: null,
      horasHombreEstimadas: null,
      horasHombreReales: null,
      assignedUserId: null,
      laborValidatedBy: null,
      laborValidatedAt: null,
      laborValidationNote: null,
      stockConsumido: false,
      stockConsumidoCantidad: 0,
      stockConsumidoAt: null,
    },
    {
      id: 2,
      catalogItemId: 2,
      descripcion: 'Filtro de Aceite Original',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 15000,
      subtotal: 15000,
      estadoOperativo: 'completado',
      notasOperativas: null,
      horasHombreEstimadas: null,
      horasHombreReales: null,
      assignedUserId: null,
      laborValidatedBy: null,
      laborValidatedAt: null,
      laborValidationNote: null,
      stockConsumido: true,
      stockConsumidoCantidad: 1,
      stockConsumidoAt: '2026-09-16T10:00:00.000Z',
    },
  ],
};

const mockQuotation: Quotation = {
  id: 202,
  codigo: 'COT-2026-0202',
  workOrderId: 101,
  clientId: 1,
  vehicleId: 1,
  asesorId: 1,
  estadoPago: 'por_pagar',
  subtotal: 80000,
  total: 95200,
  pagado: 0,
  notas: 'Valores válidos por 15 días.',
  createdAt: '2026-09-16T11:00:00.000Z',
  updatedAt: '2026-09-16T11:00:00.000Z',
  client: {
    id: 1,
    rut: '12345678-9',
    nombre: 'Transportes del Norte SpA',
    telefono: '+56 9 1111 2222',
  },
  vehicle: {
    id: 1,
    patente: 'HG-TR-34',
    marca: 'Toyota',
    modelo: 'Hilux',
  },
  asesor: {
    id: 1,
    nombre: 'Patricio Asesor',
    email: 'patricio@unithor.cl',
  },
  workOrder: {
    id: 101,
    codigo: 'OT-2026-0101',
    estado: 'en_progreso',
  },
  items: [
    {
      id: 1,
      catalogItemId: 1,
      descripcion: 'Cambio de Aceite 5W30 Sintético',
      tipoLinea: 'estandar',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 65000,
      subtotal: 65000,
      estadoOperativo: 'completado',
      notasOperativas: null,
    },
    {
      id: 2,
      catalogItemId: 2,
      descripcion: 'Filtro de Aceite Original',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 15000,
      subtotal: 15000,
      estadoOperativo: 'completado',
      notasOperativas: null,
    },
  ],
};

describe('PdfPreviewModal', () => {
  const onClose = vi.fn();
  const onDownload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza la previsualización de OT en Página 1 (Anverso)', () => {
    render(
      <PdfPreviewModal
        type="work-order"
        workOrder={mockWorkOrder}
        onClose={onClose}
        onDownload={onDownload}
      />,
    );

    // Título y código
    expect(screen.getByText(/Vista Previa PDF:/i)).toBeInTheDocument();
    expect(screen.getAllByText('OT-2026-0101').length).toBeGreaterThanOrEqual(1);

    // Contenido de la Página 1
    expect(screen.getAllByText('Transportes del Norte SpA').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('HG-TR-34').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cambio de Aceite 5W30 Sintético').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/INSPECCIÓN DE INGRESO/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Página 1 de 2').length).toBeGreaterThanOrEqual(1);
  });

  it('permite alternar a la Página 2 (Reverso Legal) con las cláusulas y firmas', () => {
    render(
      <PdfPreviewModal
        type="work-order"
        workOrder={mockWorkOrder}
        onClose={onClose}
      />,
    );

    const btnPag2 = screen.getByRole('button', { name: /Pág 2 \(Reverso Legal\)/i });
    fireEvent.click(btnPag2);

    expect(screen.getAllByText(/CONDICIONES GENERALES DEL SERVICIO/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/UNITHOR SERVICIOS INTEGRALES SPA/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FIRMA ASESOR UNITHOR/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FIRMA CLIENTE \/ CONFORMIDAD/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Página 2 de 2').length).toBeGreaterThanOrEqual(1);
  });

  it('permite alternar entre Color y B/N', () => {
    render(
      <PdfPreviewModal
        type="work-order"
        workOrder={mockWorkOrder}
        onClose={onClose}
      />,
    );

    const btnBw = screen.getByRole('button', { name: 'B/N' });
    fireEvent.click(btnBw);

    const btnColor = screen.getByRole('button', { name: 'Color' });
    expect(btnBw).toHaveClass('bg-slate-600');
    fireEvent.click(btnColor);
    expect(btnColor).toHaveClass('bg-slate-600');
  });

  it('ejecuta window.print() al pulsar Imprimir', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    render(
      <PdfPreviewModal
        type="work-order"
        workOrder={mockWorkOrder}
        onClose={onClose}
      />,
    );

    document.querySelectorAll('img').forEach((image) => {
      Object.defineProperty(image, 'complete', { value: true });
    });
    fireEvent.click(screen.getByRole('button', { name: /Imprimir/i }));
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    printSpy.mockRestore();
  });

  it('ejecuta la descarga o callback al pulsar Descargar PDF', () => {
    render(
      <PdfPreviewModal
        type="work-order"
        workOrder={mockWorkOrder}
        onClose={onClose}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Descargar PDF/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('renderiza la previsualización de Cotización Comercial', () => {
    render(
      <PdfPreviewModal
        type="quotation"
        quotation={mockQuotation}
        onClose={onClose}
      />,
    );

    expect(screen.getAllByText('COT-2026-0202').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('COTIZACIÓN').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('COTIZACIÓN COMERCIAL')).not.toBeInTheDocument();
    expect(screen.getAllByText('Según OT: OT-2026-0101').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Valores válidos por 15 días/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Página 1 de 1').length).toBeGreaterThanOrEqual(1);
  });

  it('omite el bloque de vehículo en vista previa e impresión de una COT de repuestos', () => {
    render(<PdfPreviewModal type="quotation" quotation={{ ...mockQuotation, vehicleId: null, vehicle: null, workOrderId: null, workOrder: null }} onClose={onClose} />);
    expect(screen.queryByText('DATOS DEL VEHÍCULO')).not.toBeInTheDocument();
    const portal = document.getElementById('unithor-print-portal')!;
    expect(portal).not.toHaveTextContent('DATOS DEL VEHÍCULO');
    expect(portal).toHaveTextContent('Asesor Asignado:');
    expect(screen.getAllByText('DATOS DEL CLIENTE').length).toBeGreaterThan(0);
  });

  it('incluye condiciones, descuentos y ambas cuentas en el PDF sin ofrecer tarjetas', () => {
    render(<PdfPreviewModal type="quotation" quotation={{ ...mockQuotation, total: 63000, subtotal: 80000,
      formaPago: 'transferencia', disponibilidadTrabajo: 'Disponible desde el lunes', validezDias: 7,
      descuentoTipo: 'porcentaje', descuentoValor: 10,
      items: mockQuotation.items!.map((item, index) => index === 0 ? { ...item, descuentoTipo: 'fijo', descuentoValor: 10000, subtotal: 55000 } : item),
    }} onClose={onClose} />);
    const portal = document.getElementById('unithor-print-portal')!;
    for (const text of ['BCI', '89938 640', 'BANCO DE CHILE', '1073164200', '77.374.788-1', 'CONTACTO@UNITHOR.CL',
      'Disponible desde el lunes', '7 días corridos', 'Descuentos por ítem', 'Dto. general (10%)', '$63.000']) {
      expect(portal).toHaveTextContent(text);
    }
    expect(portal).not.toHaveTextContent('Débito/Crédito');
    expect(portal).not.toHaveTextContent('IVA (19%)');
  });

  it('pagina los conceptos extensos sin reducir toda la cotización a una sola hoja', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ ...mockQuotation.items![0], id: index + 1, descripcion: `Servicio ${index + 1}: ${'Trabajo de mantenimiento y revisión. '.repeat(5)}` }));
    render(<PdfPreviewModal type="quotation" quotation={{ ...mockQuotation, items, notas: 'Condiciones adicionales. '.repeat(150) }} onClose={onClose} />);
    const portal = document.getElementById('unithor-print-portal')!;
    const sheets = portal.querySelectorAll('[data-quotation-sheet]');
    expect(sheets.length).toBeGreaterThan(3);
    expect(portal.querySelectorAll('tbody tr')).toHaveLength(40);
    expect(sheets[sheets.length - 1]).toHaveTextContent(`Página ${sheets.length} de ${sheets.length}`);
  });

  it('conserva los datos de vehículo cuando la COT tiene uno asociado', () => {
    render(<PdfPreviewModal type="quotation" quotation={mockQuotation} onClose={onClose} />);
    expect(screen.getAllByText('DATOS DEL VEHÍCULO').length).toBeGreaterThan(0);
    expect(document.getElementById('unithor-print-portal')).toHaveTextContent('HG-TR-34');
  });

  it('cierra el modal al presionar el botón X o la tecla Escape', () => {
    render(
      <PdfPreviewModal
        type="work-order"
        workOrder={mockWorkOrder}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('incluye las nueve fotos dentro del anverso de la OT y mantiene solo dos hojas', () => {
    const photos = WORK_ORDER_INSPECTION_PHOTO_SLOTS.map((slot, index) => ({
      id: index + 1, slot, mimeType: 'image/png', sizeBytes: 1024, uploadedBy: 1,
      createdAt: mockWorkOrder.createdAt, updatedAt: mockWorkOrder.updatedAt,
      url: `/api/work-orders/101/inspection/photos/${slot}`,
    }));
    render(<PdfPreviewModal type="work-order" onClose={onClose}
      workOrder={{ ...mockWorkOrder, inspection: { ...mockWorkOrder.inspection!, photos } }} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('img', { name: /^Foto / })).toHaveLength(9);
    expect(within(dialog).queryByRole('button', { name: /Fotos de recepción/ })).not.toBeInTheDocument();
    expect(within(dialog).getAllByText('Página 1 de 2').length).toBeGreaterThanOrEqual(1);

    const printPortal = document.getElementById('unithor-print-portal')!;
    expect(printPortal.querySelectorAll('img[alt^="Foto "]')).toHaveLength(9);
    expect(printPortal.querySelectorAll('.pdf-paper-sheet')).toHaveLength(2);
  });

  it('mantiene el anexo fotográfico separado en la cotización', () => {
    const photos = WORK_ORDER_INSPECTION_PHOTO_SLOTS.map((slot, index) => ({
      id: index + 1, slot, mimeType: 'image/png', sizeBytes: 1024, uploadedBy: 1,
      createdAt: mockWorkOrder.createdAt, updatedAt: mockWorkOrder.updatedAt,
      url: `/api/quotations/202/inspection/photos/${slot}`,
    }));
    render(<PdfPreviewModal type="quotation" onClose={onClose}
      quotation={{ ...mockQuotation, workOrder: { ...mockQuotation.workOrder!, inspectionPhotos: photos } }} />);

    expect(within(screen.getByRole('dialog')).queryAllByRole('img', { name: /^Foto / })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Fotos de recepción (9)' }));
    expect(within(screen.getByRole('dialog')).getAllByRole('img', { name: /^Foto / })).toHaveLength(9);

    const printPortal = document.getElementById('unithor-print-portal')!;
    expect(printPortal.querySelectorAll('img[alt^="Foto "]')).toHaveLength(9);
    expect(printPortal.querySelectorAll('.pdf-paper-sheet')).toHaveLength(2);
  });

  it('mantiene todos los servicios y solo dos hojas en una OT extensa', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      ...mockWorkOrder.items![0],
      id: index + 1,
      descripcion: `Servicio ${index + 1}: ${'Trabajo de mantenimiento y revisión. '.repeat(3)}`,
    }));
    render(<PdfPreviewModal type="work-order" onClose={onClose}
      workOrder={{ ...mockWorkOrder, items }} />);

    const printPortal = document.getElementById('unithor-print-portal')!;
    expect(printPortal.querySelectorAll('.pdf-paper-sheet')).toHaveLength(2);
    expect(printPortal.querySelectorAll('tbody tr')).toHaveLength(40);
  });
});
