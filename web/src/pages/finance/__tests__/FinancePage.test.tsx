import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ListExportButtons from '../../../components/common/ListExportButtons';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import FinancePage from '../FinancePage';

import type {
  DailyCashSummary,
  FinanceSummary,
  FinancialAnalytics,
} from '../../../hooks/useFinance';
import type { AxiosResponse } from 'axios';

vi.mock('../../../components/common/ListExportButtons', () => ({
  default: vi.fn(({ target, disabled }: { target: string; disabled?: boolean }) => (
    <button type="button" data-testid={`export-${target}`} disabled={disabled}>Exportar {target}</button>
  )),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const summary: FinanceSummary = {
  metrics: {
    revenueToday: 125000,
    revenueMonth: 1450000,
    expensesToday: 15000,
    expensesMonth: 95000,
    netCashToday: 110000,
    receivableTotal: 320000,
    receivableCount: 3,
    pendingTransferCount: 1,
    pendingTransferAmount: 75000,
  },
  pendingTransfers: [
    {
      id: 91,
      quotationId: 31,
      monto: 75000,
      metodo: 'transferencia',
      estado: 'por_verificar',
      referencia: 'TRX-0091',
      bancoOrigen: 'Banco de Chile',
      numeroTransaccion: '0091',
      comprobantePago: 'payment-receipts/transferencia-91.jpg',
      fecha: '2026-09-21T12:00:00.000Z',
      createdBy: 1,
      createdAt: '2026-09-21T12:00:00.000Z',
      updatedAt: '2026-09-21T12:00:00.000Z',
      creator: { id: 1, nombre: 'Vendedor Demo' },
      quotation: {
        id: 31,
        codigo: 'COT-2026-0031',
        total: 150000,
        client: { id: 8, nombre: 'Cliente Demo' },
      },
    },
  ],
  recentPayments: [],
  pendingQuotations: [
    {
      id: 31,
      codigo: 'COT-2026-0031',
      total: 150000,
      pagado: 0,
      saldoPendiente: 150000,
      estadoPago: 'por_verificar',
      client: { id: 8, nombre: 'Cliente Demo' },
    },
  ],
};

const analytics: FinancialAnalytics = {
  period: {
    fechaDesde: '2026-09-01',
    fechaHasta: '2026-09-23',
    previousFechaDesde: '2026-08-09',
    previousFechaHasta: '2026-08-31',
    days: 23,
    agruparPor: 'dia',
  },
  kpis: {
    grossSales: 2400000,
    collected: 1450000,
    manualIncome: 20000,
    expenses: 95000,
    netCash: 1375000,
    receivable: 950000,
    averageTicket: 600000,
    quotationCount: 4,
    paidQuotationCount: 2,
    workOrderConversionCount: 3,
    collectionRate: 60.42,
    conversionRate: 75,
  },
  comparison: {
    grossSales: { previous: 2000000, variationPercent: 20 },
    collected: { previous: 1200000, variationPercent: 20.83 },
    expenses: { previous: 100000, variationPercent: -5 },
    netCash: { previous: 1100000, variationPercent: 25 },
  },
  topSellers: [
    {
      id: 7,
      nombre: 'Ana Vendedora',
      quotationCount: 4,
      grossSales: 2400000,
      collected: 1450000,
      averageTicket: 600000,
    },
  ],
  topItems: [
    {
      catalogItemId: 5,
      codigo: 'REP-001',
      nombre: 'Pastillas de freno',
      tipo: 'parte',
      quantity: 8,
      revenue: 320000,
    },
  ],
  topClients: [
    {
      id: 8,
      nombre: 'Cliente Demo',
      rut: '76543210K',
      quotationCount: 4,
      grossSales: 2400000,
      collected: 1450000,
      receivable: 950000,
    },
  ],
  paymentMethods: [{ metodo: 'transferencia', count: 3, amount: 1450000, share: 100 }],
  quotationStatuses: [{ estado: 'parcial', count: 4, amount: 2400000, share: 100 }],
  movementCategories: [
    {
      categoria: 'gasto_operativo',
      tipo: 'egreso',
      count: 2,
      amount: 95000,
    },
  ],
  trend: [
    {
      key: '2026-09-23',
      label: '23 sep',
      grossSales: 2400000,
      collected: 1450000,
      manualIncome: 20000,
      expenses: 95000,
      netCash: 1375000,
    },
  ],
  filterOptions: {
    advisors: [{ id: 7, nombre: 'Ana Vendedora' }],
    clients: [{ id: 8, nombre: 'Cliente Demo', rut: '76543210K' }],
  },
};
const dailySummary: DailyCashSummary = {
  fecha: new Date().toISOString().slice(0, 10),
  isClosed: false,
  totals: {
    confirmedTotal: 125000,
    manualIncomeTotal: 20000,
    expenseTotal: 15000,
    netTotal: 130000,
    expectedCash: 55000,
    pendingTransferCount: 0,
    pendingTransferAmount: 0,
    byMethod: {
      efectivo: 50000,
      transferencia: 25000,
      tarjeta_debito: 50000,
      tarjeta_credito: 0,
      cheque: 0,
      otro: 0,
    },
    manualIncomeByMethod: {
      efectivo: 20000,
      transferencia: 0,
      tarjeta_debito: 0,
      tarjeta_credito: 0,
      cheque: 0,
      otro: 0,
    },
    expenseByMethod: {
      efectivo: 15000,
      transferencia: 0,
      tarjeta_debito: 0,
      tarjeta_credito: 0,
      cheque: 0,
      otro: 0,
    },
  },
  closure: null,
};

const renderPage = (route = '/finance') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <FinancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const exportProps = (target: string) => vi.mocked(ListExportButtons).mock.calls
  .filter(([props]) => props.target === target).at(-1)![0];

describe('FinancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, nombre: 'Finanzas Demo', email: 'finanzas@unithor.local', role: 'finanzas' },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation((url) =>
      Promise.resolve({
        data:
          url === '/payments'
            ? {
                items: summary.pendingTransfers,
                total: summary.pendingTransfers.length,
                page: 1,
                pageSize: 20,
                totalPages: 1,
              }
            : url === '/finance/day'
              ? dailySummary
              : url === '/finance/movements'
                ? { items: [] }
                : url === '/finance/analytics'
                  ? analytics
                  : summary,
      } as AxiosResponse),
    );
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        payment: { ...summary.pendingTransfers[0], estado: 'confirmado' },
        quotation: {
          id: 31,
          codigo: 'COT-2026-0031',
          total: 150000,
          pagado: 75000,
          saldoPendiente: 75000,
          estadoPago: 'parcial',
        },
      },
    } as AxiosResponse);
    vi.mocked(api.post).mockImplementation((url) =>
      Promise.resolve({
        data:
          url === '/finance/movements'
            ? {
                movement: {
                  id: 10,
                  tipo: 'egreso',
                  categoria: 'gasto_operativo',
                  monto: 5000,
                  metodo: 'efectivo',
                  descripcion: 'Compra de útiles',
                  referencia: null,
                  fecha: '2026-09-22T12:00:00.000Z',
                  createdBy: 1,
                  voidedAt: null,
                  voidedBy: null,
                  voidReason: null,
                  createdAt: '2026-09-22T12:00:00.000Z',
                  creator: { id: 1, nombre: 'Finanzas Demo' },
                  voider: null,
                },
              }
            : {
                ...dailySummary,
                isClosed: true,
                closure: {
                  id: 1,
                  fecha: dailySummary.fecha,
                  totalesPorMetodo: dailySummary.totals.byMethod,
                  totalConfirmado: 125000,
                  totalIngresosManuales: 20000,
                  totalEgresos: 15000,
                  totalNeto: 130000,
                  efectivoEsperado: 55000,
                  efectivoDeclarado: 55000,
                  diferenciaEfectivo: 0,
                  observaciones: null,
                  closedBy: 1,
                  closedAt: '2026-09-22T18:00:00.000Z',
                  closer: { id: 1, nombre: 'Finanzas Demo' },
                },
              },
      } as AxiosResponse),
    );
  });

  it('renderiza métricas y transferencias pendientes', async () => {
    renderPage();
    expect(await screen.findByText('Finanzas y Contabilidad')).toBeInTheDocument();
    expect((await screen.findAllByText('$1.450.000')).length).toBeGreaterThan(0);
    expect(screen.getByText('TRX-0091')).toBeInTheDocument();
    expect(screen.getAllByText('COT-2026-0031').length).toBeGreaterThan(0);
    expect(api.get).not.toHaveBeenCalledWith('/finance/analytics', expect.anything());
  });

  it('permite confirmar una transferencia pendiente', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/payments/91/verify', {
        decision: 'aprobar',
        comentario: undefined,
      }),
    );
  });

  it('permite ampliar los indicadores secundarios sin perder el listado de abonos', async () => {
    renderPage();
    await screen.findByText('TRX-0091');
    expect(screen.queryByText('Recaudación de hoy')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Más indicadores' }));
    expect(screen.getByText('Recaudación de hoy')).toBeInTheDocument();
    expect(screen.getByText('Egresos de hoy')).toBeInTheDocument();
    expect(screen.getByText('Transferencias pendientes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Menos indicadores' }));
    expect(screen.getByText('TRX-0091')).toBeInTheDocument();
    expect(screen.queryByText('Recaudación de hoy')).not.toBeInTheDocument();
  });

  it('permite abrir el comprobante pendiente sin aprobar ni abandonar finanzas', async () => {
    renderPage();
    const receipt = await screen.findByRole('link', { name: 'Ver comprobante' });
    expect(receipt).toHaveAttribute('href', '/api/payments/91/receipt');
    expect(receipt).toHaveAttribute('target', '_blank');
    expect(receipt).toHaveAttribute('rel', 'noopener noreferrer');
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(['Aprobar', 'Rechazar'])(
    'muestra banco, transacción y comprobante al %s',
    async (action) => {
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: action }));
      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByText('Banco de procedencia')).toBeInTheDocument();
      expect(dialog.getByText('Banco de Chile')).toBeInTheDocument();
      expect(dialog.getByText('0091')).toBeInTheDocument();
      expect(dialog.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute(
        'href',
        '/api/payments/91/receipt',
      );
      expect(api.patch).not.toHaveBeenCalled();
    },
  );

  it('indica cuando el pago pendiente no tiene comprobante adjunto', async () => {
    const get = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) =>
      url === '/finance/summary'
        ? Promise.resolve({
            data: {
              ...summary,
              pendingTransfers: summary.pendingTransfers.map((payment) => ({
                ...payment,
                comprobantePago: null,
              })),
            },
          } as AxiosResponse)
        : url === '/payments'
          ? Promise.resolve({
              data: {
                items: summary.pendingTransfers.map((payment) => ({
                  ...payment,
                  comprobantePago: null,
                })),
                total: 1,
                page: 1,
                pageSize: 20,
                totalPages: 1,
              },
            } as AxiosResponse)
          : get(url, config),
    );
    renderPage();
    expect(await screen.findByText('Sin comprobante adjunto')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver comprobante' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(
      within(screen.getByRole('dialog')).getByText('Sin comprobante adjunto'),
    ).toBeInTheDocument();
  });

  it('muestra el arqueo por método y permite cerrar una jornada conciliada', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Caja' }));
    expect(await screen.findByText('Arqueo y cierre diario')).toBeInTheDocument();
    expect((await screen.findAllByText('$125.000')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja del día' }));
    expect(screen.getByRole('dialog', { name: /Cerrar caja/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/finance/cash-closures', {
        fecha: dailySummary.fecha,
        efectivoDeclarado: 55000,
        observaciones: undefined,
      }),
    );
  });

  it('registra un egreso manual desde el libro diario', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Caja' }));
    const open = await screen.findByRole('button', { name: 'Nuevo movimiento' });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Compra de útiles' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/finance/movements',
        expect.objectContaining({
          tipo: 'egreso',
          categoria: 'gasto_operativo',
          monto: 5000,
          metodo: 'efectivo',
          descripcion: 'Compra de útiles',
        }),
      ),
    );
  });
  it('muestra rankings ejecutivos y aplica filtros al análisis', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Análisis' }));

    expect((await screen.findAllByText('Ana Vendedora')).length).toBeGreaterThan(0);
    expect(screen.getByText('Pastillas de freno')).toBeInTheDocument();
    expect(screen.getByText('Productos y servicios con mayor salida')).toBeInTheDocument();
    expect(screen.getByText('3 operaciones · 100,0%')).toBeInTheDocument();
    expect(screen.getByTestId('payment-share-transferencia')).toHaveStyle({ width: '100%' });

    fireEvent.change(screen.getByLabelText('Filtrar por vendedor'), {
      target: { value: '7' },
    });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/finance/analytics',
        expect.objectContaining({
          params: expect.objectContaining({ asesorId: 7 }),
        }),
      ),
    );
  });
  it('respeta el enlace de verificaciones y combina búsqueda, estado y paginación', async () => {
    renderPage('/finance?tab=verifications&paymentPage=2');
    expect(await screen.findByRole('button', { name: 'Pendientes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/payments', {
        params: expect.objectContaining({ page: 2, estado: 'por_verificar' }),
      }),
    );
    expect(exportProps('payments').filters).toEqual(expect.objectContaining({ page: 2, estado: 'por_verificar' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar abonos' }), {
      target: { value: 'TRX-0091' },
    });
    fireEvent.change(screen.getByLabelText('Abonos desde'), { target: { value: '2026-09-01' } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/payments', {
        params: expect.objectContaining({
          page: 1,
          search: 'TRX-0091',
          estado: 'por_verificar',
          fechaDesde: '2026-09-01',
        }),
      }),
    );
    expect(screen.getByRole('searchbox', { name: 'Buscar abonos' })).toHaveValue('TRX-0091');
    expect(exportProps('payments').filters).toEqual(vi.mocked(api.get).mock.calls
      .filter(([url]) => url === '/payments').at(-1)![1]!.params);
  });

  it('exporta exactamente los filtros propios de abonos y los limpia junto con el listado', async () => {
    renderPage('/finance?tab=payments&paymentPage=3&paymentStatus=rechazado&paymentMethod=cheque&paymentSearch=TRX&paymentFrom=2026-09-01&paymentTo=2026-09-30');
    await screen.findByText('TRX-0091');
    expect(exportProps('payments').filters).toEqual({ page: 3, pageSize: 20, estado: 'rechazado', metodo: 'cheque', search: 'TRX',
      fechaDesde: '2026-09-01', fechaHasta: '2026-09-30' });
    const listing = screen.getByRole('region', { name: 'Listado de abonos' });
    expect(listing).toContainElement(screen.getByTestId('export-payments'));
    expect(screen.getByTestId('export-payments')).toBeEnabled();
    expect(screen.queryByTestId('export-cash-day')).not.toBeInTheDocument();
    fireEvent.click(within(listing).getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/payments', { params: {
      page: 1, pageSize: 20, estado: undefined, metodo: undefined, search: undefined, fechaDesde: undefined, fechaHasta: undefined,
    } }));
    expect(exportProps('payments').filters).toEqual(vi.mocked(api.get).mock.calls
      .filter(([url]) => url === '/payments').at(-1)![1]!.params);
  });

  it('deshabilita exportar abonos con fechas invertidas', async () => {
    renderPage('/finance?paymentFrom=2026-10-02&paymentTo=2026-10-01');
    expect(screen.getByTestId('export-payments')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha desde debe ser anterior');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/payments')).toBe(false);
    fireEvent.change(screen.getByLabelText('Abonos hasta'), { target: { value: '2026-10-31' } });
    await waitFor(() => expect(screen.getByTestId('export-payments')).toBeEnabled());
    expect(exportProps('payments').filters).toEqual(expect.objectContaining({ fechaDesde: '2026-10-02', fechaHasta: '2026-10-31' }));
  });

  it('exporta la fecha seleccionada de caja sin requerir crear movimientos', async () => {
    useAuthStore.setState({ user: { id: 8, nombre: 'Consulta', email: 'consulta@demo.cl', role: 'finanzas',
      permissions: [{ modulo: 'finanzas', accion: 'read' }, { modulo: 'finanzas', accion: 'export' }] } });
    renderPage('/finance?tab=cash');
    expect(screen.getByTestId('export-cash-day')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('export-cash-day')).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Nuevo movimiento' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-payments')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fecha del arqueo'), { target: { value: '2026-09-21' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/finance/day', { params: { fecha: '2026-09-21' } }));
    expect(exportProps('cash-day').filters).toEqual({ fecha: '2026-09-21' });
    expect(screen.getByRole('region', { name: 'Arqueo y cierre diario' })).toContainElement(screen.getByTestId('export-cash-day'));
    expect(screen.getAllByLabelText('Fecha del arqueo')).toHaveLength(1);
    expect(screen.getByLabelText('Fecha del arqueo').closest('.finance-section-toolbar')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Fecha del arqueo'), { target: { value: '' } });
    expect(screen.getByTestId('export-cash-day')).toBeDisabled();
  });

  it.each(['payments', 'cash'] as const)('deshabilita exportar al fallar el listado de %s', async (tab) => {
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === (tab === 'cash' ? '/finance/movements' : '/payments')
      ? Promise.reject(new Error('Sin conexión')) : baseGet(url, config));
    renderPage('/finance?tab=' + tab);
    const button = screen.getByTestId(tab === 'cash' ? 'export-cash-day' : 'export-payments');
    expect(button).toBeDisabled();
    await screen.findByRole('alert');
    expect(button).toBeDisabled();
  });

  it('filtra caja por tipo y referencia sin alterar el arqueo ni perder filtros de abonos', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    const movement = { id: 10, tipo: 'egreso', categoria: 'gasto_operativo', monto: 5000,
      metodo: 'efectivo', descripcion: 'Compra de útiles', referencia: 'DOC-10',
      fecha: '2026-09-22T12:00:00.000Z', voidedAt: null, voidReason: null,
      creator: { id: 1, nombre: 'Finanzas Demo' } };
    vi.mocked(api.get).mockImplementation((url, config) => url === '/finance/movements'
      ? Promise.resolve({ data: { items: [movement, { ...movement, id: 11, tipo: 'ingreso', descripcion: 'Fondo inicial', referencia: 'DOC-11' }] } } as AxiosResponse)
      : baseGet(url, config));
    renderPage('/finance?tab=cash&paymentSearch=TRX&paymentStatus=por_verificar');
    await screen.findByText('Compra de útiles');
    fireEvent.click(screen.getByRole('button', { name: 'Ingresos' }));
    expect(screen.getByText('Fondo inicial')).toBeInTheDocument();
    expect(screen.queryByText('Compra de útiles')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar movimientos de caja' }), { target: { value: 'DOC-10' } });
    expect(screen.getByText('No hay movimientos para estos filtros.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtrar movimientos por tipo' })).getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Compra de útiles')).toBeInTheDocument();
    expect(exportProps('cash-day').filters).toEqual({ fecha: dailySummary.fecha });
    expect(screen.getByText('Exportar caja completa del día')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Abonos' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar abonos' })).toHaveValue('TRX');
    fireEvent.click(screen.getByRole('tab', { name: 'Caja' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar movimientos de caja' })).toHaveValue('DOC-10');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros de caja' }));
    expect(screen.getByText('Fondo inicial')).toBeInTheDocument();
    expect(screen.getByText('Compra de útiles')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('oculta acciones de revisión, movimientos y cierre con permiso de solo lectura', async () => {
    useAuthStore.setState({
      user: {
        id: 8,
        nombre: 'Consulta',
        email: 'consulta@unithor.local',
        role: 'finanzas',
        permissions: [{ modulo: 'finanzas', accion: 'read' }],
      },
    });
    renderPage();
    await screen.findByText('TRX-0091');
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Movimiento de caja' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Caja' }));
    expect(screen.queryByRole('button', { name: 'Nuevo movimiento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar caja del día' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('abre todas las transferencias pendientes desde el indicador aunque existan filtros previos', async () => {
    renderPage('/finance?paymentSearch=anterior&paymentMethod=efectivo&paymentFrom=2026-01-01');
    fireEvent.click(await screen.findByRole('button', { name: '1 transferencia(s) por verificar' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/payments', { params: expect.objectContaining({ page: 1, estado: 'por_verificar', search: undefined, metodo: undefined, fechaDesde: undefined }) }));
    expect(screen.getByRole('searchbox', { name: 'Buscar abonos' })).toHaveValue('');
    expect(screen.getByLabelText('Método de los abonos')).toHaveValue('');
  });

  it('conserva un movimiento fallido y confirma antes de descartar para poder reintentar', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    renderPage('/finance?tab=cash');
    const open = await screen.findByRole('button', { name: 'Nuevo movimiento' });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = within(screen.getByRole('dialog', { name: 'Registrar movimiento de caja' }));
    fireEvent.change(dialog.getByLabelText('Monto'), { target: { value: '5000' } });
    fireEvent.change(dialog.getByLabelText('Descripción'), {
      target: { value: 'Compra de útiles' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Registrar movimiento' }));
    expect(await dialog.findByRole('alert')).toBeInTheDocument();
    expect(dialog.getByLabelText('Descripción')).toHaveValue('Compra de útiles');
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(dialog.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Registrar movimiento' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Registrar movimiento de caja' }),
      ).not.toBeInTheDocument(),
    );
  });

  it.each(['review', 'movement', 'closure'] as const)('conserva %s al retirar permisos y bloquea incluso el envío directo del formulario', async (kind) => {
    renderPage(kind === 'review' ? '/finance' : '/finance?tab=cash');
    const buttonName = kind === 'review' ? 'Aprobar' : kind === 'movement' ? 'Nuevo movimiento' : 'Cerrar caja del día';
    const open = await screen.findByRole('button', { name: buttonName });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = within(await screen.findByRole('dialog'));
    const input = dialog.getByLabelText(kind === 'review' ? 'Comentario de revisión' : kind === 'movement' ? 'Descripción' : 'Observaciones');
    fireEvent.change(input, { target: { value: 'Conservar esta observación pendiente' } });
    if (kind === 'movement') fireEvent.change(dialog.getByLabelText('Monto'), { target: { value: '5000' } });
    act(() => useAuthStore.setState({ user: { ...useAuthStore.getState().user!, permissions: [{ modulo: 'finanzas', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] } }));
    expect(input).toHaveValue('Conservar esta observación pendiente');
    expect(input).toBeDisabled();
    const submit = dialog.getByRole('button', { name: kind === 'review' ? 'Confirmar pago' : kind === 'movement' ? 'Registrar movimiento' : 'Confirmar cierre' });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('bloquea envíos directos sin monto válido y evita un doble registro en el mismo ciclo', async () => {
    let resolve: ((response: AxiosResponse) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    renderPage('/finance?tab=cash');
    const open = await screen.findByRole('button', { name: 'Nuevo movimiento' });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = within(screen.getByRole('dialog'));
    const form = dialog.getByRole('button', { name: 'Registrar movimiento' }).closest('form')!;
    fireEvent.change(dialog.getByLabelText('Descripción'), { target: { value: 'Movimiento manual seguro' } });
    fireEvent.submit(form);
    expect(api.post).not.toHaveBeenCalled();
    expect(dialog.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText('Monto'), { target: { value: '5000' } });
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    await act(async () => { resolve?.({ data: { movement: { id: 10 } } } as AxiosResponse); });
  });

  it('bloquea cambios y cierre mientras se guarda un movimiento', async () => {
    let resolveRequest: ((response: AxiosResponse) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(
      () =>
        new Promise<AxiosResponse>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderPage('/finance?tab=cash');
    const open = await screen.findByRole('button', { name: 'Nuevo movimiento' });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = within(screen.getByRole('dialog', { name: 'Registrar movimiento de caja' }));
    fireEvent.change(dialog.getByLabelText('Monto'), { target: { value: '5000' } });
    fireEvent.change(dialog.getByLabelText('Descripción'), {
      target: { value: 'Compra de útiles' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Registrar movimiento' }));
    await waitFor(() => expect(dialog.getByLabelText('Descripción')).toBeDisabled());
    expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.getByRole('dialog', { name: 'Registrar movimiento de caja' }),
    ).toBeInTheDocument();
    resolveRequest?.({ data: { movement: { id: 10 } } } as AxiosResponse);
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Registrar movimiento de caja' }),
      ).not.toBeInTheDocument(),
    );
  });
});
