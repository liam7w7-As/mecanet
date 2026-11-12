import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { api } from './lib/api';
import { useAuthStore } from './stores/auth.store';

import type { UserPublic } from './stores/auth.store';
import type { Module, PermissionDefinition, Role } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

// Keep these tests on the routing boundary; the shell and page data have their own tests.
vi.mock('./components/layout/AppLayout', async () => ({ default: (await import('react-router-dom')).Outlet }));
vi.mock('./pages/dashboard/DashboardPage', () => ({ default: () => <div data-testid="route-page">dashboard</div> }));
vi.mock('./pages/work-orders/WorkOrdersPage', () => ({ default: () => <div data-testid="route-page">workOrders</div> }));
vi.mock('./pages/work-orders/WorkOrderCreatePage', () => ({ default: () => <div data-testid="route-page">workOrderCreate</div> }));
vi.mock('./pages/work-orders/MyWorkOrdersPage', () => ({ default: () => <div data-testid="route-page">myWorkOrders</div> }));
vi.mock('./pages/work-orders/WorkshopDailyReportPage', () => ({ default: () => <div data-testid="route-page">dailyReport</div> }));
vi.mock('./pages/work-orders/WorkOrderDetailPage', () => ({ default: () => <div data-testid="route-page">workOrderDetail</div> }));
vi.mock('./pages/quotations/QuotationsPage', () => ({ default: () => <div data-testid="route-page">quotations</div> }));
vi.mock('./pages/quotations/QuotationCreatePage', () => ({ default: () => <div data-testid="route-page">quotationCreate</div> }));
vi.mock('./pages/quotations/QuotationDetailPage', () => ({ default: () => <div data-testid="route-page">quotationDetail</div> }));
vi.mock('./pages/purchases/PurchasesPage', () => ({ default: () => <div data-testid="route-page">purchases</div> }));
vi.mock('./pages/purchases/PurchaseCreatePage', () => ({ default: () => <div data-testid="route-page">purchaseCreate</div> }));
vi.mock('./pages/purchases/PurchaseDetailPage', () => ({ default: () => <div data-testid="route-page">purchaseDetail</div> }));
vi.mock('./pages/finance/FinancePage', () => ({ default: () => <div data-testid="route-page">finance</div> }));
vi.mock('./pages/reports/ReportsPage', () => ({ default: () => <div data-testid="route-page">reports</div> }));
vi.mock('./pages/clients/ClientsPage', () => ({ default: () => <div data-testid="route-page">clients</div> }));
vi.mock('./pages/vehicles/VehiclesPage', () => ({ default: () => <div data-testid="route-page">vehicles</div> }));
vi.mock('./pages/vehicles/VehicleDetailPage', () => ({ default: () => <div data-testid="route-page">vehicleDetail</div> }));
vi.mock('./pages/catalog/CatalogPage', () => ({ default: () => <div data-testid="route-page">catalog</div> }));
vi.mock('./pages/warehouses/WarehousesPage', () => ({ default: () => <div data-testid="route-page">warehouses</div> }));
vi.mock('./pages/users/UsersPage', () => ({ default: () => <div data-testid="route-page">users</div> }));
vi.mock('./pages/settings/SettingsPage', () => ({ default: () => <div data-testid="route-page">settings</div> }));
vi.mock('./lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

const baseUser: UserPublic = { id: 1, nombre: 'Routing test', email: 'routing@example.test', role: 'vendedor' };
const signIn = (permissions?: PermissionDefinition[], role: Role = 'vendedor') => {
  const user = { ...baseUser, role, permissions };
  useAuthStore.setState({ user, isAuthenticated: true, isLoading: false });
  return user;
};
const LocationProbe = () => {
  const location = useLocation();
  return <>
    <output aria-label="location">{location.pathname + location.search + location.hash}</output>
    <output aria-label="return path">{location.state?.from}</output>
  </>;
};
const renderRoute = (path: string, from?: unknown) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter initialEntries={[from === undefined ? path : { pathname: path, state: { from } }]}>
      <App />
      <LocationProbe />
    </MemoryRouter>
  </QueryClientProvider>,
);

