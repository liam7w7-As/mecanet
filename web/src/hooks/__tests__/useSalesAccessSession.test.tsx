import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { useSalesAccessRecord } from '../useSalesAccessRecord';
import { useSalesAccessSession } from '../useSalesAccessSession';
import { useWorkOrder, useWorkOrders } from '../useWorkOrders';

import type { Role, SalesAccessMode } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn() }, setSessionExpiredHandler: vi.fn() }));
const clients: QueryClient[] = [];
function Detail() {
  const query = useWorkOrder(10);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  useSalesAccessRecord('work_order', 10, () => setOpen(false));
  if (query.isError) return <p>Orden no disponible</p>;
  return <><p>{query.data?.codigo ?? 'Cargando orden'}</p><button onClick={() => setOpen(true)}>Abrir gestión</button>{open && <div role="dialog"><input aria-label="Nota de trabajo" value={note} onChange={(event) => setNote(event.target.value)} /></div>}</>;
}
function Session() { useSalesAccessSession(); return <Detail />; }
const renderSession = (content = <Session />) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 120_000 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
  return client;
};
const setRole = (role: Role) => useAuthStore.setState({ user: { id: 7, nombre: 'Usuario prueba', email: 'prueba@example.com', role }, isAuthenticated: true, isLoading: false });
const refresh = async (client: QueryClient) => { await act(async () => { await client.refetchQueries({ queryKey: ['sales-access', 'session', 7] }); }); };

