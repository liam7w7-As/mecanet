import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { FleetDocument } from '../../models/FleetDocument.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Permission } from '../../models/Permission.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { StockBalance } from '../../models/StockBalance.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { Warehouse } from '../../models/Warehouse.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import * as clientsService from '../../services/client.service.js';
import * as directoryService from '../../services/exports/directory-export.service.js';
import {
  aliasesOf,
  CATALOG_IMPORT_COLUMNS,
  FLEET_IMPORT_COLUMNS,
  VEHICLE_IMPORT_COLUMNS,
} from '../../services/import/import-columns.js';
import { readSpreadsheet } from '../../services/import/spreadsheet.service.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import * as warehouseService from '../../services/warehouse.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { ExportDataset } from '../../services/exports/export-types.js';
import type { ListExportTarget } from '@unithor/shared';

const PREFIX = 'DEXP3-';
const SECRET = 'private-owner-export-sentinel';
const STORAGE = 'private/storage/do-not-export.pdf';
const HASH = 'password-hash-export-sentinel';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TARGETS = [
  'clients',
  'vehicles',
  'fleet-vehicles',
  'catalog',
  'users',
  'role-permissions',
  'warehouses',
  'stock-balances',
  'stock-movements',
  'warehouse-requests',
] as const;

let admin: User;
let developer: User;
let limited: User;
let seller: User;
let limitedRole: Role;
let sellerRole: Role;
let users: User[] = [];
let clients: Client[] = [];
let parts: CatalogItem[] = [];
let vehicles: Vehicle[] = [];
let fleet: FleetVehicle[] = [];
let warehouses: Warehouse[] = [];
let orders: WorkOrder[] = [];
const savedGrants = new Map<number, number[]>();
let permissions: Permission[] = [];

const cookie = (user: User, claimedRole?: string): string =>
  `access_token=${signAccessToken({
    sub: user.id,
    role: claimedRole ?? (user.id === admin.id ? 'admin' : 'jefe'),
  })}`;
const get = (target: ListExportTarget, query: Record<string, unknown> = {}, user = admin) =>
  request(app).get(`/api/exports/${target}/excel`).query(query).set('Cookie', cookie(user));
const download = (
  target: ListExportTarget,
  query: Record<string, unknown> = {},
  user = admin,
  format: 'excel' | 'pdf' = 'excel',
  claimedRole?: string,
) =>
  request(app)
    .get(`/api/exports/${target}/${format}`)
    .query(query)
    .set('Cookie', cookie(user, claimedRole))
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => done(null, Buffer.concat(chunks)));
      response.on('error', done);
    });

const excel = async (response: request.Response) => {
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain(MIME);
  expect(response.headers['cache-control']).toContain('no-store');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(response.body as ExcelJS.Buffer);
  const sheet = book.getWorksheet('Datos');
  if (!sheet) throw new Error('Missing export data sheet');
  const headers = Array.from(
    { length: sheet.columnCount },
    (_, index) => sheet.getRow(1).getCell(index + 1).text,
  );
  const rows = Array.from({ length: sheet.rowCount - 1 }, (_, index) =>
    Object.fromEntries(
      headers.map((header, column) => [header, sheet.getRow(index + 2).getCell(column + 1).value]),
    ),
  );
  return { book, headers, rows };
};

const grants = async (roleId: number, keys: string[]): Promise<void> => {
  const selected = keys.map((key) => {
    const permission = permissions.find((item) => `${item.modulo}.${item.accion}` === key);
    if (!permission) throw new Error(`Missing seeded permission ${key}`);
    return { roleId, permissionId: permission.id };
  });
  await RolePermission.destroy({ where: { roleId } });
  if (selected.length) await RolePermission.bulkCreate(selected);
  invalidatePermissionCache(roleId);
};

const queryFor = (target: ListExportTarget): Record<string, unknown> => {
  if (target === 'stock-balances') return { warehouseId: warehouses[0].id, search: PREFIX };
  if (target === 'stock-movements')
    return { warehouseId: warehouses[0].id, catalogItemId: parts[0].id };
  if (target === 'vehicles') return { clientId: clients[0].id };
  if (target === 'fleet-vehicles') return { search: 'DF90' };
  if (target === 'role-permissions') return { roleId: limitedRole.id };
  return { search: PREFIX };
};

