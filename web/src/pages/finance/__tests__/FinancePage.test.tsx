import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import FinancePage from '../FinancePage';

import type { FinanceSummary } from '../../../hooks/useFinance';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const summary: FinanceSummary = {
  metrics: {
    revenueToday: 125000,
    revenueMonth: 1450000,
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
    vi.mocked(api.get).mockResolvedValue({ data: summary } as AxiosResponse<FinanceSummary>);
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        payment: { ...summary.pendingTransfers[0], estado: 'confirmado' },
        quotation: { id: 31, codigo: 'COT-2026-0031', total: 150000, pagado: 75000, saldoPendiente: 75000, estadoPago: 'parcial' },
      },
    } as AxiosResponse);
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
});
