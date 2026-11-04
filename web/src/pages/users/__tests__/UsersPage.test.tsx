import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  username: 'ana',
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
  username: 'victor',
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

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><UsersPage /></MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
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
      if (url === '/roles/4/permissions') {
        return Promise.resolve({ data: { permissions: permissions.slice(0, 2) } } as AxiosResponse);
      }
      if (url === '/roles/2/permissions') {
        return Promise.resolve({ data: { permissions: permissions.slice(0, 2) } } as AxiosResponse);
      }
      if (url === '/roles/1/permissions') {
        return Promise.resolve({ data: { permissions } } as AxiosResponse);
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
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'NVendedor' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'nuevo@unithor.local' } });
    fireEvent.change(screen.getByLabelText('Contraseña temporal'), { target: { value: 'Temporal2026!' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users', {
      nombre: 'Nuevo Vendedor',
      username: 'nvendedor',
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
    fireEvent.click(screen.getByRole('tab', { name: 'Vendedor' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Creación' })).toBeChecked());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edición' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/roles/4/permissions', {
      roleId: 4,
      permissionIds: [1, 2, 3],
    }));
    expect(await screen.findByText('Permisos actualizados correctamente')).toBeInTheDocument();
  });

  it('mantiene el acceso completo del administrador aunque la matriz almacenada sea parcial', async () => {
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
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Víctor Ventas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Permisos por rol' }));
    expect(await screen.findByRole('checkbox', { name: 'Lectura' })).toBeDisabled();
    expect(screen.getByText('Módulos y Acciones (4 de 4 activos)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();
  });

  it('combina filtros de estado, rol y búsqueda y permite limpiarlos', async () => {
    renderPage();
    await screen.findByText('Víctor Ventas');
    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por rol' }), { target: { value: '4' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar usuarios' }), { target: { value: 'victor' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/users', { params: {
      page: 1, pageSize: 20, search: 'victor', roleId: 4, activo: false,
    } }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/users', { params: {
      page: 1, pageSize: 20, search: undefined, roleId: undefined, activo: undefined,
    } }));
  });

  it('abre el detalle sin mutaciones y protege las acciones sobre la cuenta propia', async () => {
    renderPage();
    await screen.findByText('Víctor Ventas');
    expect(screen.getByRole('button', { name: 'Desactivar Ana Administradora' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar Ana Administradora' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver Víctor Ventas' }));
    const dialog = screen.getByRole('dialog', { name: 'Víctor Ventas' });
    expect(within(dialog).getByText('@victor')).toBeInTheDocument();
    expect(within(dialog).getByText('Inactivo')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Editar usuario' }));
    expect(screen.getByRole('dialog', { name: 'Editar a Víctor Ventas' })).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('conserva una edición fallida y pide confirmación antes de descartarla', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('Sin conexión'));
    renderPage();
    await screen.findByText('Víctor Ventas');
    fireEvent.click(screen.getByRole('button', { name: 'Editar Víctor Ventas' }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Víctor Actualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Víctor Actualizado');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Víctor Actualizado');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bloquea cierre y envíos duplicados mientras crea una cuenta', async () => {
    let resolveCreate!: (response: AxiosResponse) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    renderPage();
    await screen.findByText('Víctor Ventas');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Nueva Cuenta' } });
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'nueva' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'nueva@unithor.local' } });
    fireEvent.change(screen.getByLabelText('Contraseña temporal'), { target: { value: 'Temporal2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Nombre completo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('button', { name: 'Crear usuario' }).closest('form')!);
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => resolveCreate({ data: { user: sellerUser } } as AxiosResponse));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('conserva permisos sin guardar al cambiar de pestaña o actualizar la consulta y avisa al cambiar de rol', async () => {
    const { queryClient } = renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Permisos por rol' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Vendedor' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Creación' })).toBeChecked());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edición' }));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['roles', 4, 'permissions'] }); });
    expect(screen.getByRole('checkbox', { name: 'Edición' })).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: 'Cuentas' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Permisos por rol' }));
    expect(screen.getByRole('checkbox', { name: 'Edición' })).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: 'Desarrollador' }));
    expect(screen.getByRole('alertdialog', { name: 'Cambiar de rol sin guardar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('checkbox', { name: 'Edición' })).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: 'Desarrollador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Edición' })).toBeDisabled());
    expect(api.put).not.toHaveBeenCalled();
  });

  it('no habilita acciones administrativas ni edición de permisos para una cuenta de solo lectura', async () => {
    useAuthStore.setState({ user: { id: 5, nombre: 'Jefe', email: 'jefe@unithor.local', role: 'jefe', permissions: [{ modulo: 'admin', accion: 'read' }] } });
    renderPage();
    await screen.findByText('Víctor Ventas');
    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Víctor Ventas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Víctor Ventas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Permisos por rol' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Vendedor' }));
    expect(await screen.findByRole('checkbox', { name: 'Lectura' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();
  });

  it('bloquea el cambio de rol durante el guardado y conserva la selección si falla', async () => {
    let rejectSave!: (reason: Error) => void;
    vi.mocked(api.put).mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Permisos por rol' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Vendedor' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Creación' })).toBeChecked());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edición' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('tab', { name: 'Desarrollador' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Edición' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
    await act(async () => rejectSave(new Error('Sin conexión')));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Edición' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeEnabled();
    expect(screen.getByRole('tab', { name: 'Vendedor' })).toHaveAttribute('aria-selected', 'true');
  });
});
