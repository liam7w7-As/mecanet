import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import { WorkOrderMechanicPanel } from '../WorkOrderMechanicPanel';

import type { WorkOrderQuality, WorkOrderQualityResponse } from '../../../hooks/useWorkOrderQuality';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
vi.mock('../WorkOrderLaborBoard', () => ({ default: () => <p>Trabajos existentes</p> }));
vi.mock('../WorkOrderTimeDetails', () => ({ default: () => <p>Horas existentes</p> }));
vi.mock('../WorkOrderPriceSuggestions', () => ({ default: () => null }));
vi.mock('../WorkOrderMechanicPriceRequest', () => ({ default: () => null }));
vi.mock('../WorkOrderAlertsPanel', () => ({ default: () => null }));
vi.mock('../WorkOrderHistoryPanel', () => ({ default: () => null }));
const order = workshopRoleOrders[0];
const quality: WorkOrderQuality = { workOrderId: order.id, estado: 'en_progreso', approvedAt: null, approvedBy: null, approvalNote: null, canConfirm: false,
  items: [{ id: 10, descripcion: 'Suspensión', tipoLinea: 'especifico', estadoOperativo: 'completado', qualityStatus: 'pendiente', qualityReviewedAt: null, qualityReviewedBy: null, qualityNote: null }], history: [] };
let client: QueryClient;
const onDirtyChange = vi.fn(); const onPendingChange = vi.fn();
const open = (section: 'execution' | 'prices' = 'execution') => render(<QueryClientProvider client={client}><WorkOrderMechanicPanel workOrder={order} section={section} onDirtyChange={onDirtyChange} onPendingChange={onPendingChange} /></QueryClientProvider>);

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/quality') ? { quality } : { items: [], mechanics: [] } }));
});
afterEach(() => client.clear());

describe('Quality integration in Gestión de trabajos', () => {
  it('opens quality from Revisar calidad, keeps manual hours folded and propagates dirty and pending state to the managing modal', async () => {
    open();
    expect(screen.getByText('Trabajos existentes')).toBeVisible();
    expect(screen.getByText('Horas existentes')).not.toBeVisible();
    fireEvent.click(screen.getByText('Horas, alertas e historial', { selector: 'summary' }));
    expect(screen.getByText('Horas existentes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Revisar calidad/ }));
    const summary = screen.getByText('Control de calidad');
    expect(screen.getByText('Trabajos existentes').compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary.compareDocumentPosition(screen.getByText('Horas existentes')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary.closest('details')).toHaveAttribute('open');
    const item = await screen.findByRole('region', { name: 'Calidad de Suspensión' });
    expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeVisible();
    fireEvent.click(within(item).getByText('Notas y detalle').closest('summary')!);
    const note = within(item).getByLabelText('Nota de calidad de Suspensión');
    fireEvent.change(note, { target: { value: 'Revisión pendiente de guardar' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /Ver trabajos/ }));
    expect(note).not.toBeVisible();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /Revisar calidad/ }));
    expect(note).toBeVisible();
    expect(note).toHaveValue('Revisión pendiente de guardar');
    let fail: ((error: Error) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    fireEvent.click(within(item).getByRole('button', { name: 'Aprobar servicio' }));
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(true));
    expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeDisabled();
    await act(async () => fail?.(new Error('Sin conexión')));
    await within(item).findByRole('alert');
    expect(note).toHaveValue('Revisión pendiente de guardar');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
  });

  it('does not request quality while initially viewing the prices section', () => {
    open('prices');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url.endsWith('/quality'))).toBe(false);
  });

  it('does not mount quality for a seller viewing the operational panel', () => {
    useAuthStore.setState({ user: { id: 8, nombre: 'Ventas', email: 'qa@example.test', role: 'vendedor' } });
    open();
    expect(screen.queryByText('Control de calidad')).not.toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url.endsWith('/quality'))).toBe(false);
  });

  it('finishes an in-flight review without resetting unsaved work in the parent', async () => {
    let finish: ((response: { data: WorkOrderQualityResponse }) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    open();
    fireEvent.click(screen.getByRole('button', { name: /Revisar calidad/ }));
    const item = await screen.findByRole('region', { name: 'Calidad de Suspensión' });
    fireEvent.click(within(item).getByRole('button', { name: 'Aprobar servicio' }));
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(true));
    await act(async () => finish?.({ data: { quality: { ...quality, items: quality.items.map((item) => ({ ...item, qualityStatus: 'aprobado' })) } } }));
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByRole('button', { name: /Ver trabajos/ }));
    expect(screen.getByText('Trabajos existentes')).toBeVisible();
    fireEvent.click(screen.getByText('Horas, alertas e historial', { selector: 'summary' }));
    expect(screen.getByText('Horas existentes')).toBeVisible();
  });
});
