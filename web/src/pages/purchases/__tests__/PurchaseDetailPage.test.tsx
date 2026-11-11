import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseFixture, supplierFixture } from './fixtures';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import PurchaseDetailPage from '../PurchaseDetailPage';

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
      <MemoryRouter initialEntries={['/purchases/7']}>
        <Routes>
          <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
          <Route path="/purchases" element={<h1>Listado de compras</h1>} />
          <Route path="/work-orders/:id" element={<h1>Orden de trabajo</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('PurchaseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/purchases/7') {
        return Promise.resolve({
          data: { purchase: purchaseFixture },
        } as AxiosResponse<{ purchase: typeof purchaseFixture }>);
      }
      if (url === '/suppliers/12') {
        return Promise.resolve({
          data: { supplier: supplierFixture },
        } as AxiosResponse<{ supplier: typeof supplierFixture }>);
      }
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
  });

  it('muestra comprobante, ítems con stock, asociación y pago pendiente', async () => {
    renderPage('jefe');

    expect(
      await screen.findByRole('heading', { name: 'COMP-000007' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Registrada el .* por Jefe de Taller/)).toBeInTheDocument();
    expect(screen.getByText('Repuestos Andes')).toBeInTheDocument();
    expect(screen.getByText('Datos incompletos')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);

    const items = within(screen.getByRole('region', { name: 'Totales de la compra' }));
    expect(items.getByText('Total')).toBeInTheDocument();

    expect(screen.getByText('Filtro de aceite')).toBeInTheDocument();
    expect(screen.getByText('REP-005 · Filtro de aceite')).toBeInTheDocument();
    expect(screen.getByText('Recibido en ALM-01')).toBeInTheDocument();
    expect(screen.getByText('OT-2026-0009')).toHaveAttribute('href', '/work-orders/9');
    expect(screen.getByText('Factura')).toBeInTheDocument();
    expect(screen.getByText('F-9001')).toBeInTheDocument();
    expect(screen.getByText('factura-compra.pdf')).toBeInTheDocument();
    expect(screen.getByText(/application\/pdf · 2 KB/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Registrar pago/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pagar compra completa/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular compra/ })).not.toBeInTheDocument();
  });

  it('reserva anulación y edición de proveedor a administración', async () => {
    renderPage('admin');

    expect(
      await screen.findByRole('heading', { name: 'COMP-000007' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anular compra/ })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Completar proveedor/ }).length,
    ).toBeGreaterThan(0);
  });

  it('deja solo lectura al bodeguero', async () => {
    renderPage('bodeguero');

    expect(
      await screen.findByRole('heading', { name: 'COMP-000007' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar pago/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular compra/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Completar proveedor/ })).not.toBeInTheDocument();
    expect(screen.getByText('El pago total está pendiente.')).toBeInTheDocument();
  });

  it('conserva los datos de pago al cancelar y bloquea el cierre durante el registro', async () => {
    let finishPayment: ((value: AxiosResponse<{ purchase: typeof purchaseFixture }>) => void) | undefined;
    vi.mocked(api.post).mockImplementation(() => new Promise((resolve) => { finishPayment = resolve; }));
    renderPage('jefe');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Pagar compra a crédito' }));
    fireEvent.change(dialog.getByLabelText('Banco'), { target: { value: 'BCI' } });
    fireEvent.change(dialog.getByLabelText('N.º de operación'), { target: { value: 'OP-700' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(dialog.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog.getByLabelText('Banco')).toHaveValue('BCI');
    fireEvent.click(dialog.getByRole('button', { name: 'Registrar pago total' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/purchases/7/payment', {
      metodo: 'transferencia', referencia: null, banco: 'BCI', numeroOperacion: 'OP-700',
    }));
    expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    finishPayment?.({ data: { purchase: purchaseFixture } } as AxiosResponse<{ purchase: typeof purchaseFixture }>);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pagar compra a crédito' })).not.toBeInTheDocument());
  });

  it('conserva el motivo de anulación hasta confirmar y envía la misma operación', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { purchase: purchaseFixture } } as AxiosResponse);
    renderPage('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Anular compra' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Anular compra' }));
    fireEvent.change(dialog.getByLabelText('Motivo de la anulación'), { target: { value: 'Documento duplicado' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog.getByLabelText('Motivo de la anulación')).toHaveValue('Documento duplicado');
    fireEvent.click(dialog.getByRole('button', { name: 'Anular compra' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/purchases/7/void', { motivo: 'Documento duplicado' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Anular compra' })).not.toBeInTheDocument());
  });

  it('protege la edición del proveedor sin guardar al cerrar el formulario', async () => {
    renderPage('admin');
    const openSupplier = (await screen.findAllByRole('button', { name: /Completar proveedor/ }))[0];
    await waitFor(() => expect(openSupplier).toBeEnabled());
    fireEvent.click(openSupplier);
    const dialog = within(await screen.findByRole('dialog', { name: 'Datos del proveedor' }));
    fireEvent.change(dialog.getByLabelText('Contacto'), { target: { value: 'Contacto de compras' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(dialog.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog.getByLabelText('Contacto')).toHaveValue('Contacto de compras');
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog', { name: 'Datos del proveedor' })).not.toBeInTheDocument();
  });
});
