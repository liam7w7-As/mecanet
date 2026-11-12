import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { api } from './lib/api';
import { useAuthStore } from './stores/auth.store';

import type { AuthResponse } from './stores/auth.store';
import type { PermissionDefinition, Role } from '@unithor/shared';
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

const demoPrimaryPaths = ['/dashboard', '/work-orders', '/vehicles', '/warehouses'];
const adminMorePaths = ['/reports', '/work-orders/daily-report', '/quotations', '/clients', '/catalog', '/purchases', '/finance', '/users', '/settings'];
const mobileRoleCases: { role: Role; permissions?: PermissionDefinition[]; primary: string[]; more: string[] }[] = [
  { role: 'desarrollador', primary: demoPrimaryPaths, more: adminMorePaths },
  { role: 'admin', primary: demoPrimaryPaths, more: adminMorePaths },
  { role: 'jefe', primary: demoPrimaryPaths, more: adminMorePaths.filter((path) => path !== '/finance') },
  { role: 'vendedor', primary: demoPrimaryPaths, more: ['/reports', '/quotations', '/clients', '/catalog'] },
  { role: 'bodeguero', primary: demoPrimaryPaths, more: ['/reports', '/quotations', '/clients', '/catalog', '/purchases'] },
  { role: 'finanzas', primary: ['/dashboard', '/vehicles', '/quotations'], more: ['/reports', '/clients', '/catalog', '/purchases', '/finance'] },
  { role: 'mecanico', primary: ['/work-orders/mine'], more: [] },
  { role: 'vendedor', permissions: [{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }], primary: ['/dashboard', '/work-orders', '/vehicles', '/quotations'], more: ['/reports', '/clients', '/catalog'] },
  { role: 'vendedor', permissions: [{ modulo: 'comercial', accion: 'read' }], primary: ['/dashboard', '/vehicles', '/quotations'], more: ['/reports', '/clients', '/catalog'] },
  { role: 'bodeguero', permissions: [{ modulo: 'almacen', accion: 'read' }], primary: ['/warehouses'], more: ['/reports'] },
];

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
    vi.mocked(api.get).mockReset();
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

  it('pliega a un rail accesible, conserva el foco y restaura la preferencia al montar', () => {
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    const first = renderRoute('/dashboard');

    const toggle = screen.getByRole('button', { name: 'Plegar navegación' });
    toggle.focus();
    fireEvent.click(toggle);
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(navigation).toBeVisible();
    expect(navigation.closest('.redesign-shell')).toHaveClass('shell-collapsed');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(within(navigation).getByRole('link', { name: 'Usuarios' })).toHaveAttribute('title', 'Usuarios');
    expect(window.localStorage.getItem('unithor:sidebar-collapsed')).toBe('true');
    first.unmount();

    renderRoute('/dashboard');
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    expect(window.localStorage.getItem('unithor:sidebar-collapsed')).toBe('false');
  });

  it('el rail expone los grupos cerrados y sus tooltips al foco y al puntero', () => {
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    renderRoute('/forbidden');
    fireEvent.click(screen.getByRole('button', { name: 'Comercial' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plegar navegación' }));
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    const clients = within(navigation).getByRole('link', { name: 'Clientes' });
    expect(clients).toBeVisible();
    expect(within(navigation).queryByRole('button', { name: 'Comercial' })).not.toBeInTheDocument();
    // Animated icons must not create a second tab stop inside each link.
    expect(clients.querySelector('[tabindex="0"]')).toBeNull();
    act(() => clients.focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Clientes');
    expect(clients).toHaveAccessibleName('Clientes');
    fireEvent.keyDown(clients, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(clients).toHaveFocus();
    fireEvent.mouseEnter(clients);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Clientes');
    fireEvent.scroll(navigation);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
    expect(screen.getByRole('button', { name: 'Comercial' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(navigation).queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument();
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
    expect(navigation.getByRole('link', { name: 'Mi taller' })).toHaveAttribute('href', '/work-orders/mine');
    expect(navigation.getAllByRole('link')).toHaveLength(1);
    expect(navigation.queryByRole('link', { name: 'Cotizaciones' })).not.toBeInTheDocument();
    expect(navigation.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it.each(['/', '/login', '/dashboard'])('lleva al mecánico con sesión de %s a su ficha', async (path) => {
    useAuthStore.setState({ user: { ...authenticatedUser, role: 'mecanico' }, isAuthenticated: true, isLoading: false });
    renderRoute(path);
    await waitFor(() => expect(screen.getByLabelText('Ubicación de prueba')).toHaveTextContent('/work-orders/mine'));
    expect(api.get).toHaveBeenCalledWith('/work-orders', expect.objectContaining({ params: expect.objectContaining({ page: 1, pageSize: 12 }) }));
    expect(screen.queryByRole('link', { name: /Nueva Orden de Trabajo/ })).not.toBeInTheDocument();
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
    ['vendedor', '/users'], ['vendedor', '/finance'], ['vendedor', '/work-orders/daily-report'],
    ['finanzas', '/work-orders/new'], ['finanzas', '/quotations/new'], ['bodeguero', '/work-orders/mine'],
  ] as const)('al cambiar de cuenta a %s descarta el destino previo no autorizado %s', async (role, path) => {
    vi.mocked(api.post).mockResolvedValue({ data: { user: { ...authenticatedUser, role } } } as AxiosResponse<AuthResponse>);
    renderRoute(path);
    fireEvent.change(await screen.findByLabelText('Usuario o correo'), { target: { value: 'prueba' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Prueba123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
    await waitFor(() => expect(screen.getByLabelText('Ubicación de prueba')).toHaveTextContent('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'Acceso restringido' })).not.toBeInTheDocument();
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
    ['mecanico', 'Mi taller', 'Mi taller'],
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
    const previousRootOverflow = document.documentElement.style.overflow;
    const trigger = screen.getByRole('button', { name: 'Abrir todas las secciones' });
    trigger.focus();

    fireEvent.click(trigger);
    const sheet = screen.getByRole('dialog', { name: 'Más opciones' });
    expect(sheet).toBeVisible();
    expect(sheet).toHaveFocus();
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    const first = within(sheet).getByRole('button', { name: 'Cerrar secciones' });
    const last = within(sheet).getByRole('button', { name: 'Cerrar sesión' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(document.documentElement.style.overflow).toBe(previousRootOverflow);
    expect(trigger).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    fireEvent.click(screen.getByRole('link', { name: 'Clientes' }));
    expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it.each(mobileRoleCases)('distribuye todos los accesos autorizados de $role entre primarios y Más ($primary)', ({ role, permissions, primary, more }) => {
    mockViewport(false);
    useAuthStore.setState({ user: { ...authenticatedUser, role, permissions }, isAuthenticated: true, isLoading: false });
    renderRoute('/forbidden');
    const tabs = within(screen.getByRole('navigation', { name: 'Navegación principal (móvil)' }));
    expect(tabs.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(primary);
    expect(tabs.getAllByRole('link').length).toBeLessThanOrEqual(4);
    expect(tabs.getByRole('button', { name: 'Abrir todas las secciones' })).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(tabs.getByRole('button', { name: 'Abrir todas las secciones' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Más opciones' }));
    expect(sheet.queryAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(more);
    expect(document.getElementById('shell-navigation')).not.toBeInTheDocument();
  });

  it('usa Inicio, Taller, Vehículos y Almacenes y mantiene Más activo en el reporte diario', () => {
    mockViewport(false);
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    renderRoute('/work-orders/daily-report');
    const tabs = within(screen.getByRole('navigation', { name: 'Navegación principal (móvil)' }));
    expect(tabs.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual(['Inicio', 'Taller', 'Vehículos', 'Almacenes']);
    expect(tabs.getByRole('link', { name: 'Taller' })).not.toHaveAttribute('aria-current');
    expect(tabs.getByRole('button', { name: 'Abrir todas las secciones' })).toHaveClass('active');
    fireEvent.click(tabs.getByRole('button', { name: 'Abrir todas las secciones' }));
    expect(screen.getByRole('link', { name: 'Reporte diario' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Compras' })).toHaveAttribute('href', '/purchases');
    expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute('href', '/settings');
  });

  it('conserva los contadores y sus valores completos en el rail y en ambas superficies móviles', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => ({ data: path === '/dashboard/summary'
      ? { operationalInbox: { total: 145, counts: { approvals: 2, assignedWorkOrders: 3, quotationFollowUps: 107, warehouseDeliveries: 7, stockAlerts: 4, fleetDocumentAlerts: 6, paymentVerifications: 1 } } }
      : { items: [], total: 0, noLeidas: 0 } } as AxiosResponse));
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    const desktop = renderRoute('/forbidden');
    fireEvent.click(screen.getByRole('button', { name: 'Plegar navegación' }));
    const rail = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
    await waitFor(() => expect(rail.getByRole('link', { name: 'Almacenes' })).toHaveAccessibleDescription('11 pendientes'));
    expect(rail.getByRole('link', { name: 'Cotizaciones' })).toHaveAccessibleDescription('107 pendientes');
    expect(within(rail.getByRole('link', { name: 'Cotizaciones' })).getByText('99+')).toBeInTheDocument();
    const account = within(screen.getByRole('group', { name: 'Cuenta y aplicación' }));
    expect(account.getByRole('button', { name: 'Menú de usuario' })).toBeInTheDocument();
    expect(account.getByRole('button', { name: 'Instalar aplicación UNITHOR' })).toBeInTheDocument();
    desktop.unmount();
    mockViewport(false);
    renderRoute('/forbidden');
    const tabs = within(screen.getByRole('navigation', { name: 'Navegación principal (móvil)' }));
    await waitFor(() => expect(tabs.getByRole('link', { name: 'Almacenes' })).toHaveAccessibleDescription('11 pendientes'));
    expect(tabs.getByRole('link', { name: 'Inicio' })).toHaveAccessibleDescription('145 pendientes');
    expect(tabs.getByRole('link', { name: 'Taller' })).toHaveAccessibleDescription('5 pendientes');
    fireEvent.click(tabs.getByRole('button', { name: 'Abrir todas las secciones' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Más opciones' }));
    expect(sheet.getByRole('link', { name: 'Cotizaciones' })).toHaveAccessibleDescription('107 pendientes');
    expect(sheet.getByRole('link', { name: 'Finanzas / Contabilidad' })).toHaveAccessibleDescription('1 pendientes');
  });

  it('cierra Más al pasar a escritorio, restaura el scroll y conserva la preferencia del rail', () => {
    const fallbackMedia = window.matchMedia('(display-mode: standalone)');
    const desktopMedia = Object.assign(new EventTarget(), { media: '(min-width: 1024px)', matches: false });
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => query === desktopMedia.media ? desktopMedia as MediaQueryList : fallbackMedia);
    window.localStorage.setItem('unithor:sidebar-collapsed', 'true');
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    renderRoute('/forbidden');
    const previousOverflow = document.body.style.overflow;
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    expect(document.body.style.overflow).toBe('hidden');
    act(() => { desktopMedia.matches = true; desktopMedia.dispatchEvent(new Event('change')); });
    expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).closest('.redesign-shell')).toHaveClass('shell-collapsed');
    expect(screen.queryByRole('navigation', { name: 'Navegación principal (móvil)' })).not.toBeInTheDocument();
    act(() => { desktopMedia.matches = false; desktopMedia.dispatchEvent(new Event('change')); });
    expect(document.getElementById('shell-navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir todas las secciones' })).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem('unithor:sidebar-collapsed')).toBe('true');
  });

  it.each([true, false])('el control de instalación conserva el prompt nativo (escritorio: %s)', async (desktop) => {
    mockViewport(desktop);
    useAuthStore.setState({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
    renderRoute('/forbidden');
    if (!desktop) fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    const install = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      platforms: ['web'],
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });
    act(() => { window.dispatchEvent(install); });
    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicación UNITHOR' }));
    await waitFor(() => expect(install.prompt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Instalar aplicación UNITHOR' })).not.toBeInTheDocument());
    expect(install.defaultPrevented).toBe(true);
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
