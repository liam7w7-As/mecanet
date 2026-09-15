import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { api } from './lib/api';
import { useAuthStore } from './stores/auth.store';

import type { AxiosResponse } from 'axios';

vi.mock('./lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const authenticatedUser = {
  id: 1,
  nombre: 'Desarrollador UNITHOR',
  email: 'dev@unithor.local',
  role: 'desarrollador' as const,
};

const renderRoute = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('App routing and authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('renderiza el spinner mientras verifica la sesión', () => {
    useAuthStore.setState({ isLoading: true });
    renderRoute('/dashboard');

    expect(screen.getByRole('status', { name: 'Verificando sesión' })).toBeInTheDocument();
    expect(screen.getByText('Verificando sesión...')).toBeInTheDocument();
  });

  it('redirige al login cuando no hay una sesión autenticada', async () => {
    renderRoute('/dashboard');

    expect(await screen.findByRole('heading', { name: 'UNITHOR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('renderiza el layout y su navegación para un usuario autenticado', () => {
    useAuthStore.setState({
      user: authenticatedUser,
      isAuthenticated: true,
      isLoading: false,
    });
    renderRoute('/dashboard');

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Taller / OT' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByText('Hola, Desarrollador UNITHOR')).toBeInTheDocument();
  });

  it('limpia la sesión y vuelve al login al cerrar sesión', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: null } as AxiosResponse<null>);
    useAuthStore.setState({
      user: authenticatedUser,
      isAuthenticated: true,
      isLoading: false,
    });
    renderRoute('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
    expect(await screen.findByRole('heading', { name: 'UNITHOR' })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
  });
});
