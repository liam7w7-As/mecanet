import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import UsersPage from '../UsersPage';

import type { AdminUser, PermissionOption, RoleOption } from '../../../hooks/useUsers';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const adminUser: AdminUser = {
  id: 1,
  nombre: 'Ana Administradora',
  email: 'ana@unithor.local',
  roleId: 2,
  activo: true,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
  role: { id: 2, nombre: 'admin' },
};

const sellerUser: AdminUser = {
  id: 7,
  nombre: 'Víctor Ventas',
  email: 'victor@unithor.local',
  roleId: 4,
  activo: false,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
  role: { id: 4, nombre: 'vendedor' },
};

const roles: RoleOption[] = [
  { id: 1, nombre: 'desarrollador', descripcion: 'Acceso total' },
  { id: 2, nombre: 'admin', descripcion: 'Administración' },
  { id: 4, nombre: 'vendedor', descripcion: 'Ventas' },
];

const permissions: PermissionOption[] = [
  { id: 1, modulo: 'admin', accion: 'read' },
  { id: 2, modulo: 'admin', accion: 'create' },
  { id: 3, modulo: 'admin', accion: 'update' },
  { id: 4, modulo: 'admin', accion: 'delete' },
];

const usersResponse = {
  data: [adminUser, sellerUser],
  meta: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><UsersPage /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 1,
        nombre: 'Ana Administradora',
        email: 'ana@unithor.local',
        role: 'admin',
        permissions,
      },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/users') return Promise.resolve({ data: usersResponse } as AxiosResponse);
      if (url === '/roles') return Promise.resolve({ data: { roles } } as AxiosResponse);
      if (url === '/permissions') return Promise.resolve({ data: { permissions } } as AxiosResponse);
      if (url === '/roles/2/permissions') {
        return Promise.resolve({ data: { permissions: permissions.slice(0, 2) } } as AxiosResponse);
      }
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
  });

  it('renderiza cuentas, roles y estados de acceso', async () => {
    renderPage();

    expect(await screen.findByText('Ana Administradora')).toBeInTheDocument();
    expect(screen.getByText('Víctor Ventas')).toBeInTheDocument();
    expect(screen.getAllByText('Administrador')).toHaveLength(2);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.getByText('2 registros')).toBeInTheDocument();
  });

  it('crea una cuenta con el rol seleccionado', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { user: sellerUser } } as AxiosResponse);
    renderPage();
    await screen.findByText('Ana Administradora');

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Nuevo Vendedor' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'nuevo@unithor.local' } });
    fireEvent.change(screen.getByLabelText('Contraseña temporal'), { target: { value: 'Temporal2026!' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users', {
      nombre: 'Nuevo Vendedor',
      email: 'nuevo@unithor.local',
      password: 'Temporal2026!',
      roleId: 4,
    }));
  });

  it('actualiza la matriz de permisos del rol seleccionado', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { permissions: permissions.slice(0, 3) } } as AxiosResponse);
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: 'Permisos por rol' }));
    expect(await screen.findByText('Matriz dinámica de permisos')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Creación' })).toBeChecked());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edición' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/roles/2/permissions', {
      roleId: 2,
      permissionIds: [1, 2, 3],
    }));
    expect(await screen.findByText('Permisos actualizados correctamente')).toBeInTheDocument();
  });

  it('oculta acciones no concedidas aunque el rol sea administrador', async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        nombre: 'Ana Administradora',
        email: 'ana@unithor.local',
        role: 'admin',
        permissions: [{ modulo: 'admin', accion: 'read' }],
      },
    });
    renderPage();

    await screen.findByText('Ana Administradora');
    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Víctor Ventas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Permisos por rol' }));
    expect(await screen.findByRole('checkbox', { name: 'Lectura' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();
  });
});