const built = async (
  target: ListExportTarget,
  query: Record<string, unknown> = {},
): Promise<ExportDataset> => {
  const result = await directoryService.buildDirectoryExport(target, query, {
    id: admin.id,
    role: 'admin',
  });
  if (!result) throw new Error(`Missing directory adapter ${target}`);
  return result;
};

// Snapshot persisted rows, including timestamps, so GET side effects cannot hide
// behind unchanged aggregate counts. Only fixture records are selected.
const snapshot = async (): Promise<string> =>
  JSON.stringify(
    await Promise.all([
      Client.findAll({
        where: { id: clients.map((item) => item.id) },
        paranoid: false,
        order: [['id', 'ASC']],
        raw: true,
      }),
      Vehicle.findAll({
        where: { id: vehicles.map((item) => item.id) },
        paranoid: false,
        order: [['id', 'ASC']],
        raw: true,
      }),
      FleetVehicle.findAll({
        where: { id: fleet.map((item) => item.id) },
        paranoid: false,
        order: [['id', 'ASC']],
        raw: true,
      }),
      FleetDocument.findAll({
        where: { fleetVehicleId: fleet.map((item) => item.id) },
        paranoid: false,
        order: [['id', 'ASC']],
        raw: true,
      }),
      CatalogItem.findAll({
        where: { id: parts.map((item) => item.id) },
        paranoid: false,
        order: [['id', 'ASC']],
        raw: true,
      }),
      Warehouse.findAll({
        where: { id: warehouses.map((item) => item.id) },
        order: [['id', 'ASC']],
        raw: true,
      }),
      StockBalance.findAll({
        where: { warehouseId: warehouses.map((item) => item.id) },
        order: [['id', 'ASC']],
        raw: true,
      }),
      StockMovement.findAll({
        where: { warehouseId: warehouses.map((item) => item.id) },
        order: [['id', 'ASC']],
        raw: true,
      }),
      WorkOrder.findAll({
        where: { id: orders.map((item) => item.id) },
        paranoid: false,
        order: [['id', 'ASC']],
        raw: true,
      }),
      WorkOrderRequest.findAll({
        where: { workOrderId: orders.map((item) => item.id) },
        order: [['id', 'ASC']],
        raw: true,
      }),
      User.findAll({
        where: { id: users.map((item) => item.id) },
        paranoid: false,
        order: [['id', 'ASC']],
        raw: true,
      }),
      RolePermission.findAll({
        where: { roleId: [...savedGrants.keys()] },
        order: [['roleId', 'ASC'], ['permissionId', 'ASC']],
        raw: true,
      }),
    ]),
  );

