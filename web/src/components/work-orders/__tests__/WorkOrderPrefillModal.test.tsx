import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderPrefillModal from '../WorkOrderPrefillModal';

import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn() }, setSessionExpiredHandler: vi.fn(), getCookie: vi.fn(),
}));
const order = { id: 12, codigo: 'OT-26-12', clientId: 7, vehicleId: 4,
  contactClientId: 7, billingClientId: 7, client: { nombre: 'Cliente anterior' }, vehicle: { patente: 'ABCD12' } };

describe('Load identification from another OT', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 1, nombre: 'Admin', role: 'admin', email: 'admin@test.cl' } });
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url === '/work-orders' ? { items: [order] } :
        url === '/work-orders/12' ? { workOrder: order } :
          url === '/vehicles/4' ? { vehicle: { id: 4, patente: 'ABCD12' } } :
            { client: { id: 7, nombre: 'Cliente anterior', tipo: 'cliente' } },
    }) as AxiosResponse);
  });

  it('requires an explicit confirmation before replacing current data', async () => {
    const onConfirm = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WorkOrderPrefillModal onClose={vi.fn()} onConfirm={onConfirm} currentClient="Cliente actual" currentVehicle="ZZZZ99" />
    </QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /OT-26-12/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revisar datos' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Revisar datos' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Cliente actual/)).toBeInTheDocument();
    expect(screen.getByText(/ZZZZ99/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y cargar datos' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      order: expect.objectContaining({ id: 12 }), client: expect.objectContaining({ id: 7 }), vehicle: expect.objectContaining({ id: 4 }),
    }));
  });
});
