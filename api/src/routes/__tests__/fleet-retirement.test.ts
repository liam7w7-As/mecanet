import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { up as ensureFleetRetirement } from '../../database/migrations/045-fleet-retirement-and-private-owner.js';
import { app } from '../../main.js';
import { FleetDocument } from '../../models/FleetDocument.js';
import { FleetDocumentVersion } from '../../models/FleetDocumentVersion.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Permission } from '../../models/Permission.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { Role as RoleName } from '@unithor/shared';

const password = 'FleetPrivacy2026!';
const ownerName = 'Propietario privado de pruebas SpA';
const roles: RoleName[] = ['desarrollador', 'admin', 'jefe', 'vendedor', 'bodeguero', 'finanzas'];
const users: number[] = [];
const cookies = new Map<RoleName, string[]>();
const addedPermissions: Array<{ roleId: number; permissionId: number }> = [];
const auth = (role: RoleName) => cookies.get(role) ?? [];
const csrf = (role: RoleName) => auth(role).find((cookie) => cookie.startsWith('csrf_token='))?.slice(11) ?? '';
const patch = (id: number, body: object, role: RoleName = 'desarrollador') => request(app).patch(`/api/fleet-vehicles/${id}`).set('Cookie', auth(role)).set('X-CSRF-Token', csrf(role)).send(body);
const get = (path: string, role: RoleName = 'desarrollador') => request(app).get(path).set('Cookie', auth(role));
let vehicle: FleetVehicle;
let document: FleetDocument;

beforeAll(async () => {
  if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Only unithor_test is allowed');
  const passwordHash = await hashPassword(password);
  for (const roleName of roles) {
    const role = await Role.findOne({ where: { nombre: roleName } });
    if (!role) throw new Error(`Missing role ${roleName}`);
    // Custom fleet access must never grant access to the private owner field.
    const actions = roleName === 'jefe' ? ['read', 'create', 'update'] : roleName === 'finanzas' ? ['read'] : [];
    for (const accion of actions) {
      const permission = await Permission.findOne({ where: { modulo: 'flota', accion } });
      if (!permission) throw new Error('Missing fleet permission');
      const [, created] = await RolePermission.findOrCreate({ where: { roleId: role.id, permissionId: permission.id }, defaults: { roleId: role.id, permissionId: permission.id } });
      if (created) addedPermissions.push({ roleId: role.id, permissionId: permission.id });
    }
    invalidatePermissionCache(role.id);
    const user = await User.create({ nombre: `Fleet ${roleName}`, email: `fleet-private-${roleName}@example.test`, passwordHash, roleId: role.id, activo: true });
    users.push(user.id);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
    expect(login.status).toBe(200);
    const raw: unknown = login.headers['set-cookie'];
    cookies.set(roleName, (Array.isArray(raw) ? raw as string[] : []).map((cookie) => cookie.split(';')[0]));
  }
  vehicle = await FleetVehicle.create({ patente: 'FP7001', responsable: 'Encargada Rent a Car', propietario: ownerName, estadoOperativo: 'disponible' });
  document = await FleetDocument.create({ fleetVehicleId: vehicle.id, nombre: 'Permiso de circulación', fechaVencimiento: '2028-03-31', version: 1 });
});

afterAll(async () => {
  if (document) {
    await FleetDocumentVersion.destroy({ where: { fleetDocumentId: document.id }, force: true });
    await FleetDocument.destroy({ where: { fleetVehicleId: vehicle.id }, force: true });
  }
  await FleetVehicle.destroy({ where: { patente: { [Op.like]: 'FP70%' } }, force: true });
  for (const permission of addedPermissions) { await RolePermission.destroy({ where: permission }); invalidatePermissionCache(permission.roleId); }
  if (users.length) { await RefreshToken.destroy({ where: { userId: users } }); await User.destroy({ where: { id: users }, force: true }); }
});

