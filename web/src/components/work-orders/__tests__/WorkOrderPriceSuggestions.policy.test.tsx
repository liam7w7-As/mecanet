import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import * as permissions from '../../../lib/permissions';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderPriceSuggestions from '../WorkOrderPriceSuggestions';

import type { WorkOrderPricePolicy } from '../../../hooks/useWorkOrderLabor';
import type { WorkOrder, WorkOrderPriceSuggestion } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
const proposal: WorkOrderPriceSuggestion = { id: 5, workOrderId: 41, workOrderItemId: 10, itemDescripcion: 'Revisión de suspensión', horasEstimadas: 2, horasReales: 1, precioActualOt: 0, precioActualCatalogo: null, precioSugerido: 25000, alcance: 'ot', motivo: 'Diagnóstico completado', estado: 'pendiente', createdByName: 'Ana Jefa', reviewNote: null, reviewedAt: null, createdAt: '2026-11-16T12:00:00Z' };
let client: QueryClient;
let order: WorkOrder;
let policy: WorkOrderPricePolicy;
let suggestions: WorkOrderPriceSuggestion[];
const dirty = vi.fn(); const pending = vi.fn();
const renderPanel = () => render(<QueryClientProvider client={client}><WorkOrderPriceSuggestions workOrder={order} requestedItem={{ itemId: 10 }} onDirtyChange={dirty} onPendingChange={pending} /></QueryClientProvider>);
const fill = (price = '25000', reason = 'Diagnóstico completado') => {
  fireEvent.change(screen.getByLabelText('Precio sugerido'), { target: { value: price } });
  fireEvent.change(screen.getByLabelText('Motivo de la propuesta'), { target: { value: reason } });
};
const saveApplied = () => {
  const suggestion = { ...proposal, estado: 'aprobada' as const, appliedDirectly: true };
  suggestions = [suggestion];
  return { data: { suggestion } };
};

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  order = structuredClone(workshopRoleOrders[0]);
  order.items![0].precioUnitario = 0;
  order.items![0].qualityStatus = 'aprobado';
  order.contact = { clientId: 3, nombre: 'Contacto actual', telefono: '+56 9 1234 5678', rut: null, email: 'contacto@example.test' };
  order.client = { id: 1, nombre: 'Cliente de facturación', telefono: '+56 9 1111 1111', rut: null };
  policy = { approvalRequired: true, canConfigure: false };
  suggestions = [];
  useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/price-policy') ? { policy } : { suggestions } }));
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe('Per-order price controls', () => {
  it('requires a positive price and reason for a zero-priced service without changing prices while approval is pending', async () => {
    order.items![0].estadoOperativo = 'pendiente';
    order.items![0].qualityStatus = 'pendiente';
    renderPanel();
    await screen.findByLabelText('Precio sugerido');
    fill('0');
    expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeDisabled();
    fill('25000', 'x');
    expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeDisabled();
    fill();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeEnabled());
    vi.mocked(api.post).mockResolvedValueOnce({ data: { suggestion: proposal } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a administración' }));
    await screen.findByText(/Propuesta enviada a administración/);
    expect(api.post).toHaveBeenCalledWith('/work-orders/41/price-suggestions', { workOrderItemId: 10, precioSugerido: 25000, alcance: 'ot', motivo: proposal.motivo });
    expect(screen.queryByRole('link', { name: 'Preparar aviso por WhatsApp' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('applies directly only to this order and offers manual WhatsApp with the current contact phone', async () => {
    policy.approvalRequired = false;
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPanel(); fill();
    const apply = await screen.findByRole('button', { name: 'Aplicar precio en esta OT' });
    vi.mocked(api.post).mockImplementationOnce(async () => saveApplied());
    fireEvent.click(apply);
    await screen.findByText('Precio aplicado en esta OT. El catálogo se mantuvo.');
    const link = screen.getByRole('link', { name: 'Preparar aviso por WhatsApp' });
    const href = new URL(link.getAttribute('href')!);
    expect(href.hostname).toBe('wa.me'); expect(href.pathname).toBe('/56912345678');
    expect(href.searchParams.get('text')).toContain('Contacto actual');
    expect(href.searchParams.get('text')).toContain('OT-26-41');
    expect(href.searchParams.get('text')).toContain(proposal.motivo);
    expect(link).toHaveAttribute('target', '_blank');
    expect(open).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Ver propuestas revisadas', { selector: 'summary' }));
    expect(screen.getByText('Aplicado directamente en esta OT')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar propuesta' })).not.toBeInTheDocument();
  });

  it('uses the returned pending state even when the policy previously allowed direct application', async () => {
    policy.approvalRequired = false;
    renderPanel(); fill();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { suggestion: proposal } });
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar precio en esta OT' }));
    await screen.findByText(/Propuesta enviada a administración/);
    expect(screen.queryByText(/Precio aplicado en esta OT/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Preparar aviso por WhatsApp' })).not.toBeInTheDocument();
  });

  it('requires administration approval for catalog scopes even when direct OT pricing is allowed', async () => {
    policy.approvalRequired = false;
    order.items![0].catalogItemId = 3;
    renderPanel(); fill();
    await screen.findByRole('button', { name: 'Aplicar precio en esta OT' });
    fireEvent.change(screen.getByLabelText('Alcance de la propuesta'), { target: { value: 'catalogo' } });
    expect(screen.getByText(/^Nuevo precio de catálogo:/)).toHaveTextContent('25.000');
    expect(screen.queryByText(/Diferencia en esta OT:/)).not.toBeInTheDocument();
    expect(screen.getByText(/La OT mantendrá su precio/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeEnabled();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { suggestion: { ...proposal, alcance: 'catalogo' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a administración' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/work-orders/41/price-suggestions', { workOrderItemId: 10, precioSugerido: 25000, alcance: 'catalogo', motivo: proposal.motivo }));
  });

  it('preserves direct-price drafts on error and propagates modal pending state', async () => {
    policy.approvalRequired = false;
    renderPanel(); fill();
    let fail: ((failure: Error) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar precio en esta OT' }));
    await waitFor(() => expect(pending).toHaveBeenLastCalledWith(true));
    expect(screen.getByLabelText('Precio sugerido')).toBeDisabled();
    await act(async () => fail?.(new Error('Sin conexión')));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Precio sugerido')).toHaveValue('25.000');
    expect(screen.getByLabelText('Motivo de la propuesta')).toHaveValue(proposal.motivo);
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(pending).toHaveBeenLastCalledWith(false);
    vi.mocked(api.post).mockImplementationOnce(async () => saveApplied());
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar precio en esta OT' }));
    await screen.findByText(/Precio aplicado en esta OT/);
    expect(dirty).toHaveBeenLastCalledWith(false);
  });

  it('preserves failed policy selections and changes the action mode only after a successful policy save', async () => {
    policy.canConfigure = true;
    useAuthStore.setState({ user: { id: 1, nombre: 'Admin', email: 'qa@example.test', role: 'admin' } });
    renderPanel(); fill();
    fireEvent.click(await screen.findByText('Política de precios de esta OT', { selector: 'summary' }));
    const choice = screen.getByLabelText('Aprobación de precios de esta OT');
    fireEvent.change(choice, { target: { value: 'false' } });
    expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeInTheDocument();
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política de esta OT' }));
    await screen.findByRole('alert');
    expect(choice).toHaveValue('false');
    expect(screen.getByLabelText('Precio sugerido')).toHaveValue('25.000');
    vi.mocked(api.patch).mockImplementationOnce(async () => { policy = { ...policy, approvalRequired: false }; return { data: { policy } }; });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política de esta OT' }));
    await screen.findByRole('button', { name: 'Aplicar precio en esta OT' });
    expect(api.patch).toHaveBeenLastCalledWith('/work-orders/41/price-policy', { approvalRequired: false });
    expect(screen.getByLabelText('Motivo de la propuesta')).toHaveValue(proposal.motivo);
  });

  it('hides create, review and policy mutations from an administrator without workshop update permission', async () => {
    vi.spyOn(permissions, 'hasUserPermission').mockImplementation((_user, _module, action) => action !== 'update');
    policy.canConfigure = true; suggestions = [proposal];
    useAuthStore.setState({ user: { id: 1, nombre: 'Consulta', email: 'qa@example.test', role: 'admin', permissions: [{ modulo: 'taller', accion: 'read' }] } });
    renderPanel(); await screen.findByText('Pendiente de aprobación');
    expect(screen.queryByRole('button', { name: /Enviar a administración|Aplicar precio|Aprobar propuesta|Rechazar propuesta|Guardar política/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Precio sugerido')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });

  it('keeps proposal drafts when update permission is removed and restored', async () => {
    renderPanel(); fill();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeEnabled());
    act(() => useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe', permissions: [{ modulo: 'taller', accion: 'read' }] } }));
    expect(screen.queryByRole('button', { name: 'Enviar a administración' })).not.toBeInTheDocument();
    expect(dirty).toHaveBeenLastCalledWith(true);
    act(() => useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe' } }));
    expect(screen.getByLabelText('Precio sugerido')).toHaveValue('25.000');
    expect(screen.getByLabelText('Motivo de la propuesta')).toHaveValue(proposal.motivo);
  });

  it('retains drafts and blocks new prices until a failed policy query is retried', async () => {
    let failed = false;
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url.endsWith('/price-policy') && !failed) { failed = true; throw new Error('Sin conexión'); }
      return { data: url.endsWith('/price-policy') ? { policy } : { suggestions } };
    });
    renderPanel(); fill(); await screen.findByRole('button', { name: 'Reintentar política de precios' });
    expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeDisabled();
    expect(screen.getByLabelText('Precio sugerido')).toHaveValue('25.000');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar política de precios' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar a administración' })).toBeEnabled());
  });

  it('does not substitute a billing phone when the current contact has none', async () => {
    suggestions = [{ ...proposal, estado: 'aprobada', appliedDirectly: true }];
    order.contact!.telefono = null;
    renderPanel(); fireEvent.click(await screen.findByText('Ver propuestas revisadas', { selector: 'summary' }));
    expect(screen.queryByRole('link', { name: 'Preparar aviso por WhatsApp' })).not.toBeInTheDocument();
    expect(screen.getByText(/El contacto de esta OT no tiene teléfono/)).toBeInTheDocument();
  });

  it('updates manual WhatsApp links with the current contact and omits them for catalog-only adjustments', async () => {
    suggestions = [{ ...proposal, estado: 'aprobada' }, { ...proposal, id: 6, estado: 'aprobada', alcance: 'catalogo' }];
    const mounted = renderPanel(); fireEvent.click(await screen.findByText('Ver propuestas revisadas', { selector: 'summary' }));
    expect(screen.getAllByRole('link', { name: 'Preparar aviso por WhatsApp' })).toHaveLength(1);
    order = { ...order, contact: { ...order.contact!, telefono: '+56 9 8765 4321' } };
    mounted.rerender(<QueryClientProvider client={client}><WorkOrderPriceSuggestions workOrder={order} onDirtyChange={dirty} onPendingChange={pending} /></QueryClientProvider>);
    expect(screen.getByRole('link', { name: 'Preparar aviso por WhatsApp' })).toHaveAttribute('href', expect.stringContaining('https://wa.me/56987654321?'));
    expect(screen.queryByText('Aplicado directamente en esta OT')).not.toBeInTheDocument();
  });

  it('preserves failed administration review notes and retries approval', async () => {
    suggestions = [proposal];
    useAuthStore.setState({ user: { id: 1, nombre: 'Admin', email: 'qa@example.test', role: 'admin' } });
    renderPanel(); await screen.findByRole('button', { name: 'Aprobar propuesta' });
    const note = screen.getByLabelText('Comentario para Revisión de suspensión');
    fireEvent.change(note, { target: { value: 'Autorizado por diagnóstico' } });
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar propuesta' }));
    await screen.findByRole('alert'); expect(note).toHaveValue('Autorizado por diagnóstico');
    vi.mocked(api.patch).mockImplementationOnce(async () => { const saved = { ...proposal, estado: 'aprobada' as const, appliedDirectly: false }; suggestions = [saved]; return { data: { suggestion: saved } }; });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar propuesta' }));
    await screen.findByText(/Propuesta aprobada. Los importes/);
    expect(api.patch).toHaveBeenLastCalledWith('/work-orders/41/price-suggestions/5', { decision: 'aprobar', comentario: 'Autorizado por diagnóstico' });
  });
});
