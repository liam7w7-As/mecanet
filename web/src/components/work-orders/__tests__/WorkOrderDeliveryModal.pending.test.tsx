import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderDeliveryModal from '../WorkOrderDeliveryModal';

import type { WorkOrder } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
let client: QueryClient; let order: WorkOrder;
const open = (onClose: () => void) => render(<QueryClientProvider client={client}><WorkOrderDeliveryModal workOrder={order} onClose={onClose} /></QueryClientProvider>);
const fillDelivery = () => {
  for (const [label, value] of [['Kilometraje de salida', '98010'], ['Nombre de quien recibe', 'Cliente de prueba'], ['RUT / Identificación', '123456785'], ['Teléfono de contacto', '+56912345678'], ['Firma nominativa del receptor', 'Cliente de prueba'], ['Observaciones de salida', 'Entrega revisada']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
};
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  order = { ...structuredClone(workshopRoleOrders[0]), estado: 'finalizada', qualityApprovedAt: '2026-11-16T12:00:00Z', unpricedServices: [] };
});
afterEach(() => client.clear());

describe('Delivery pending close protection', () => {
  it('blocks backdrop, header X, Volver and Escape during submission and preserves the form after failure', async () => {
    let reject: ((failure: Error) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const onClose = vi.fn(); open(onClose); fillDelivery();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const backdrop = screen.getByRole('button', { name: 'Cerrar entrega' });
    const header = screen.getByRole('button', { name: 'Cerrar' });
    const back = screen.getByRole('button', { name: 'Volver' });
    await waitFor(() => expect(header).toBeDisabled());
    expect(backdrop).toBeDisabled(); expect(back).toBeDisabled();
    fireEvent.click(backdrop); fireEvent.click(header); fireEvent.click(back);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Observaciones de salida')).toHaveValue('Entrega revisada');
    await act(async () => reject?.(new Error('Sin conexión')));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Firma nominativa del receptor')).toHaveValue('Cliente de prueba');
    expect(screen.getByLabelText('Observaciones de salida')).toHaveValue('Entrega revisada');
    expect(screen.getAllByRole('checkbox').every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(backdrop).toBeEnabled(); expect(header).toBeEnabled(); expect(back).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(header); expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once after server confirmation rather than blocking the success callback', async () => {
    let finish: ((response: { data: { workOrder: WorkOrder } }) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onClose = vi.fn(); open(onClose); fillDelivery();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish?.({ data: { workOrder: { ...order, estado: 'entregada' } } }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
