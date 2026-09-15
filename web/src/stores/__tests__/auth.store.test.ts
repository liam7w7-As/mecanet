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
});
