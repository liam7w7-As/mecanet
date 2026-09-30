import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import ReportsPage from '../ReportsPage';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));
const renderPage = (route = '/reports') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/reports" element={<ReportsPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

const loginAs = (role: 'vendedor' | 'mecanico' | 'admin' | 'finanzas') => {
  useAuthStore.setState({
    user: { id: 1, nombre: role, email: `${role}@unithor.local`, role },
    isAuthenticated: true,
    isLoading: false,
  });
};

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.startsWith('/reports/')) return { data: new Blob(['report']) };
      if (url === '/roles') return { data: { roles: [] } };
      if (url === '/users') {
        return { data: { data: [], meta: { total: 0, page: 1, pageSize: 8, totalPages: 0 } } };
      }
      if (url === '/finance/analytics') {
        return {
          data: {
            period: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-30', previousFechaDesde: null, previousFechaHasta: null, days: 30, agruparPor: 'dia' },
            kpis: { grossSales: 200000, collected: 150000, manualIncome: 0, expenses: 25000, netCash: 125000, receivable: 50000, averageTicket: 100000, quotationCount: 2, paidQuotationCount: 1, workOrderConversionCount: 1, collectionRate: 75, conversionRate: 50 },
            comparison: null,
            topSellers: [{ id: 1, nombre: 'Vendedor Uno', quotationCount: 2, grossSales: 200000, collected: 150000, averageTicket: 100000 }],
            topItems: [{ catalogItemId: 1, codigo: 'SRV-1', nombre: 'Mantención', tipo: 'estandar', quantity: 2, revenue: 200000 }],
            topClients: [], paymentMethods: [], quotationStatuses: [], movementCategories: [], trend: [],
            filterOptions: { advisors: [{ id: 1, nombre: 'Vendedor Uno' }], clients: [] },
          },
        };
      }
      if (url === '/quotations') return { data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 0 } };
      if (url === '/work-orders') return { data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 0 } };
      return { data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 0 } };
    });
  });

  it('muestra a vendedor solo sus áreas autorizadas', async () => {
    loginAs('vendedor');
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Reporte comercial de cotizaciones' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comercial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Taller' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clientes y vehículos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finanzas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cuentas' })).not.toBeInTheDocument();
  });

  it('limita al mecánico al reporte de sus órdenes de taller', async () => {
    loginAs('mecanico');
    renderPage('/reports?section=finance');

    expect(await screen.findByRole('heading', { name: 'Reporte de taller y progreso de OT' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finanzas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clientes y vehículos' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/work-orders', expect.objectContaining({ params: expect.objectContaining({ pageSize: 8 }) }));
  });

  it('permite al admin entrar a todas las áreas con una vista financiera de reportes', async () => {
    loginAs('admin');
    renderPage();

    for (const area of ['Finanzas', 'Comercial', 'Taller', 'Almacenes', 'Catálogo', 'Clientes y vehículos', 'Cuentas']) {
      expect(screen.getByRole('button', { name: area })).toBeInTheDocument();
    }
    expect(await screen.findByRole('heading', { name: 'Informe financiero ejecutivo' })).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Ventas' })).toBeInTheDocument();
  });

  it('aplica el filtro de vínculo con OT también a la descarga comercial', async () => {
    loginAs('vendedor');
    const createObjectUrl = vi.fn(() => 'blob:report-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage('/reports?section=commercial');

    fireEvent.change(await screen.findByRole('combobox', { name: 'Vínculo con OT' }), { target: { value: 'false' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/quotations', {
      params: expect.objectContaining({ workOrderLinked: false }),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/commercial/excel', {
      params: expect.objectContaining({ workOrderLinked: false }),
      responseType: 'blob',
    }));
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
  });

  it('permite generar reportes de catálogo desde su propia pestaña', async () => {
    loginAs('admin');
    const createObjectUrl = vi.fn(() => 'blob:catalog-report-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage('/reports?section=catalog');

    expect(await screen.findByRole('heading', { name: 'Reporte de catálogo, servicios y repuestos' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/catalog/excel', {
      params: expect.objectContaining({ fechaDesde: expect.any(String), fechaHasta: expect.any(String) }),
      responseType: 'blob',
    }));
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
  });

  it('permite exportar el reporte de cuentas y accesos', async () => {
    loginAs('admin');
    const createObjectUrl = vi.fn(() => 'blob:accounts-report-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage('/reports?section=administration');

    expect(await screen.findByRole('heading', { name: 'Cuentas, roles y accesos' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/administration/excel', {
      params: expect.objectContaining({ fechaDesde: expect.any(String), fechaHasta: expect.any(String) }),
      responseType: 'blob',
    }));
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
  });

  it('permite elegir un reporte de solo vehículos', async () => {
    loginAs('admin');
    renderPage('/reports?section=fleet');

    fireEvent.change(await screen.findByRole('combobox', { name: 'Contenido del reporte' }), {
      target: { value: 'vehicles' },
    });

    expect(await screen.findByText(/Vista previa de vehículos/)).toBeInTheDocument();
    expect(screen.queryByText(/Vista previa de clientes/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo de cliente' })).toBeDisabled();
  });
});
