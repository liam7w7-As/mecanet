import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuotation } from '../../../hooks/useQuotations';
import { useWorkOrder, useWorkOrders } from '../../../hooks/useWorkOrders';
import { api } from '../../../lib/api';
import { salesScopeEpochKey } from '../../../lib/sales-access-cache';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders, workshopRoleSummary } from '../../../test/fixtures/workshop-roles';
import ClientFormModal from '../../clients/ClientFormModal';
import QuotationEditModal from '../../quotations/QuotationEditModal';
import VehicleFormModal from '../../vehicles/VehicleFormModal';
import AppLayout from '../AppLayout';

import type { Client, Quotation, Vehicle } from '../../../types/entities';
import type { SalesAccessMode } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

// Only transport is mocked: layout, PageTransition, Outlet, access hooks, and forms are real.
vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

const sellerId = 7;
const sessionKey = ['sales-access', 'session', sellerId];
const clientFixture: Client = {
  id: 3, nombre: 'Cliente de prueba', tipo: 'cliente', rut: null,
  email: null, telefono: null, direccion: null, region: null, comuna: null, notas: null,
  createdAt: '2026-11-12T12:00:00Z', updatedAt: '2026-11-12T12:00:00Z',
};
const vehicleFixture: Vehicle = {
  id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Hilux', ano: 2024,
  color: null, vinChasis: null, motor: null, kilometraje: 5000, combustible: null,
  transmision: null, clientId: null, createdAt: clientFixture.createdAt, updatedAt: clientFixture.updatedAt,
};
const quotationFixture: Quotation = {
  id: 20, codigo: 'COT-26-20', workOrderId: 10, clientId: clientFixture.id,
  vehicleId: vehicleFixture.id, asesorId: sellerId, estadoPago: 'por_pagar',
  subtotal: 10000, total: 10000, pagado: 0, notas: 'Nota original',
  createdAt: clientFixture.createdAt, updatedAt: clientFixture.updatedAt,
  items: [{
    id: 101, catalogItemId: null, descripcion: 'Servicio original', tipoLinea: 'estandar',
    unidadMedida: 'servicio', cantidad: 1, precioUnitario: 10000, subtotal: 10000,
    estadoOperativo: 'pendiente', notasOperativas: null,
  }],
};
const orders = [10, 11, 12].map((id) => ({ ...workshopRoleOrders[0], id, codigo: `OT-26-${id}` }));

interface ScopeSnapshot {
  mode: SalesAccessMode;
  revision: string;
  workOrderIds: number[];
  quotationIds: number[];
}
const scopeChanges: ScopeSnapshot[] = [
  { mode: 'selected', revision: 'unrelated-removal-v2', workOrderIds: [10], quotationIds: [20] },
  { mode: 'selected', revision: 'unrelated-addition-v3', workOrderIds: [10, 11, 12], quotationIds: [20, 21] },
  { mode: 'own', revision: 'own-v4', workOrderIds: [10], quotationIds: [20] },
  { mode: 'all', revision: 'all-v5', workOrderIds: [10, 11, 12], quotationIds: [20, 21] },
];
let scope: ScopeSnapshot;
let unexpectedGets: string[];
const queryClients: QueryClient[] = [];
const ids = (value: unknown): number[] => typeof value === 'string' ? value.split(',').map(Number) : [];
const response = (data: unknown) => ({ data } as AxiosResponse);

// These active queries make a revision change refresh real private data in the same Outlet.
function PrivateRecords() {
  const list = useWorkOrders({ page: 1, pageSize: 10 });
  useWorkOrder(10);
  useWorkOrder(11);
  return <output aria-label="Órdenes visibles">{list.data?.items.map((order) => order.codigo).join(', ')}</output>;
}

