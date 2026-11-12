import { describe, expect, it } from 'vitest';

import { APP_ROUTES, getRouteAccess, hasRouteAccess } from '../route-access';
import { getPostLoginPath, getSessionHomePath } from '../session-navigation';

import type { UserPublic } from '../../stores/auth.store';
import type { Module, PermissionDefinition, Role } from '@unithor/shared';

const user = (role: Role = 'vendedor', permissions?: PermissionDefinition[]): UserPublic => ({
  id: 1, nombre: 'Routing test', email: 'routing@example.test', role, permissions,
});
const only = (modulo: Module, accion: PermissionDefinition['accion'] = 'read') =>
  user('vendedor', [{ modulo, accion }]);

describe('authorized session homes', () => {
  it.each([
    ['desarrollador', '/dashboard'], ['admin', '/dashboard'], ['jefe', '/dashboard'],
    ['vendedor', '/dashboard'], ['bodeguero', '/dashboard'], ['finanzas', '/dashboard'],
    ['mecanico', '/work-orders/mine'],
  ] satisfies Array<[Role, string]>)('keeps the standard %s home', (role, home) => {
    expect(getSessionHomePath(user(role))).toBe(home);
  });

  it.each([
    ['taller', 'create', '/work-orders/new'],
    ['comercial', 'create', '/quotations/new'],
    ['compras', 'create', '/purchases/new'],
    ['finanzas', 'read', '/finance'],
    ['almacen', 'read', '/warehouses'],
    ['flota', 'read', '/vehicles'],
    ['compras', 'read', '/purchases'],
    ['admin', 'read', '/users'],
  ] satisfies Array<[Module, PermissionDefinition['accion'], string]>)('lands %s:%s on %s without dashboard access', (module, action, home) => {
    expect(getSessionHomePath(only(module, action))).toBe(home);
  });

  it.each(['finanzas', 'almacen', 'flota'] satisfies Module[])('does not treat %s write/export as read access', (module) => {
    for (const action of ['create', 'update', 'export'] as const) {
      expect(getSessionHomePath(only(module, action))).toBe('/forbidden');
    }
  });

  it('uses API permissions for finance and warehouse roles without commercial/workshop read', () => {
    expect(getSessionHomePath(user('finanzas', [{ modulo: 'finanzas', accion: 'read' }]))).toBe('/finance');
    expect(getSessionHomePath(user('bodeguero', [{ modulo: 'almacen', accion: 'read' }]))).toBe('/warehouses');
    expect(getSessionHomePath(user('finanzas', []))).toBe('/forbidden');
    expect(getSessionHomePath(user('bodeguero', []))).toBe('/forbidden');
  });

  it('keeps administrator overrides and the jefe role-only daily-report rule', () => {
    expect(getSessionHomePath(user('admin', []))).toBe('/dashboard');
    expect(getSessionHomePath(user('desarrollador', []))).toBe('/dashboard');
    expect(getSessionHomePath(user('jefe', []))).toBe('/work-orders/daily-report');
  });

  it('keeps mechanics in their authorized workshop and otherwise stops at forbidden', () => {
    expect(getSessionHomePath(user('mecanico', [{ modulo: 'taller', accion: 'read' }]))).toBe('/work-orders/mine');
    expect(getSessionHomePath(user('mecanico', [{ modulo: 'comercial', accion: 'read' }]))).toBe('/forbidden');
    expect(getSessionHomePath(user('mecanico', []))).toBe('/forbidden');
  });

  it('has stable unauthenticated and no-permission destinations', () => {
    expect(getSessionHomePath(null)).toBe('/login');
    const account = user('vendedor', []);
    expect(getSessionHomePath(account)).toBe('/forbidden');
    expect(getPostLoginPath(account, '/forbidden')).toBe('/forbidden');
    expect(getPostLoginPath(account, '/login')).toBe('/forbidden');
  });
});

