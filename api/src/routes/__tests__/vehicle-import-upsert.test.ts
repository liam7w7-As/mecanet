import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Permission } from '../../models/Permission.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { buildImportTemplate } from '../../services/import/import-template.service.js';
import {
  invalidatePermissionCache,
  updateRolePermissions,
} from '../../services/permission.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { ImportModule } from '@unithor/shared';

type Module = Extract<ImportModule, 'vehicles' | 'fleet-vehicles'>;
interface Session {
  token: string;
}
const MARKER = 'Phase2 vehicle import ';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const csrf = 'phase2-vehicle-import-csrf';
const plates = new Set<string>();
let admin: Session;
let limited: Session;
let roleId: number;
let originalPermissions: number[] = [];
let permissionIds = new Map<string, number>();
const userIds: number[] = [];

const workbook = async (
  headers: string[],
  rows: Array<Array<string | number | boolean | null>>,
): Promise<Buffer> => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Datos');
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
    const value = row[headers.indexOf('Patente')];
    if (typeof value === 'string' && value.trim()) {
      plates.add(value.trim().toUpperCase());
      plates.add(value.replace(/[\s-]/g, '').toUpperCase());
    }
  }
  return Buffer.from(await book.xlsx.writeBuffer());
};

const upload = async (
  module: Module,
  buffer: Buffer,
  dryRun: boolean,
  session = admin,
  previewToken?: string,
) => {
  let req = request(app)
    .post(`/api/${module}/import`)
    .query({ dryRun: String(dryRun) })
    .set('Cookie', [`access_token=${session.token}`, `csrf_token=${csrf}`])
    .set('X-CSRF-Token', csrf);
  if (previewToken) req = req.set('X-Import-Preview', previewToken);
  return req.attach('file', buffer, { filename: 'phase2-vehicles.xlsx', contentType: MIME });
};

const preview = async (module: Module, buffer: Buffer, session = admin) => {
  const response = await upload(module, buffer, true, session);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.preview.previewToken).toEqual(expect.any(String));
  return response.body.preview;
};

const confirm = async (module: Module, buffer: Buffer, session = admin) => {
  const plan = await preview(module, buffer, session);
  const response = await upload(module, buffer, false, session, plan.previewToken);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return { plan, result: response.body.result };
};

const permissions = async (...keys: string[]) => {
  const ids = keys.map((key) => {
    const id = permissionIds.get(key);
    if (!id) throw new Error(`Missing seeded permission ${key}`);
    return id;
  });
  await updateRolePermissions(roleId, ids);
};

const vehicle = async (patente: string, extra: Record<string, unknown> = {}) => {
  plates.add(patente);
  return Vehicle.create({ patente, ...extra });
};
const fleetVehicle = async (patente: string, extra: Record<string, unknown> = {}) => {
  plates.add(patente);
  return FleetVehicle.create({ patente, estadoOperativo: 'disponible', ...extra });
};

