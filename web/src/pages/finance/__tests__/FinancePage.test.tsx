import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import FinancePage from '../FinancePage';

import type { DailyCashSummary, FinanceSummary } from '../../../hooks/useFinance';
import type { AxiosResponse } from 'axios';

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
  pendingTransfers: [{
    id: 91,
    quotationId: 31,
    monto: 75000,
    metodo: 'transferencia',
    estado: 'por_verificar',
    referencia: 'TRX-0091',
    fecha: '2026-09-21T12:00:00.000Z',
    createdBy: 1,
    createdAt: '2026-09-21T12:00:00.000Z',
    updatedAt: '2026-09-21T12:00:00.000Z',
    creator: { id: 1, nombre: 'Vendedor Demo' },
    quotation: { id: 31, codigo: 'COT-2026-0031', total: 150000, client: { id: 8, nombre: 'Cliente Demo' } },
  }],
  recentPayments: [],
  pendingQuotations: [{
    id: 31,
    codigo: 'COT-2026-0031',
    total: 150000,
    pagado: 0,
    saldoPendiente: 150000,
    estadoPago: 'por_verificar',
    client: { id: 8, nombre: 'Cliente Demo' },
  }],
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

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><FinancePage /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('FinancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({
      data: url === '/finance/day' ? dailySummary : url === '/finance/movements' ? { items: [] } : summary,
    } as AxiosResponse));
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        payment: { ...summary.pendingTransfers[0], estado: 'confirmado' },
        quotation: { id: 31, codigo: 'COT-2026-0031', total: 150000, pagado: 75000, saldoPendiente: 75000, estadoPago: 'parcial' },
      },
    } as AxiosResponse);
    vi.mocked(api.post).mockImplementation((url) => Promise.resolve({
      data: url === '/finance/movements' ? {
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
      } : {
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
    } as AxiosResponse));
  });

  it('renderiza métricas y transferencias pendientes', async () => {
    renderPage();
    expect(await screen.findByText('Finanzas / Contabilidad')).toBeInTheDocument();
    expect(await screen.findByText('$1.450.000')).toBeInTheDocument();
    expect(screen.getByText('TRX-0091')).toBeInTheDocument();
    expect(screen.getAllByText('COT-2026-0031').length).toBeGreaterThan(0);
  });

  it('permite confirmar una transferencia pendiente', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/payments/91/verify', {
      decision: 'aprobar',
      comentario: undefined,
    }));
  });

  it('muestra el arqueo por método y permite cerrar una jornada conciliada', async () => {
    renderPage();
    expect(await screen.findByText('Arqueo y cierre diario')).toBeInTheDocument();
    expect((await screen.findAllByText('$125.000')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja del día' }));
    expect(screen.getByRole('dialog', { name: /Cerrar caja/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/finance/cash-closures', {
      fecha: dailySummary.fecha,
      efectivoDeclarado: 55000,
      observaciones: undefined,
    }));
  });

  it('registra un egreso manual desde el libro diario', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo movimiento' }));
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Compra de útiles' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/finance/movements',
      expect.objectContaining({
        tipo: 'egreso',
        categoria: 'gasto_operativo',
        monto: 5000,
        metodo: 'efectivo',
        descripcion: 'Compra de útiles',
      }),
    ));
  });
});