describe('Directory and inventory exports (API integration)', () => {
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test')
      throw new Error('These tests require unithor_test');
    const roles = await Role.findAll();
    const role = (name: string): Role => {
      const found = roles.find((item) => item.nombre === name);
      if (!found) throw new Error(`Missing seeded role ${name}`);
      return found;
    };
    limitedRole = role('jefe');
    sellerRole = role('vendedor');
    permissions = await Permission.findAll();
    for (const selected of [limitedRole, sellerRole]) {
      savedGrants.set(
        selected.id,
        (await RolePermission.findAll({ where: { roleId: selected.id } })).map(
          (item) => item.permissionId,
        ),
      );
    }
    users = await User.bulkCreate(
      ['admin', 'desarrollador', 'jefe', 'vendedor', 'jefe', 'jefe'].map((name, index) => ({
        nombre: `${PREFIX}User ${index}`,
        username: `dexp3-user-${index}`,
        email: `dexp3-${index}@example.test`,
        passwordHash: HASH,
        roleId: role(name).id,
        activo: index !== 4,
      })),
    );
    [admin, developer, limited, seller] = users;
    await users[5].destroy();
    clients = await Client.bulkCreate(
      Array.from({ length: 105 }, (_, index) => ({
        nombre: `${PREFIX}Client ${String(index).padStart(3, '0')}`,
        tipo: index === 103 ? ('cliente' as const) : ('empresa' as const),
        email: `dexp3-client-${index}@example.test`,
        telefono: '+56 9 1234 5678',
      })),
    );
    await clients[104].destroy();
    warehouses = await Warehouse.bulkCreate(
      [0, 1, 2].map((index) => ({
        codigo: `${PREFIX}W${index}`,
        nombre: `${PREFIX}Warehouse ${index}`,
        activo: index !== 2,
      })),
    );
    parts = await CatalogItem.bulkCreate(
      Array.from({ length: 106 }, (_, index) => ({
        codigo: `${PREFIX}P${String(index).padStart(3, '0')}`,
        nombre: `${PREFIX}Part ${String(index).padStart(3, '0')}`,
        tipo: index === 104 ? ('estandar' as const) : ('parte' as const),
        unidadMedida: 'unidad' as const,
        precio: 123.45,
        stock: index < 103 ? 12 : 0,
        stockMinimo: 2,
      })),
    );
    await parts[105].destroy();
    await StockBalance.bulkCreate([
      ...parts.slice(0, 104).map((item, index) => ({
        warehouseId: warehouses[0].id,
        catalogItemId: item.id,
        cantidad: index === 0 ? 5 : index < 103 ? 12 : 0,
      })),
      { warehouseId: warehouses[1].id, catalogItemId: parts[0].id, cantidad: 7 },
    ]);
    vehicles = await Vehicle.bulkCreate([
      {
        patente: 'DX9001',
        clientId: clients[0].id,
        marca: 'Toyota',
        modelo: 'Hilux',
        combustible: 'diesel',
        transmision: 'manual',
      },
      { patente: 'BOL-EXPORT9', clientId: clients[0].id, marca: 'Nissan' },
      { patente: 'DX9002', clientId: clients[103].id },
      { patente: 'DX9003', clientId: clients[0].id },
      { patente: 'AB-CD12', clientId: clients[0].id },
    ]);
    await vehicles[3].destroy();
    fleet = await FleetVehicle.bulkCreate([
      {
        patente: 'DF9001',
        codigoInterno: `${PREFIX}F1`,
        estadoOperativo: 'disponible',
        propietario: SECRET,
        responsable: 'Responsable público',
      },
      {
        patente: 'DF9002',
        codigoInterno: `${PREFIX}F2`,
        estadoOperativo: 'dado_de_baja',
        propietario: SECRET,
        fechaBaja: new Date('2025-01-01'),
        motivoBaja: 'Retiro',
      },
      { patente: 'DF9003', codigoInterno: `${PREFIX}F3`, estadoOperativo: 'en_mantencion' },
      { patente: 'DF9004', codigoInterno: `${PREFIX}F4`, estadoOperativo: 'disponible' },
    ]);
    await fleet[3].destroy();
    await FleetDocument.bulkCreate(
      [0, 1].map((index) => ({
        fleetVehicleId: fleet[0].id,
        nombre: `Documento ${index}`,
        fechaVencimiento: '2020-01-01',
        storageKey: STORAGE,
      })),
    );
    const movement = {
      warehouseId: warehouses[0].id,
      catalogItemId: parts[0].id,
      tipo: 'ingreso' as const,
      cantidad: 1,
      saldoResultante: 5,
      motivo: PREFIX,
      createdBy: admin.id,
    };
    await StockMovement.bulkCreate([
      ...Array.from({ length: 103 }, (_, index) => ({
        ...movement,
        fecha: new Date(Date.UTC(2025, 1, 10, 12, 0, index)),
      })),
      { ...movement, fecha: new Date('2025-02-10T13:00:00Z'), catalogItemId: parts[1].id },
      { ...movement, fecha: new Date('2025-02-10T14:00:00Z'), warehouseId: warehouses[1].id },
      { ...movement, fecha: new Date('2025-02-11T00:00:00Z') },
      { ...movement, fecha: new Date('2025-02-10T15:00:00Z'), tipo: 'salida' },
    ]);
    orders = await WorkOrder.bulkCreate(
      [seller.id, admin.id, seller.id].map((createdBy, index) => ({
        codigo: `${PREFIX}OT${index}`,
        clientId: clients[0].id,
        vehicleId: vehicles[0].id,
        createdBy,
        estado: 'en_progreso' as const,
      })),
    );
    await orders[2].destroy();
    const warehouseRequest = {
      catalogItemId: parts[0].id,
      tipo: 'repuesto' as const,
      motivo: PREFIX,
      cantidad: 1,
      requestedBy: admin.id,
      reviewedAt: new Date('2025-02-01'),
    };
    await WorkOrderRequest.bulkCreate([
      { ...warehouseRequest, workOrderId: orders[0].id, estado: 'aprobada' },
      { ...warehouseRequest, workOrderId: orders[1].id, estado: 'aprobada' },
      {
        ...warehouseRequest,
        workOrderId: orders[0].id,
        estado: 'entregada',
        deliveredWarehouseId: warehouses[0].id,
      },
      { ...warehouseRequest, workOrderId: orders[0].id, estado: 'pendiente' },
      { ...warehouseRequest, workOrderId: orders[2].id, estado: 'aprobada' },
    ]);
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    for (const [roleId, ids] of savedGrants) {
      await RolePermission.destroy({ where: { roleId } });
      if (ids.length)
        await RolePermission.bulkCreate(ids.map((permissionId) => ({ roleId, permissionId })));
      invalidatePermissionCache(roleId);
    }
    if (orders.length) {
      await WorkOrderRequest.destroy({ where: { workOrderId: orders.map((item) => item.id) } });
      await WorkOrder.destroy({ where: { id: orders.map((item) => item.id) }, force: true });
    }
    if (fleet.length) {
      await FleetDocument.destroy({
        where: { fleetVehicleId: fleet.map((item) => item.id) },
        force: true,
      });
      await FleetVehicle.destroy({ where: { id: fleet.map((item) => item.id) }, force: true });
    }
    if (warehouses.length) {
      await StockMovement.destroy({ where: { warehouseId: warehouses.map((item) => item.id) } });
      await StockBalance.destroy({ where: { warehouseId: warehouses.map((item) => item.id) } });
      await Warehouse.destroy({ where: { id: warehouses.map((item) => item.id) }, force: true });
    }
    if (parts.length)
      await CatalogItem.destroy({ where: { id: parts.map((item) => item.id) }, force: true });
    if (vehicles.length)
      await Vehicle.destroy({ where: { id: vehicles.map((item) => item.id) }, force: true });
    if (clients.length)
      await Client.destroy({ where: { id: clients.map((item) => item.id) }, force: true });
    if (users.length)
      await User.destroy({ where: { id: users.map((item) => item.id) }, force: true });
  });

  it.each(TARGETS)('requires authentication and BOTH policy rights for %s', async (target) => {
    for (const format of ['excel', 'pdf']) {
      expect((await request(app).get(`/api/exports/${target}/${format}`)).status).toBe(401);
    }
    const builder = vi.spyOn(directoryService, 'buildDirectoryExport');
    await grants(limitedRole.id, [
      'taller.read',
      'comercial.read',
      'flota.read',
      'almacen.read',
      'admin.read',
    ]);
    expect((await get(target, queryFor(target), limited)).status).toBe(403);
    expect((await download(target, queryFor(target), limited, 'pdf')).status).toBe(403);
    await grants(limitedRole.id, [
      'taller.export',
      'comercial.export',
      'flota.export',
      'almacen.export',
      'admin.export',
    ]);
    expect((await get(target, queryFor(target), limited)).status).toBe(403);
    expect((await download(target, queryFor(target), limited, 'pdf')).status).toBe(403);
    expect(builder).not.toHaveBeenCalled();
  });

  it('allows catalog read/export through different permitted modules and strips unknown metadata', async () => {
    await grants(limitedRole.id, ['taller.read', 'admin.export']);
    expect((await get('catalog', { search: parts[0].codigo }, limited)).status).toBe(200);
    const result = await built('catalog', {
      search: `  ${PREFIX}  `,
      tipo: 'parte',
      soloConStock: 'true',
      password: HASH,
      token: SECRET,
      path: STORAGE,
      page: 8,
      pageSize: 1,
    });
    expect(result.filters).toEqual({ search: PREFIX, tipo: 'parte', soloConStock: true });
    expect(JSON.stringify(result)).not.toContain(HASH);
    expect(JSON.stringify(result)).not.toContain(STORAGE);
  });

  it('exports every filtered client page in list order and excludes soft-deleted clients', async () => {
    const result = await excel(
      await download('clients', { search: PREFIX, tipo: 'empresa', page: 999, pageSize: 1 }),
    );
    expect(result.rows).toHaveLength(103);
    expect(result.rows.map((row) => row.ID)).toEqual(
      clients
        .slice(0, 103)
        .map((item) => item.id)
        .reverse(),
    );
  });

  it('uses required warehouse context and the UI case-insensitive balance search before pagination', async () => {
    expect((await get('stock-balances')).status).toBe(400);
    expect((await get('stock-balances', { warehouseId: 'invalid' })).status).toBe(400);
    const result = await excel(
      await download('stock-balances', {
        warehouseId: warehouses[0].id,
        search: `  ${PREFIX.toLowerCase()}p  `,
        page: 8,
        pageSize: 1,
      }),
    );
    expect(result.rows).toHaveLength(104);
    expect(result.rows.every((row) => row['ID almacén'] === warehouses[0].id)).toBe(true);
    expect(result.rows.find((row) => row['ID ítem'] === parts[0].id)?.Stock).toBe(5);
    const other = await excel(
      await download('stock-balances', { warehouseId: warehouses[1].id, search: PREFIX }),
    );
    expect(other.rows).toHaveLength(1);
    expect(other.rows[0].Stock).toBe(7);
  });

  it('matches movement item, warehouse, type and inclusive date filters across all pages', async () => {
    const result = await excel(
      await download('stock-movements', {
        warehouseId: warehouses[0].id,
        catalogItemId: parts[0].id,
        tipo: 'ingreso',
        fechaDesde: '2025-02-10',
        fechaHasta: '2025-02-10',
        page: 2,
        pageSize: 1,
      }),
    );
    expect(result.rows).toHaveLength(103);
    expect(
      result.rows.every(
        (row) =>
          row['ID ítem'] === parts[0].id &&
          row['ID almacén'] === warehouses[0].id &&
          row.Tipo === 'ingreso',
      ),
    ).toBe(true);
    expect(result.rows.map((row) => row.ID)).toEqual(
      [...result.rows.map((row) => Number(row.ID))].sort((a, b) => b - a),
    );
    expect((await get('stock-movements', { fechaDesde: 'not-a-date' })).status).toBe(400);
  });

  it('preserves warehouse filters and user role/active filters without credential fields', async () => {
    const warehouseResult = await excel(
      await download('warehouses', { search: PREFIX, soloActivos: 'true', pageSize: 1 }),
    );
    expect(warehouseResult.rows.map((row) => row.ID)).toEqual(
      warehouses.slice(0, 2).map((item) => item.id),
    );
    const result = await excel(
      await download('users', { search: PREFIX, roleId: limitedRole.id, activo: 'false' }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ID).toBe(users[4].id);
    expect(result.headers.join(' ')).not.toMatch(/password|token|hash|path/i);
    expect(JSON.stringify(result.rows)).not.toContain(HASH);
  });

  it('exports the selected role matrix, including denied and protected effective permissions', async () => {
    await grants(limitedRole.id, ['almacen.read']);
    const selected = await excel(await download('role-permissions', { roleId: limitedRole.id }));
    expect(selected.rows).toHaveLength(permissions.length);
    expect(selected.rows.every((row) => row['ID rol'] === limitedRole.id)).toBe(true);
    expect(
      selected.rows.find((row) => row.Módulo === 'almacen' && row.Acción === 'read')?.Permitido,
    ).toBe('Sí');
    expect(
      selected.rows.find((row) => row.Módulo === 'almacen' && row.Acción === 'export')?.Permitido,
    ).toBe('No');
    const protectedRole = await excel(await download('role-permissions', { roleId: admin.roleId }));
    expect(protectedRole.rows.every((row) => row.Permitido === 'Sí')).toBe(true);
    expect((await get('role-permissions', { roleId: 'invalid' })).status).toBe(400);
    expect((await get('role-permissions', { roleId: 2_147_483_647 })).status).toBe(404);
  });

  it('keeps warehouse request status, search, paranoid order and seller ownership scope', async () => {
    await grants(sellerRole.id, ['almacen.read', 'almacen.export']);
    const own = await excel(
      await download(
        'warehouse-requests',
        { search: PREFIX, estado: 'aprobada', pageSize: 1 },
        seller,
      ),
    );
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].OT).toBe(orders[0].codigo);
    const all = await excel(await download('warehouse-requests', { search: PREFIX }));
    expect(all.rows).toHaveLength(2);
    const delivered = await excel(
      await download('warehouse-requests', { search: orders[0].codigo, estado: 'entregada' }),
    );
    expect(delivered.rows).toHaveLength(1);
    expect(delivered.rows[0].Estado).toBe('entregada');
  });

  it('exports vehicle owner public import fields and cautiously infers foreign plates', async () => {
    const result = await excel(await download('vehicles', { clientId: clients[0].id }));
    expect(result.headers).toEqual(VEHICLE_IMPORT_COLUMNS.map((item) => item.header));
    expect(result.rows).toHaveLength(3);
    expect(
      result.rows.every(
        (row) =>
          row.Propietario === clients[0].nombre && row['Email propietario'] === clients[0].email,
      ),
    ).toBe(true);
    expect(result.rows.find((row) => row.ID === vehicles[0].id)?.['Patente extranjera']).toBeNull();
    expect(result.rows.find((row) => row.ID === vehicles[1].id)?.['Patente extranjera']).toBe('Sí');
    expect(result.rows.find((row) => row.ID === vehicles[4].id)?.['Patente extranjera']).toBe('Sí');
  });

  it('preserves a stored foreign Chilean-looking hyphenated plate through confirmed reimport', async () => {
    const response = await download('vehicles', { search: 'AB-CD12' });
    const exported = await excel(response);
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0]).toMatchObject({
      ID: vehicles[4].id,
      Patente: 'AB-CD12',
      'Patente extranjera': 'Sí',
    });
    const before = await snapshot();
    const canonicalCount = await Vehicle.count({ where: { patente: 'ABCD12' }, paranoid: false });
    const csrf = 'directory-export-foreign-roundtrip-csrf';
    const upload = (dryRun: boolean, previewToken?: string) => {
      const call = request(app)
        .post('/api/vehicles/import')
        .query({ dryRun: String(dryRun) })
        .set('Cookie', [cookie(admin), `csrf_token=${csrf}`])
        .set('X-CSRF-Token', csrf);
      if (previewToken) call.set('X-Import-Preview', previewToken);
      return call.attach('file', response.body as Buffer, {
        filename: 'foreign-roundtrip.xlsx',
        contentType: MIME,
      });
    };
    const preview = await upload(true);
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toMatchObject({ newRows: 0, updateRows: 0, unchangedRows: 1 });
    expect(preview.body.preview.rows[0].values.patente).toBe('AB-CD12');
    const confirmed = await upload(false, preview.body.preview.previewToken as string);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.result).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
      clientsCreated: 0,
    });
    expect((await vehicles[4].reload()).patente).toBe('AB-CD12');
    expect(await Vehicle.count({ where: { patente: 'ABCD12' }, paranoid: false })).toBe(
      canonicalCount,
    );
    expect(await snapshot()).toBe(before);
  });

  it('preserves fleet status/expiry filters and list order without duplicate document joins', async () => {
    const result = await excel(
      await download('fleet-vehicles', { search: 'DF90', page: 2, pageSize: 1 }),
    );
    expect(result.rows.map((row) => row.ID)).toEqual([fleet[0].id, fleet[2].id, fleet[1].id]);
    const expired = await excel(
      await download('fleet-vehicles', { search: 'DF90', vencimiento: 'vencido' }),
    );
    expect(expired.rows.map((row) => row.ID)).toEqual([fleet[0].id]);
    const retired = await excel(
      await download('fleet-vehicles', { search: 'DF90', estado: 'dado_de_baja' }),
    );
    expect(retired.rows.map((row) => row.ID)).toEqual([fleet[1].id]);
    expect(JSON.stringify(result.rows)).not.toContain(STORAGE);
  });

  it('includes fleet owner header AND data only for an opted-in DB-verified admin/developer', async () => {
    await grants(limitedRole.id, ['flota.read', 'flota.export']);
    for (const user of [admin, developer, limited]) {
      for (const includeOwner of [undefined, 'false', 'true']) {
        const result = await excel(
          await download('fleet-vehicles', { search: 'DF9001', includeOwner }, user),
        );
        const allowed = user.id !== limited.id && includeOwner === 'true';
        expect(result.headers.includes('Propietario')).toBe(allowed);
        if (allowed) expect(result.rows[0].Propietario).toBe(SECRET);
        else expect(JSON.stringify(result.rows)).not.toContain(SECRET);
        expect(result.rows[0].Responsable).toBe('Responsable público');
      }
    }
    const forged = await download(
      'fleet-vehicles',
      { search: 'DF9001', includeOwner: 'true' },
      limited,
      'excel',
      'admin',
    );
    expect(forged.status).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(forged.body as ExcelJS.Buffer);
    expect(JSON.stringify(book.model)).not.toContain(SECRET);
    const direct = await directoryService.buildDirectoryExport(
      'fleet-vehicles',
      { search: 'DF9001', includeOwner: true },
      { id: admin.id, role: 'admin' },
    );
    expect(direct?.tables[0].rows[0].propietario).toBe(SECRET);
  });

  it('exports all catalog pages with blank import Stock and actual global stock for Excel and PDF', async () => {
    const result = await excel(
      await download('catalog', {
        search: PREFIX,
        tipo: 'parte',
        soloConStock: 'true',
        page: 7,
        pageSize: 1,
      }),
    );
    expect(result.rows).toHaveLength(103);
    expect(result.headers.slice(0, CATALOG_IMPORT_COLUMNS.length)).toEqual(
      CATALOG_IMPORT_COLUMNS.map((item) => item.header),
    );
    expect(
      result.rows.every((row) => row.Stock === null && row['Stock global (consulta)'] === 12),
    ).toBe(true);
    const data = await built('catalog', { search: parts[0].codigo });
    expect(data.tables[0].columns.find((column) => column.key === 'stock')?.pdf).toBe(false);
    expect(data.tables[0].columns.find((column) => column.key === 'stockGlobal')?.pdf).not.toBe(
      false,
    );
    expect(data.notes?.join(' ')).toContain('saldo final del almacén seleccionado');
  });

  it.each(['catalog', 'vehicles', 'fleet-vehicles'] as const)(
    'round-trips %s Excel headers and stable IDs through the actual import preview',
    async (target) => {
      const queries = {
        catalog: { search: parts[0].codigo },
        vehicles: { search: vehicles[0].patente },
        'fleet-vehicles': { search: fleet[0].patente, includeOwner: 'true' },
      };
      const definitions = {
        catalog: CATALOG_IMPORT_COLUMNS,
        vehicles: VEHICLE_IMPORT_COLUMNS,
        'fleet-vehicles': FLEET_IMPORT_COLUMNS,
      };
      const response = await download(target, queries[target]);
      const exported = await excel(response);
      const parsed = await readSpreadsheet(response.body as Buffer, {
        aliases: aliasesOf(definitions[target]),
        required: ['id'],
      });
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].values.id).toBe(exported.rows[0].ID);
      expect(parsed.mappedColumns).toEqual(
        Object.fromEntries(definitions[target].map((column) => [column.key, column.header])),
      );
      const before = await snapshot();
      const csrf = 'directory-export-preview-csrf';
      const preview = await request(app)
        .post(`/api/${target}/import`)
        .query({ dryRun: 'true' })
        .set('Cookie', [cookie(admin), `csrf_token=${csrf}`])
        .set('X-CSRF-Token', csrf)
        .attach('file', response.body as Buffer, { filename: 'roundtrip.xlsx', contentType: MIME });
      expect(preview.status).toBe(200);
      expect(preview.body.preview).toMatchObject({ newRows: 0, updateRows: 0, unchangedRows: 1 });
      expect(await snapshot()).toBe(before);
    },
  );

  it('fails with 400 above 10,000 rows without returning a truncated workbook', async () => {
    const list = vi
      .spyOn(clientsService, 'listClients')
      .mockResolvedValue({ items: [], total: 10_001, totalPages: 101, page: 1, pageSize: 100 });
    expect((await get('clients')).status).toBe(400);
    expect(list).toHaveBeenCalledTimes(1);
    const balance = {
      warehouseId: warehouses[0].id,
      catalogItemId: parts[0].id,
      cantidad: 1,
      codigo: 'LIMIT',
      nombre: 'Limit',
      precio: 1,
      stockMinimo: 0,
      bajoMinimo: false,
    };
    vi.spyOn(warehouseService, 'getWarehouseBalances').mockResolvedValue(
      Array.from({ length: 10_001 }, () => balance),
    );
    expect((await get('stock-balances', { warehouseId: warehouses[0].id })).status).toBe(400);
    const empty = await excel(
      await download('stock-balances', { warehouseId: warehouses[0].id, search: 'no-match' }),
    );
    expect(empty.rows).toHaveLength(0);
  });

  it('returns valid Excel/PDF for every owned target and leaves all persisted rows unchanged', async () => {
    const before = await snapshot();
    for (const target of TARGETS) {
      await excel(await download(target, queryFor(target)));
      const response = await download(target, queryFor(target), admin, 'pdf');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((await PDFDocument.load(response.body as Buffer)).getPageCount()).toBeGreaterThan(0);
    }
    expect(await snapshot()).toBe(before);
    expect(
      await directoryService.buildDirectoryExport('payments', {}, { id: admin.id, role: 'admin' }),
    ).toBeNull();
  }, 30_000);
});
