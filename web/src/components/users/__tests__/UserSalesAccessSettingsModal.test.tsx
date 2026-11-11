import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import UsersPage from '../../../pages/users/UsersPage';
import { useAuthStore } from '../../../stores/auth.store';
import UserSalesAccessSettingsModal from '../UserSalesAccessSettingsModal';

import type { SalesAccessRecord, UserSalesAccessSettings } from '../../../hooks/useSalesAccess';
import type { AdminUser } from '../../../hooks/useUsers';
import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../common/ListExportButtons', () => ({ default: () => null }));

const seller: AdminUser = { id: 7, nombre: 'Valentina Ventas', username: 'valentina', email: 'ventas@example.com',
  roleId: 4, role: { id: 4, nombre: 'vendedor' }, activo: true,
  createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z' };
const order: SalesAccessRecord = { scopeType: 'work_order', targetId: 12, codigo: 'OT-26-12',
  clientName: 'Cliente Uno', patente: 'ABCD12', ownerName: 'Otra vendedora', owned: false,
  linkedRecord: { scopeType: 'quotation', targetId: 22, codigo: 'COT-26-22' } };
const quote: SalesAccessRecord = { ...order, scopeType: 'quotation', targetId: 22, codigo: 'COT-26-22',
  linkedRecord: { scopeType: 'work_order', targetId: 12, codigo: 'OT-26-12' } };
const independent: SalesAccessRecord = { ...quote, targetId: 23, codigo: 'COT-26-23', linkedRecord: null };
const own: SalesAccessRecord = { ...order, targetId: 14, codigo: 'OT-26-14', owned: true, ownerName: seller.nombre, linkedRecord: null };
const shared: UserSalesAccessSettings = { mode: 'selected', grants: [{
  id: 1, userId: 7, scopeType: 'work_order', targetId: 12, targetCodigo: 'OT-26-12',
  grantedBy: 1, grantedByName: 'Admin', expired: false, expiresAt: null, createdAt: '2026-11-01T12:00:00Z',
  linkedRecord: order.linkedRecord, clientName: order.clientName, patente: order.patente,
}] };
const close = vi.fn();
const response = <T,>(data: T): AxiosResponse<T> => ({ data, status: 200, statusText: 'OK', headers: {}, config: { headers: new AxiosHeaders() } });

function renderUI(child: ReactNode = <UserSalesAccessSettingsModal user={seller} onClose={close} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{child}</MemoryRouter></QueryClientProvider>);
}
const selectedMode = async () => {
  const radio = await screen.findByRole('radio', { name: /Seleccionar algunas/ });
  await waitFor(() => expect(radio).toBeEnabled());
  fireEvent.click(radio);
  return screen.findByRole('checkbox', { name: 'Compartir OT-26-12' });
};

