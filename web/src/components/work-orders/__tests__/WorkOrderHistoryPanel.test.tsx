import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { insightHistory } from '../../../test/fixtures/workshop-insights';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderHistoryPanel from '../WorkOrderHistoryPanel';

import type { WorkOrder } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
let client: QueryClient; let order: WorkOrder; let history: typeof insightHistory;
const onState = vi.fn();
const view = (active = true) => <QueryClientProvider client={client}><WorkOrderHistoryPanel workOrder={order} active={active} onState={onState} /></QueryClientProvider>;
const expand = () => fireEvent.click(screen.getByText('Comparar trabajos anteriores').closest('summary')!);
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  order = structuredClone(workshopRoleOrders[0]); history = structuredClone(insightHistory);
  useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe' } });
  vi.mocked(api.get).mockImplementation(async (_url, config) => {
    const params = config?.params as { page?: number } | undefined;
    return { data: { history: { ...history, page: params?.page ?? 1 } } };
  });
});
afterEach(() => client.clear());

describe('Previous-work comparison', () => {
  it('fetches only after expansion and clearly distinguishes missing references from zero', async () => {
    history.reference = { samples: 0, hourSamples: 0, priceSamples: 0, averageHoursPerUnit: null, averageNetUnitPrice: null };
    history.items = []; history.total = 0; history.totalPages = 0;
    render(view()); expect(api.get).not.toHaveBeenCalled(); expand();
    await screen.findByText('Sin referencia de horas');
    expect(screen.getByText('Sin referencia de precio')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Referencia de esta página' })).toHaveTextContent('0 servicios · 0 con horas · 0 con precio neto');
    expect(screen.queryByRole('button', { name: /Aplicar precio/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Cantidad actual')).toHaveLength(1);
  });

  it('submits date, same-vehicle and search filters, paginates, and resets to page one for a new service', async () => {
    history.total = 20; history.totalPages = 2;
    render(view()); expand(); await screen.findByText('Referencia de esta página');
    fireEvent.change(screen.getByLabelText('Historial desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Historial hasta'), { target: { value: '2026-11-15' } });
    fireEvent.change(screen.getByLabelText('Buscar en trabajos anteriores'), { target: { value: '  Hilux  ' } });
    fireEvent.click(screen.getByLabelText('Solo el mismo vehículo'));
    expect(onState).toHaveBeenLastCalledWith(true, false);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros de historial' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders/41/items/10/history', expect.objectContaining({ params: { page: 1, pageSize: 10, fechaDesde: '2026-10-01', fechaHasta: '2026-11-15', sameVehicle: true, search: 'Hilux' } })));
    fireEvent.click(await screen.findByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders/41/items/10/history', expect.objectContaining({ params: expect.objectContaining({ page: 2 }) })));
    fireEvent.change(screen.getByLabelText('Servicio para comparar'), { target: { value: '11' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders/41/items/11/history', expect.objectContaining({ params: expect.objectContaining({ page: 1, sameVehicle: true }) })));
  });

  it('keeps filter drafts while inactive and defaults the selected service when items arrive late', async () => {
    const loaded = order.items; order = { ...order, items: [] };
    const mounted = render(view()); expand(); expect(api.get).not.toHaveBeenCalled();
    order = { ...order, items: loaded }; mounted.rerender(view());
    await screen.findByText('Referencia de esta página');
    expect(screen.getByLabelText('Servicio para comparar')).toHaveValue('10');
    fireEvent.change(screen.getByLabelText('Buscar en trabajos anteriores'), { target: { value: 'Borrador conservado' } });
    mounted.rerender(view(false));
    await client.invalidateQueries({ queryKey: ['work-orders'] });
    expect(api.get).toHaveBeenCalledTimes(1);
    mounted.rerender(view());
    expect(screen.getByLabelText('Buscar en trabajos anteriores')).toHaveValue('Borrador conservado');
  });

  it('never renders or fetches history for mechanics', () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'qa@example.test', role: 'mecanico' } });
    render(view()); expect(screen.queryByText('Comparar trabajos anteriores')).not.toBeInTheDocument(); expect(api.get).not.toHaveBeenCalled();
  });

  it('opens a requested comparison, links the original order in another tab, and keeps criteria collapsible', async () => {
    history.items = [{ workOrderId: 3, codigo: 'OT-26-03', fechaIngreso: '2026-10-01', estado: 'entregada', vehicle: null, itemId: 2, description: 'Revisión de suspensión', quantity: 2, unit: 'servicio', estimatedHours: null, actualHours: 4, hoursPerUnit: 2, netUnitPrice: 15000, qualityApproved: false }];
    render(<QueryClientProvider client={client}><WorkOrderHistoryPanel workOrder={order} requestedItem={{ itemId: 10 }} onState={onState} /></QueryClientProvider>);
    const link = await screen.findByRole('link', { name: /OT-26-03/ });
    expect(link).toHaveAttribute('href', '/work-orders/3'); expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Criterios de comparación').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('region', { name: 'Referencia de esta página' })).toHaveTextContent('15.000');
  });

  it('preserves filters on failure and explains an empty same-vehicle result', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Sin conexión'));
    render(view()); expand(); await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Buscar en trabajos anteriores'), { target: { value: 'Reintento' } });
    history.items = []; history.notes = ['La OT actual no tiene vehículo asociado.'];
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }));
    await screen.findByText('Sin trabajos anteriores comparables para estos filtros.');
    expect(screen.getByLabelText('Buscar en trabajos anteriores')).toHaveValue('Reintento');
    fireEvent.click(screen.getByText('Criterios de comparación'));
    expect(screen.getByText('La OT actual no tiene vehículo asociado.')).toBeInTheDocument();
  });
});
