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
const renderPage = (route = '/reports') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
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
      if (typeof url === 'string' && url.endsWith('/preview')) {
        if (url === '/reports/fleet/preview') return { data: { clients: { items: [], total: 0 }, vehicles: { items: [], total: 0 } } };
        if (url === '/reports/administration/preview') return { data: { data: [], meta: { total: 0 } } };
        return { data: { items: [], total: 0, warehouses: [], balances: { items: [], total: 0 } } };
      }
      if (typeof url === 'string' && url.startsWith('/reports/'))
        return { data: new Blob(['report'], { type: url.endsWith('/pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
      if (url === '/roles') return { data: { roles: [] } };
      if (url === '/users') {
        return { data: { data: [], meta: { total: 0, page: 1, pageSize: 8, totalPages: 0 } } };
      }
      if (url === '/finance/analytics') {
        return {
          data: {
            period: {
              fechaDesde: '2026-09-01',
              fechaHasta: '2026-09-30',
              previousFechaDesde: null,
              previousFechaHasta: null,
              days: 30,
              agruparPor: 'dia',
            },
            kpis: {
              grossSales: 200000,
              collected: 150000,
              manualIncome: 0,
              expenses: 25000,
              netCash: 125000,
              receivable: 50000,
              averageTicket: 100000,
              quotationCount: 2,
              paidQuotationCount: 1,
              workOrderConversionCount: 1,
              collectionRate: 75,
              conversionRate: 50,
            },
            comparison: null,
            topSellers: [
              {
                id: 1,
                nombre: 'Vendedor Uno',
                quotationCount: 2,
                grossSales: 200000,
                collected: 150000,
                averageTicket: 100000,
              },
            ],
            topItems: [
              {
                catalogItemId: 1,
                codigo: 'SRV-1',
                nombre: 'Mantención',
                tipo: 'estandar',
                quantity: 2,
                revenue: 200000,
              },
            ],
            topClients: [],
            paymentMethods: [],
            quotationStatuses: [],
            movementCategories: [],
            trend: [],
            filterOptions: { advisors: [{ id: 1, nombre: 'Vendedor Uno' }], clients: [] },
          },
        };
      }
      if (url === '/quotations')
        return { data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 0 } };
      if (url === '/work-orders')
        return { data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 0 } };
      return { data: { items: [], total: 0, page: 1, pageSize: 8, totalPages: 0 } };
    });
  });

  it('muestra a vendedor solo sus áreas autorizadas', async () => {
    loginAs('vendedor');
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Reporte comercial de cotizaciones' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comercial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Taller' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clientes y vehículos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finanzas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cuentas' })).not.toBeInTheDocument();
  });

  it('limita al mecánico al reporte de sus órdenes de taller', async () => {
    loginAs('mecanico');
    renderPage('/reports?section=finance');

    expect(
      await screen.findByRole('heading', { name: 'Reporte de taller y progreso de OT' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finanzas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clientes y vehículos' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      '/work-orders',
      expect.objectContaining({ params: expect.objectContaining({ pageSize: 8 }) }),
    );
  });

  it('permite al admin entrar a todas las áreas con una vista financiera de reportes', async () => {
    loginAs('admin');
    renderPage();

    for (const area of [
      'Finanzas',
      'Comercial',
      'Taller',
      'Almacenes',
      'Catálogo',
      'Clientes y vehículos',
      'Cuentas',
    ]) {
      expect(screen.getByRole('button', { name: area })).toBeInTheDocument();
    }
    expect(
      await screen.findByRole('heading', { name: 'Informe financiero ejecutivo' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Ventas' })).toBeInTheDocument();
  });

  it('aplica el filtro de vínculo con OT también a la descarga comercial', async () => {
    loginAs('vendedor');
    const createObjectUrl = vi.fn(() => 'blob:report-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderPage('/reports?section=commercial');

    fireEvent.change(await screen.findByRole('combobox', { name: 'Vínculo con OT' }), {
      target: { value: 'false' },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('/quotations', {
        params: expect.objectContaining({ workOrderLinked: false }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/commercial/excel', {
        params: expect.objectContaining({ workOrderLinked: false }),
        responseType: 'blob',
      }),
    );
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
  });

  it('permite generar reportes de catálogo desde su propia pestaña', async () => {
    loginAs('admin');
    const createObjectUrl = vi.fn(() => 'blob:catalog-report-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderPage('/reports?section=catalog');

    expect(
      await screen.findByRole('heading', { name: 'Reporte de catálogo, servicios y repuestos' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/catalog/excel', {
        params: expect.objectContaining({
          fechaDesde: expect.any(String),
          fechaHasta: expect.any(String),
        }),
        responseType: 'blob',
      }),
    );
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
  });

  it('permite exportar el reporte de cuentas y accesos', async () => {
    loginAs('admin');
    const createObjectUrl = vi.fn(() => 'blob:accounts-report-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderPage('/reports?section=administration');

    expect(
      await screen.findByRole('heading', { name: 'Cuentas, roles y accesos' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/administration/excel', {
        params: expect.objectContaining({
          fechaDesde: expect.any(String),
          fechaHasta: expect.any(String),
        }),
        responseType: 'blob',
      }),
    );
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
  it('conserva la búsqueda comercial y la aplica también al cambiar de área', async () => {
    loginAs('vendedor');
    renderPage('/reports?section=commercial');
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar' }), {
      target: { value: 'Cambio de aceite' },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/quotations', {
        params: expect.objectContaining({ search: 'Cambio de aceite' }),
      }),
    );
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('Cambio de aceite');
    fireEvent.click(screen.getByRole('button', { name: 'Taller' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/work-orders', {
        params: expect.objectContaining({ search: 'Cambio de aceite' }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Comercial' }));
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('Cambio de aceite');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('');
  });

  it('bloquea el reporte financiero y su consulta con un rango de fechas invertido', async () => {
    loginAs('admin');
    renderPage('/reports?section=finance&from=2026-11-04&to=2026-11-01');
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha desde debe ser anterior o igual');
    expect(screen.getByRole('button', { name: 'Abrir PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeDisabled();
    expect(api.get).not.toHaveBeenCalledWith('/finance/analytics', expect.anything());
    expect(
      screen.queryByRole('status', { name: 'Cargando reporte financiero' }),
    ).not.toBeInTheDocument();
  });

  it.each(['sin_stock', 'critico'] as const)('aplica %s también a la muestra de catálogo', async (stock) => {
    loginAs('admin');
    const base = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => url === '/reports/catalog/preview'
      ? { data: { total: 1, items: [{ id: 1, codigo: 'FIL-01', nombre: 'Filtro muestra correcta', tipo: 'parte', precio: 1500, stock: stock === 'sin_stock' ? 0 : 2 }] } }
      : base(url, config));
    renderPage(`/reports?section=catalog&catalogStock=${stock}&from=2026-11-01&to=2026-11-12`);
    expect(await screen.findByText('Filtro muestra correcta')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/reports/catalog/preview', { params: expect.objectContaining({ stock, fechaDesde: '2026-11-01', fechaHasta: '2026-11-12' }) });
    expect(api.get).not.toHaveBeenCalledWith('/catalog', expect.anything());
  });

  it('previsualiza existencias por almacén con los mismos filtros que sus movimientos', async () => {
    loginAs('admin');
    const base = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => url === '/reports/inventory/preview'
      ? { data: { total: 0, items: [], warehouses: [{ id: 2, codigo: 'NORTE', nombre: 'Almacén Norte', activo: true }], balances: { total: 1, items: [{ warehouseId: 2, catalogItemId: 5, codigo: 'REP-05', nombre: 'Repuesto sin existencias', cantidad: 0, warehouseCodigo: 'NORTE', warehouseNombre: 'Almacén Norte' }] } } }
      : base(url, config));
    renderPage('/reports?section=inventory&warehouseId=2&stock=sin_stock&movementType=ingreso&q=repuesto&from=2026-11-01&to=2026-11-12');
    expect(await screen.findByRole('region', { name: 'Vista previa de existencias' })).toHaveTextContent('Repuesto sin existencias');
    expect(screen.getByLabelText('Almacén')).toHaveValue('2');
    expect(api.get).toHaveBeenCalledWith('/reports/inventory/preview', { params: expect.objectContaining({ stock: 'sin_stock', tipo: 'ingreso', warehouseId: 2, search: 'repuesto' }) });
    expect(api.get).not.toHaveBeenCalledWith('/warehouses', expect.anything());
  });

  it('envía tipo de cliente e historial al previsualizar solo vehículos', async () => {
    loginAs('admin');
    renderPage('/reports?section=fleet&fleetScope=vehicles&clientType=empresa&onlyWithHistory=true&from=2026-11-01&to=2026-11-12');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/fleet/preview', { params: expect.objectContaining({ scope: 'vehicles', clientType: 'empresa', onlyWithHistory: true }) }));
    expect(api.get).not.toHaveBeenCalledWith('/clients', expect.anything());
    expect(api.get).not.toHaveBeenCalledWith('/vehicles', expect.anything());
  });

  it('distingue cuentas eliminadas al incluirlas en el reporte', async () => {
    loginAs('admin');
    const base = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => url === '/reports/administration/preview'
      ? { data: { meta: { total: 1 }, data: [{ id: 7, nombre: 'Cuenta histórica', username: 'historica', activo: false, deletedAt: '2026-11-01T10:00:00Z', role: { nombre: 'vendedor' } }] } }
      : base(url, config));
    renderPage('/reports?section=administration&includeDeleted=true');
    expect(await screen.findByText('Cuenta histórica')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Eliminado' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/reports/administration/preview', { params: expect.objectContaining({ includeDeleted: true }) });
  });

  it.each(['catalog', 'inventory', 'fleet', 'administration'] as const)('no consulta %s ni deja cargando su muestra con fechas invertidas', (section) => {
    loginAs('admin');
    renderPage(`/reports?section=${section}&from=2026-11-12&to=2026-11-01`);
    expect(screen.getByRole('button', { name: 'Abrir PDF' })).toBeDisabled();
    expect(api.get).not.toHaveBeenCalledWith(`/reports/${section}/preview`, expect.anything());
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
  });

  it('limita el reporte financiero a 366 días antes de consultar y exportar', () => {
    loginAs('admin');
    renderPage('/reports?section=finance&from=2024-01-01&to=2026-11-12');
    expect(screen.getByRole('alert')).toHaveTextContent('366 días');
    expect(screen.getByRole('button', { name: 'Abrir PDF' })).toBeDisabled();
    expect(api.get).not.toHaveBeenCalledWith('/finance/analytics', expect.anything());
  });

  it('abre el PDF en otra pestaña con los mismos filtros de la vista previa', async () => {
    loginAs('admin');
    const preview = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:commercial-preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    renderPage('/reports?section=commercial&quotationLinked=false&from=2026-09-01&to=2026-09-30');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir PDF' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/commercial/pdf', {
        params: expect.objectContaining({
          fechaDesde: '2026-09-01',
          fechaHasta: '2026-09-30',
          workOrderLinked: false,
        }),
        responseType: 'blob',
      }),
    );
    await waitFor(() => expect(preview.location.href).toBe('blob:commercial-preview'));
    expect(open).toHaveBeenCalledWith('', '_blank');
    open.mockRestore();
  });
});
