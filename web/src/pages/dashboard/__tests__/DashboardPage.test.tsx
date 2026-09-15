import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import DashboardPage from '../DashboardPage';

import type { DashboardSummary } from '@unithor/shared';
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

const summary: DashboardSummary = {
  metrics: {
    activeWorkOrders: 8,
    waitingForParts: 2,
    pendingQuotations: 4,
    pendingBalance: 380000,
    monthlyRevenue: 1250000,
    quotationsWithoutWorkOrder: 3,
  },
  recentWorkOrders: [
    {
      id: 21,
      codigo: 'OT-2026-0021',
      estado: 'en_progreso',
      fechaIngreso: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-09-15T12:00:00.000Z',
      client: { id: 7, nombre: 'Cliente Demo' },
      vehicle: { id: 4, patente: 'ABCD12' },
    },
  ],
  lowStockCount: 1,
  lowStockItems: [
    { id: 5, codigo: 'FLT-001', nombre: 'Filtro de aceite', stock: 3 },
  ],
  unlinkedQuotations: [
    {
      id: 31,
      codigo: 'COT-2026-0031',
      total: 95000,
      estadoPago: 'por_pagar',
      client: { id: 7, nombre: 'Cliente Demo' },
    },
  ],
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 1,
        nombre: 'David Contreras',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockResolvedValue({ data: summary } as AxiosResponse<DashboardSummary>);
  });

  it('renderiza las tarjetas KPI con valores formateados', async () => {
    renderPage();

    expect(await screen.findByText('Bienvenido de vuelta, David')).toBeInTheDocument();
    expect(await screen.findByTestId('active-work-orders')).toHaveTextContent('8');
    expect(screen.getByTestId('waiting-for-parts')).toHaveTextContent('2');
    expect(screen.getByTestId('monthly-revenue')).toHaveTextContent('$1.250.000');
    expect(screen.getByTestId('pending-balance')).toHaveTextContent('$380.000');
    expect(screen.getByTestId('low-stock-count')).toHaveTextContent('1');
  });

  it('expone las rutas correctas en las acciones rápidas', async () => {
    renderPage();
    await screen.findByText('Bienvenido de vuelta, David');

    expect(screen.getByRole('link', { name: /Ingresar vehículo/ })).toHaveAttribute('href', '/work-orders/new');
    expect(screen.getByRole('link', { name: /Nueva cotización/ })).toHaveAttribute('href', '/quotations/new');
    expect(screen.getByRole('button', { name: /Dar de alta cliente/ })).toBeEnabled();
  });

  it('renderiza los últimos trabajos y accesos a detalle', async () => {
    renderPage();

    expect(await screen.findByText('OT-2026-0021')).toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    expect(screen.getAllByText('Cliente Demo').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Ver OT-2026-0021' })).toHaveAttribute('href', '/work-orders/21');
    expect(screen.getByRole('link', { name: /Ver todas/ })).toHaveAttribute('href', '/work-orders');
  });
});
