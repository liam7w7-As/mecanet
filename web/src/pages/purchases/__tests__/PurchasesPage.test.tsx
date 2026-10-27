import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseListResponse } from './fixtures';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import PurchasesPage from '../PurchasesPage';

import type { Role } from '@unithor/shared';
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

    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/purchases/7');
    expect(screen.getByRole('link', { name: 'Ver comprobante de COMP-000007' })).toHaveAttribute(
      'href',
      '/api/purchases/7/receipt',
    );
    expect(api.get).toHaveBeenCalledWith('/purchases', expect.anything());
  });

  it('oculta creación y exportación a un usuario de bodega', async () => {
    renderPage('bodeguero');

    expect(await screen.findByText('COMP-000007')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nueva compra/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Proveedores/ })).toBeInTheDocument();
  });

  it('permite crear y exportar al jefe de taller', async () => {
    renderPage('jefe');

    expect(await screen.findByText('COMP-000007')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nueva compra/ })).toHaveAttribute(
      'href',
      '/purchases/new',
    );
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
  });
});
