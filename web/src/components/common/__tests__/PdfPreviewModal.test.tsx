import { fireEvent, render, screen } from '@testing-library/react';
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
      cantidad: 1,
      precioUnitario: 15000,
      subtotal: 15000,
      estadoOperativo: 'completado',
      notasOperativas: null,
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

  it('ejecuta window.print() al pulsar Imprimir', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    render(
      <PdfPreviewModal
        type="work-order"
        workOrder={mockWorkOrder}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Imprimir/i }));
    expect(printSpy).toHaveBeenCalled();
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
    expect(screen.getAllByText('COTIZACIÓN COMERCIAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Según OT: OT-2026-0101').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Valores válidos por 15 días/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Página 1 de 1').length).toBeGreaterThanOrEqual(1);
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
});
