import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createDefaultDpConfiguration } from '@unithor/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import VehicleDpDetailsModal from '../VehicleDpDetailsModal';

import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() }, setSessionExpiredHandler: vi.fn(), getCookie: vi.fn(),
}));
vi.mock('../../../hooks/useCatalogEvents', () => ({ useCatalogEvents: vi.fn() }));
const vehicle = { id: 4, patente: 'ABCD12', dpBodyTypeId: null, dpSizeId: null };
const record = { configuration: createDefaultDpConfiguration(), revision: 1, updatedAt: '2026-11-24T10:00:00Z', lastEditor: null };

function mount() {
  const onReady = vi.fn();
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <VehicleDpDetailsModal vehicleId={4} onReady={onReady} onClose={onClose} />
  </QueryClientProvider>);
  return { onReady, onClose };
}

describe('Vehicle classification before selection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 1, nombre: 'Admin', role: 'admin', email: 'admin@test.cl' } });
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/catalog/dp' ? record : { vehicle } }) as AxiosResponse);
    vi.mocked(api.patch).mockResolvedValue({ data: { vehicle: { ...vehicle, dpBodyTypeId: 'suv', dpSizeId: 'XL' } } } as AxiosResponse);
  });

  it('blocks selection until both fields are saved, and limits sizes to the selected body', async () => {
    const { onReady } = mount();
    const body = await screen.findByLabelText('Carrocería');
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardar y seleccionar' })).toBeDisabled();
    fireEvent.change(body, { target: { value: 'suv' } });
    const size = screen.getByLabelText('Tamaño del vehículo');
    expect(within(size).queryByRole('option', { name: 'S' })).not.toBeInTheDocument();
    fireEvent.change(size, { target: { value: 'XL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seleccionar' }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith('/vehicles/4', { dpBodyTypeId: 'suv', dpSizeId: 'XL' });
  });

  it('accepts an already classified vehicle without changing its record', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/catalog/dp' ? record : { vehicle: { ...vehicle, dpBodyTypeId: 'sedan', dpSizeId: 'M' } } }) as AxiosResponse);
    const { onReady } = mount();
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('does not select the candidate when the modal is cancelled', async () => {
    const { onReady, onClose } = mount();
    await screen.findByLabelText('Carrocería');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});
