import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, getCookie } from '../../lib/api';
import { useAuthStore } from '../auth.store';

import type { AxiosResponse } from 'axios';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

describe('auth.store checkAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
  });

  it('no consulta la API cuando el navegador no tiene indicios de sesión', async () => {
    vi.mocked(getCookie).mockReturnValue(null);

    await useAuthStore.getState().checkAuth();

    expect(api.get).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('restaura la sesión cuando existe cookie CSRF', async () => {
    const user = {
      id: 1,
      nombre: 'Desarrollador UNITHOR',
      username: 'dev',
      email: 'dev@unithor.local',
      role: 'desarrollador' as const,
      permissions: [],
    };
    vi.mocked(getCookie).mockReturnValue('csrf-activo');
    vi.mocked(api.get).mockResolvedValue({ data: { user } } as AxiosResponse);

    await useAuthStore.getState().checkAuth();

    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  const user = { id: 7, nombre: 'Vendedora', email: 'vendedora@unithor.local', role: 'vendedor' as const };
  const deferredCheck = () => {
    let resolve!: (response: AxiosResponse) => void;
    const promise = new Promise<AxiosResponse>((done) => { resolve = done; });
    vi.mocked(api.get).mockReturnValueOnce(promise);
    return resolve;
  };

  it('refresca permisos sin desmontar la pantalla autenticada', async () => {
    vi.mocked(getCookie).mockReturnValue('csrf-activo');
    useAuthStore.getState().setUser(user);
    const resolve = deferredCheck();
    const check = useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().isLoading).toBe(false);
    const updated = { ...user, permissions: [{ modulo: 'comercial' as const, accion: 'read' as const }] };
    resolve({ data: { user: updated } } as AxiosResponse);
    await check;
    expect(useAuthStore.getState().user).toEqual(updated);
  });

  it('conserva la sesión y el formulario ante un fallo temporal de conexión', async () => {
    vi.mocked(getCookie).mockReturnValue('csrf-activo');
    useAuthStore.getState().setUser(user);
    vi.mocked(api.get).mockRejectedValueOnce(new AxiosError('Sin conexión', 'ERR_NETWORK'));
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState()).toMatchObject({ user, isAuthenticated: true, isLoading: false });
  });

  it('retira una sesión rechazada aunque ya estuviera autenticada', async () => {
    vi.mocked(getCookie).mockReturnValue('csrf-activo');
    useAuthStore.getState().setUser(user);
    vi.mocked(api.get).mockRejectedValueOnce(new AxiosError('No autenticado', 'ERR_BAD_REQUEST', undefined, undefined,
      { status: 401 } as AxiosResponse));
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, isLoading: false });
  });

  it.each(['logout', 'other-user'])('descarta una comprobación anterior después de %s', async (change) => {
    vi.mocked(getCookie).mockReturnValue('csrf-activo');
    useAuthStore.getState().setUser(user);
    const resolve = deferredCheck();
    const check = useAuthStore.getState().checkAuth();
    const next = change === 'logout' ? null : { ...user, id: 9, nombre: 'Otra cuenta' };
    useAuthStore.getState().setUser(next);
    resolve({ data: { user } } as AxiosResponse);
    await check;
    expect(useAuthStore.getState().user).toEqual(next);
  });

  it('aplica solamente la comprobación más reciente si llegan respuestas desordenadas', async () => {
    vi.mocked(getCookie).mockReturnValue('csrf-activo');
    useAuthStore.getState().setUser(user);
    const oldResolve = deferredCheck();
    const newResolve = deferredCheck();
    const first = useAuthStore.getState().checkAuth();
    const second = useAuthStore.getState().checkAuth();
    const latest = { ...user, permissions: [] };
    newResolve({ data: { user: latest } } as AxiosResponse);
    await second;
    oldResolve({ data: { user } } as AxiosResponse);
    await first;
    expect(useAuthStore.getState().user).toEqual(latest);
  });
});