describe('post-login route permission checks', () => {
  it.each([
    ['taller', '/work-orders/new', '/dashboard'],
    ['comercial', '/quotations/new', '/dashboard'],
    ['compras', '/purchases/new', '/purchases'],
  ] satisfies Array<[Module, string, string]>)('restores %s create-only forms with the complete query and hash', (module, path, readHome) => {
    const from = `${path}?clientId=42&search=A%2FB&return=https%3A%2F%2Fexample.test#draft%2Fitems`;
    expect(getPostLoginPath(only(module, 'create'), from)).toBe(from);
    expect(getPostLoginPath(only(module, 'create'), path.replace('/new', ''))).toBe(path);
    expect(getPostLoginPath(only(module, 'create'), path.replace('/new', '/42'))).toBe(path);
    expect(getPostLoginPath(only(module), from)).toBe(readHome);
  });

  it.each(['/WORK-ORDERS/NEW/', '/work-orders/%6Eew', '/work-orders/new/'])('matches the guard for the create-route variant %s', (path) => {
    expect(getPostLoginPath(only('taller', 'create'), path)).toBe(path);
    expect(getPostLoginPath(only('taller'), path)).toBe('/dashboard');
  });

  it.each(['comercial', 'taller'] satisfies Module[])('restores conversion with the existing %s alternative, without a read grant', (module) => {
    const account = only(module, module === 'comercial' ? 'update' : 'create');
    const from = '/quotations/42/convert-to-ot?clientId=7#items';
    expect(getPostLoginPath(account, from)).toBe(from);
  });

  it('does not let quotation read/create/export authorize conversion', () => {
    for (const action of ['read', 'create', 'export'] as const) {
      const account = only('comercial', action);
      expect(getPostLoginPath(account, '/quotations/42/convert-to-ot')).toBe(getSessionHomePath(account));
    }
  });

  it('checks fleet detail separately from the fleet list', () => {
    const account = only('flota');
    expect(getPostLoginPath(account, '/vehicles?search=ABC#list')).toBe('/vehicles?search=ABC#list');
    expect(getPostLoginPath(account, '/vehicles/42')).toBe('/vehicles');
  });

  it.each(['desarrollador', 'admin', 'jefe', 'vendedor', 'bodeguero', 'finanzas', 'mecanico'] satisfies Role[])('preserves daily-report and settings policy for %s', (role) => {
    const account = user(role);
    expect(getPostLoginPath(account, '/work-orders/daily-report')).toBe(
      ['desarrollador', 'admin', 'jefe'].includes(role) ? '/work-orders/daily-report' : getSessionHomePath(account),
    );
    expect(getPostLoginPath(account, '/settings')).toBe(
      ['desarrollador', 'admin', 'jefe'].includes(role) ? '/settings' : getSessionHomePath(account),
    );
  });

  it('keeps daily report role-only and settings permission-based for custom accounts', () => {
    expect(getPostLoginPath(user('jefe', []), '/work-orders/daily-report?date=2026-11-12#summary')).toBe('/work-orders/daily-report?date=2026-11-12#summary');
    expect(getPostLoginPath(user('jefe', []), '/settings')).toBe('/work-orders/daily-report');
    expect(getPostLoginPath(only('admin'), '/settings')).toBe('/settings');
    expect(getPostLoginPath(only('taller'), '/work-orders/daily-report')).toBe('/dashboard');
  });

  it.each(['/work-orders/mine', '/WORK-ORDERS/MINE/', '/work-orders/%6Dine?tab=all#work'])('does not restore nonmechanics to %s', (from) => {
    expect(getPostLoginPath(user('admin'), from)).toBe('/dashboard');
  });

  it('keeps mechanics on mine or numeric worksheets, subject to current permissions', () => {
    const mechanic = user('mecanico');
    for (const from of ['/work-orders/mine?status=active#cards', '/work-orders/42/ficha?tab=observaciones#draft']) {
      expect(getPostLoginPath(mechanic, from)).toBe(from);
      expect(getPostLoginPath(user('mecanico', []), from)).toBe('/forbidden');
    }
    for (const from of ['/work-orders', '/work-orders/42', '/work-orders/new', '/quotations', '/work-orders/abc/ficha']) {
      expect(getPostLoginPath(mechanic, from)).toBe('/work-orders/mine');
    }
  });
});

describe('internal redirect URL validation', () => {
  it.each([
    undefined, '', 'https://example.test/work-orders/new', '//example.test/work-orders/new',
    '/\\example.test/work-orders/new', '\\example.test', 'javascript:alert(1)',
    'work-orders/new', ' /work-orders/new', '/work-orders\\new', '/work-orders/../work-orders/new',
    '/work-orders/%2e%2e/work-orders/new', '/work-orders/%5cnew', '/work-orders/%0anew',
    '/work-orders/new\n', '/work-orders/new?x=1\r\n#draft', '/work-orders/%E0%A4%A',
    '/login?from=/work-orders/new#draft', '/', '/work-orders/new/extra', '/finance/extra',
    '/vehicles/42/extra', '/api/work-orders', '/unknown',
  ])('uses a safe authorized fallback for %s', (from) => {
    expect(getPostLoginPath(user('admin'), from)).toBe('/dashboard');
  });

  it('preserves URL-like query/hash data as data on an authorized internal route', () => {
    const from = '/clients?search=a%26b&next=//example.test&path=%5Ctest#https://example.test/a?b=c';
    expect(getPostLoginPath(user('admin'), from)).toBe(from);
  });
});

describe('route access matching', () => {
  it('ranks static routes before read-protected detail parameters', () => {
    expect(getRouteAccess('/work-orders/new')).toBe(APP_ROUTES.workOrderCreate);
    expect(getRouteAccess('/work-orders/daily-report')).toBe(APP_ROUTES.dailyReport);
    expect(getRouteAccess('/quotations/new')).toBe(APP_ROUTES.quotationCreate);
    expect(getRouteAccess('/purchases/new')).toBe(APP_ROUTES.purchaseCreate);
    expect(getRouteAccess('/vehicles/42')).toBe(APP_ROUTES.vehicleDetail);
    expect(getRouteAccess('/vehicles/42/extra')).toBeUndefined();
  });

  it('does not broaden read, write, or export permissions', () => {
    expect(hasRouteAccess(only('taller', 'create'), APP_ROUTES.workOrders)).toBe(false);
    expect(hasRouteAccess(only('taller'), APP_ROUTES.workOrderCreate)).toBe(false);
    expect(hasRouteAccess(only('comercial', 'export'), APP_ROUTES.quotations)).toBe(false);
    expect(hasRouteAccess(only('finanzas', 'export'), APP_ROUTES.reports)).toBe(false);
    expect(hasRouteAccess(only('flota'), APP_ROUTES.vehicleDetail)).toBe(false);
  });
});
