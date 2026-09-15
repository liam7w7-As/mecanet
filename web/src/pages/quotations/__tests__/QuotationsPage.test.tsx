import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationDetailPage from '../QuotationDetailPage';
import QuotationsPage from '../QuotationsPage';

import type {
  PaginatedResponse,
  Payment,
  PaymentQuotationSummary,
  Quotation,
  QuotationPaymentSummary,
} from '../../../types/entities';
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

const quotation: Quotation = {
  id: 31,
  codigo: 'COT-2026-0031',
  workOrderId: null,
  clientId: 7,
  vehicleId: 4,
  asesorId: 1,
  estadoPago: 'parcial',
  subtotal: 50000,
  total: 50000,
  pagado: 10000,
  notas: 'Presupuesto válido por 15 días',
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
  client: { id: 7, rut: '123456785', nombre: 'Cliente Demo', telefono: '+56912345678' },
  vehicle: { id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Corolla' },
  asesor: { id: 1, nombre: 'Desarrollador UNITHOR', email: 'dev@unithor.local' },
  workOrder: null,
  items: [{ id: 1, catalogItemId: null, descripcion: 'Cambio de aceite', cantidad: 1, precioUnitario: 50000, subtotal: 50000 }],
};

const linkedQuotation: Quotation = {
  ...quotation,
  id: 32,
  codigo: 'COT-2026-0032',
  workOrderId: 12,
  workOrder: { id: 12, codigo: 'OT-2026-0012', estado: 'borrador' },
};

const listResponse: PaginatedResponse<Quotation> = {
  items: [quotation, linkedQuotation],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const initialPayment: Payment = {
  id: 5,
  quotationId: quotation.id,
  monto: 10000,
  metodo: 'efectivo',
  fecha: '2026-09-15T10:00:00.000Z',
  createdBy: 1,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
  creator: { id: 1, nombre: 'Desarrollador UNITHOR' },
};

const createPaymentSummary = (paid: number, payments = [initialPayment]): QuotationPaymentSummary => ({
  quotationId: quotation.id,
  total: 50000,
  pagado: paid,
  saldoPendiente: 50000 - paid,
  estadoPago: paid >= 50000 ? 'total' : paid > 0 ? 'parcial' : 'por_pagar',
  payments,
});

const renderWithProviders = (children: React.ReactNode, route = '/quotations') => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
};

const renderDetail = (route = `/quotations/${quotation.id}`) => renderWithProviders(
  <Routes><Route path="/quotations/:id" element={<QuotationDetailPage />} /></Routes>,
  route,
);

describe('QuotationsPage', () => {
  let paymentSummary: QuotationPaymentSummary;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentSummary = createPaymentSummary(10000);
    useAuthStore.setState({
      user: { id: 1, nombre: 'Desarrollador UNITHOR', email: 'dev@unithor.local', role: 'desarrollador' },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === `/quotations/${quotation.id}`) {
        return Promise.resolve({ data: { quotation } } as AxiosResponse<{ quotation: Quotation }>);
      }
      if (url === `/quotations/${quotation.id}/payments`) {
        return Promise.resolve({ data: paymentSummary } as AxiosResponse<QuotationPaymentSummary>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<Quotation>>);
    });
  });

  it('renderiza cotizaciones con estado y saldos calculados', async () => {
    renderWithProviders(<QuotationsPage />);

    expect(await screen.findByText('COT-2026-0031')).toBeInTheDocument();
    expect(screen.getAllByText('Abono parcial').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$40.000').length).toBeGreaterThan(0);
    expect(screen.getByText('OT-2026-0012')).toBeInTheDocument();
  });

  it('muestra convertir a OT solamente para cotizaciones no vinculadas', async () => {
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');

    expect(screen.getByRole('button', { name: 'Convertir COT-2026-0031 a OT' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Convertir COT-2026-0032 a OT' })).not.toBeInTheDocument();
  });

  it('actualiza el saldo mostrado después de registrar un abono', async () => {
    const newPayment: Payment = { ...initialPayment, id: 6, monto: 15000 };
    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/payments') {
        paymentSummary = createPaymentSummary(25000, [newPayment, initialPayment]);
        const updatedQuotation: PaymentQuotationSummary = {
          id: quotation.id,
          codigo: quotation.codigo,
          total: 50000,
          pagado: 25000,
          saldoPendiente: 25000,
          estadoPago: 'parcial',
        };
        return Promise.resolve({ data: { payment: newPayment, quotation: updatedQuotation } } as AxiosResponse);
      }
      return Promise.reject(new Error('Endpoint inesperado'));
    });
    renderDetail(`/quotations/${quotation.id}?payment=true`);

    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '15000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

    await waitFor(() => expect(screen.getByTestId('quotation-balance')).toHaveTextContent('25.000'));
    expect(api.post).toHaveBeenCalledWith('/payments', expect.objectContaining({ quotationId: 31, monto: 15000 }));
  });

  it('impide registrar un monto superior al saldo pendiente', async () => {
    renderDetail(`/quotations/${quotation.id}?payment=true`);

    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '45000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('no puede superar el saldo pendiente');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('descarga el reporte comercial como archivo Excel', async () => {
    const excelBlob = new Blob(['xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const createObjectUrl = vi.fn(() => 'blob:commercial-report');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/reports/commercial/excel') {
        return Promise.resolve({ data: excelBlob } as AxiosResponse<Blob>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<Quotation>>);
    });
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/reports/commercial/excel', {
        params: expect.objectContaining({
          fechaDesde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          fechaHasta: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
        responseType: 'blob',
      });
      expect(createObjectUrl).toHaveBeenCalledWith(excelBlob);
      expect(anchorClick).toHaveBeenCalled();
    });
  });
});