describe('Seller session scope refresh', () => {
  let revision: string;
  let mode: SalesAccessMode;
  let accessible: boolean;
  beforeEach(() => {
    vi.clearAllMocks(); revision = 'selected-v1'; mode = 'selected'; accessible = true;
    setRole('vendedor');
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === '/auth/sales-access') {
        const requested = config?.params as { workOrderIds?: string; quotationIds?: string } | undefined;
        return { data: { mode, revision, records: {
          workOrderIds: accessible && requested?.workOrderIds ? requested.workOrderIds.split(',').map(Number) : [],
          quotationIds: accessible && requested?.quotationIds ? requested.quotationIds.split(',').map(Number) : [],
        } } } as AxiosResponse;
      }
      if (!accessible) throw new Error('Orden no encontrada');
      return { data: { workOrder: { id: 10, codigo: 'OT COMPARTIDA' } } } as AxiosResponse;
    });
  });
  afterEach(() => { clients.splice(0).forEach((client) => client.clear()); focusManager.setFocused(undefined); vi.useRealTimers(); });

  it.each<Role>(['admin', 'desarrollador', 'jefe', 'mecanico', 'bodeguero', 'finanzas'])('no verifica ni reinicia los accesos del rol %s', async (role) => {
    setRole(role); renderSession(); await screen.findByText('OT COMPARTIDA');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/auth/sales-access')).toBe(false);
  });

  it.each<SalesAccessMode>(['own', 'selected', 'all'])('conserva el formulario autorizado al cambiar a %s', async (nextMode) => {
    const client = renderSession(); await screen.findByText('OT COMPARTIDA'); await refresh(client);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir gestión' }));
    const input = screen.getByLabelText('Nota de trabajo');
    fireEvent.change(input, { target: { value: 'Borrador sin guardar' } });
    revision = 'changed-v2'; mode = nextMode;
    await refresh(client);
    await waitFor(() => expect(client.getQueryData(['sales-access', 'cache-epoch'])).toBe(1));
    expect(screen.getByLabelText('Nota de trabajo')).toBe(input);
    expect(input).toHaveValue('Borrador sin guardar');
  });

  it('retira el detalle y cierra su editor solo cuando el servidor confirma la revocación', async () => {
    const client = renderSession(); await screen.findByText('OT COMPARTIDA'); await refresh(client);
    client.setQueryData(['quotations', 'detail', 20], { codigo: 'COT COMPARTIDA' });
    client.setQueryData(['quotation-payments', 20], { pagado: 500 });
    client.setQueryData(['clients', 'detail', 3], { nombre: 'Cliente compartido' });
    client.setQueryData(['catalog', 'list'], { items: ['Repuesto común'] });
    client.setQueryData(['warehouses', 'requests', { estado: 'aprobada' }], { items: ['Solicitud de OT compartida'] });
    client.setQueryData(['warehouses', 'list', {}], { items: ['Almacén compartido'] });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir gestión' }));
    revision = 'own-v2'; mode = 'own'; accessible = false;
    await refresh(client); await screen.findByText('Orden no disponible');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('OT COMPARTIDA')).not.toBeInTheDocument();
    expect(client.getQueryData(['work-orders', 'detail', 10])).toBeUndefined();
    expect(client.getQueryData(['quotations', 'detail', 20])).toBeUndefined();
    expect(client.getQueryData(['quotation-payments', 20])).toBeUndefined();
    expect(client.getQueryData(['clients', 'detail', 3])).toEqual({ nombre: 'Cliente compartido' });
    expect(client.getQueryData(['catalog', 'list'])).toEqual({ items: ['Repuesto común'] });
    expect(client.getQueryData(['warehouses', 'requests', { estado: 'aprobada' }])).toBeUndefined();
    expect(client.getQueryData(['warehouses', 'list', {}])).toEqual({ items: ['Almacén compartido'] });
  });

  it('conserva lo escrito si falla la verificación y reintenta sin recargar', async () => {
    const client = renderSession(); await screen.findByText('OT COMPARTIDA'); await refresh(client);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir gestión' }));
    fireEvent.change(screen.getByLabelText('Nota de trabajo'), { target: { value: 'No perder' } });
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Sin conexión'));
    await refresh(client);
    expect(screen.getByLabelText('Nota de trabajo')).toHaveValue('No perder');
    revision = 'all-v2'; mode = 'all'; await refresh(client);
    expect(screen.getByLabelText('Nota de trabajo')).toHaveValue('No perder');
  });

  it('revalida al volver al foco y cada 30 segundos, sin desmontar el editor', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); focusManager.setFocused(true);
    const client = renderSession(); await screen.findByText('OT COMPARTIDA'); await refresh(client);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir gestión' }));
    const input = screen.getByLabelText('Nota de trabajo');
    await waitFor(() => expect(client.getQueryData(['sales-access', 'session', 7])).toMatchObject({ revision: 'selected-v1' }));
    revision = 'all-v2'; mode = 'all';
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(client.getQueryData(['sales-access', 'session', 7])).toMatchObject({ revision: 'all-v2' }));
    await waitFor(() => expect(client.getQueryData(['sales-access', 'cache-epoch'])).toBe(1));
    revision = 'selected-v3'; mode = 'selected';
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(client.getQueryData(['sales-access', 'session', 7])).toMatchObject({ revision: 'selected-v3' }));
    await waitFor(() => expect(client.getQueryData(['sales-access', 'cache-epoch'])).toBe(2));
    expect(screen.getByLabelText('Nota de trabajo')).toBe(input);
  });

  it('puede recuperar un detalle denegado después de que se vuelva a compartir', async () => {
    const client = renderSession(); await screen.findByText('OT COMPARTIDA'); await refresh(client);
    accessible = false; revision = 'own-v2'; await refresh(client); await screen.findByText('Orden no disponible');
    accessible = true; revision = 'selected-v3'; await refresh(client);
    expect(await screen.findByText('OT COMPARTIDA')).toBeInTheDocument();
  });

  it('no mantiene filas revocadas como placeholder durante una búsqueda pendiente', async () => {
    let resolveList: ((value: AxiosResponse) => void) | undefined;
    const original = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/work-orders') return accessible
        ? Promise.resolve({ data: { items: [{ id: 10, codigo: 'FILA COMPARTIDA' }], total: 1 } } as AxiosResponse)
        : new Promise<AxiosResponse>((resolve) => { resolveList = resolve; });
      return original(url, config);
    });
    function List() {
      const [search, setSearch] = useState('');
      const list = useWorkOrders({ search });
      return <><input aria-label="Buscar OT" value={search} onChange={(event) => setSearch(event.target.value)} />{list.data?.items.map((item) => <p key={item.id}>{item.codigo}</p>)}</>;
    }
    function Board() { useSalesAccessSession(); return <List />; }
    const client = renderSession(<Board />); await screen.findByText('FILA COMPARTIDA'); await refresh(client);
    accessible = false;
    fireEvent.change(screen.getByLabelText('Buscar OT'), { target: { value: 'otra' } });
    expect(screen.getByText('FILA COMPARTIDA')).toBeInTheDocument();
    revision = 'own-v2'; mode = 'own'; await refresh(client);
    await waitFor(() => expect(screen.queryByText('FILA COMPARTIDA')).not.toBeInTheDocument());
    await act(async () => { resolveList?.({ data: { items: [], total: 0 } } as AxiosResponse); });
  });
});
