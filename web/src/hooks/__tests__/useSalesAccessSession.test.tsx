import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { useSalesAccessSession } from '../useSalesAccessSession';
import { useWorkOrder } from '../useWorkOrders';

import type { Role, SalesAccessMode } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
  setSessionExpiredHandler: vi.fn(),
}));

const clients: QueryClient[] = [];
const renderSession = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 120_000 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><Session /></QueryClientProvider>);
  return client;
};
function Detail() {
  const query = useWorkOrder(10);
  const [open, setOpen] = useState(false);
  if (query.isError) return <p>Orden no disponible</p>;
  return <><p>{query.data?.codigo ?? 'Cargando orden'}</p><button onClick={() => setOpen(true)}>Abrir gestión</button>{open && <div role="dialog">Datos de la orden abierta</div>}</>;
}
function Session() {
  const version = useSalesAccessSession();
  return <><output aria-label="Versión de vista">{version}</output><Detail key={version} /></>;
}
const setRole = (role: Role) => useAuthStore.setState({
  user: { id: 7, nombre: 'Usuario prueba', email: 'prueba@example.com', role },
  isAuthenticated: true,
  isLoading: false,
});

describe('Seller session scope refresh', () => {
  let revision: string;
  let mode: SalesAccessMode;
  let accessible: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    revision = 'selected-v1'; mode = 'selected'; accessible = true;
    setRole('vendedor');
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/auth/sales-access') return { data: { mode, revision } } as AxiosResponse;
      if (!accessible) throw new Error('Orden no encontrada');
      return { data: { workOrder: { id: 10, codigo: 'OT COMPARTIDA' } } } as AxiosResponse;
    });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it.each<Role>(['admin', 'desarrollador', 'jefe', 'mecanico', 'bodeguero', 'finanzas'])('no consulta ni reinicia los accesos del rol %s', async (role) => {
    setRole(role);
    renderSession();
    await screen.findByText('OT COMPARTIDA');
    expect(api.get).not.toHaveBeenCalledWith('/auth/sales-access');
  });

  it('conserva la vista y su formulario cuando el alcance no cambió', async () => {
    const client = renderSession();
    await screen.findByText('OT COMPARTIDA');
    await waitFor(() => expect(client.getQueryData(['sales-access', 'session', 7])).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Abrir gestión' }));
    await act(async () => { await client.refetchQueries({ queryKey: ['sales-access', 'session', 7] }); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Versión de vista')).toHaveTextContent('7:0');
  });

  it('al revocar borra OT, COT y pagos cacheados y cierra la gestión antigua, conservando catálogo y almacenes', async () => {
    const client = renderSession();
    await screen.findByText('OT COMPARTIDA');
    await waitFor(() => expect(client.getQueryData(['sales-access', 'session', 7])).toBeDefined());
    client.setQueryData(['quotations', 'detail', 20], { codigo: 'COT COMPARTIDA' });
    client.setQueryData(['quotation-payments', 20], { pagado: 500 });
    client.setQueryData(['clients', 'detail', 3, true], { history: ['OT COMPARTIDA'] });
    client.setQueryData(['catalog', 'list'], { items: ['Repuesto común'] });
    client.setQueryData(['warehouses', 'list'], { items: ['Bodega común'] });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir gestión' }));
    revision = 'own-v2'; mode = 'own'; accessible = false;
    await act(async () => { await client.refetchQueries({ queryKey: ['sales-access', 'session', 7] }); });
    await screen.findByText('Orden no disponible');
    expect(screen.queryByText('OT COMPARTIDA')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.getQueryData(['work-orders', 'detail', 10])).toBeUndefined();
    expect(client.getQueryData(['quotations', 'detail', 20])).toBeUndefined();
    expect(client.getQueryData(['quotation-payments', 20])).toBeUndefined();
    expect(client.getQueryData(['clients', 'detail', 3, true])).toBeUndefined();
    expect(client.getQueryData(['catalog', 'list'])).toEqual({ items: ['Repuesto común'] });
    expect(client.getQueryData(['warehouses', 'list'])).toEqual({ items: ['Bodega común'] });
  });

  it('detecta cambios al volver a la pestaña sin recargar el navegador', async () => {
    const client = renderSession();
    await screen.findByText('OT COMPARTIDA');
    await waitFor(() => expect(client.getQueryData(['sales-access', 'session', 7])).toBeDefined());
    revision = 'all-v2'; mode = 'all';
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(screen.getByLabelText('Versión de vista')).toHaveTextContent('7:1'));
    expect(await screen.findByText('OT COMPARTIDA')).toBeInTheDocument();
  });

  it('consulta cambios cada 30 segundos en una pestaña activa', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    focusManager.setFocused(true);
    const client = renderSession();
    await screen.findByText('OT COMPARTIDA');
    await waitFor(() => expect(client.getQueryData(['sales-access', 'session', 7])).toBeDefined());
    revision = 'selected-v2';
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(screen.getByLabelText('Versión de vista')).toHaveTextContent('7:1'));
  });
});