describe('Vehicle/fleet smart import (API + real permissions)', () => {
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Requires unithor_test');
    const adminRole = await Role.findOne({ where: { nombre: 'admin' } });
    const limitedRole = await Role.findOne({ where: { nombre: 'jefe' } });
    if (!adminRole || !limitedRole) throw new Error('Missing seeded roles');
    roleId = limitedRole.id;
    originalPermissions = (await RolePermission.findAll({ where: { roleId } })).map(
      (entry) => entry.permissionId,
    );
    permissionIds = new Map(
      (await Permission.findAll()).map((entry) => [`${entry.modulo}:${entry.accion}`, entry.id]),
    );
    for (const [name, role] of [
      ['admin', adminRole],
      ['limited', limitedRole],
    ] as const) {
      const user = await User.create({
        nombre: `${MARKER}${name}`,
        email: `phase2-vehicle-${name}@test.local`,
        passwordHash: 'unused-in-signed-test-session',
        roleId: role.id,
        activo: true,
      });
      userIds.push(user.id);
      const session = { token: signAccessToken({ sub: user.id, role: role.nombre }) };
      if (name === 'admin') admin = session;
      else limited = session;
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (roleId) await updateRolePermissions(roleId, originalPermissions);
    if (plates.size) {
      await Vehicle.destroy({ where: { patente: { [Op.in]: [...plates] } }, force: true });
      await FleetVehicle.destroy({ where: { patente: { [Op.in]: [...plates] } }, force: true });
    }
    await Client.destroy({ where: { nombre: { [Op.like]: `${MARKER}%` } }, force: true });
    plates.clear();
  });

  afterAll(async () => {
    if (roleId) await updateRolePermissions(roleId, originalPermissions);
    invalidatePermissionCache();
    if (userIds.length) await User.destroy({ where: { id: userIds }, force: true });
  });

  it('updates by stable ID, previews old/new, preserves blanks and treats zero explicitly', async () => {
    const owner = await Client.create({ nombre: `${MARKER}owner`, tipo: 'cliente' });
    const existing = await vehicle('VPAA01', {
      marca: 'Toyota',
      modelo: 'Hilux',
      kilometraje: 42000,
      clientId: owner.id,
    });
    const file = await workbook(
      ['ID', 'Patente', 'Marca', 'Modelo', 'Kilometraje', 'Propietario'],
      [[existing.id, 'vp-aa02', '   ', '', 0, null]],
    );
    const { plan, result } = await confirm('vehicles', file);
    expect(plan.rows[0]).toMatchObject({ status: 'update', existingId: existing.id });
    expect(plan.rows[0].changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'patente', before: 'VPAA01', after: 'VPAA02' }),
        expect.objectContaining({ field: 'kilometraje', before: 42000, after: 0 }),
      ]),
    );
    expect(result).toMatchObject({ created: 0, updated: 1, clientsCreated: 0, failed: 0 });
    await existing.reload();
    expect(existing).toMatchObject({
      patente: 'VPAA02',
      marca: 'Toyota',
      modelo: 'Hilux',
      kilometraje: 0,
      clientId: owner.id,
    });
    const timestamp = existing.updatedAt.getTime();
    const writes = vi.spyOn(Vehicle.prototype, 'update');
    const repeated = await confirm('vehicles', file);
    expect(repeated.plan).toMatchObject({ unchangedRows: 1, updateRows: 0 });
    expect(repeated.result).toMatchObject({ updated: 0, unchanged: 1, clientsCreated: 0 });
    expect(writes).not.toHaveBeenCalled();
    expect((await existing.reload()).updatedAt.getTime()).toBe(timestamp);
  });

  it('matches normalized domestic plates without an ID', async () => {
    const existing = await vehicle('VPAA03', { color: 'Blanco' });
    const file = await workbook(['Patente', 'Color'], [['vp-aa03', 'Rojo']]);
    const { plan, result } = await confirm('vehicles', file);
    expect(plan.rows[0]).toMatchObject({ existingId: existing.id, status: 'update' });
    expect(result.updated).toBe(1);
    expect((await existing.reload()).color).toBe('Rojo');
  });

  it('rejects unknown/deleted IDs, conflicting identities and workshop/fleet collisions', async () => {
    const first = await vehicle('VPAA04');
    const other = await vehicle('VPAA05');
    const deleted = await vehicle('VPAA06');
    await deleted.destroy();
    await fleetVehicle('VPFB01');
    const file = await workbook(
      ['ID', 'Patente', 'Marca'],
      [
        [2147483647, first.patente, 'Wrong'],
        [deleted.id, null, 'Wrong'],
        [first.id, other.patente, 'Wrong'],
        [null, 'VPFB01', 'Wrong'],
      ],
    );
    const { result } = await confirm('vehicles', file);
    expect(result).toMatchObject({ conflicts: 4, updated: 0, created: 0 });
    expect((await first.reload()).marca).toBeNull();
    expect((await Vehicle.findByPk(deleted.id, { paranoid: false }))!.deletedAt).not.toBeNull();
  });

  it('conflicts every repeated plate or repeated destination, including ID-only rows', async () => {
    const existing = await vehicle('VPAA07');
    const file = await workbook(
      ['ID', 'Patente', 'Color'],
      [
        [existing.id, null, 'Rojo'],
        [null, 'VPAA07', 'Azul'],
        [null, 'VPAA08', 'Blanco'],
        [null, 'vp-aa08', 'Negro'],
      ],
    );
    const { result } = await confirm('vehicles', file);
    expect(result).toMatchObject({ conflicts: 4, updated: 0, created: 0 });
    expect((await existing.reload()).color).toBeNull();
    expect(await Vehicle.count({ where: { patente: 'VPAA08' } })).toBe(0);
  });

  it('shares one newly created client between two rows and leaves a repeated file unchanged', async () => {
    const name = `${MARKER}shared new client`;
    const file = await workbook(
      ['Patente', 'Propietario', 'RUT propietario', 'Teléfono propietario'],
      [
        ['VPAA09', name, '12.991.234-5', '12345'],
        ['VPAA10', name, '129912345', '67890'],
      ],
    );
    const { result } = await confirm('vehicles', file);
    expect(result).toMatchObject({ created: 2, clientsCreated: 1, failed: 0 });
    const rows = await Vehicle.findAll({ where: { patente: ['VPAA09', 'VPAA10'] } });
    expect(rows).toHaveLength(2);
    expect(rows[0].clientId).toBeTruthy();
    expect(rows[0].clientId).toBe(rows[1].clientId);
    const owner = await Client.findByPk(rows[0].clientId!);
    expect(owner).toMatchObject({ telefono: '12345', rut: '129912345' });
    expect(await Client.count({ where: { nombre: name } })).toBe(1);
    const repeated = await confirm('vehicles', file);
    expect(repeated.result).toMatchObject({
      unchanged: 2,
      updated: 0,
      created: 0,
      clientsCreated: 0,
    });
  });

  it('rolls back a failed row client and lets the next row create and reuse it safely', async () => {
    const name = `${MARKER}savepoint client`;
    const file = await workbook(
      ['Patente', 'Propietario', 'RUT propietario'],
      [
        ['VPAA22', name, '129912348'],
        ['VPAA23', name, '129912348'],
      ],
    );
    vi.spyOn(Vehicle, 'create').mockImplementationOnce(async () => {
      throw new Error('Forced vehicle creation failure after client creation');
    });
    const { result } = await confirm('vehicles', file);
    expect(result).toMatchObject({ created: 1, failed: 1, clientsCreated: 1 });
    expect(await Vehicle.count({ where: { patente: 'VPAA22' } })).toBe(0);
    const successful = (await Vehicle.findOne({ where: { patente: 'VPAA23' } }))!;
    const owners = await Client.findAll({ where: { nombre: name } });
    expect(owners).toHaveLength(1);
    expect(successful.clientId).toBe(owners[0].id);
  });

  it('matches active clients by RUT or normalized name without editing their details', async () => {
    const owner = await Client.create({
      nombre: `${MARKER}Ána Soto`,
      rut: '129912346',
      tipo: 'cliente',
      telefono: 'Original',
      email: 'original@test.local',
    });
    const before = structuredClone((await Client.findByPk(owner.id))!.toJSON());
    const file = await workbook(
      ['Patente', 'Propietario', 'RUT propietario', 'Teléfono propietario', 'Email propietario'],
      [
        ['VPAA11', null, '12.991.234-6', 'New phone', 'new@test.local'],
        ['VPAA12', `${MARKER}ana   soto`, null, 'Other', null],
      ],
    );
    const { result } = await confirm('vehicles', file);
    expect(result).toMatchObject({ created: 2, clientsCreated: 0 });
    expect(
      (await Vehicle.findAll({ where: { patente: ['VPAA11', 'VPAA12'] } })).every(
        (row) => row.clientId === owner.id,
      ),
    ).toBe(true);
    expect((await Client.findByPk(owner.id))!.toJSON()).toEqual(before);
  });

  it('never restores a deleted client by RUT or name', async () => {
    const owner = await Client.create({
      nombre: `${MARKER}deleted client`,
      rut: '129912347',
      tipo: 'cliente',
    });
    await owner.destroy();
    const file = await workbook(
      ['Patente', 'Propietario', 'RUT propietario'],
      [
        ['VPAA13', null, '12.991.234-7'],
        ['VPAA14', owner.nombre, null],
      ],
    );
    const { result } = await confirm('vehicles', file);
    expect(result).toMatchObject({ conflicts: 2, clientsCreated: 0, created: 0 });
    expect((await Client.findByPk(owner.id, { paranoid: false }))!.deletedAt).not.toBeNull();
  });

  it('preserves foreign plate punctuation and honors explicit foreign flag changes', async () => {
    const file = await workbook(
      ['Patente', 'Patente extranjera', 'Marca'],
      [
        ['VP-C123', true, 'One'],
        ['VPC123', 'Sí', 'Two'],
        ['VPAA15', 'Quizás', 'Bad'],
      ],
    );
    const { result } = await confirm('vehicles', file);
    expect(result).toMatchObject({ created: 2, failed: 1, conflicts: 0 });
    const foreign = (await Vehicle.findOne({ where: { patente: 'VP-C123' } }))!;
    const natural = await workbook(
      ['Patente', 'Patente extranjera', 'Color'],
      [['vp-c123', 'Sí', 'Rojo']],
    );
    expect((await confirm('vehicles', natural)).result.updated).toBe(1);
    expect((await foreign.reload()).patente).toBe('VP-C123');
    const blankPlate = await workbook(['ID', 'Color'], [[foreign.id, 'Azul']]);
    expect((await confirm('vehicles', blankPlate)).result.updated).toBe(1);
    expect((await foreign.reload()).patente).toBe('VP-C123');
    const domestic = await workbook(
      ['ID', 'Patente', 'Patente extranjera'],
      [[foreign.id, 'vp-aa16', 'No']],
    );
    expect((await confirm('vehicles', domestic)).result.updated).toBe(1);
    expect((await foreign.reload()).patente).toBe('VPAA16');
    const foreignAgain = await workbook(
      ['ID', 'Patente', 'Patente extranjera'],
      [[foreign.id, 'VP-C123', 'Sí']],
    );
    expect((await confirm('vehicles', foreignAgain)).result.updated).toBe(1);
    const noFlag = await workbook(['Patente', 'Marca'], [['VP-X124', 'Bad']]);
    expect((await preview('vehicles', noFlag)).errorRows).toBe(1);
  });

  it('matches fleet internal code, preserves blank owner, and avoids unchanged writes', async () => {
    const existing = await fleetVehicle('VPFB02', {
      codigoInterno: 'VP-FLEET-02',
      propietario: 'Private owner',
      responsable: 'Old',
      kilometraje: 33,
    });
    const file = await workbook(
      ['Patente', 'Código interno', 'Responsable', 'Propietario', 'Kilometraje'],
      [['VPFB03', 'vp-fleet-02', 'New', ' ', 0]],
    );
    const { plan, result } = await confirm('fleet-vehicles', file);
    expect(plan.rows[0]).toMatchObject({ existingId: existing.id, status: 'update' });
    expect(result).toMatchObject({ updated: 1, created: 0 });
    expect(await existing.reload()).toMatchObject({
      patente: 'VPFB03',
      propietario: 'Private owner',
      responsable: 'New',
      kilometraje: 0,
    });
    const writes = vi.spyOn(FleetVehicle.prototype, 'update');
    expect((await confirm('fleet-vehicles', file)).result).toMatchObject({
      unchanged: 1,
      updated: 0,
    });
    expect(writes).not.toHaveBeenCalled();
  });

  it('rejects fleet ID/key disagreements, cross-workshop keys, and deleted matches', async () => {
    const first = await fleetVehicle('VPFB04', { codigoInterno: 'VP-FLEET-04' });
    const other = await fleetVehicle('VPFB05', { codigoInterno: 'VP-FLEET-05' });
    const deleted = await fleetVehicle('VPFB06', { codigoInterno: 'VP-FLEET-06' });
    await deleted.destroy();
    await vehicle('VPAA17');
    const file = await workbook(
      ['ID', 'Patente', 'Código interno', 'Color'],
      [
        [first.id, other.patente, null, 'Wrong'],
        [null, first.patente, other.codigoInterno, 'Wrong'],
        [2147483647, 'VPFB07', null, 'Wrong'],
        [deleted.id, null, null, 'Wrong'],
        [null, 'VPAA17', null, 'Wrong'],
        [null, null, deleted.codigoInterno, 'Wrong'],
      ],
    );
    expect((await confirm('fleet-vehicles', file)).result).toMatchObject({
      conflicts: 6,
      created: 0,
      updated: 0,
    });
    expect(
      (await FleetVehicle.findByPk(deleted.id, { paranoid: false }))!.deletedAt,
    ).not.toBeNull();
    expect((await first.reload()).color).toBeNull();
  });

  it('conflicts repeated fleet codes and targets without applying the first row', async () => {
    const existing = await fleetVehicle('VPFB08', { codigoInterno: 'VP-FLEET-08' });
    const file = await workbook(
      ['ID', 'Patente', 'Código interno', 'Color'],
      [
        [existing.id, null, null, 'Rojo'],
        [null, null, existing.codigoInterno, 'Azul'],
        [null, 'VPFB09', 'VP-FLEET-09', null],
        [null, 'VPFB10', 'vp-fleet-09', null],
      ],
    );
    expect((await confirm('fleet-vehicles', file)).result).toMatchObject({
      conflicts: 4,
      created: 0,
      updated: 0,
    });
    expect((await existing.reload()).color).toBeNull();
  });

  it('sets retirement dates on transition, preserves them on updates, and denies reactivation', async () => {
    const existing = await fleetVehicle('VPFB11');
    const retire = await workbook(
      ['ID', 'Estado operativo', 'Motivo de baja'],
      [[existing.id, 'Retirado', 'End of use']],
    );
    expect((await confirm('fleet-vehicles', retire)).result.updated).toBe(1);
    await existing.reload();
    const retiredAt = existing.fechaBaja!.getTime();
    const reason = await workbook(['ID', 'Motivo de baja'], [[existing.id, 'Updated reason']]);
    expect((await confirm('fleet-vehicles', reason)).result.updated).toBe(1);
    expect((await existing.reload()).fechaBaja!.getTime()).toBe(retiredAt);
    const reactivation = await workbook(['ID', 'Estado operativo'], [[existing.id, 'Disponible']]);
    expect((await confirm('fleet-vehicles', reactivation)).result).toMatchObject({
      conflicts: 1,
      updated: 0,
    });
    expect(await existing.reload()).toMatchObject({
      estadoOperativo: 'dado_de_baja',
      motivoBaja: 'Updated reason',
    });
  });

  it.each(['vehicles', 'fleet-vehicles'] as const)(
    'enforces real import/read/create/update permissions for %s',
    async (module) => {
      const area = module === 'vehicles' ? 'taller' : 'flota';
      const existing =
        module === 'vehicles'
          ? await vehicle('VPAA18', { marca: 'Original' })
          : await fleetVehicle('VPFB12', { marca: 'Original' });
      await permissions(`${area}:import`, `${area}:read`, `${area}:create`);
      const edit = await workbook(['ID', 'Marca'], [[existing.id, 'Denied']]);
      const denied = await confirm(module, edit, limited);
      expect(denied.plan.rows[0]).toMatchObject({ status: 'conflict', existingId: existing.id });
      expect(denied.result).toMatchObject({ updated: 0, conflicts: 1 });
      expect((await existing.reload()).marca).toBe('Original');
      // Revoke create while keeping import/read/update: a new row is still denied.
      await permissions(`${area}:import`, `${area}:read`, `${area}:update`);
      const newPlate = module === 'vehicles' ? 'VPAA19' : 'VPFB13';
      const create = await workbook(['Patente', 'Marca'], [[newPlate, 'Denied']]);
      const rejected = await confirm(module, create, limited);
      expect(rejected.plan.rows[0].status).toBe('conflict');
      expect(rejected.result).toMatchObject({ created: 0, conflicts: 1 });
      const count =
        module === 'vehicles'
          ? await Vehicle.count({ where: { patente: newPlate } })
          : await FleetVehicle.count({ where: { patente: newPlate } });
      expect(count).toBe(0);
    },
  );

  it('requires client create permission even when updating an existing vehicle', async () => {
    const existing = await vehicle('VPAA20');
    await permissions('taller:import', 'taller:read', 'taller:update');
    const file = await workbook(
      ['ID', 'Propietario'],
      [[existing.id, `${MARKER}denied new client`]],
    );
    const { plan, result } = await confirm('vehicles', file, limited);
    expect(plan.rows[0].status).toBe('conflict');
    expect(result).toMatchObject({ updated: 0, clientsCreated: 0, conflicts: 1 });
    expect((await existing.reload()).clientId).toBeNull();
    expect(await Client.count({ where: { nombre: `${MARKER}denied new client` } })).toBe(0);
  });

  it.each(['comercial', 'taller'])(
    'allows client creation through %s.create alone',
    async (area) => {
      const existing = await vehicle('VPAA21');
      await permissions('taller:import', 'taller:read', 'taller:update', `${area}:create`);
      const file = await workbook(
        ['ID', 'Propietario'],
        [[existing.id, `${MARKER}allowed by ${area}`]],
      );
      expect((await confirm('vehicles', file, limited)).result).toMatchObject({
        updated: 1,
        clientsCreated: 1,
        failed: 0,
      });
      expect((await existing.reload()).clientId).toBeTruthy();
    },
  );

  it('redacts private fleet owner values/changes while keeping responsible public', async () => {
    const secret = 'PRIVATE fleet owner sentinel';
    const existing = await fleetVehicle('VPFB14', { propietario: secret, responsable: 'Old' });
    await permissions('flota:import', 'flota:read', 'flota:update');
    const file = await workbook(
      ['ID', 'Propietario', 'Responsable'],
      [[existing.id, ' ', 'Public responsible']],
    );
    const { plan, result } = await confirm('fleet-vehicles', file, limited);
    expect(plan.rows[0].values).not.toHaveProperty('propietario');
    expect(plan.mappedColumns).not.toHaveProperty('propietario');
    expect(plan.headers).not.toContain('Propietario');
    expect(plan.rows[0].changes).toEqual([
      expect.objectContaining({ field: 'responsable', before: 'Old', after: 'Public responsible' }),
    ]);
    expect(JSON.stringify({ plan, result })).not.toContain(secret);
    expect(await existing.reload()).toMatchObject({
      propietario: secret,
      responsable: 'Public responsible',
    });
    const denied = await workbook(['ID', 'Propietario'], [[existing.id, 'Unauthorized owner']]);
    expect((await upload('fleet-vehicles', denied, true, limited)).status).toBe(403);
    expect((await upload('fleet-vehicles', denied, false, limited)).status).toBe(403);
  });

  it('adds optional stable IDs and preserve/upsert instructions to every template', async () => {
    for (const module of ['vehicles', 'fleet-vehicles', 'catalog'] as const) {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load((await buildImportTemplate(module)) as unknown as ExcelJS.Buffer);
      expect(book.getWorksheet('Datos')!.getRow(1).values).toContain('ID');
      const instructions = JSON.stringify(book.getWorksheet('Instrucciones')!.getSheetValues());
      expect(instructions).toContain('actualiza');
      expect(instructions).toContain('vacías conservan');
      if (module === 'vehicles')
        expect(book.getWorksheet('Datos')!.getRow(1).values).toContain('Patente extranjera');
      if (module === 'fleet-vehicles')
        expect(instructions).toContain('Solo se conserva con estado Dado de baja');
    }
  });
});