const guards: Array<{ path: string; page: string; permissions: PermissionDefinition[]; role?: Role }> = [
  { path: '/dashboard', page: 'dashboard', permissions: [{ modulo: 'comercial', accion: 'read' }] },
  { path: '/work-orders', page: 'workOrders', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { path: '/work-orders/new', page: 'workOrderCreate', permissions: [{ modulo: 'taller', accion: 'create' }] },
  { path: '/work-orders/mine', page: 'myWorkOrders', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { path: '/work-orders/daily-report', page: 'dailyReport', permissions: [], role: 'jefe' },
  { path: '/work-orders/42/ficha', page: 'workOrders', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { path: '/work-orders/42', page: 'workOrderDetail', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { path: '/quotations', page: 'quotations', permissions: [{ modulo: 'comercial', accion: 'read' }] },
  { path: '/quotations/new', page: 'quotationCreate', permissions: [{ modulo: 'comercial', accion: 'create' }] },
  { path: '/quotations/42/convert-to-ot', page: 'workOrderCreate', permissions: [{ modulo: 'comercial', accion: 'update' }] },
  { path: '/quotations/42', page: 'quotationDetail', permissions: [{ modulo: 'comercial', accion: 'read' }] },
  { path: '/purchases', page: 'purchases', permissions: [{ modulo: 'compras', accion: 'read' }] },
  { path: '/purchases/new', page: 'purchaseCreate', permissions: [{ modulo: 'compras', accion: 'create' }] },
  { path: '/purchases/42', page: 'purchaseDetail', permissions: [{ modulo: 'compras', accion: 'read' }] },
  { path: '/finance', page: 'finance', permissions: [{ modulo: 'finanzas', accion: 'read' }] },
  { path: '/reports', page: 'reports', permissions: [{ modulo: 'almacen', accion: 'read' }] },
  { path: '/clients', page: 'clients', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { path: '/vehicles', page: 'vehicles', permissions: [{ modulo: 'flota', accion: 'read' }] },
  { path: '/vehicles/42', page: 'vehicleDetail', permissions: [{ modulo: 'comercial', accion: 'read' }] },
  { path: '/catalog', page: 'catalog', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { path: '/warehouses', page: 'warehouses', permissions: [{ modulo: 'almacen', accion: 'read' }] },
  { path: '/users', page: 'users', permissions: [{ modulo: 'admin', accion: 'read' }] },
  { path: '/settings', page: 'settings', permissions: [{ modulo: 'admin', accion: 'read' }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: {} } as AxiosResponse);
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('App route guards', () => {
  it.each(guards)('keeps the existing minimal authorization for $path', async ({ path, page, permissions, role }) => {
    signIn(permissions, role);
    renderRoute(path);
    expect(await screen.findByTestId('route-page')).toHaveTextContent(page);
    expect(screen.queryByRole('heading', { name: 'Acceso restringido' })).not.toBeInTheDocument();
  });

  it.each(guards)('denies $path without its permission or role', async ({ path }) => {
    signIn([]);
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument();
    expect(screen.getByLabelText('location').textContent).toBe('/forbidden');
    expect(screen.queryByTestId('route-page')).not.toBeInTheDocument();
  });

  it.each([
    ['/work-orders/new/', 'taller', 'read'], ['/quotations/NEW', 'comercial', 'read'],
    ['/purchases/%6Eew', 'compras', 'read'], ['/work-orders/42', 'taller', 'create'],
    ['/quotations/42', 'comercial', 'create'], ['/purchases/42', 'compras', 'create'],
    ['/finance', 'finanzas', 'export'], ['/warehouses', 'almacen', 'update'],
    ['/vehicles/42', 'flota', 'read'],
  ] satisfies Array<[string, Module, PermissionDefinition['accion']]>)('does not broaden %s for %s:%s', async (path, modulo, accion) => {
    signIn([{ modulo, accion }]);
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument();
  });
});

describe('session redirects through App', () => {
  it.each([
    ['taller', '/work-orders/new', 'workOrderCreate'],
    ['comercial', '/quotations/new', 'quotationCreate'],
    ['compras', '/purchases/new', 'purchaseCreate'],
  ] satisfies Array<[Module, string, string]>)('restores the complete %s create-only URL after an expired session login', async (modulo, path, page) => {
    const permissions: PermissionDefinition[] = [{ modulo, accion: 'create' }];
    vi.mocked(api.post).mockResolvedValue({ data: { user: { ...baseUser, permissions } } } as AxiosResponse);
    const from = `${path}?clientId=42&search=A%2FB#draft%2Fitems`;
    renderRoute(from);
    expect(await screen.findByLabelText('Usuario o correo')).toBeInTheDocument();
    expect(screen.getByLabelText('return path').textContent).toBe(from);
    fireEvent.change(screen.getByLabelText('Usuario o correo'), { target: { value: 'prueba' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Prueba123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
    await waitFor(() => expect(screen.getByLabelText('location').textContent).toBe(from));
    expect(screen.getByTestId('route-page')).toHaveTextContent(page);
    expect(useAuthStore.getState().user?.permissions).toEqual(permissions);
  });

  it.each([
    ['taller', '/work-orders/new'], ['comercial', '/quotations/new'], ['compras', '/purchases/new'],
  ] satisfies Array<[Module, string]>)('restores %s create-only URLs through PublicRoute', async (modulo, path) => {
    signIn([{ modulo, accion: 'create' }]);
    const from = `${path}?clientId=42#draft`;
    renderRoute('/login', from);
    await waitFor(() => expect(screen.getByLabelText('location').textContent).toBe(from));
    expect(screen.getByTestId('route-page')).toBeInTheDocument();
  });

  it.each([
    ['desarrollador', '/dashboard'], ['admin', '/dashboard'], ['jefe', '/dashboard'],
    ['vendedor', '/dashboard'], ['bodeguero', '/dashboard'], ['finanzas', '/dashboard'],
    ['mecanico', '/work-orders/mine'],
  ] satisfies Array<[Role, string]>)('lands standard %s on its authorized home', async (role, home) => {
    signIn(undefined, role);
    renderRoute('/login');
    await waitFor(() => expect(screen.getByLabelText('location').textContent).toBe(home));
    expect(screen.getByTestId('route-page')).toBeInTheDocument();
  });

  it.each([
    ['taller', 'create', '/work-orders/new'], ['comercial', 'create', '/quotations/new'],
    ['compras', 'create', '/purchases/new'], ['finanzas', 'read', '/finance'],
    ['almacen', 'read', '/warehouses'], ['flota', 'read', '/vehicles'],
  ] satisfies Array<[Module, PermissionDefinition['accion'], string]>)('uses an authorized home for %s:%s when the saved destination is denied', async (modulo, accion, home) => {
    signIn([{ modulo, accion }]);
    renderRoute('/login', '/settings?tab=access#roles');
    await waitFor(() => expect(screen.getByLabelText('location').textContent).toBe(home));
    expect(screen.getByTestId('route-page')).toBeInTheDocument();
  });

  it.each(['/', '/login', '/dashboard', '/forbidden'])('settles no-permission users from %s at forbidden without a home loop', async (path) => {
    signIn([]);
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument();
    expect(screen.getByLabelText('location').textContent).toBe('/forbidden');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the nonmechanic mine exclusion in PublicRoute', async () => {
    signIn([{ modulo: 'taller', accion: 'read' }]);
    renderRoute('/login', '/work-orders/mine?status=active#cards');
    await waitFor(() => expect(screen.getByLabelText('location').textContent).toBe('/dashboard'));
  });

  it.each(['/forbidden', '/missing-page'])('sends the %s home CTA to an authorized create-only form', async (path) => {
    signIn([{ modulo: 'compras', accion: 'create' }]);
    renderRoute(path);
    const homeLink = screen.getByRole('link', { name: /al inicio/ });
    expect(homeLink).toHaveAttribute('href', '/purchases/new');
    fireEvent.click(homeLink);
    expect(await screen.findByTestId('route-page')).toHaveTextContent('purchaseCreate');
    expect(screen.getByLabelText('location').textContent).toBe('/purchases/new');
  });

  it('sends a mechanic forbidden CTA to their own workshop', () => {
    signIn(undefined, 'mecanico');
    renderRoute('/forbidden');
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/work-orders/mine');
  });
});
