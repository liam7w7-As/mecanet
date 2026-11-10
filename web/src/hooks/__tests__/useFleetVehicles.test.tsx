import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import {
  fleetVehicleKeys,
  useCreateFleetVehicleMutation,
  useFleetVehicle,
  useFleetVehicles,
  useUpdateFleetVehicleMutation,
} from '../useFleetVehicles';

import type { UserPublic } from '../../stores/auth.store';
import type { FleetVehicleDetail } from '../../types/entities';
import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const admin: UserPublic = { id: 1, role: 'admin', nombre: 'Admin', email: 'admin@example.test' };
const vehicle: FleetVehicleDetail = {
  id: 3, patente: 'FLAB12', codigoInterno: null, marca: null, modelo: null, ano: null,
  color: null, vinChasis: null, motor: null, kilometraje: null, combustible: null,
  transmision: null, estadoOperativo: 'disponible', sucursal: null, responsable: 'Taller externo',
  propietario: 'Propietario privado', fechaBaja: null, motivoBaja: null,
  createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z',
  documentSummary: { total: 0, expired: 0, expiringSoon: 0, nextExpiry: null }, documents: [],
};
const list = (item: FleetVehicleDetail) => ({ items: [item], page: 1, pageSize: 20, total: 1, totalPages: 1 });

