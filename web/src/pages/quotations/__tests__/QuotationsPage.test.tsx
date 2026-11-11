import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const { listExportSpy } = vi.hoisted(() => ({ listExportSpy: vi.fn() }));

vi.mock('../../../components/common/ListExportButtons', () => ({
  default: (props: { target: string; filters: Record<string, unknown>; disabled?: boolean }) => {
    listExportSpy(props);
    return <div data-testid={`list-export-${props.target}`} />;
  },
}));

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
  items: [
    {
      id: 1,
      catalogItemId: null,
      descripcion: 'Cambio de aceite',
      tipoLinea: 'estandar',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 50000,
      subtotal: 50000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
    },
  ],
};

const linkedQuotation: Quotation = {
  ...quotation,
  id: 32,
  codigo: 'COT-2026-0032',
  workOrderId: 12,
  workOrder: { id: 12, codigo: 'OT-2026-0012', estado: 'en_progreso' },
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

const createPaymentSummary = (
  paid: number,
  payments = [initialPayment],
): QuotationPaymentSummary => ({
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

const renderDetail = (route = `/quotations/${quotation.id}`) =>
  renderWithProviders(
    <Routes>
      <Route path="/quotations/:id" element={<QuotationDetailPage />} />
    </Routes>,
    route,
  );

describe('QuotationsPage', () => {
  let paymentSummary: QuotationPaymentSummary;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentSummary = createPaymentSummary(10000);
    useAuthStore.setState({
      user: {
        id: 1,
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      },
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


  it('abre el detalle desde la fila con teclado y mantiene el listado', async () => {
    renderWithProviders(<QuotationsPage />);
    const row = await screen.findByRole('row', { name: 'Cotización COT-2026-0031' });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'COT-2026-0031' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Cotizaciones' })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva el abono, banco, referencia y comprobante al fallar y reintentar', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ data: { payment: initialPayment, quotation: { id: quotation.id } } });
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    await within(dialog).findByTestId('payment-confirmed');
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '5000' } });
    fireEvent.change(within(dialog).getByLabelText('Método de pago'), { target: { value: 'transferencia' } });
    fireEvent.change(within(dialog).getByLabelText('Banco de procedencia'), { target: { value: 'BCI' } });
    fireEvent.change(within(dialog).getByLabelText('Número de transacción'), { target: { value: 'TRX-REINTENTO' } });
    const receipt = new File(['comprobante'], 'pago.pdf', { type: 'application/pdf' });
    fireEvent.change(within(dialog).getByLabelText('Comprobante de pago'), { target: { files: [receipt] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await within(dialog).findByRole('alert');
    expect(within(dialog).getByLabelText('Monto del abono')).toHaveValue('5.000');
    expect(within(dialog).getByLabelText('Número de transacción')).toHaveValue('TRX-REINTENTO');
    expect(within(dialog).getByLabelText('Banco de procedencia')).toHaveValue('BCI');
    expect(within(dialog).getByRole('button', { name: 'Quitar comprobante' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    for (const [, body] of vi.mocked(api.post).mock.calls) {
      expect(body).toBeInstanceOf(FormData);
      const payload = body as FormData;
      expect(payload.get('quotationId')).toBe('31');
      expect(payload.get('monto')).toBe('5000');
      expect(payload.get('bancoOrigen')).toBe('BCI');
      expect(payload.get('numeroTransaccion')).toBe('TRX-REINTENTO');
      expect(payload.get('comprobantePago')).toBe(receipt);
    }
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar abono' })).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: 'Cotizaciones' })).toBeInTheDocument();
  });

  it('confirma antes de descartar un abono y permite quitar el archivo seleccionado', async () => {
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    const receipt = new File(['recibo'], 'recibo.pdf', { type: 'application/pdf' });
    fireEvent.change(within(dialog).getByLabelText('Comprobante de pago'), { target: { files: [receipt] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(within(dialog).getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
    expect(within(dialog).getByText('recibo.pdf', { selector: 'strong' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quitar comprobante' }));
    expect(within(dialog).queryByRole('button', { name: 'Quitar comprobante' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog', { name: 'Registrar abono' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('bloquea cierre y cambios mientras se registra el abono', async () => {
    let complete: () => void = () => { throw new Error('Pago no iniciado'); };
    vi.mocked(api.post).mockImplementation(() => new Promise((resolve) => { complete = () => resolve({ data: { payment: initialPayment, quotation: { id: quotation.id } } } as AxiosResponse); }));
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    await within(dialog).findByTestId('payment-confirmed');
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '1000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByLabelText('Monto del abono')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    await act(async () => { complete(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar abono' })).not.toBeInTheDocument());
  });


  it('oculta el abono en listado y detalle para un usuario comercial de solo lectura', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Bodega', email: 'bodega@demo.cl', role: 'bodeguero' } });
    renderWithProviders(<QuotationsPage />);
    const row = await screen.findByRole('row', { name: 'Cotización COT-2026-0031' });
    expect(screen.queryByRole('button', { name: 'Abonar a COT-2026-0031' })).not.toBeInTheDocument();
    fireEvent.keyDown(row, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'COT-2026-0031' });
    expect(within(dialog).queryByRole('button', { name: 'Registrar Abono' })).not.toBeInTheDocument();
  });

  it('muestra la carga y permite reintentar la apertura del editor del vendedor', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation();
    let attempts = 0;
    let rejectLoad: () => void = () => { throw new Error('Carga no iniciada'); };
    let finishLoad: () => void = () => { throw new Error('Reintento no iniciado'); };
    useAuthStore.setState({
      user: { id: 1, nombre: 'Ventas', email: 'ventas@demo.cl', role: 'vendedor' },
    });
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/quotations/31') {
        attempts += 1;
        return new Promise((resolve, reject) => {
          if (attempts === 1) rejectLoad = () => reject(new Error('Sin conexión'));
          else finishLoad = () => resolve({ data: { quotation } } as AxiosResponse);
        });
      }
      if (url === '/catalog') {
        return Promise.resolve({ data: { items: [], total: 0 } } as AxiosResponse);
      }
      return baseGet?.(url, config) ?? Promise.reject(new Error('GET inesperado'));
    });
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar COT-2026-0031' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar cotización' }));
    expect(dialog.getByRole('status')).toHaveTextContent('Cargando cotización para editar');
    expect(dialog.queryByLabelText('Notas comerciales')).not.toBeInTheDocument();
    expect(attempts).toBe(1);
    await act(async () => { rejectLoad(); });
    expect(await dialog.findByRole('alert')).toHaveTextContent('No fue posible cargar la cotización para editar.');
    fireEvent.click(dialog.getByRole('button', { name: 'Reintentar' }));
    expect(await dialog.findByRole('status')).toHaveTextContent('Cargando cotización para editar');
    expect(dialog.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(attempts).toBe(2);
    await act(async () => { finishLoad(); });
    expect(await screen.findByLabelText('Notas comerciales')).toHaveValue(quotation.notas);
    expect(screen.queryByText('Cargando cotización para editar…')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Cotizaciones' })).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each(['cargando', 'error'] as const)(
    'permite cancelar la apertura del editor en estado %s y restaura el foco',
    async (state) => {
      const baseGet = vi.mocked(api.get).getMockImplementation();
      let finishLoad: () => void = () => { throw new Error('Carga no iniciada'); };
      vi.mocked(api.get).mockImplementation((url, config) => {
        if (url === '/quotations/31') {
          if (state === 'error') return Promise.reject(new Error('Sin conexión'));
          return new Promise((resolve) => {
            finishLoad = () => resolve({ data: { quotation } } as AxiosResponse);
          });
        }
        return baseGet?.(url, config) ?? Promise.reject(new Error('GET inesperado'));
      });
      renderWithProviders(<QuotationsPage />);
      const trigger = await screen.findByRole('button', { name: 'Editar COT-2026-0031' });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = within(screen.getByRole('dialog', { name: 'Editar cotización' }));
      if (state === 'error') await dialog.findByRole('alert');
      else expect(dialog.getByRole('status')).toHaveTextContent('Cargando cotización para editar');
      fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog', { name: 'Editar cotización' })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(document.body.style.overflow).not.toBe('hidden');
      if (state === 'cargando') await act(async () => { finishLoad(); });
      expect(screen.queryByRole('dialog', { name: 'Editar cotización' })).not.toBeInTheDocument();
      expect(api.patch).not.toHaveBeenCalled();
    },
  );

  it('no ofrece editar a un vendedor sin permiso de actualización comercial', async () => {
    useAuthStore.setState({
      user: { id: 9, nombre: 'Consulta', email: 'consulta@demo.cl', role: 'vendedor',
        permissions: [{ modulo: 'comercial', accion: 'read' }] },
    });
    renderWithProviders(<QuotationsPage />);
    await screen.findByText(quotation.codigo);
    expect(screen.queryByRole('button', { name: 'Editar COT-2026-0031' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Editar cotización' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/quotations/31');
  });

  it('mantiene descuentos e identidad de líneas al reintentar una edición fallida', async () => {
    const discounted: Quotation = { ...quotation, descuentoTipo: 'porcentaje', descuentoValor: 10,
      items: quotation.items?.map((item) => ({ ...item, descuentoTipo: 'fijo', descuentoValor: 1000 })) };
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/quotations/31' ? { quotation: discounted } : url === '/catalog' ? { items: [], total: 0 } : listResponse } as AxiosResponse));
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ data: { quotation: discounted } });
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar COT-2026-0031' }));
    await screen.findByLabelText('Notas comerciales');
    const dialog = await screen.findByRole('dialog', { name: 'Editar cotización' });
    fireEvent.change(within(dialog).getByLabelText('Notas comerciales'), { target: { value: 'Conservar condiciones' } });
    expect(within(dialog).getByTestId('quotation-edit-total')).toHaveTextContent('44.100');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await within(dialog).findByRole('alert');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(within(dialog).getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
    expect(within(dialog).getByLabelText('Notas comerciales')).toHaveValue('Conservar condiciones');
    expect(within(dialog).getByLabelText('Descuento general')).toHaveValue(10);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
    expect(api.patch).toHaveBeenLastCalledWith('/quotations/31', expect.objectContaining({
      notas: 'Conservar condiciones', descuentoTipo: 'porcentaje', descuentoValor: 10,
      items: [expect.objectContaining({ id: 1, descuentoTipo: 'fijo', descuentoValor: 1000 })],
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar cotización' })).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: 'Cotizaciones' })).toBeInTheDocument();
  });


  it('conserva el registro de abonos para Finanzas con permiso de creación financiero', async () => {
    useAuthStore.setState({ user: { id: 8, nombre: 'Contabilidad', email: 'finanzas@demo.cl', role: 'finanzas' } });
    renderWithProviders(<QuotationsPage />);
    expect(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva Cotización' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('row', { name: 'Cotización COT-2026-0031' }), { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'COT-2026-0031' });
    expect(within(dialog).getByRole('button', { name: 'Registrar Abono' })).toBeInTheDocument();
  });


  it('protege la anulación en curso y actualiza el saldo al confirmarse', async () => {
    let finish: () => void = () => { throw new Error('Anulación no iniciada'); };
    vi.mocked(api.delete).mockImplementation(() => new Promise((resolve) => { finish = () => {
      paymentSummary = createPaymentSummary(0, []);
      resolve({ data: { message: 'Anulado', quotation: { id: 31, codigo: quotation.codigo, total: 50000, pagado: 0, saldoPendiente: 50000, estadoPago: 'por_pagar' } } } as AxiosResponse);
    }; }));
    renderDetail('/quotations/31');
    fireEvent.click(await screen.findByRole('button', { name: 'Anular pago de $10.000' }));
    const dialog = screen.getByRole('dialog', { name: 'Anular pago' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anular pago' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/payments/5'));
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Anular pago' })).not.toBeInTheDocument());
    expect(screen.getByTestId('quotation-balance')).toHaveTextContent('50.000');
  });

  it('renderiza cotizaciones con estado y saldos calculados', async () => {
    renderWithProviders(<QuotationsPage />);

    expect(await screen.findByText('COT-2026-0031')).toBeInTheDocument();
    expect(screen.getAllByText('Abono parcial').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$40.000').length).toBeGreaterThan(0);
    expect(screen.getByText('OT-2026-0012')).toBeInTheDocument();
  });

  it('muestra numeración y filtra cotizaciones sin OT y archivadas', async () => {
    renderWithProviders(<QuotationsPage />);

    expect(await screen.findByText('COT-2026-0031')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'N°' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/quotations', {
      params: expect.objectContaining({ archiveStatus: 'active' }),
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Sin OT' }));

    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('/quotations', {
        params: expect.objectContaining({ workOrderLinked: false }),
      }),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Archivadas' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('/quotations', {
        params: expect.objectContaining({ archiveStatus: 'archived' }),
      }),
    );
  });

  it('identifica el importe de la página cuando el listado tiene más cotizaciones', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...listResponse, total: 40, totalPages: 2 } });
    renderWithProviders(<QuotationsPage />);

    const total = await screen.findByText(/^Total de esta página/);
    expect(total).toHaveTextContent('100.000');
    expect(screen.queryByText(/^Total cotizado/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('row', { name: /^Cotización / })).toHaveLength(2);
  });

  it('agrupa la patente bajo el cliente y la OT en verde bajo el código COT', async () => {
    renderWithProviders(<QuotationsPage />);
    const code = await screen.findByRole('link', { name: linkedQuotation.codigo });
    const codeCell = code.closest('td')!;
    const order = within(codeCell).getByRole('link', { name: 'OT-2026-0012' });
    expect(order).toHaveAttribute('href', '/work-orders/12');
    expect(order).toHaveClass('text-emerald-700');
    const row = code.closest('tr')!;
    const clientCell = within(row).getByText('Cliente Demo').closest('td')!;
    expect(within(clientCell).getByText('123456785')).toBeInTheDocument();
    expect(within(clientCell).getByText('ABCD12')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Vehículo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'OT asociada' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
  });

  it('no muestra datos de vehículo ni etiquetas de OT para una venta de repuestos independiente', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {
      ...listResponse, items: [{ ...quotation, vehicleId: null, vehicle: null }], total: 1,
    } });
    renderWithProviders(<QuotationsPage />);
    const row = (await screen.findByText(quotation.codigo)).closest('tr')!;
    expect(within(row).queryByText('S/V')).not.toBeInTheDocument();
    expect(within(row).queryByText('Sin datos')).not.toBeInTheDocument();
    expect(within(row).queryByText('COT sin OT')).not.toBeInTheDocument();
    expect(within(row).queryByText('ABCD12')).not.toBeInTheDocument();
    expect(within(row).getAllByRole('cell')).toHaveLength(9);
  });

  it('resalta en amarillo las COT sin OT y en naranja las OT sin actividad', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const oldUnlinked: Quotation = { ...quotation, estadoPago: 'por_pagar', pagado: 0, createdAt: eightDaysAgo, updatedAt: eightDaysAgo };
    const oldLinked: Quotation = { ...linkedQuotation, updatedAt: eightDaysAgo, workOrder: { ...linkedQuotation.workOrder!, updatedAt: eightDaysAgo } };
    vi.mocked(api.get).mockResolvedValue({ data: { ...listResponse, items: [oldUnlinked, oldLinked] } });
    renderWithProviders(<QuotationsPage />);

    const unlinkedWarning = await screen.findByText('Sin OT: 8 días');
    const linkedWarning = screen.getByText('OT sin actividad: 8 días');
    expect(unlinkedWarning.closest('tr')).toHaveClass('bg-yellow-50/80');
    expect(linkedWarning.closest('tr')).toHaveClass('bg-orange-50/80');
  });

  it('muestra convertir a OT solamente para cotizaciones no vinculadas', async () => {
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');

    expect(
      screen.getByRole('button', { name: 'Convertir COT-2026-0031 a OT' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Convertir COT-2026-0032 a OT' }),
    ).not.toBeInTheDocument();
  });

  it('abre el modal de abono directamente en la vista de cotizaciones sin redirigir', async () => {
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');

    expect(
      screen.queryByRole('link', { name: 'Ver y registrar pago de COT-2026-0031' }),
    ).not.toBeInTheDocument();

    const payButton = screen.getByRole('button', { name: 'Abonar a COT-2026-0031' });
    fireEvent.click(payButton);

    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('COT-2026-0031')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByLabelText('Número de transacción')).toBeVisible();
      expect(within(dialog).getByLabelText('Comprobante de pago')).toBeVisible();
    });
    expect(dialog.querySelector('input[type="datetime-local"]')).toBeNull();
    const date = dialog.querySelector('time')?.getAttribute('datetime');
    expect(date).toBeTruthy();
    expect(Math.abs(new Date(date ?? '').getTime() - Date.now())).toBeLessThan(60_000);
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
        return Promise.resolve({
          data: { payment: newPayment, quotation: updatedQuotation },
        } as AxiosResponse);
      }
      return Promise.reject(new Error('Endpoint inesperado'));
    });
    renderDetail(`/quotations/${quotation.id}?payment=true`);

    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), {
      target: { value: '15000' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

    await waitFor(() =>
      expect(screen.getByTestId('quotation-balance')).toHaveTextContent('25.000'),
    );
    expect(api.post).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({ quotationId: 31, monto: 15000 }),
    );
    const payload = vi.mocked(api.post).mock.calls.at(-1)?.[1] as { fecha: string };
    expect(Math.abs(new Date(payload.fecha).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('archiva desde la tabla con confirmación y actualiza el listado', async () => {
    let archivedAt: string | null = null;
    const unpaid = { ...quotation, pagado: 0, estadoPago: 'por_pagar' as const, createdAt: new Date().toISOString() };
    vi.mocked(api.get).mockImplementation((_url, config) => Promise.resolve({ data: {
      ...listResponse,
      items: (config?.params as { archiveStatus?: string } | undefined)?.archiveStatus === 'archived'
        ? archivedAt ? [{ ...unpaid, archivedAt }] : []
        : archivedAt ? [] : [unpaid],
    } }));
    vi.mocked(api.patch).mockImplementation(() => {
      archivedAt = new Date().toISOString();
      return Promise.resolve({ data: { quotation: { ...unpaid, archivedAt } } });
    });
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archivar COT-2026-0031' }));
    const paymentStatus = within(screen.getByText(unpaid.codigo).closest('tr')!).getByText('Por pagar');
    expect(paymentStatus).toHaveClass('text-brand-muted');
    expect(paymentStatus.className).not.toMatch(/bg-|ring-/);
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar archivo' }));
    await waitFor(() => expect(screen.queryByText('COT-2026-0031')).not.toBeInTheDocument());
    expect(api.patch).toHaveBeenCalledWith('/quotations/31/archive');
    fireEvent.click(screen.getByRole('tab', { name: 'Archivadas' }));
    expect(await screen.findByText('Archivada manualmente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archivar COT-2026-0031' })).not.toBeInTheDocument();
  });

  it('desarchiva desde Archivadas con confirmación y vuelve al listado activo', async () => {
    let archivedAt: string | null = new Date().toISOString();
    const manual = { ...quotation, pagado: 0, estadoPago: 'por_pagar' as const, createdAt: new Date().toISOString() };
    vi.mocked(api.get).mockImplementation((_url, config) => Promise.resolve({ data: {
      ...listResponse,
      items: (config?.params as { archiveStatus?: string } | undefined)?.archiveStatus === 'archived'
        ? archivedAt ? [{ ...manual, archivedAt }] : []
        : archivedAt ? [] : [{ ...manual, archivedAt: null }],
    } }));
    vi.mocked(api.patch).mockImplementation(() => {
      archivedAt = null;
      return Promise.resolve({ data: { quotation: { ...manual, archivedAt: null } } });
    });
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Archivadas' }));
    expect(await screen.findByText('Archivada manualmente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archivar COT-2026-0031' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Desarchivar COT-2026-0031' }));
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desarchivo' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/quotations/31/unarchive'));
    await waitFor(() => expect(screen.queryByText('Archivada manualmente')).not.toBeInTheDocument());
  });

  it('conserva estilo de Abono parcial y no permite archivar con abonos u OT', async () => {
    renderWithProviders(<QuotationsPage />);
    await screen.findByText(quotation.codigo);
    expect(screen.queryByRole('button', { name: /^Archivar COT/ })).not.toBeInTheDocument();
    const cell = within(screen.getByText(quotation.codigo).closest('tr')!).getByText('Abono parcial');
    expect(cell).toHaveClass('bg-brand-pale');
  });

  it('no ofrece tarjeta en el método de pago del modal de abono', async () => {
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    const select = within(dialog).getByLabelText('Método de pago') as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll('option')).map((option) => option.value);
    expect(values).toEqual(['efectivo', 'transferencia', 'cheque', 'otro']);
  });

  it('envía el banco, el número y una foto del comprobante para un abono con transferencia', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {
      payment: { ...initialPayment, metodo: 'transferencia' },
      quotation: { id: quotation.id, codigo: quotation.codigo, total: 50000, pagado: 22000, saldoPendiente: 28000, estadoPago: 'parcial' },
    } });
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '12000' } });
    fireEvent.change(within(dialog).getByLabelText('Método de pago'), { target: { value: 'transferencia' } });
    fireEvent.change(within(dialog).getByLabelText('Banco de procedencia'), { target: { value: 'Banco Santander' } });
    fireEvent.change(within(dialog).getByLabelText('Número de transacción'), { target: { value: 'TRANSF-001' } });
    const file = new File(['image'], 'comprobante.jpg', { type: 'image/jpeg' });
    fireEvent.change(within(dialog).getByLabelText('Comprobante de pago'), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/payments', expect.any(FormData)));
    const payload = vi.mocked(api.post).mock.calls.at(-1)?.[1] as FormData;
    expect(payload.get('numeroTransaccion')).toBe('TRANSF-001');
    expect(payload.get('comprobantePago')).toBe(file);
    expect(payload.get('metodo')).toBe('transferencia');
    expect(payload.get('bancoOrigen')).toBe('Banco Santander');
  });

  it('distingue los trabajos terminados de los pendientes y calcula el saldo del nuevo abono', async () => {
    const detailed: Quotation = { ...quotation, items: [
      { ...quotation.items![0], id: 101, descripcion: 'Servicio terminado', subtotal: 20000, precioUnitario: 20000, estadoOperativo: 'completado' },
      { ...quotation.items![0], id: 102, descripcion: 'Repuesto instalado', tipoLinea: 'parte', subtotal: 10000, precioUnitario: 10000, estadoOperativo: 'completado' },
      { ...quotation.items![0], id: 103, descripcion: 'Trabajo en espera', subtotal: 20000, precioUnitario: 20000, estadoOperativo: 'pendiente' },
    ] };
    const originalGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === `/quotations/${quotation.id}`
      ? Promise.resolve({ data: { quotation: detailed } }) : originalGet(url, config));
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    const completed = await within(dialog).findByRole('list', { name: 'Trabajos completados' });
    expect(within(completed).getByText('Servicio terminado')).toBeVisible();
    expect(within(completed).getByText('Repuesto instalado')).toBeVisible();
    expect(within(completed).queryByText('Trabajo en espera')).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('payment-completed-total')).toHaveTextContent('30.000');
    expect(within(dialog).getByTestId('payment-confirmed')).toHaveTextContent('10.000');
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '15000' } });
    expect(within(dialog).getByTestId('payment-projected-balance')).toHaveTextContent('25.000');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Completar saldo' }));
    expect(within(dialog).getByLabelText('Monto del abono')).toHaveValue('40.000');
    expect(within(dialog).getByTestId('payment-projected-balance')).toHaveTextContent('$0');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('descuenta los abonos en verificación del disponible sin contarlos como pagos confirmados', async () => {
    paymentSummary = createPaymentSummary(10000, [initialPayment, { ...initialPayment, id: 18, monto: 12000, metodo: 'transferencia', estado: 'por_verificar' }]);
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    await within(dialog).findByText('Abonos en verificación');
    expect(within(dialog).getByTestId('payment-confirmed')).toHaveTextContent('10.000');
    expect(within(dialog).getByTestId('payment-available-balance')).toHaveTextContent('28.000');
    expect(within(dialog).getByText('Aún no hay trabajos marcados como terminados.')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Completar saldo' }));
    expect(within(dialog).getByLabelText('Monto del abono')).toHaveValue('28.000');
    expect(within(dialog).getByTestId('payment-projected-balance')).toHaveTextContent('12.000');
    fireEvent.change(within(dialog).getByLabelText('Método de pago'), { target: { value: 'transferencia' } });
    expect(within(dialog).getByText('Saldo al confirmar esta transferencia')).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '30000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('28.000');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('impide registrar el abono cuando no se pudo obtener el saldo actualizado', async () => {
    const originalGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === `/quotations/${quotation.id}/payments`
      ? Promise.reject(new Error('Sin conexión')) : originalGet(url, config));
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('saldo actualizado');
    expect(within(dialog).getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  it('permite cambiar la fecha precargada cuando el abono corresponde a otro momento', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {
      payment: initialPayment,
      quotation: { id: quotation.id, codigo: quotation.codigo, total: 50000, pagado: 20000, saldoPendiente: 30000, estadoPago: 'parcial' },
    } });
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cambiar fecha del abono' }));
    fireEvent.change(within(dialog).getByLabelText('Fecha del abono'), { target: { value: '2026-09-18T11:30' } });
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), { target: { value: '10000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/payments', expect.objectContaining({
      fecha: new Date('2026-09-18T11:30').toISOString(),
    })));
  });

  it('envía datos de transferencia con banco, número y comprobante', async () => {
    const transferPayment: Payment = {
      ...initialPayment,
      id: 7,
      monto: 12000,
      metodo: 'transferencia',
      estado: 'por_verificar',
      bancoOrigen: 'Banco Santander',
      numeroTransaccion: 'TRX-WEB-001',
      comprobantePago: 'comprobante-web.pdf',
    };
    vi.mocked(api.post).mockResolvedValue({
      data: {
        payment: transferPayment,
        quotation: {
          id: quotation.id,
          codigo: quotation.codigo,
          total: 50000,
          pagado: 10000,
          saldoPendiente: 40000,
          estadoPago: 'por_verificar',
        },
      },
    } as AxiosResponse);
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');

    fireEvent.click(screen.getByRole('button', { name: 'Abonar a COT-2026-0031' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), {
      target: { value: '12000' },
    });
    fireEvent.change(within(dialog).getByLabelText('Método de pago'), {
      target: { value: 'transferencia' },
    });
    fireEvent.change(within(dialog).getByLabelText('Banco de procedencia'), {
      target: { value: 'Banco Santander' },
    });
    fireEvent.change(within(dialog).getByLabelText('Número de transacción'), {
      target: { value: 'TRX-WEB-001' },
    });
    const file = new File(['pdf'], 'comprobante-web.pdf', { type: 'application/pdf' });
    fireEvent.change(within(dialog).getByLabelText('Comprobante de pago'), {
      target: { files: [file] },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/payments', expect.any(FormData)));

    const payload = vi.mocked(api.post).mock.calls.at(-1)?.[1];
    expect(payload).toBeInstanceOf(FormData);
    const formData = payload as FormData;
    expect(formData.get('quotationId')).toBe('31');
    expect(formData.get('monto')).toBe('12000');
    expect(formData.get('metodo')).toBe('transferencia');
    expect(formData.get('bancoOrigen')).toBe('Banco Santander');
    expect(formData.get('numeroTransaccion')).toBe('TRX-WEB-001');
    expect(formData.get('comprobantePago')).toBe(file);
  });

  it('impide registrar un monto superior al saldo pendiente', async () => {
    renderDetail(`/quotations/${quotation.id}?payment=true`);

    const dialog = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.change(within(dialog).getByLabelText('Monto del abono'), {
      target: { value: '45000' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'no puede superar el saldo pendiente',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([
    ['Todas', { estadoPago: undefined, workOrderLinked: undefined, archiveStatus: 'active' }],
    ['Sin OT', { estadoPago: undefined, workOrderLinked: false, archiveStatus: 'active' }],
    ['Archivadas', { estadoPago: undefined, workOrderLinked: undefined, archiveStatus: 'archived' }],
    ['Abono parcial', { estadoPago: 'parcial', workOrderLinked: undefined, archiveStatus: 'active' }],
  ] as const)('comparte los filtros exactos de %s con la exportación sin recurrir al reporte comercial', async (tab, statusFilters) => {
    useAuthStore.setState((state) => ({ user: { ...state.user!, role: 'vendedor', permissions: [
      { modulo: 'comercial', accion: 'read' }, { modulo: 'comercial', accion: 'export' },
    ] } }));
    vi.mocked(api.get).mockResolvedValue({ data: { ...listResponse, total: 45, totalPages: 3 } });
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');
    expect(screen.queryByRole('link', { name: 'Nueva Cotización' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('list-export-quotations')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Exportar Excel' })).not.toBeInTheDocument();
    expect(listExportSpy.mock.lastCall?.[0].filters).toMatchObject({
      fechaDesde: undefined, fechaHasta: undefined,
    });
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    fireEvent.click(screen.getByRole('button', { name: 'Fecha de emisión' }));
    fireEvent.change(screen.getByLabelText('Fecha desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Fecha hasta'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    fireEvent.change(screen.getByLabelText('Buscar cotizaciones'), { target: { value: 'Cliente' } });
    expect(listExportSpy.mock.lastCall?.[0].filters.search).toBeUndefined();
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/quotations', {
      params: expect.objectContaining({ search: 'Cliente' }),
    }));
    fireEvent.change(screen.getByLabelText('Seleccionar página'), { target: { value: '2' } });
    await waitFor(() => {
      const props = listExportSpy.mock.lastCall?.[0];
      expect(props).toMatchObject({ target: 'quotations', disabled: false });
      expect(props.filters).toEqual({ page: 2, pageSize: 20, search: 'Cliente',
        fechaDesde: '2026-09-01', fechaHasta: '2026-10-31', ...statusFilters,
      });
      expect(props.filters).toEqual(vi.mocked(api.get).mock.lastCall?.[1]?.params);
    });
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/reports/commercial/excel')).toBe(false);
  });
  it('aplica un rango válido y bloquea fechas invertidas sin consultar ese rango', async () => {
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');
    fireEvent.click(screen.getByRole('button', { name: 'Fecha de emisión' }));
    fireEvent.change(screen.getByLabelText('Fecha desde'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Fecha hasta'), { target: { value: '2026-11-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha final debe ser igual o posterior');
    expect(listExportSpy.mock.lastCall?.[0].filters).toMatchObject({ fechaDesde: undefined, fechaHasta: undefined });
    expect(api.get).not.toHaveBeenCalledWith('/quotations', { params: expect.objectContaining({ fechaDesde: '2026-11-10' }) });
    fireEvent.change(screen.getByLabelText('Fecha desde'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/quotations', { params: expect.objectContaining({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-02', page: 1 }) }));
    expect(screen.queryByLabelText('Fecha desde')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro de fechas' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/quotations', { params: expect.objectContaining({ fechaDesde: undefined, fechaHasta: undefined }) }));
  });

  it('deshabilita la exportación de COT mientras carga y cuando falla el listado', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Sin conexión'));
    renderWithProviders(<QuotationsPage />);
    expect(listExportSpy.mock.lastCall?.[0].disabled).toBe(true);
    await screen.findByRole('alert');
    expect(listExportSpy.mock.lastCall?.[0].disabled).toBe(true);
  });

  it('descarta fechas sin aplicar al cerrar el desplegable y devuelve el foco', async () => {
    renderWithProviders(<QuotationsPage />);
    await screen.findByText('COT-2026-0031');
    const trigger = screen.getByRole('button', { name: 'Fecha de emisión' });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText('Fecha desde'), { target: { value: '2026-10-01' } });
    fireEvent.keyDown(screen.getByLabelText('Fecha desde'), { key: 'Escape' });
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByLabelText('Fecha desde')).toHaveValue('');
    expect(api.get).not.toHaveBeenCalledWith('/quotations', { params: expect.objectContaining({ fechaDesde: '2026-10-01' }) });
  });

  it('abre el código en un modal y conserva la ruta del listado', async () => {
    renderWithProviders(<QuotationsPage />);
    fireEvent.click(await screen.findByRole('link', { name: 'COT-2026-0031' }));
    expect(await screen.findByRole('dialog', { name: 'COT-2026-0031' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Cotizaciones' })).toBeInTheDocument();
  });

});