type DraftKind = 'client-create' | 'client-edit' | 'vehicle-create' | 'vehicle-edit' | 'quotation-query' | 'quotation-prop';
function DraftWorkspace({ kind, onClose }: { kind: DraftKind; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const quotation = useQuotation(kind === 'quotation-query' ? quotationFixture.id : 0);
  const close = () => { onClose(); setOpen(false); };
  return <section aria-label="Página de prueba de borradores">
    <h1>Borradores de prueba</h1>
    <PrivateRecords />
    <button type="button" onClick={() => setOpen(true)} disabled={kind === 'quotation-query' && !quotation.data}>
      Abrir borrador
    </button>
    {open && kind.startsWith('client-') && <ClientFormModal client={kind === 'client-edit' ? clientFixture : undefined} onClose={close} />}
    {open && kind.startsWith('vehicle-') && <VehicleFormModal vehicle={kind === 'vehicle-edit' ? vehicleFixture : undefined} onClose={close} />}
    {open && kind === 'quotation-query' && quotation.data && <QuotationEditModal quotation={quotation.data} onClose={close} />}
    {open && kind === 'quotation-prop' && <QuotationEditModal quotation={quotationFixture} onClose={close} />}
  </section>;
}

const renderWorkspace = async (kind: DraftKind) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 120_000, gcTime: Infinity }, mutations: { retry: false } },
  });
  queryClients.push(client);
  const onClose = vi.fn();
  const path = kind.startsWith('client-') ? '/clients' : kind.startsWith('vehicle-') ? '/vehicles' : '/quotations';
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path={path} element={<DraftWorkspace kind={kind} onClose={onClose} />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
  await waitFor(() => expect(client.getQueryData<{ revision: string }>(sessionKey)?.revision).toBe(scope.revision));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir borrador' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(client.isFetching()).toBe(0));
  return { client, onClose, dialog };
};

