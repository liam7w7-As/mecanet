import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { api } from './lib/api';
import { useAuthStore } from './stores/auth.store';

import type { AuthResponse } from './stores/auth.store';
import type { Role } from '@unithor/shared';
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

const mockViewport = (desktop: boolean) => vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
  matches: query === '(min-width: 1024px)' && desktop,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(() => true),
}));

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label="Ubicación de prueba">{location.pathname + location.search + location.hash}</output>;
};

const renderRoute = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('App routing and authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const stored = new Map<string, string>();
    const storage: Storage = {
      get length() { return stored.size; },
      clear: () => stored.clear(),
      getItem: (key) => stored.get(key) ?? null,
      key: (index) => [...stored.keys()][index] ?? null,
      removeItem: (key) => { stored.delete(key); },
      setItem: (key, value) => { stored.set(key, value); },
    };
    vi.stubGlobal('localStorage', storage);
    mockViewport(true);
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renderiza el spinner mientras verifica la sesión', () => {
    useAuthStore.setState({ isLoading: true });
    renderRoute('/dashboard');

    expect(screen.getByRole('status', { name: 'Verificando sesión' })).toBeInTheDocument();
    expect(screen.getByText('Verificando sesión...')).toBeInTheDocument();
  });

  it('redirige al login cuando no hay una sesión autenticada', async () => {
    renderRoute('/dashboard');

    expect(await screen.findByRole('heading', { name: /iniciar sesi/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).toBeInTheDocument();
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
    expect(screen.getByText('Bienvenido de vuelta, Desarrollador')).toBeInTheDocument();
  });

  it('limpia la sesión y vuelve al login al cerrar sesión', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: null } as AxiosResponse<null>);
    useAuthStore.setState({
      user: authenticatedUser,
      isAuthenticated: true,
      isLoading: false,
    });
    renderRoute('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
    expect(await screen.findByRole('heading', { name: /iniciar sesi/i })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
  });

  it('pliega la navegación, conserva la preferencia y permite volver a abrirla', () => {
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    const first = renderRoute('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Plegar navegación' }));
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('unithor:sidebar-collapsed')).toBe('true');
    first.unmount();

    renderRoute('/dashboard');
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    expect(window.localStorage.getItem('unithor:sidebar-collapsed')).toBe('false');
  });

  it('permite plegar un grupo sin cambiar la página ni perder sus enlaces', () => {
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    renderRoute('/dashboard');

    const commercial = screen.getByRole('button', { name: 'Comercial' });
    fireEvent.click(commercial);
    expect(commercial).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument();
    expect(screen.getByText('Bienvenido de vuelta, Desarrollador')).toBeInTheDocument();
    fireEvent.click(commercial);
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeVisible();
  });

  it('mantiene al mecánico limitado a su ficha en la nueva navegación', () => {
    useAuthStore.setState({
      user: { ...authenticatedUser, role: 'mecanico' }, isAuthenticated: true, isLoading: false,
    });
    renderRoute('/work-orders/mine');

    const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
    expect(navigation.getByRole('link', { name: 'Mi ficha' })).toHaveAttribute('href', '/work-orders/mine');
    expect(navigation.getAllByRole('link')).toHaveLength(1);
    expect(navigation.queryByRole('link', { name: 'Cotizaciones' })).not.toBeInTheDocument();
    expect(navigation.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it.each(['/', '/login', '/dashboard'])('lleva al mecánico con sesión de %s a su ficha', async (path) => {
    useAuthStore.setState({ user: { ...authenticatedUser, role: 'mecanico' }, isAuthenticated: true, isLoading: false });
    renderRoute(path);
    await waitFor(() => expect(screen.getByLabelText('Ubicación de prueba')).toHaveTextContent('/work-orders/mine'));
    expect(api.get).not.toHaveBeenCalledWith('/work-orders', expect.anything());
  });

  it.each([
    ['/login', '/work-orders/mine'],
    ['/quotations', '/work-orders/mine'],
    ['/work-orders/1083/ficha?tab=observaciones', '/work-orders/1083/ficha?tab=observaciones'],
  ])('al iniciar sesión como mecánico desde %s respeta el destino operativo', async (path, destination) => {
    vi.mocked(api.post).mockResolvedValue({ data: { user: { ...authenticatedUser, role: 'mecanico' } } } as AxiosResponse<AuthResponse>);
    renderRoute(path);
    fireEvent.change(await screen.findByLabelText('Usuario o correo'), { target: { value: 'mecanico' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Mecanico2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
    await waitFor(() => expect(screen.getByLabelText('Ubicación de prueba')).toHaveTextContent(destination));
  });

  it('restaura la búsqueda, filtros y fragmento después de iniciar sesión', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { user: authenticatedUser } } as AxiosResponse<AuthResponse>);
    renderRoute('/clients?search=Ejemplo&tipo=empresa#listado');
    fireEvent.change(await screen.findByLabelText('Usuario o correo'), { target: { value: 'dev' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Desarrollador2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
    await waitFor(() => expect(screen.getByLabelText('Ubicación de prueba')).toHaveTextContent('/clients?search=Ejemplo&tipo=empresa#listado'));
  });

  it.each([
    ['vendedor', '/finance'], ['vendedor', '/users'], ['vendedor', '/settings'],
    ['bodeguero', '/finance'], ['bodeguero', '/users'],
    ['finanzas', '/work-orders/new'], ['finanzas', '/users'],
    ['mecanico', '/quotations'], ['mecanico', '/finance'],
  ] as const)('impide a %s abrir directamente %s', async (role, path) => {
    useAuthStore.setState({ user: { ...authenticatedUser, role }, isAuthenticated: true, isLoading: false });
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument();
  });

  it.each([
    ['desarrollador', 'Usuarios', 'Configuración'],
    ['admin', 'Usuarios', 'Finanzas / Contabilidad'],
    ['jefe', 'Reporte diario', 'Compras'],
    ['vendedor', 'Cotizaciones', 'Clientes'],
    ['bodeguero', 'Almacenes', 'Catálogo'],
    ['finanzas', 'Finanzas / Contabilidad', 'Compras'],
    ['mecanico', 'Mi ficha', 'Mi ficha'],
  ] satisfies Array<[Role, string, string]>)('conserva la navegación autorizada de %s', (role, first, second) => {
    useAuthStore.setState({ user: { ...authenticatedUser, role }, isAuthenticated: true, isLoading: false });
    renderRoute('/forbidden');
    const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
    expect(navigation.getByRole('link', { name: first })).toBeInTheDocument();
    expect(navigation.getByRole('link', { name: second })).toBeInTheDocument();
  });

  it('aplica los permisos recibidos de la API antes de abrir una ruta', async () => {
    useAuthStore.setState({ user: { ...authenticatedUser, role: 'vendedor', permissions: [{ modulo: 'comercial', accion: 'read' }] }, isAuthenticated: true, isLoading: false });
    renderRoute('/quotations/new');
    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Taller / OT' })).not.toBeInTheDocument();
  });

  it('cierra el menú móvil con Escape y al navegar, restaurando el scroll', () => {
    mockViewport(false);
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    renderRoute('/dashboard');
    expect(screen.queryByRole('button', { name: 'Abrir navegación' })).not.toBeInTheDocument();
    expect(document.getElementById('shell-navigation')).not.toBeInTheDocument();
    const previousOverflow = document.body.style.overflow;

    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    expect(screen.getByRole('dialog', { name: 'Más opciones' })).toBeVisible();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    fireEvent.click(screen.getByRole('link', { name: 'Clientes' }));
    expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it('Más respeta el alcance del vendedor y abre su perfil fuera del panel', async () => {
    mockViewport(false);
    useAuthStore.setState({ user: { ...authenticatedUser, role: 'vendedor' }, isAuthenticated: true, isLoading: false });
    renderRoute('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    const more = within(screen.getByRole('dialog', { name: 'Más opciones' }));
    expect(more.getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/clients');
    expect(more.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(more.queryByRole('link', { name: 'Finanzas / Contabilidad' })).not.toBeInTheDocument();
    fireEvent.click(more.getByRole('button', { name: 'Mi perfil' }));
    expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: authenticatedUser.nombre })).toBeInTheDocument();
  });

  it('Más del mecánico no revela accesos ajenos a su ficha', () => {
    mockViewport(false);
    useAuthStore.setState({ user: { ...authenticatedUser, role: 'mecanico' }, isAuthenticated: true, isLoading: false });
    renderRoute('/work-orders/mine');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    const more = within(screen.getByRole('dialog', { name: 'Más opciones' }));
    expect(more.queryAllByRole('link')).toHaveLength(0);
    expect(more.getByRole('button', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(document.getElementById('shell-navigation')).not.toBeInTheDocument();
  });

  it('mantiene accesible la navegación aunque el navegador bloquee el almacenamiento local', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    renderRoute('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Plegar navegación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  });
});
