import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { insightAlerts, insightHistory, insightSettings } from '../../../test/fixtures/workshop-insights';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderAlertsPanel from '../WorkOrderAlertsPanel';
import { WorkOrderMechanicPanel } from '../WorkOrderMechanicPanel';
import WorkshopAlertsPanel from '../WorkshopAlertsPanel';
import WorkshopOperationsModal from '../WorkshopOperationsModal';

import type { WorkOrder } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
vi.mock('../WorkshopTimePanel', () => ({ default: ({ onState }: { onState: (dirty: boolean, pending: boolean) => void }) => <button onClick={() => onState(true, false)}>Horas sin guardar</button> }));
vi.mock('../../settings/WorkshopPersonnelPanel', () => ({ default: () => <p>Jornada existente</p> }));
vi.mock('../WorkOrderLaborBoard', () => ({ default: () => <p>Trabajos existentes</p> }));
vi.mock('../WorkOrderTimeDetails', () => ({ default: () => null }));
vi.mock('../WorkOrderQualityPanel', () => ({ default: () => null }));
vi.mock('../WorkOrderPriceSuggestions', () => ({ default: () => <p>Precios existentes</p> }));
vi.mock('../WorkOrderMechanicPriceRequest', () => ({ default: () => null }));
let client: QueryClient; let order: WorkOrder; let summary: typeof insightAlerts; let settings: typeof insightSettings;
const onState = vi.fn();
const wrap = (node: React.ReactNode) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
const role = (value: 'admin' | 'jefe' | 'mecanico', id = 7) => useAuthStore.setState({ user: { id, nombre: value, email: 'qa@example.test', role: value } });
beforeEach(() => {
  vi.resetAllMocks(); role('jefe');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  order = structuredClone(workshopRoleOrders[0]); summary = structuredClone(insightAlerts); settings = structuredClone(insightSettings);
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/history') ? { history: insightHistory } : url.endsWith('/alert-settings') ? { settings } : url.endsWith('/alerts') ? { summary } : { items: [], mechanics: [] } }));
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe('Operational alert panels', () => {
  it('shows the count, priorities, missing schedule and supervisor manage links immediately', async () => {
    render(wrap(<WorkOrderAlertsPanel workOrder={order} />));
    await screen.findByText('3 avisos');
    expect(screen.getByText('Horas superiores al estimado')).toBeInTheDocument();
    expect(screen.getByText('Diferencia comercial')).toBeInTheDocument();
    expect(screen.getByText(/La jornada del taller no está configurada/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Abrir trabajo/ })[0]).toHaveAttribute('href', '/work-orders?manage=41');
  });

  it('shows only assigned personal operational alerts and excludes prices and other workers for mechanics', async () => {
    role('mecanico', 9);
    summary.alerts.push({ ...summary.alerts[2], id: 'own-price', userId: 9 });
    summary.alerts.push({ ...summary.alerts[0], id: 'own-parts', kind: 'waiting_parts', priority: 'normal', title: 'Espera de repuesto propio' });
    render(wrap(<WorkOrderAlertsPanel workOrder={order} />));
    await screen.findByText('Espera de repuesto propio');
    expect(screen.getByText('2 avisos')).toBeInTheDocument();
    expect(screen.queryByText('Registro de otro trabajador')).not.toBeInTheDocument();
    expect(screen.queryByText('Diferencia comercial')).not.toBeInTheDocument();
    expect(screen.queryByText(/30.000/)).not.toBeInTheDocument();
  });

  it('does not fetch for an explicitly empty managed team despite stale legacy assignments', () => {
    role('mecanico', 9);
    order = { ...order, items: order.items?.map((item) => ({ ...item, teamManaged: true, assignments: [] })) };
    render(wrap(<WorkOrderAlertsPanel workOrder={order} />));
    expect(screen.queryByText('Mis alertas de esta OT')).not.toBeInTheDocument(); expect(api.get).not.toHaveBeenCalled();
  });

  it('stops collapsed and inactive alert queries and retries failed requests without claiming there are no alerts', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Sin conexión'));
    const mounted = render(wrap(<WorkOrderAlertsPanel workOrder={order} />));
    await screen.findByRole('alert');
    expect(screen.queryByText('Sin alertas operativas para esta consulta.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar alertas' }));
    await screen.findByText('3 avisos');
    fireEvent.click(screen.getByText('Alertas de esta OT').closest('summary')!);
    await waitFor(() => expect(screen.getByText('Alertas de esta OT').closest('details')).not.toHaveAttribute('open'));
    const calls = vi.mocked(api.get).mock.calls.length;
    await act(async () => { await client.invalidateQueries({ queryKey: ['work-orders'] }); });
    expect(api.get).toHaveBeenCalledTimes(calls);
    mounted.rerender(wrap(<WorkOrderAlertsPanel workOrder={order} active={false} />));
    await act(async () => { await client.invalidateQueries({ queryKey: ['work-orders'] }); });
    expect(api.get).toHaveBeenCalledTimes(calls);
  });

  it('keeps chief and mechanic settings read-only and fetches them only when expanded', async () => {
    render(wrap(<WorkshopAlertsPanel initialDate="2026-11-16" onState={onState} />));
    await screen.findByText('3 avisos');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url.endsWith('/alert-settings'))).toBe(false);
    fireEvent.click(screen.getByText('Tolerancias de las alertas', { selector: 'summary' }));
    await screen.findByText(/Tolerancia de tiempo: 20%/);
    expect(screen.queryByRole('button', { name: 'Guardar tolerancias' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe('Alert integration and existing draft guards', () => {
  it('opens global alerts from the new tab, retains the selected jornada day across clean tab switches and preserves time draft protection', async () => {
    const onClose = vi.fn();
    render(wrap(<WorkshopOperationsModal onClose={onClose} />));
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Horas sin guardar' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Alertas' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('tab', { name: 'Horas y solicitudes' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Alertas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    await screen.findByText('3 avisos');
    fireEvent.change(screen.getByLabelText('Día de jornada'), { target: { value: '2026-11-15' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders/operations/alerts', expect.objectContaining({ params: { fecha: '2026-11-15' } })));
    fireEvent.click(screen.getByRole('tab', { name: 'Horas y solicitudes' }));
    const calls = vi.mocked(api.get).mock.calls.length;
    await act(async () => { await client.invalidateQueries({ queryKey: ['work-orders'] }); });
    expect(api.get).toHaveBeenCalledTimes(calls);
    fireEvent.click(screen.getByRole('tab', { name: 'Alertas' }));
    expect(screen.getByLabelText('Día de jornada')).toHaveValue('2026-11-15'); expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('tablist')).toHaveClass('flex-wrap');
  });

  it('preserves decimal tolerance drafts on error, blocks pending navigation and protects unsaved settings on close', async () => {
    role('admin'); const onClose = vi.fn();
    render(wrap(<WorkshopOperationsModal onClose={onClose} />));
    fireEvent.click(screen.getByRole('tab', { name: 'Alertas' }));
    fireEvent.click(await screen.findByText('Tolerancias de las alertas', { selector: 'summary' }));
    const time = await screen.findByLabelText('Tolerancia de tiempo (%)');
    fireEvent.change(time, { target: { value: '0.5' } });
    expect(time).toBeValid(); expect(time).toHaveAttribute('step', '0.01');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    let reject: ((failure: Error) => void) | undefined;
    vi.mocked(api.patch).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tolerancias' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Horas y solicitudes' })).toBeDisabled());
    fireEvent.keyDown(document, { key: 'Escape' }); expect(onClose).not.toHaveBeenCalled();
    await act(async () => reject?.(new Error('Sin conexión')));
    await screen.findByRole('alert'); expect(time).toHaveValue(0.5);
    vi.mocked(api.patch).mockImplementationOnce(async () => { settings = { ...settings, timeTolerancePercent: 0.5 }; return { data: { settings } }; });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tolerancias' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Horas y solicitudes' })).toBeEnabled());
    expect(api.patch).toHaveBeenLastCalledWith('/work-orders/operations/alert-settings', { timeTolerancePercent: 0.5, commercialTolerancePercent: 10 });
  });

  it('keeps history filter drafts across execution/prices and pauses both insight queries when the manage view is hidden', async () => {
    const onDirtyChange = vi.fn();
    const mounted = render(wrap(<WorkOrderMechanicPanel workOrder={order} section="execution" onDirtyChange={onDirtyChange} />));
    fireEvent.click(screen.getByText('Horas, alertas e historial', { selector: 'summary' }));
    fireEvent.click(screen.getByText('Comparar trabajos anteriores').closest('summary')!);
    await screen.findByText('Referencia de esta página');
    fireEvent.change(screen.getByLabelText('Buscar en trabajos anteriores'), { target: { value: 'Filtro pendiente' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    mounted.rerender(wrap(<WorkOrderMechanicPanel workOrder={order} section="prices" onDirtyChange={onDirtyChange} />));
    expect(screen.getByLabelText('Buscar en trabajos anteriores')).toHaveValue('Filtro pendiente');
    expect(screen.getByText('Precios existentes')).toBeInTheDocument();
    mounted.rerender(wrap(<WorkOrderMechanicPanel workOrder={order} section="prices" active={false} onDirtyChange={onDirtyChange} />));
    const calls = vi.mocked(api.get).mock.calls.length;
    await act(async () => { await client.invalidateQueries({ queryKey: ['work-orders'] }); });
    expect(api.get).toHaveBeenCalledTimes(calls);
  });
});