describe('Configuración de acceso comercial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 1, nombre: 'Admin', email: 'admin@example.com', role: 'admin' }, isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/users/7/sales-access') return Promise.resolve(response<UserSalesAccessSettings>({ mode: 'own', grants: [] }));
      if (url === '/users/7/sales-access/records') {
        const params = config?.params as { scopeType?: string; page?: number } | undefined;
        const items = params?.scopeType === 'quotation' ? [quote, independent] : [order, own];
        return Promise.resolve(response({ items, total: 25, page: params?.page ?? 1, pageSize: 10, totalPages: 3 }));
      }
      if (url === '/users') return Promise.resolve({ data: { data: [seller], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } } as AxiosResponse);
      if (url === '/roles') return Promise.resolve({ data: { roles: [seller.role] } } as AxiosResponse);
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
    vi.mocked(api.put).mockResolvedValue(response<UserSalesAccessSettings>({ mode: 'all', grants: [] }));
  });

  it('abre directamente desde la fila del vendedor sin pasar por su ficha', async () => {
    renderUI(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: `Acceso OT/COT de ${seller.nombre}` }));
    expect(await screen.findByRole('dialog', { name: 'Acceso a OT y COT' })).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('muestra solo propias y guarda Todas con una sola petición sin crear concesiones individuales', async () => {
    renderUI();
    const all = await screen.findByRole('radio', { name: /Todas/ });
    await waitFor(() => expect(all).toBeEnabled());
    expect(screen.getByRole('radio', { name: /Solo propias/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar acceso' })).toBeDisabled();
    fireEvent.click(all);
    expect(screen.getByText(/los que se creen en adelante/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acceso' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/users/7/sales-access', { mode: 'all', records: [] }));
    expect(api.put).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('cambia de acceso seleccionado a solo propias para retirar los accesos previos', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: shared } as AxiosResponse);
    renderUI();
    const ownMode = await screen.findByRole('radio', { name: /Solo propias/ });
    await waitFor(() => expect(ownMode).toBeEnabled());
    fireEvent.click(ownMode);
    expect(screen.getByText(/se retirarán los accesos compartidos anteriores/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acceso' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/users/7/sales-access', { mode: 'own', records: [] }));
  });

  it('selecciona OT y COT en conjunto, conserva varias selecciones y bloquea registros propios', async () => {
    renderUI();
    fireEvent.click(await selectedMode());
    expect(screen.getByRole('checkbox', { name: 'Compartir OT-26-14' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cotizaciones' }));
    expect(await screen.findByRole('checkbox', { name: 'Compartir COT-26-22' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compartir COT-26-23' }));
    fireEvent.click(screen.getByRole('tab', { name: /Seleccionadas/ }));
    expect(screen.getByRole('button', { name: 'Quitar OT-26-12 de la selección' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Quitar COT-26-23 de la selección' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acceso' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/users/7/sales-access', { mode: 'selected', records: [
      { scopeType: 'work_order', targetId: 12 }, { scopeType: 'quotation', targetId: 23 },
    ] }));
  });

  it('mantiene la selección al buscar y paginar sin guardar cambios anticipadamente', async () => {
    renderUI();
    fireEvent.click(await selectedMode());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar OT o cotización' }), { target: { value: 'ABCD12' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/users/7/sales-access/records', { params: expect.objectContaining({ search: 'ABCD12', page: 1 }) }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Página siguiente de registros' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente de registros' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/users/7/sales-access/records', { params: expect.objectContaining({ page: 2, search: 'ABCD12' }) }));
    expect(await screen.findByRole('checkbox', { name: 'Compartir OT-26-12' })).toBeChecked();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('quitar desde COT desmarca también su OT y evita guardar una selección vacía', async () => {
    renderUI();
    fireEvent.click(await selectedMode());
    fireEvent.click(screen.getByRole('button', { name: 'Cotizaciones' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Compartir COT-26-22' }));
    expect(screen.getByRole('button', { name: 'Guardar acceso' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Órdenes de trabajo' }));
    expect(await screen.findByRole('checkbox', { name: 'Compartir OT-26-12' })).not.toBeChecked();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('conserva lo seleccionado al fallar el guardado y permite reintentar', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('Fallo de conexión')).mockResolvedValueOnce({ data: shared } as AxiosResponse);
    renderUI();
    fireEvent.click(await selectedMode());
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acceso' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Compartir OT-26-12' })).toBeChecked();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acceso' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.put).mock.calls[0]).toEqual(vi.mocked(api.put).mock.calls[1]);
  });

  it('pide confirmar antes de descartar y conserva el modo al seguir editando', async () => {
    renderUI();
    const all = await screen.findByRole('radio', { name: /Todas/ });
    await waitFor(() => expect(all).toBeEnabled());
    fireEvent.click(all);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    const prompt = screen.getByRole('alertdialog', { name: 'Descartar edición' });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Seguir editando' }));
    expect(all).toBeChecked();
    expect(close).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('bloquea cerrar, cambiar el modo y duplicar la petición durante el guardado', async () => {
    let finish!: (value: AxiosResponse<UserSalesAccessSettings>) => void;
    vi.mocked(api.put).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderUI();
    const all = await screen.findByRole('radio', { name: /Todas/ });
    await waitFor(() => expect(all).toBeEnabled());
    fireEvent.click(all);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acceso' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled());
    expect(all).toBeDisabled();
    expect(screen.getByRole('button', { name: /Guardar acceso/ })).toBeDisabled();
    expect(api.put).toHaveBeenCalledTimes(1);
    await act(async () => finish(response<UserSalesAccessSettings>({ mode: 'all', grants: [] })));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it('no permite guardar si no se pudo cargar la configuración', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Sin conexión'));
    renderUI();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar acceso' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Todas/ })).toBeDisabled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('oculta la gestión de accesos a roles distintos de admin y desarrollador', async () => {
    useAuthStore.setState({ user: { id: 3, nombre: 'Jefe', email: 'jefe@example.com', role: 'jefe', permissions: [{ modulo: 'admin', accion: 'read' }] } });
    renderUI(<UsersPage />);
    await screen.findByText(seller.nombre);
    expect(screen.queryByRole('button', { name: `Acceso OT/COT de ${seller.nombre}` })).not.toBeInTheDocument();
  });
});
