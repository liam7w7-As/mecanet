import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { Permission } from '../../models/Permission.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { SalesAccessGrant } from '../../models/SalesAccessGrant.js';
import { StockBalance } from '../../models/StockBalance.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { Warehouse } from '../../models/Warehouse.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { Role as RoleName } from '@unithor/shared';
import type { Response as SuperAgentResponse } from 'superagent';

// Run only through the main agent's single serialized API runner.
const PREFIX = `R6PRE${Date.now()}`;
const DAY = '2002-03-04';
const RANGE = { fechaDesde: DAY, fechaHasta: DAY };
const STAMP = new Date(`${DAY}T12:00:00Z`);
const binaryParser = (res: SuperAgentResponse, done: (error: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => done(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => done(error, Buffer.alloc(0)));
};

describe('Report previews, shared filters and real persisted permissions', () => {
  const users: User[] = [];
  const actors = new Map<string, User>();
  const roles = new Map<RoleName, number>();
  const originalGrants = new Map<number, number[]>();
  let permissions: Permission[] = [];
  let parts: CatalogItem[] = [];
  let clients: Client[] = [];
  let vehicles: Vehicle[] = [];
  let warehouses: Warehouse[] = [];
  let orders: WorkOrder[] = [];
  let quotations: Quotation[] = [];
  let movements: StockMovement[] = [];

  const setGrants = async (role: RoleName, grants: string[]): Promise<void> => {
    const roleId = roles.get(role)!;
    await RolePermission.destroy({ where: { roleId } });
    const selected = permissions.filter((permission) => grants.includes(`${permission.modulo}:${permission.accion}`));
    if (selected.length) await RolePermission.bulkCreate(selected.map((permission) => ({ roleId, permissionId: permission.id })));
    invalidatePermissionCache(roleId);
  };
  const get = (path: string, actor = 'admin', query: Record<string, unknown> = {}) =>
    request(app).get(`/api/reports/${path}`).query({ ...RANGE, ...query })
      // authenticate must use the persisted role, not the privileged JWT claim.
      .set('Cookie', [`access_token=${signAccessToken({ sub: actors.get(actor)!.id, role: 'desarrollador' })}`]);
  const book = async (area: string, query: Record<string, unknown>, actor = 'admin') => {
    const res = await get(`${area}/excel`, actor, query).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    return workbook;
  };
  const values = (sheet: ExcelJS.Worksheet, column: number) =>
    Array.from({ length: Math.max(0, sheet.rowCount - 5) }, (_, index) => sheet.getRow(index + 5).getCell(column).value);

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Only isolated unithor_test fixtures are permitted');
    await sequelize.authenticate();
    permissions = await Permission.findAll();
    for (const name of ['admin', 'desarrollador', 'vendedor', 'mecanico', 'bodeguero'] as const) {
      const role = await Role.findOne({ where: { nombre: name } });
      if (!role) throw new Error(`Missing fixture role ${name}`);
      roles.set(name, role.id);
      if (name === 'vendedor' || name === 'bodeguero' || name === 'mecanico') originalGrants.set(role.id,
        (await RolePermission.findAll({ where: { roleId: role.id } })).map((entry) => entry.permissionId));
    }
    await setGrants('vendedor', ['comercial:read', 'comercial:export', 'taller:read', 'taller:export']);
    await setGrants('bodeguero', []);
    for (const [name, role] of [
      ['admin', 'admin'], ['developer', 'desarrollador'], ['seller', 'vendedor'],
      ['otherSeller', 'vendedor'], ['mechanic', 'mecanico'], ['restricted', 'bodeguero'],
    ] as const) {
      const user = await User.create({ nombre: `${PREFIX} ${name}`, email: `${PREFIX}-${name}@fixture.local`,
        passwordHash: 'isolated-jwt-only-fixture', roleId: roles.get(role)!, activo: true });
      users.push(user); actors.set(name, user);
    }
    const deleted = await User.create({ nombre: `${PREFIX} deleted`, email: `${PREFIX}-deleted@fixture.local`,
      passwordHash: 'must-not-leak', roleId: roles.get('vendedor')!, activo: false });
    users.push(deleted); await deleted.destroy();
    warehouses = await Warehouse.bulkCreate([0, 1].map((index) => ({ codigo: `${PREFIX}-${index}`, nombre: `${PREFIX} almacén ${index}`, activo: true })));
    parts = await CatalogItem.bulkCreate(Array.from({ length: 14 }, (_, index) => ({
      tipo: 'parte' as const, codigo: `${PREFIX}-${index}`, nombre: `${PREFIX} repuesto ${String(index).padStart(2, '0')}`,
      precio: 10000, stock: index < 12 ? 0 : index === 12 ? 2 : 50, stockMinimo: 5,
    })));
    await StockBalance.bulkCreate([
      { warehouseId: warehouses[0].id, catalogItemId: parts[0].id, cantidad: 0 },
      { warehouseId: warehouses[1].id, catalogItemId: parts[0].id, cantidad: 2 },
      { warehouseId: warehouses[0].id, catalogItemId: parts[13].id, cantidad: 50 },
    ]);
    movements = await StockMovement.bulkCreate([
      { warehouseId: warehouses[0].id, catalogItemId: parts[0].id, cantidad: 1, saldoResultante: 0 },
      { warehouseId: warehouses[1].id, catalogItemId: parts[0].id, cantidad: 2, saldoResultante: 2 },
      { warehouseId: warehouses[0].id, catalogItemId: parts[13].id, cantidad: 50, saldoResultante: 50 },
    ].map((entry) => ({ ...entry, tipo: 'ingreso' as const, motivo: PREFIX, createdBy: actors.get('admin')!.id, fecha: STAMP })));
    clients = await Client.bulkCreate([
      { nombre: `${PREFIX} Empresa`, tipo: 'empresa' as const },
      { nombre: `${PREFIX} Persona`, tipo: 'cliente' as const },
      { nombre: `${PREFIX} Empresa sin historial`, tipo: 'empresa' as const },
    ]);
    vehicles = await Vehicle.bulkCreate([0, 1, 2, 0].map((clientIndex, index) => ({
      patente: `RP${String(Date.now()).slice(-7)}${index}`, clientId: clients[clientIndex].id, marca: PREFIX,
    })));
    orders = await WorkOrder.bulkCreate([0, 1].map((index) => ({ codigo: `OT-${PREFIX}-${index}`,
      clientId: clients[index].id, vehicleId: vehicles[index].id, fechaIngreso: STAMP,
      createdBy: actors.get(index === 0 ? 'seller' : 'otherSeller')!.id, estado: 'en_progreso' as const })));
    await WorkOrderItem.bulkCreate([
      { workOrderId: orders[0].id, descripcion: 'Asignado por ítem', assignedUserId: actors.get('mechanic')!.id,
        cantidad: 1, precioUnitario: 10000, subtotal: 10000, estadoOperativo: 'completado' as const },
      { workOrderId: orders[0].id, descripcion: 'Otro trabajo', cantidad: 1, precioUnitario: 10000,
        subtotal: 10000, estadoOperativo: 'omitido' as const },
    ]);
    quotations = await Quotation.bulkCreate([0, 1].map((index) => ({ codigo: `COT-${PREFIX}-${index}`,
      clientId: clients[index].id, vehicleId: vehicles[index].id, asesorId: actors.get(index === 0 ? 'seller' : 'otherSeller')!.id,
      workOrderId: orders[index].id, subtotal: 10000, total: 9000, pagado: 0, createdAt: STAMP })));
    await QuotationItem.bulkCreate([0, 13].map((partIndex) => ({ quotationId: quotations[0].id,
      catalogItemId: parts[partIndex].id, descripcion: parts[partIndex].nombre, cantidad: 1, precioUnitario: 10000, subtotal: 10000 })));
  });

  afterAll(async () => {
    for (const [roleId, permissionIds] of originalGrants) {
      await RolePermission.destroy({ where: { roleId } });
      if (permissionIds.length) await RolePermission.bulkCreate(permissionIds.map((permissionId) => ({ roleId, permissionId })));
      invalidatePermissionCache(roleId);
    }
    const userIds = users.map((user) => user.id);
    await SalesAccessGrant.destroy({ where: { userId: userIds } });
    await QuotationItem.destroy({ where: { quotationId: quotations.map((entry) => entry.id) } });
    await Quotation.destroy({ where: { id: quotations.map((entry) => entry.id) }, force: true });
    await WorkOrderItem.destroy({ where: { workOrderId: orders.map((entry) => entry.id) } });
    await WorkOrder.destroy({ where: { id: orders.map((entry) => entry.id) }, force: true });
    await StockMovement.destroy({ where: { id: movements.map((entry) => entry.id) } });
    await StockBalance.destroy({ where: { warehouseId: warehouses.map((entry) => entry.id) } });
    await Warehouse.destroy({ where: { id: warehouses.map((entry) => entry.id) }, force: true });
    await CatalogItem.destroy({ where: { id: parts.map((entry) => entry.id) }, force: true });
    await Vehicle.destroy({ where: { id: vehicles.map((entry) => entry.id) }, force: true });
    await Client.destroy({ where: { id: clients.map((entry) => entry.id) }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  });

  it('requires authentication and validates report filters', async () => {
    expect((await request(app).get('/api/reports/catalog/preview')).status).toBe(401);
    expect((await get('catalog/preview', 'admin', { stock: 'invalid' })).status).toBe(400);
    expect((await get('inventory/preview', 'admin', { fechaDesde: '2003-01-01' })).status).toBe(400);
  });

  it.each(['admin', 'developer'])('uses the same filtered catalogue, returns ten rows and the full total for %s', async (actor) => {
    const query = { search: PREFIX, tipo: 'parte', stock: 'sin_stock' };
    const preview = await get('catalog/preview', actor, query);
    expect(preview.status).toBe(200);
    expect(preview.body.total).toBe(12);
    expect(preview.body.items).toHaveLength(10);
    expect(preview.body.items.every((item: { stock: number }) => item.stock === 0)).toBe(true);
    expect(preview.headers['cache-control']).toBe('private, no-store');
    const workbook = await book('catalog', query, actor);
    expect(values(workbook.getWorksheet('Catálogo')!, 1)).toHaveLength(preview.body.total);
    const usageCodes = values(workbook.getWorksheet('Ofrecidos en COT')!, 2);
    expect(usageCodes).toEqual([parts[0].codigo]);
  });

  it('shares stock and warehouse filtering between balances, movements and the exported report', async () => {
    const query = { search: PREFIX, stock: 'sin_stock', warehouseId: warehouses[0].id };
    const preview = await get('inventory/preview', 'admin', query);
    expect(preview.status).toBe(200);
    expect(preview.body.items.map((item: { id: number }) => item.id)).toEqual([movements[0].id]);
    expect(preview.body.balances).toMatchObject({ total: 1, items: [{ warehouseId: warehouses[0].id, cantidad: 0 }] });
    const workbook = await book('inventory', query);
    expect(values(workbook.getWorksheet('Movimientos')!, 3)).toEqual([parts[0].nombre]);
    expect(values(workbook.getWorksheet('Saldos por almacén')!, 3)).toEqual([parts[0].codigo]);
    expect(values(workbook.getWorksheet('Resumen de almacenes')!, 1)).toEqual([warehouses[0].codigo]);
  });

  it('filters vehicle client type and history before counting; reports real vehicle counts', async () => {
    const query = { search: PREFIX, clientType: 'empresa', onlyWithHistory: true };
    const preview = await get('fleet/preview', 'admin', query);
    expect(preview.status).toBe(200);
    expect(preview.body.clients.items.map((item: { id: number }) => item.id)).toEqual([clients[0].id]);
    expect(preview.body.clients.items[0].vehiclesCount).toBe(2);
    expect(preview.body.vehicles.items.map((item: { id: number }) => item.id)).toEqual([vehicles[0].id]);
    const workbook = await book('fleet', query);
    expect(values(workbook.getWorksheet('Historial OT')!, 1)).toEqual([orders[0].codigo]);
    expect(values(workbook.getWorksheet('Historial COT')!, 1)).toEqual([quotations[0].codigo]);
  });

  it('intersects seller history with owned, granted and revoked records', async () => {
    const query = { search: PREFIX, onlyWithHistory: true };
    const own = await get('fleet/preview', 'seller', query);
    expect(own.status).toBe(200);
    expect(own.body.clients.total).toBe(1);
    const grant = await SalesAccessGrant.create({ userId: actors.get('seller')!.id, scopeType: 'quotation', targetId: quotations[1].id });
    try {
      expect((await get('fleet/preview', 'seller', query)).body.clients.total).toBe(2);
    } finally { await grant.destroy(); }
    expect((await get('fleet/preview', 'seller', query)).body.clients.total).toBe(1);
    expect((await get('fleet/preview', 'mechanic', query)).status).toBe(403);
    expect((await get('fleet/excel', 'mechanic', query)).status).toBe(403);
  });

  it('includes deleted users only on request, with an explicit public DTO', async () => {
    const query = { search: PREFIX };
    const active = await get('administration/preview', 'admin', query);
    const all = await get('administration/preview', 'admin', { ...query, includeDeleted: true });
    expect(active.status).toBe(200); expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(active.body.meta.total + 1);
    expect(all.body.data.some((user: { deletedAt: string | null }) => user.deletedAt)).toBe(true);
    for (const user of all.body.data) {
      expect(Object.keys(user).sort()).toEqual(['id', 'nombre', 'username', 'email', 'roleId', 'activo', 'createdAt', 'updatedAt', 'deletedAt', 'role'].sort());
      expect(Object.keys(user.role).sort()).toEqual(['id', 'nombre']);
    }
  });

  it('finds commercial rows by client and plate and keeps an exact OT filter', async () => {
    for (const search of [clients[0].nombre, vehicles[0].patente]) {
      const workbook = await book('commercial', { search, workOrderId: orders[0].id, workOrderLinked: true });
      expect(values(workbook.getWorksheet('Resumen Comercial')!, 1)).toEqual([quotations[0].codigo]);
      expect(values(workbook.getWorksheet('Resumen Comercial')!, 9)).toEqual([10710]);
    }
  });

  it('keeps mechanic exports limited to assigned orders without commercial data even with explicit export grants', async () => {
    const query = { search: PREFIX };
    await setGrants('mecanico', ['taller:read', 'taller:export']);
    try {
      const workbook = await book('workshop', { ...query, mechanicId: actors.get('admin')!.id }, 'mechanic');
      const content = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
      expect(content).toContain(orders[0].codigo);
      expect(content).not.toContain(orders[1].codigo);
      expect(content).not.toContain(quotations[0].codigo);
      expect(content).not.toMatch(/Total estimado|Saldo pendiente|Precio unitario|Monto pagado/);
      const pdf = await get('workshop/pdf', 'mechanic', query);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
    } finally {
      const roleId = roles.get('mecanico')!;
      await RolePermission.destroy({ where: { roleId } });
      const permissionIds = originalGrants.get(roleId)!;
      if (permissionIds.length) await RolePermission.bulkCreate(permissionIds.map((permissionId) => ({ roleId, permissionId })));
      invalidatePermissionCache(roleId);
    }
  });

  it('filters workshop by item mechanic without dropping other work or penalizing omitted tasks', async () => {
    const workbook = await book('workshop', { mechanicId: actors.get('mechanic')!.id, search: vehicles[0].patente });
    expect(values(workbook.getWorksheet('Órdenes de trabajo')!, 1)).toEqual([orders[0].codigo]);
    expect(values(workbook.getWorksheet('Órdenes de trabajo')!, 9)).toEqual(['100%']);
    expect(values(workbook.getWorksheet('Servicios y progreso')!, 3)).toEqual(['Asignado por ítem', 'Otro trabajo']);
  });

  it('requires read plus export, preserves cross-area finance and rejects export-only grants', async () => {
    const query = { search: PREFIX };
    await setGrants('bodeguero', ['finanzas:export']);
    for (const area of ['commercial', 'workshop', 'inventory', 'catalog', 'fleet', 'finance']) {
      for (const format of ['pdf', 'excel']) expect((await get(`${area}/${format}`, 'restricted', query)).status).toBe(403);
    }
    await setGrants('bodeguero', ['comercial:read']);
    expect((await get('catalog/preview', 'restricted', query)).status).toBe(200);
    expect((await get('commercial/excel', 'restricted', query)).status).toBe(403);
    await setGrants('bodeguero', ['comercial:read', 'finanzas:export']);
    expect((await get('commercial/excel', 'restricted', query)).status).toBe(200);
    expect((await get('inventory/excel', 'restricted', query)).status).toBe(403);
    await setGrants('bodeguero', ['finanzas:read', 'finanzas:export']);
    for (const area of ['commercial', 'workshop', 'inventory', 'catalog', 'fleet']) {
      expect((await get(`${area}/excel`, 'restricted', query)).status).toBe(200);
    }
    expect((await get('administration/preview', 'restricted', query)).status).toBe(403);
    expect((await get('administration/excel', 'restricted', query)).status).toBe(403);
  });
});