const refreshScope = async (client: QueryClient, next: ScopeSnapshot, epoch: number) => {
  scope = next;
  await act(async () => { await client.refetchQueries({ queryKey: sessionKey, exact: true }); });
  // Wait for the real session effect and its aggregate refreshes before inspecting DOM identity.
  await waitFor(() => expect(client.getQueryData(salesScopeEpochKey)).toBe(epoch));
  await waitFor(() => expect(client.isFetching()).toBe(0));
};
const metadataCalls = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === '/auth/sales-access');
const expectNoSaves = () => {
  expect(api.post).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
  expect(api.delete).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetAllMocks();
  unexpectedGets = [];
  scope = { mode: 'selected', revision: 'selected-v1', workOrderIds: [10, 11], quotationIds: [20] };
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({
    media, matches: media === '(min-width: 1024px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => true,
  }));
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return stored.size; }, clear: () => stored.clear(),
    getItem: (key: string) => stored.get(key) ?? null, key: (index: number) => [...stored.keys()][index] ?? null,
    removeItem: (key: string) => { stored.delete(key); }, setItem: (key: string, value: string) => { stored.set(key, value); },
  } satisfies Storage);
  useAuthStore.setState({
    user: { id: sellerId, nombre: 'Vendedor de prueba', email: 'seller@example.test', role: 'vendedor' },
    isAuthenticated: true, isLoading: false,
  });
  vi.mocked(api.get).mockImplementation(async (url, config) => {
    if (url === '/auth/sales-access') {
      const params = config?.params as { workOrderIds?: string; quotationIds?: string } | undefined;
      return response({ mode: scope.mode, revision: scope.revision, records: {
        workOrderIds: ids(params?.workOrderIds).filter((id) => scope.workOrderIds.includes(id)),
        quotationIds: ids(params?.quotationIds).filter((id) => scope.quotationIds.includes(id)),
      } });
    }
    if (url === '/dashboard/summary') return response(workshopRoleSummary);
    if (url === '/notifications/unread-count') return response({ noLeidas: 0 });
    if (url === '/notifications') return response({ items: [], total: 0, noLeidas: 0, page: 1, pageSize: 20, totalPages: 1 });
    if (url === '/customer-emails/preparation') return response({ enabled: false, jobs: [] });
    if (url === '/work-orders') return response({ items: orders.filter((order) => scope.workOrderIds.includes(order.id)), total: scope.workOrderIds.length, page: 1, pageSize: 10, totalPages: 1 });
    if (typeof url === 'string' && /^\/work-orders\/\d+$/.test(url)) {
      const order = orders.find((item) => item.id === Number(url.split('/').at(-1)));
      if (!order || !scope.workOrderIds.includes(order.id)) throw new Error('OT revocada');
      return response({ workOrder: order });
    }
    if (url === '/quotations/20') {
      if (!scope.quotationIds.includes(20)) throw new Error('Cotización revocada');
      return response({ quotation: quotationFixture });
    }
    if (url === '/clients') return response({ items: [clientFixture], total: 1, page: 1, pageSize: 8, totalPages: 1 });
    if (url === '/catalog') return response({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
    unexpectedGets.push(String(url));
    throw new Error(`GET sin fixture: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(unexpectedGets).toEqual([]);
});

describe('Sales access revisions through the real AppLayout and Outlet', () => {
  it.each([
    ['client-create', 'Nuevo cliente'], ['client-edit', 'Editar cliente'],
    ['vehicle-create', 'Nuevo vehículo'], ['vehicle-edit', 'Editar vehículo'],
  ] satisfies Array<[DraftKind, string]>)('preserves %s draft nodes and values through unrelated removal/addition and own/all modes', async (kind, title) => {
    const { client, dialog, onClose } = await renderWorkspace(kind);
    expect(dialog).toHaveAccessibleName(title);
    const isClient = kind.startsWith('client-');
    const labels = isClient ? ['Nombre completo', 'Correo electrónico'] : ['Marca', 'Modelo'];
    const values = isClient ? ['Cliente sin guardar', 'draft@example.test'] : ['Marca sin guardar', 'Modelo sin guardar'];
    const fields = labels.map((name) => within(dialog).getByRole('textbox', { name }));
    fields.forEach((field, index) => fireEvent.change(field, { target: { value: values[index] } }));
    const page = screen.getByRole('heading', { name: 'Borradores de prueba' });
    for (const [index, next] of scopeChanges.entries()) {
      await refreshScope(client, next, index + 1);
      expect(screen.getByRole('heading', { name: 'Borradores de prueba' }), next.revision).toBe(page);
      expect(screen.getByRole('dialog', { name: title }), next.revision).toBe(dialog);
      fields.forEach((field, fieldIndex) => {
        expect(within(dialog).getByRole('textbox', { name: labels[fieldIndex] }), next.revision).toBe(field);
        expect(field, next.revision).toHaveValue(values[fieldIndex]);
      });
      expect(screen.getByLabelText('Órdenes visibles')).toHaveTextContent(next.workOrderIds.map((id) => `OT-26-${id}`).join(', '));
      expect(onClose).not.toHaveBeenCalled();
    }
    expectNoSaves();
  });

  it.each(['quotation-query', 'quotation-prop'] satisfies DraftKind[])('preserves the actual %s editor while record 20 remains authorized', async (kind) => {
    const { client, dialog, onClose } = await renderWorkspace(kind);
    const notes = within(dialog).getByRole('textbox', { name: 'Notas comerciales' });
    const description = within(dialog).getByRole('textbox', { name: 'Descripción 1' });
    fireEvent.change(notes, { target: { value: 'Condiciones todavía sin guardar' } });
    fireEvent.change(description, { target: { value: 'Servicio todavía sin guardar' } });
    if (kind === 'quotation-prop') expect(client.getQueryState(['quotations', 'detail', 20])).toBeUndefined();
    for (const [index, next] of scopeChanges.entries()) {
      await refreshScope(client, next, index + 1);
      expect(screen.getByRole('dialog', { name: 'Editar cotización' }), next.revision).toBe(dialog);
      expect(within(dialog).getByRole('textbox', { name: 'Notas comerciales' }), next.revision).toBe(notes);
      expect(within(dialog).getByRole('textbox', { name: 'Descripción 1' }), next.revision).toBe(description);
      expect(notes).toHaveValue('Condiciones todavía sin guardar');
      expect(description).toHaveValue('Servicio todavía sin guardar');
      expect(onClose).not.toHaveBeenCalled();
      const params = metadataCalls().at(-1)?.[1]?.params as { workOrderIds?: string; quotationIds?: string };
      expect(ids(params.workOrderIds).sort()).toEqual([10, 11]);
      expect(ids(params.quotationIds)).toEqual([20]);
    }
    expectNoSaves();
  });

  it.each(['quotation-query', 'quotation-prop'] satisfies DraftKind[])('closes the actual %s editor only when record 20 is confirmed revoked', async (kind) => {
    const { client, dialog, onClose } = await renderWorkspace(kind);
    const notes = within(dialog).getByRole('textbox', { name: 'Notas comerciales' });
    fireEvent.change(notes, { target: { value: 'Borrador privado que debe retirarse' } });
    if (kind === 'quotation-prop') expect(client.getQueryState(['quotations', 'detail', 20])).toBeUndefined();
    await refreshScope(client, scopeChanges[0], 1);
    expect(screen.getByRole('dialog', { name: 'Editar cotización' })).toBe(dialog);
    expect(notes).toHaveValue('Borrador privado que debe retirarse');
    expect(onClose).not.toHaveBeenCalled();
    const page = screen.getByRole('heading', { name: 'Borradores de prueba' });
    await refreshScope(client, { mode: 'own', revision: 'quotation-revoked-v3', workOrderIds: [10], quotationIds: [] }, 2);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar cotización' })).not.toBeInTheDocument());
    expect(notes).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Borrador privado que debe retirarse')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Borradores de prueba' })).toBe(page);
    expectNoSaves();
  });
});
