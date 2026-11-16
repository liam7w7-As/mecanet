import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import { WorkOrderMechanicPanel } from '../WorkOrderMechanicPanel';
import WorkOrderMechanicPriceRequest from '../WorkOrderMechanicPriceRequest';

import type { WorkOrder, WorkOrderRequest } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
vi.mock('../WorkOrderLaborBoard', () => ({ default: () => null }));
vi.mock('../WorkOrderTimeDetails', () => ({ default: () => null }));
vi.mock('../WorkOrderQualityPanel', () => ({ default: () => null }));
vi.mock('../WorkOrderPriceSuggestions', () => ({ default: () => null }));
let client: QueryClient;
let order: WorkOrder;
const forwarded: WorkOrderRequest = { id: 8, tipo: 'aumento_precio', estado: 'aprobada', workOrderItemId: 10, catalogItemId: null, motivo: 'Complejidad adicional', cantidad: null, precioSugerido: 25000, precioAprobado: null, reviewNote: 'Derivada a administración', reviewedAt: '2026-11-16T12:00:00Z', deliveredWarehouseId: null, deliveredBy: null, deliveredAt: null, deliveryNote: null, createdAt: '2026-11-16T11:00:00Z', requester: { id: 9, nombre: 'Carlos' }, workOrderItem: { id: 10, descripcion: 'Revisión de suspensión', precioUnitario: 0 } };
const dirty = vi.fn(); const pending = vi.fn();
const open = () => render(<QueryClientProvider client={client}><WorkOrderMechanicPriceRequest workOrder={order} requestedItem={{ itemId: 10 }} onDirtyChange={dirty} onPendingChange={pending} /></QueryClientProvider>);

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  order = structuredClone(workshopRoleOrders[0]);
  order.priceApprovalRequired = false;
  order.items![0].precioUnitario = 0;
  order.items![0].qualityStatus = 'aprobado';
  useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockResolvedValue({ data: { items: [], mechanics: [] } });
});
afterEach(() => client.clear());

describe('Mechanic price requests and forwarded approval state', () => {
  it('keeps a mechanic request pending for a zero-priced approved service even when direct supervisor pricing is enabled', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Precio sugerido'), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText('Motivo de la propuesta'), { target: { value: 'Diagnóstico terminado' } });
    expect(screen.getByText('Motivo de la propuesta (visible para el cliente)')).toBeInTheDocument();
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar al jefe de taller' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Precio sugerido')).toHaveValue('25.000');
    expect(screen.getByLabelText('Motivo de la propuesta')).toHaveValue('Diagnóstico terminado');
    vi.mocked(api.post).mockResolvedValueOnce({ data: { request: forwarded } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar al jefe de taller' }));
    await screen.findByText(/Sugerencia enviada al jefe/);
    expect(api.post).toHaveBeenLastCalledWith('/work-orders/41/requests', { tipo: 'aumento_precio', workOrderItemId: 10, precioSugerido: 25000, motivo: 'Diagnóstico terminado' });
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Aplicar precio en esta OT' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it('shows forwarded requests as pending administration rather than applied in the mechanic history', () => {
    order.requests = [forwarded];
    open();
    expect(screen.getByText('Pendiente de administración')).toHaveClass('gold');
    expect(screen.queryByText('aprobada', { exact: true })).not.toBeInTheDocument();
  });

  it('uses the same pending administration label in the chief request history', () => {
    useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe' } });
    order.requests = [forwarded];
    const mounted = render(<QueryClientProvider client={client}><WorkOrderMechanicPanel workOrder={order} section="requests" /></QueryClientProvider>);
    const history = mounted.container.querySelector('.workshop-request-history')!;
    expect(within(history as HTMLElement).getByText('Pendiente de administración')).toHaveClass('bg-brand-goldPale');
    expect(within(history as HTMLElement).queryByText('aprobada', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps the legacy applied label when a request has an approved price', () => {
    order.requests = [{ ...forwarded, precioAprobado: 25000 }];
    open();
    expect(screen.getByText('aprobada', { exact: true })).toHaveClass('green');
    expect(screen.queryByText('Pendiente de administración')).not.toBeInTheDocument();
  });

  it('uses the safe approval flag after application even when private prices are hidden from the mechanic', () => {
    order.requests = [{ ...forwarded, precioSugerido: null, precioAprobado: null, pendingPriceApproval: false }];
    open();
    expect(screen.getByText('aprobada', { exact: true })).toHaveClass('green');
    expect(screen.queryByText('Pendiente de administración')).not.toBeInTheDocument();
  });

  it('disables mechanic proposal mutation without workshop update permission', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico', permissions: [{ modulo: 'taller', accion: 'read' }] } });
    open();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enviar al jefe de taller' })).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
  });
});
