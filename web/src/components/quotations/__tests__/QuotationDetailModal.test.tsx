import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationDetailModal from '../QuotationDetailModal';

import type { Quotation, QuotationPaymentSummary } from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const mockQuotation: Quotation = {
  id: 42,
  codigo: 'COT-2026-0042',
  workOrderId: 15,
  clientId: 3,
  vehicleId: 8,
  asesorId: 1,
  estadoPago: 'parcial',
  subtotal: 150000,
  total: 150000,
  pagado: 50000,
  notas: 'Cotización con servicios y repuestos',
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
  client: { id: 3, rut: '11223344-5', nombre: 'Transportes Rápidos', telefono: '+56987654321' },
  vehicle: { id: 8, patente: 'KJHG77', marca: 'Nissan', modelo: 'Navara' },
  asesor: { id: 1, nombre: 'Jefe Taller UNITHOR', email: 'jefe@unithor.local' },
  workOrder: { id: 15, codigo: 'OT-2026-0015', estado: 'en_progreso' },
  items: [
    {
      id: 1,
      catalogItemId: 10,
      descripcion: 'Mantenimiento preventivo 40.000km',
      tipoLinea: 'estandar',
      unidadMedida: 'servicio',
      cantidad: 1,
      precioUnitario: 80000,
      subtotal: 80000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
      catalogItem: { id: 10, tipo: 'estandar', codigo: 'SRV-01', nombre: 'Mantenimiento' },
    },
    {
      id: 2,
      catalogItemId: 20,
      descripcion: 'Pastillas de freno delanteras cerámicas',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 45000,
      subtotal: 45000,
      estadoOperativo: 'completado',
      notasOperativas: null,
      catalogItem: { id: 20, tipo: 'parte', codigo: 'REP-05', nombre: 'Pastillas' },
    },
    {
      id: 3,
      catalogItemId: null,
      descripcion: 'Líquido de frenos DOT4 adicional',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 25000,
      subtotal: 25000,
      estadoOperativo: 'pendiente',
      notasOperativas: '[Sugerido: Pendiente] Nivel crítico detectado en inspección técnica',
      catalogItem: { id: 30, tipo: 'parte', codigo: 'REP-09', nombre: 'Líquido DOT4' },
    },
  ],
};

const mockPaymentSummary: QuotationPaymentSummary = {
  quotationId: 42,
  total: 150000,
  pagado: 50000,
  saldoPendiente: 100000,
  estadoPago: 'parcial',
  payments: [],
};

const renderModal = (props: { quotationId?: number; onClose?: () => void } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuotationDetailModal
          quotationId={props.quotationId ?? 42}
          onClose={props.onClose ?? vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('QuotationDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, nombre: 'Jefe Taller UNITHOR', email: 'jefe@unithor.local', role: 'jefe' },
      isAuthenticated: true,
      isLoading: false,
    });

    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/quotations/42') {
        return Promise.resolve({ data: { quotation: mockQuotation } } as AxiosResponse);
      }
      if (url === '/quotations/42/payments') {
        return Promise.resolve({ data: mockPaymentSummary } as AxiosResponse);
      }
      if (url === '/catalog') {
        return Promise.resolve({ data: { items: [], total: 0 } } as AxiosResponse);
      }
      return Promise.reject(new Error(`Unhandled GET: ${url}`));
    });

    vi.mocked(api.patch).mockResolvedValue({
      data: { quotation: mockQuotation },
    } as AxiosResponse);
  });

  it('renderiza cabecera, datos de cliente/vehículo y categorías de conceptos', async () => {
    renderModal();

    expect(await screen.findByText('COT-2026-0042')).toBeInTheDocument();
    expect(screen.getByText('Transportes Rápidos')).toBeInTheDocument();
    expect(screen.getByText('KJHG77')).toBeInTheDocument();
    expect(screen.getByText('OT · OT-2026-0015')).toBeInTheDocument();

    // Categorías
    expect(screen.getByRole('button', { name: /Servicios Estándar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Repuestos y Accesorios/i })).toBeInTheDocument();
  });

  it('permite alternar el check de entrega / aplicado al vehículo', async () => {
    renderModal();
    await screen.findByText('COT-2026-0042');

    // Find the delivery check button for the first item (Mantenimiento preventivo)
    const checkButtons = screen.getAllByTitle(/Marcar como aplicado/i);
    expect(checkButtons.length).toBeGreaterThan(0);

    fireEvent.click(checkButtons[0]);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/quotations/42',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Mantenimiento preventivo 40.000km',
              estadoOperativo: 'completado',
            }),
          ]),
        }),
      );
    });
  });

  it('permite al Jefe de Taller ajustar el precio de un servicio', async () => {
    renderModal();
    await screen.findByText('COT-2026-0042');

    // Find the edit price button on the service
    const editPriceButtons = screen.getAllByTitle(/Ajustar precio de servicio/i);
    expect(editPriceButtons.length).toBeGreaterThan(0);

    fireEvent.click(editPriceButtons[0]);

    // Input appears
    const priceInput = screen.getByDisplayValue('80.000');
    fireEvent.change(priceInput, { target: { value: '95000' } });

    // Save
    const saveButton = screen.getByTitle('Guardar precio');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/quotations/42',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Mantenimiento preventivo 40.000km',
              precioUnitario: 95000,
            }),
          ]),
        }),
      );
    });
  });

  it('muestra concepto sugerido por taller y permite registrar aprobación del cliente', async () => {
    renderModal();
    await screen.findByText('COT-2026-0042');

    // Concepto sugerido
    expect(screen.getByText('Pendiente Aprobación Cliente')).toBeInTheDocument();

    // Click Aprobar
    const approveButton = screen.getByRole('button', { name: /Aprobar/i });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/quotations/42',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Líquido de frenos DOT4 adicional',
              notasOperativas: expect.stringContaining('[Sugerido: Aprobado]'),
            }),
          ]),
        }),
      );
    });
  });
});