describe('Privacidad e invalidación de caché de flota', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
    useAuthStore.setState({ user: admin, isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url === '/fleet-vehicles' ? list(vehicle) : { fleetVehicle: vehicle },
    } as AxiosResponse));
  });

  afterEach(() => client.clear());

  it.each([
    { label: 'otro usuario con el mismo rol', nextUser: { ...admin, id: 2 } },
    { label: 'otro rol del mismo usuario', nextUser: { ...admin, role: 'jefe' as const } },
  ])('aísla lista y ficha, incluso como placeholder, al pasar a $label', async ({ nextUser }) => {
    const { result } = renderHook(() => ({ list: useFleetVehicles({ page: 1 }), detail: useFleetVehicle(3) }), { wrapper });
    await waitFor(() => {
      expect(result.current.list.data?.items[0].propietario).toBe('Propietario privado');
      expect(result.current.detail.data?.propietario).toBe('Propietario privado');
    });
    let releaseList!: (response: AxiosResponse) => void;
    let releaseDetail!: (response: AxiosResponse) => void;
    const pendingList = new Promise<AxiosResponse>((resolve) => { releaseList = resolve; });
    const pendingDetail = new Promise<AxiosResponse>((resolve) => { releaseDetail = resolve; });
    vi.mocked(api.get).mockImplementation((url) => url === '/fleet-vehicles' ? pendingList : pendingDetail);

    act(() => useAuthStore.setState({ user: nextUser }));
    expect(result.current.list.data).toBeUndefined();
    expect(result.current.list.isPlaceholderData).toBe(false);
    expect(result.current.detail.data).toBeUndefined();

    const { propietario: _owner, ...publicVehicle } = vehicle;
    await act(async () => {
      releaseList({ data: list(publicVehicle) } as AxiosResponse);
      releaseDetail({ data: { fleetVehicle: publicVehicle } } as AxiosResponse);
    });
    await waitFor(() => {
      expect(result.current.list.data?.items[0]).toEqual(publicVehicle);
      expect(result.current.detail.data).toEqual(publicVehicle);
    });
    expect(result.current.list.data?.items[0]).not.toHaveProperty('propietario');
    expect(result.current.detail.data).not.toHaveProperty('propietario');
    expect(client.getQueryData(fleetVehicleKeys.detail(3, admin))).toEqual(vehicle);
  });

  it('conserva la página anterior al filtrar dentro del mismo usuario', async () => {
    const { result, rerender } = renderHook(({ page }) => useFleetVehicles({ page }), { wrapper, initialProps: { page: 1 } });
    await waitFor(() => expect(result.current.data?.items[0]).toEqual(vehicle));
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
    rerender({ page: 2 });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.items[0]).toEqual(vehicle);
  });

  it.each(['create', 'update'] as const)('el hook %s conserva null para admin/dev y elimina propietario para otros roles', async (action) => {
    vi.mocked(api.post).mockResolvedValue({ data: { fleetVehicle: vehicle } });
    vi.mocked(api.patch).mockResolvedValue({ data: { fleetVehicle: vehicle } });
    const { result } = renderHook(() => ({ create: useCreateFleetVehicleMutation(), update: useUpdateFleetVehicleMutation() }), { wrapper });
    const request = action === 'create' ? vi.mocked(api.post) : vi.mocked(api.patch);
    const mutate = (propietario: string | null | undefined) => action === 'create'
      ? result.current.create.mutateAsync({ patente: 'FLAB12', propietario })
      : result.current.update.mutateAsync({ id: 3, data: { responsable: 'Rentacar externo', propietario } });

    for (const role of ['admin', 'desarrollador'] as const) {
      act(() => useAuthStore.setState({ user: { ...admin, role } }));
      await act(async () => { await mutate(null); });
      expect(request.mock.lastCall?.[1]).toHaveProperty('propietario', null);
      await act(async () => { await mutate('   '); });
      expect(request.mock.lastCall?.[1]).toHaveProperty('propietario', null);
      await act(async () => { await mutate('  Propietario nuevo  '); });
      expect(request.mock.lastCall?.[1]).toHaveProperty('propietario', 'Propietario nuevo');
      await act(async () => { await mutate(undefined); });
      expect(request.mock.lastCall?.[1]).not.toHaveProperty('propietario');
    }
    act(() => useAuthStore.setState({ user: { ...admin, role: 'jefe' } }));
    await act(async () => { await mutate('Propietario que no se debe enviar'); });
    expect(request.mock.lastCall?.[1]).not.toHaveProperty('propietario');
    await act(async () => { await mutate(null); });
    expect(request.mock.lastCall?.[1]).not.toHaveProperty('propietario');
  });

  it.each(['create', 'update'] as const)('una respuesta de %s tardía queda en su identidad original y mantiene invalidación global', async (action) => {
    const otherUser: UserPublic = { ...admin, id: 9, role: 'jefe' };
    const { propietario: _owner, ...publicVehicle } = vehicle;
    client.setQueryData(fleetVehicleKeys.detail(3, otherUser), publicVehicle);
    client.setQueryData(fleetVehicleKeys.list({}, admin), list(vehicle));
    client.setQueryData(fleetVehicleKeys.list({}, otherUser), list(publicVehicle));
    client.setQueryData(['dashboard'], { total: 1 });

    let finish!: (response: AxiosResponse) => void;
    const pending = new Promise<AxiosResponse>((resolve) => { finish = resolve; });
    vi.mocked(api.post).mockReturnValue(pending);
    vi.mocked(api.patch).mockReturnValue(pending);
    const { result } = renderHook(() => ({ create: useCreateFleetVehicleMutation(), update: useUpdateFleetVehicleMutation() }), { wrapper });
    let saving!: Promise<FleetVehicleDetail>;
    act(() => {
      saving = action === 'create'
        ? result.current.create.mutateAsync({ patente: 'FLAB12', propietario: 'Propietario privado' })
        : result.current.update.mutateAsync({ id: 3, data: { propietario: 'Propietario privado' } });
    });
    await waitFor(() => expect(action === 'create' ? api.post : api.patch).toHaveBeenCalledTimes(1));
    act(() => useAuthStore.setState({ user: otherUser }));
    await act(async () => {
      finish({ data: { fleetVehicle: vehicle } } as AxiosResponse);
      await saving;
    });
    expect(client.getQueryData(fleetVehicleKeys.detail(3, admin))).toEqual(vehicle);
    expect(client.getQueryData(fleetVehicleKeys.detail(3, otherUser))).toEqual(publicVehicle);
    expect(client.getQueryState(fleetVehicleKeys.list({}, admin))?.isInvalidated).toBe(true);
    expect(client.getQueryState(fleetVehicleKeys.list({}, otherUser))?.isInvalidated).toBe(true);
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
  });
});
