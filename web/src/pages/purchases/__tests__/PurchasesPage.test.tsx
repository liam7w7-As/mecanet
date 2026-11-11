import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseListResponse, supplierFixture } from './fixtures';
import ListExportButtons from '../../../components/common/ListExportButtons';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import PurchasesPage from '../PurchasesPage';

import type { Role } from '@unithor/shared';
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

const renderPage = (role: Role) => {
  useAuthStore.setState({
    user: {
      id: 1,
      nombre: 'Usuario de prueba',
      email: 'usuario@unithor.local',
      role,
    },
    isAuthenticated: true,
    isLoading: false,
  });

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/purchases']}>
        <Routes>
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/purchases/:id" element={<h1>Detalle de compra</h1>} />
          <Route path="/purchases/new" element={<h1>Nueva compra</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const exportProps = (target: string) => vi.mocked(ListExportButtons).mock.calls
  .filter(([props]) => props.target === target).at(-1)![0];

describe('PurchasesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({
      data: purchaseListResponse,
    } as AxiosResponse<typeof purchaseListResponse>);
  });

  it('muestra el resumen, el comprobante, el vehículo y el crédito pendiente', async () => {
    renderPage('jefe');

    expect(await screen.findByRole('heading', { name: 'Compras' })).toBeInTheDocument();
    expect(await screen.findByText('COMP-000007')).toBeInTheDocument();
    expect(screen.getByText('Repuestos Andes')).toBeInTheDocument();
    expect(screen.getByText('Datos incompletos')).toBeInTheDocument();
    expect(screen.getByText('Folio F-9001')).toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    expect(screen.getByText('OT-2026-0009')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getAllByText(/\$11\.900/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Crédito pendiente/).textContent).toMatch(/11\.900/);

    const summary = within(screen.getByRole('region', { name: 'Resumen de compras' }));
    expect(summary.getByText('Compras')).toBeInTheDocument();
    expect(summary.getByText('IVA 19%')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Ver compra COMP-000007' })).toHaveAttribute('href', '/purchases/7');
    expect(screen.getByRole('link', { name: 'Ver comprobante de COMP-000007' })).toHaveAttribute(
      'href',
      '/api/purchases/7/receipt',
    );
    expect(api.get).toHaveBeenCalledWith('/purchases', expect.anything());
  });

  it('oculta creación a bodega y delega los permisos de exportación al control común', async () => {
    renderPage('bodeguero');

    expect(await screen.findByText('COMP-000007')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nueva compra/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('export-purchases')).toBeEnabled();
    expect(screen.getByRole('button', { name: /Proveedores/ })).toBeInTheDocument();
  });

  it('permite crear y exportar al jefe de taller', async () => {
    renderPage('jefe');

    expect(await screen.findByText('COMP-000007')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nueva compra/ })).toHaveAttribute(
      'href',
      '/purchases/new',
    );
    expect(screen.getAllByTestId('export-purchases')).toHaveLength(1);
    expect(screen.getByRole('banner')).toContainElement(screen.getByTestId('export-purchases'));
  });

  it('reutiliza todos los filtros de compras y mantiene una sola barra de exportación', async () => {
    renderPage('finanzas');
    await screen.findByText('COMP-000007');
    expect(screen.queryByRole('link', { name: /Nueva compra/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar compras'), { target: { value: 'Andes' } });
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'anulada' } });
    fireEvent.change(screen.getByLabelText('Filtrar por forma de pago'), { target: { value: 'credito' } });
    fireEvent.change(screen.getByLabelText('Filtrar por documento'), { target: { value: 'factura' } });
    fireEvent.change(screen.getByLabelText('Fecha de registro desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Fecha de registro hasta'), { target: { value: '2026-10-31' } });
    const filters = { page: 1, pageSize: 20, search: 'Andes', estado: 'anulada', formaPago: 'credito',
      tipoDocumento: 'factura', fechaDesde: '2026-10-01', fechaHasta: '2026-10-31' };
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/purchases', { params: filters }));
    expect(exportProps('purchases').filters).toEqual(filters);
    expect(screen.getAllByTestId('export-purchases')).toHaveLength(1);
    expect(screen.getByTestId('export-purchases')).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Ver comprobante de COMP-000007' })).toHaveAttribute('href', '/api/purchases/7/receipt');
    fireEvent.change(screen.getByLabelText('Fecha de registro hasta'), { target: { value: '2026-09-30' } });
    expect(screen.getByTestId('export-purchases')).toBeDisabled();
  });

  it('exporta los filtros del modal de proveedores sin requerir crear ni editar', async () => {
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/suppliers'
      ? { items: [supplierFixture], total: 1, page: 1, pageSize: 12, totalPages: 1 }
      : purchaseListResponse } as AxiosResponse));
    renderPage('finanzas');
    await screen.findByText('COMP-000007');
    fireEvent.click(screen.getByRole('button', { name: 'Proveedores' }));
    const modal = screen.getByRole('dialog', { name: 'Proveedores' });
    expect(within(modal).getByTestId('export-suppliers')).toBeDisabled();
    await waitFor(() => expect(within(modal).getByTestId('export-suppliers')).toBeEnabled());
    expect(within(modal).queryByRole('button', { name: 'Completar' })).not.toBeInTheDocument();
    fireEvent.change(within(modal).getByLabelText('Buscar proveedor'), { target: { value: '  Andes  ' } });
    fireEvent.click(within(modal).getByRole('checkbox', { name: 'Solo incompletos' }));
    const filters = { page: 1, pageSize: 12, search: 'Andes', soloIncompletos: true };
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/suppliers', { params: filters }));
    expect(exportProps('suppliers').filters).toEqual(filters);
    expect(screen.getAllByTestId('export-suppliers')).toHaveLength(1);
    expect(screen.getByTestId('export-purchases')).toBeEnabled();
  });

  it('deshabilita exportar las compras mientras cargan y cuando falla la consulta', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Sin conexión'));
    renderPage('finanzas');
    expect(screen.getByTestId('export-purchases')).toBeDisabled();
    await screen.findByRole('alert');
    expect(screen.getByTestId('export-purchases')).toBeDisabled();
  });
});