describe('Fleet retirement and private owner', () => {
  it.each(['admin', 'desarrollador'] as const)('returns owner separately from the public responsible to %s', async (role) => {
    const detail = await get(`/api/fleet-vehicles/${vehicle.id}`, role);
    expect(detail.status).toBe(200);
    expect(detail.body.fleetVehicle).toMatchObject({ propietario: ownerName, responsable: 'Encargada Rent a Car' });
    const list = await get('/api/fleet-vehicles?search=FP7001', role);
    expect(list.body.items[0].propietario).toBe(ownerName);
    const saved = await patch(vehicle.id, { propietario: ownerName, responsable: 'Encargada Rent a Car' }, role);
    expect(saved.status).toBe(200);
    expect(saved.body.fleetVehicle.propietario).toBe(ownerName);
  });

  it.each(['jefe', 'vendedor', 'bodeguero', 'finanzas'] as const)('omits owner entirely for %s even with fleet read access', async (role) => {
    const detail = await get(`/api/fleet-vehicles/${vehicle.id}`, role);
    const list = await get('/api/fleet-vehicles?search=FP7001', role);
    expect(detail.status).toBe(200); expect(list.status).toBe(200);
    expect(detail.body.fleetVehicle).not.toHaveProperty('propietario');
    expect(list.body.items[0]).not.toHaveProperty('propietario');
    expect(JSON.stringify([detail.body, list.body])).not.toContain(ownerName);
    expect(detail.body.fleetVehicle.responsable).toBe('Encargada Rent a Car');
  });

  it('allows ordinary fleet edits but rejects owner edits and creation by a non-admin editor', async () => {
    const ordinary = await patch(vehicle.id, { responsable: 'Jefe de taller externo' }, 'jefe');
    expect(ordinary.status).toBe(200); expect(ordinary.body.fleetVehicle).not.toHaveProperty('propietario');
    expect((await patch(vehicle.id, { propietario: 'Otro titular' }, 'jefe')).status).toBe(403);
    expect((await patch(vehicle.id, { propietario: null }, 'jefe')).status).toBe(403);
    const create = await request(app).post('/api/fleet-vehicles').set('Cookie', auth('jefe')).set('X-CSRF-Token', csrf('jefe')).send({ patente: 'FP7002', propietario: 'No autorizado' });
    expect(create.status).toBe(403);
    expect(await FleetVehicle.findOne({ where: { patente: 'FP7002' } })).toBeNull();
    expect((await vehicle.reload()).propietario).toBe(ownerName);
  });

  it('retires rather than deleting, preserving dates on repeated edits and all documents', async () => {
    const result = await patch(vehicle.id, { estadoOperativo: 'dado_de_baja', motivoBaja: 'Renovación de flota' }, 'jefe');
    expect(result.status).toBe(200);
    expect(result.body.fleetVehicle).toMatchObject({ estadoOperativo: 'dado_de_baja', motivoBaja: 'Renovación de flota' });
    expect(result.body.fleetVehicle.fechaBaja).toBeTruthy();
    expect(result.body.fleetVehicle.documents).toHaveLength(1);
    const savedDate = result.body.fleetVehicle.fechaBaja;
    const repeated = await patch(vehicle.id, { estadoOperativo: 'dado_de_baja', responsable: 'Encargado de resguardo' }, 'jefe');
    expect(repeated.body.fleetVehicle.fechaBaja).toBe(savedDate);
    expect(repeated.body.fleetVehicle.motivoBaja).toBe('Renovación de flota');
    expect((await vehicle.reload()).deletedAt).toBeNull();
    expect(await FleetDocument.findByPk(document.id)).not.toBeNull();
    const reactivate = await patch(vehicle.id, { estadoOperativo: 'disponible' }, 'jefe');
    expect(reactivate.body.fleetVehicle.fechaBaja).toBe(savedDate);
    expect(reactivate.body.fleetVehicle.documents).toHaveLength(1);
  });

  it('sorts states before pagination, keeping unavailable and retired vehicles last', async () => {
    const sortedVehicles = await FleetVehicle.bulkCreate([
      { patente: 'FP7011', estadoOperativo: 'dado_de_baja', fechaBaja: new Date() },
      { patente: 'FP7012', estadoOperativo: 'fuera_de_servicio' },
      { patente: 'FP7013', estadoOperativo: 'en_mantencion' },
      { patente: 'FP7014', estadoOperativo: 'disponible' },
    ]);
    const first = await get('/api/fleet-vehicles?search=FP70&pageSize=2&page=1', 'jefe');
    const second = await get('/api/fleet-vehicles?search=FP70&pageSize=2&page=2', 'jefe');
    const last = await get('/api/fleet-vehicles?search=FP70&pageSize=2&page=3', 'jefe');
    expect(first.body.items.map((item: { estadoOperativo: string }) => item.estadoOperativo)).toEqual(['disponible', 'disponible']);
    expect(second.body.items.map((item: { estadoOperativo: string }) => item.estadoOperativo)).toEqual(['en_mantencion', 'fuera_de_servicio']);
    expect(last.body.items.map((item: { estadoOperativo: string }) => item.estadoOperativo)).toEqual(['dado_de_baja']);
    const filtered = await get('/api/fleet-vehicles?estado=dado_de_baja', 'jefe');
    expect(filtered.body.total).toBe(1);
    await FleetDocument.bulkCreate(sortedVehicles.flatMap((item) => [
      { fleetVehicleId: item.id, nombre: 'Documento vencido A', fechaVencimiento: '2020-01-01' },
      { fleetVehicleId: item.id, nombre: 'Documento vencido B', fechaVencimiento: '2020-01-02' },
    ]));
    const expiredPage = await get('/api/fleet-vehicles?search=FP70&vencimiento=vencido&pageSize=2&page=2', 'jefe');
    expect(expiredPage.status).toBe(200);
    expect(expiredPage.body.total).toBe(4);
    expect(expiredPage.body.items.map((item: { estadoOperativo: string }) => item.estadoOperativo)).toEqual(['fuera_de_servicio', 'dado_de_baja']);

  });

  it('keeps owner and documents intact when ensuring an already-migrated database again', async () => {
    await ensureFleetRetirement(sequelize.getQueryInterface());
    await ensureFleetRetirement(sequelize.getQueryInterface());
    expect((await vehicle.reload()).propietario).toBe(ownerName);
    expect(await FleetDocument.findByPk(document.id)).not.toBeNull();
  });

  it('requires CSRF for retirement', async () => {
    const result = await request(app).patch(`/api/fleet-vehicles/${vehicle.id}`).set('Cookie', auth('desarrollador')).send({ estadoOperativo: 'dado_de_baja' });
    expect(result.status).toBe(403);
  });
  it('lets administration explicitly clear owner without erasing the responsible', async () => {
    const response = await patch(vehicle.id, { propietario: null }, 'admin');
    expect(response.status).toBe(200);
    expect(response.body.fleetVehicle.propietario).toBeNull();
    expect(response.body.fleetVehicle.responsable).toBe('Encargado de resguardo');
  });

});
