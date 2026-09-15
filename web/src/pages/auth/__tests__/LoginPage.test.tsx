import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import LoginPage from '../LoginPage';

import type { AuthResponse } from '../../../stores/auth.store';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
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
  username: 'dev',
  email: 'dev@unithor.local',
  role: 'desarrollador' as const,
};

const renderLogin = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<h1>Dashboard de prueba</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const completeForm = (identifier = 'dev'): void => {
  fireEvent.change(screen.getByLabelText('Usuario o correo'), { target: { value: identifier } });
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'Desarrollador2026!' },
  });
};

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('renderiza los campos y el botón de ingreso', () => {
    renderLogin();

    expect(screen.getByLabelText('Usuario o correo')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).toBeInTheDocument();
  });

  it('valida el identificador antes de llamar a la API', () => {
    renderLogin();
    completeForm('x');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    expect(screen.getByText('Ingrese un usuario o correo válido')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('muestra una alerta cuando las credenciales son incorrectas', async () => {
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 401,
        data: { error: { code: 'UNAUTHORIZED', message: 'Credenciales inválidas' } },
      },
    });
    renderLogin();
    completeForm();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Credenciales incorrectas. Verifique su usuario o correo y contraseña.',
    );
  });

  it('actualiza la sesión y navega al dashboard tras un login exitoso', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { user: authenticatedUser },
    } as AxiosResponse<AuthResponse>);
    renderLogin();
    completeForm(' DEV ');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard de prueba' })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      identifier: 'dev',
      password: 'Desarrollador2026!',
    });
    await waitFor(() => {
      expect(useAuthStore.getState().user).toEqual(authenticatedUser);
    });
  });

  it('permite mostrar y ocultar la contraseña', () => {
    renderLogin();
    const passwordInput = screen.getByLabelText('Contraseña');

    expect(passwordInput).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(passwordInput).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
