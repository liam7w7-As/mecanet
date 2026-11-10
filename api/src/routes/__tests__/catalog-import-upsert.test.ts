import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { StockBalance } from '../../models/StockBalance.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Warehouse } from '../../models/Warehouse.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import * as permissions from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { ImportPreview, ImportResult } from '@unithor/shared';

const PREFIX = 'CATUP-';
const PASSWORD = 'CatalogUpsert2026!';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FILE_NAME = 'catalogo-upsert.xlsx';
const emails = ['catalog-upsert-admin@unithor.local', 'catalog-upsert-jefe@unithor.local'];

interface Cookies {
  access: string;
  csrf: string;
}
interface ImportOptions {
  warehouseId?: number;
  previewToken?: string;
  dryRun?: boolean;
  limited?: boolean;
}

let admin: User;
let limitedUser: User;
let adminCookies: Cookies;
let limitedCookies: Cookies;
let selected: Warehouse;
let other: Warehouse;
let inactive: Warehouse;

const workbook = async (
  headers: string[],
  rows: Array<Array<string | number | null>>,
): Promise<Buffer> => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Datos');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
};

const login = async (email: string): Promise<Cookies> => {
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  const header = response.headers['set-cookie'];
  const cookies = Object.fromEntries(
    (Array.isArray(header) ? header : [header]).map((value: string) => {
      const pair = value.split(';')[0];
      const separator = pair.indexOf('=');
      return [pair.slice(0, separator), pair.slice(separator + 1)];
    }),
  );
  return { access: cookies.access_token, csrf: cookies.csrf_token };
};

const upload = (buffer: Buffer, options: ImportOptions = {}) => {
  const cookies = options.limited ? limitedCookies : adminCookies;
  const call = request(app)
    .post('/api/catalog/import')
    .query({
      dryRun: options.dryRun ? 'true' : 'false',
      ...(options.warehouseId === undefined ? {} : { warehouseId: options.warehouseId }),
    })
    .set('Cookie', [`access_token=${cookies.access}`, `csrf_token=${cookies.csrf}`])
    .set('X-CSRF-Token', cookies.csrf);
  if (options.previewToken) call.set('X-Import-Preview', options.previewToken);
  return call.attach('file', buffer, { filename: FILE_NAME, contentType: MIME });
};

const preview = async (buffer: Buffer, options: ImportOptions = {}): Promise<ImportPreview> => {
  const response = await upload(buffer, { ...options, dryRun: true });
  expect(response.status).toBe(200);
  expect(response.body.preview.previewToken).toEqual(expect.any(String));
  return response.body.preview as ImportPreview;
};

const confirm = async (
  buffer: Buffer,
  plan: ImportPreview,
  options: ImportOptions = {},
): Promise<ImportResult> => {
  const response = await upload(buffer, { ...options, previewToken: plan.previewToken });
  expect(response.status).toBe(201);
  return response.body.result as ImportResult;
};

const createPart = (suffix: string, stock = 0) =>
  CatalogItem.create({
    tipo: 'parte',
    codigo: `${PREFIX}${suffix}`,
    nombre: `${PREFIX}${suffix} original`,
    descripcion: 'Detalle original conservado',
    unidadMedida: 'juego',
    precio: 123.45,
    stock,
    stockMinimo: 3,
    horasHombreEstandar: null,
  });

const stockedPart = async (suffix = 'STOCK'): Promise<CatalogItem> => {
  const item = await createPart(suffix, 12);
  await StockBalance.bulkCreate([
    { catalogItemId: item.id, warehouseId: selected.id, cantidad: 5 },
    { catalogItemId: item.id, warehouseId: other.id, cantidad: 7 },
  ]);
  return item.reload();
};

const grantLimited = (grants: string[]): void => {
  const actual = permissions.hasPermission;
  const allowed = new Set(['taller.import', ...grants]);
  vi.spyOn(permissions, 'hasPermission').mockImplementation(async (userId, module, action) =>
    userId === limitedUser.id ? allowed.has(`${module}.${action}`) : actual(userId, module, action),
  );
};

const removeRows = async (): Promise<void> => {
  const items = await CatalogItem.findAll({
    where: {
      [Op.or]: [{ codigo: { [Op.like]: `${PREFIX}%` } }, { nombre: { [Op.like]: `${PREFIX}%` } }],
    },
    paranoid: false,
  });
  const ids = items.map((item) => item.id);
  if (ids.length > 0) {
    await QuotationItem.destroy({ where: { catalogItemId: ids } });
    await WorkOrderItem.destroy({ where: { catalogItemId: ids } });
    await StockMovement.destroy({ where: { catalogItemId: ids } });
    await StockBalance.destroy({ where: { catalogItemId: ids } });
    await CatalogItem.destroy({ where: { id: ids }, force: true });
  }
  await Quotation.destroy({ where: { codigo: { [Op.like]: `${PREFIX}%` } }, force: true });
  await WorkOrder.destroy({ where: { codigo: { [Op.like]: `${PREFIX}%` } }, force: true });
};

const removeUsers = async (): Promise<void> => {
  const users = await User.findAll({ where: { email: emails }, paranoid: false });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await RefreshToken.destroy({ where: { userId: ids } });
    await User.destroy({ where: { id: ids }, force: true });
  }
};

describe('Catálogo: importación inteligente con vista previa confirmada', () => {
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test')
      throw new Error('Estas pruebas requieren unithor_test');
    await removeRows();
    await removeUsers();
    await Warehouse.destroy({ where: { codigo: { [Op.like]: `${PREFIX}%` } } });
    const adminRole = await Role.findOne({ where: { nombre: 'admin' } });
    const jefeRole = await Role.findOne({ where: { nombre: 'jefe' } });
    if (!adminRole || !jefeRole) throw new Error('Faltan roles base de pruebas');
    const passwordHash = await hashPassword(PASSWORD);
    admin = await User.create({
      nombre: 'Catalog upsert admin',
      email: emails[0],
      passwordHash,
      roleId: adminRole.id,
    });
    limitedUser = await User.create({
      nombre: 'Catalog upsert jefe',
      email: emails[1],
      passwordHash,
      roleId: jefeRole.id,
    });
    adminCookies = await login(admin.email);
    limitedCookies = await login(limitedUser.email);
    selected = await Warehouse.create({ codigo: `${PREFIX}W1`, nombre: 'Almacén seleccionado' });
    other = await Warehouse.create({ codigo: `${PREFIX}W2`, nombre: 'Otro almacén' });
    inactive = await Warehouse.create({
      codigo: `${PREFIX}OFF`,
      nombre: 'Almacén inactivo',
      activo: false,
    });
  });

  beforeEach(async () => {
    await selected.update({ activo: true });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await removeRows();
  });
  afterAll(async () => {
    await removeRows();
    await removeUsers();
    await Warehouse.destroy({ where: { codigo: { [Op.like]: `${PREFIX}%` } } });
  });

  it('previsualiza cambios por campo, conserva vacíos y aplica cero explícito en metadatos', async () => {
    const item = await createPart('META');
    const service = await CatalogItem.create({
      tipo: 'especifico',
      nombre: `${PREFIX}Servicio horas`,
      unidadMedida: 'servicio',
      descripcion: 'Servicio conservado',
      precio: 15,
      horasHombreEstandar: 2.5,
    });
    const file = await workbook(
      ['Código', 'Nombre', 'Tipo', 'Precio', 'Stock mínimo', 'Descripción', 'Unidad', 'Horas'],
      [
        [item.codigo!.toLowerCase(), `${PREFIX}META actualizado`, null, 0, 0, ' ', null, null],
        [null, service.nombre, 'Servicio específico', null, null, null, null, 0],
        [`${PREFIX}NUEVO`, `${PREFIX}Nuevo`, 'Repuesto', 9, 0, null, null, null],
      ],
    );
    const plan = await preview(file);
    expect(plan).toMatchObject({ newRows: 1, updateRows: 2, conflictRows: 0, errorRows: 0 });
    expect(plan.rows[0].changes).toEqual(
      expect.arrayContaining([
        { field: 'precio', label: 'Precio', before: 123.45, after: 0 },
        { field: 'stockMinimo', label: 'Stock mínimo', before: 3, after: 0 },
      ]),
    );
    expect(plan.rows[0].changes!.map((change) => change.field)).not.toContain('descripcion');
    expect(plan.rows[1].changes).toEqual([
      { field: 'horasHombreEstandar', label: 'Horas hombre estándar', before: 2.5, after: 0 },
    ]);
    expect(Number((await item.reload()).precio)).toBe(123.45);
    expect(await CatalogItem.count({ where: { codigo: `${PREFIX}NUEVO` } })).toBe(0);
    expect(await confirm(file, plan)).toMatchObject({ created: 1, updated: 2, failed: 0 });
    expect(await item.reload()).toMatchObject({
      descripcion: 'Detalle original conservado',
      unidadMedida: 'juego',
      stockMinimo: 0,
      stock: 0,
    });
    expect(Number(item.precio)).toBe(0);
    expect(Number((await service.reload()).horasHombreEstandar)).toBe(0);
    expect(await StockMovement.count({ where: { createdBy: admin.id } })).toBe(0);
  });

  it('resuelve ID antes del código y permite renombrar la identidad sin crear otro registro', async () => {
    const item = await createPart('ID');
    const file = await workbook(
      ['ID', 'Código', 'Nombre', 'Precio'],
      [[item.id, `${PREFIX}ID-NUEVO`, `${PREFIX}Renombrado`, 77]],
    );
    const plan = await preview(file);
    expect(plan.rows[0]).toMatchObject({ existingId: item.id, status: 'update' });
    expect(await confirm(file, plan)).toMatchObject({ created: 0, updated: 1 });
    expect(await item.reload()).toMatchObject({
      codigo: `${PREFIX}ID-NUEVO`,
      nombre: `${PREFIX}Renombrado`,
    });
  });

  it('bloquea ID desconocido, registros eliminados y colisiones de ID/código sin restaurar ni hacer fallback', async () => {
    const item = await createPart('EXISTE');
    const deleted = await createPart('ELIMINADO');
    await deleted.destroy();
    const collision = await createPart('COLISION');
    for (const cells of [
      [2_147_483_647, item.codigo, `${PREFIX}Desconocido`, 999],
      [deleted.id, `${PREFIX}NO-RESTAURAR`, `${PREFIX}Eliminado`, 999],
      [null, deleted.codigo, `${PREFIX}Eliminado por código`, 999],
      [item.id, collision.codigo, `${PREFIX}ID con otro código`, 999],
    ]) {
      const file = await workbook(['ID', 'Código', 'Nombre', 'Precio'], [cells]);
      const plan = await preview(file);
      expect(plan.rows[0].status).toBe('conflict');
      expect(await confirm(file, plan)).toMatchObject({ created: 0, updated: 0, conflicts: 1 });
    }
    expect(Number((await item.reload()).precio)).toBe(123.45);
    expect(await CatalogItem.findByPk(deleted.id)).toBeNull();
    expect((await CatalogItem.findByPk(deleted.id, { paranoid: false }))!.deletedAt).not.toBeNull();
  });

  it('busca nombre y tipo sin código de entrada, conserva el código existente y exige coincidencia única', async () => {
    const name = `${PREFIX}Revisión técnica`;
    const service = await CatalogItem.create({
      tipo: 'estandar',
      codigo: `${PREFIX}CON-CODIGO`,
      nombre: name,
      precio: 20,
    });
    const differentType = await CatalogItem.create({
      tipo: 'especifico',
      nombre: name,
      precio: 30,
    });
    const file = await workbook(
      ['Nombre', 'Tipo', 'Precio'],
      [[`${PREFIX}REVISION   TECNICA`, 'Servicio estándar', 44]],
    );
    const plan = await preview(file);
    expect(plan.rows[0]).toMatchObject({ status: 'update', existingId: service.id });
    await confirm(file, plan);
    expect(await service.reload()).toMatchObject({ codigo: `${PREFIX}CON-CODIGO` });
    expect(Number(service.precio)).toBe(44);
    expect(Number((await differentType.reload()).precio)).toBe(30);
    await CatalogItem.create({ tipo: 'estandar', nombre: name, precio: 55 });
    const ambiguous = await preview(file);
    expect(ambiguous.rows[0].status).toBe('conflict');
    expect(await confirm(file, ambiguous)).toMatchObject({ created: 0, updated: 0, conflicts: 1 });
  });

  it('mantiene el código informado como clave autoritativa aunque otro registro tenga igual nombre y tipo', async () => {
    const existing = await CatalogItem.create({
      tipo: 'estandar',
      nombre: `${PREFIX}Mismo nombre`,
      precio: 10,
    });
    const file = await workbook(
      ['Código', 'Nombre', 'Tipo', 'Precio'],
      [[`${PREFIX}OTRO-CODIGO`, existing.nombre, 'Servicio', 20]],
    );
    const plan = await preview(file);
    expect(plan.rows[0]).toMatchObject({ status: 'valid' });
    expect(plan.rows[0].existingId).toBeUndefined();
    expect(await confirm(file, plan)).toMatchObject({ created: 1, updated: 0 });
    expect(Number((await existing.reload()).precio)).toBe(10);
  });

  it('actualiza coincidencias únicas sin código y no reutiliza nombres de registros eliminados', async () => {
    const existing = await CatalogItem.create({
      tipo: 'estandar',
      nombre: `${PREFIX}Sin código`,
      precio: 10,
    });
    const file = await workbook(['Nombre', 'Tipo', 'Precio'], [[existing.nombre, 'Servicio', 20]]);
    const plan = await preview(file);
    expect(plan.rows[0]).toMatchObject({ status: 'update', existingId: existing.id });
    expect(await confirm(file, plan)).toMatchObject({ updated: 1 });
    expect((await existing.reload()).codigo).toBeNull();
    await existing.destroy();
    const deletedPlan = await preview(file);
    expect(deletedPlan.rows[0].status).toBe('conflict');
    expect(await confirm(file, deletedPlan)).toMatchObject({
      created: 0,
      updated: 0,
      conflicts: 1,
    });
  });

  it('permite desambiguar por ID nombres o códigos duplicados que ya existían', async () => {
    const first = await createPart('DUP-DB');
    await createPart('DUP-DB');
    const file = await workbook(
      ['ID', 'Nombre', 'Precio'],
      [[first.id, `${PREFIX}Duplicado identificado`, 88]],
    );
    const plan = await preview(file);
    expect(plan.rows[0]).toMatchObject({ status: 'update', existingId: first.id });
    expect(await confirm(file, plan)).toMatchObject({ updated: 1 });
  });

  it('marca como conflicto todas las filas con destinos o claves repetidos, incluida la primera', async () => {
    const existing = await createPart('REPETIDO');
    const file = await workbook(
      ['ID', 'Código', 'Nombre', 'Tipo', 'Precio'],
      [
        [existing.id, null, `${PREFIX}Destino por ID`, null, 10],
        [null, existing.codigo, `${PREFIX}Destino por código`, null, 20],
        [null, `${PREFIX}NEW-DUP`, `${PREFIX}Nuevo A`, null, 1],
        [null, `${PREFIX}new-dup`, `${PREFIX}Nuevo B`, null, 2],
        [null, null, `${PREFIX}Revisión repetida`, 'Servicio', 1],
        [null, null, `${PREFIX}REVISION  REPETIDA`, 'Servicio', 2],
      ],
    );
    const plan = await preview(file);
    expect(plan).toMatchObject({ conflictRows: 6, newRows: 0, updateRows: 0 });
    expect(plan.rows.every((row) => row.status === 'conflict')).toBe(true);
    expect(await confirm(file, plan)).toMatchObject({ created: 0, updated: 0, conflicts: 6 });
    expect(Number((await existing.reload()).precio)).toBe(123.45);
  });

  it('no escribe metadatos ni movimientos en filas sin cambios, incluso con stock explícito igual al saldo', async () => {
    const item = await stockedPart();
    const originalUpdatedAt = (await item.reload()).updatedAt.getTime();
    const originalBalances = (
      await StockBalance.findAll({ where: { catalogItemId: item.id }, order: [['id', 'ASC']] })
    ).map((balance) => balance.toJSON());
    const file = await workbook(
      ['Código', 'Nombre', 'Precio', 'Stock'],
      [[item.codigo, null, 123.45, 5]],
    );
    const plan = await preview(file, { warehouseId: selected.id });
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', changes: [] });
    expect(await confirm(file, plan, { warehouseId: selected.id })).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
    });
    expect((await item.reload()).updatedAt.getTime()).toBe(originalUpdatedAt);
    expect(
      (
        await StockBalance.findAll({ where: { catalogItemId: item.id }, order: [['id', 'ASC']] })
      ).map((balance) => balance.toJSON()),
    ).toEqual(originalBalances);
    expect(await StockMovement.count({ where: { catalogItemId: item.id } })).toBe(0);
  });

  it.each([12, 4, 0])(
    'Stock %i es saldo final del almacén seleccionado y conserva los demás saldos',
    async (target) => {
      const item = await stockedPart();
      const file = await workbook(['Código', 'Nombre', 'Stock'], [[item.codigo, null, target]]);
      const plan = await preview(file, { warehouseId: selected.id });
      expect(plan.rows[0].values).toMatchObject({
        stock: target,
        stockGlobal: 12,
        stockTotalAlmacenes: 12,
        stockAlmacenActual: 5,
        warehouseId: selected.id,
      });
      expect(plan.rows[0].changes).toEqual([
        { field: 'stock', label: `Stock final en ${selected.codigo}`, before: 5, after: target },
      ]);
      expect(await confirm(file, plan, { warehouseId: selected.id })).toMatchObject({
        updated: 1,
        failed: 0,
      });
      expect(
        (await StockBalance.findOne({
          where: { catalogItemId: item.id, warehouseId: selected.id },
        }))!.cantidad,
      ).toBe(target);
      expect(
        (await StockBalance.findOne({ where: { catalogItemId: item.id, warehouseId: other.id } }))!
          .cantidad,
      ).toBe(7);
      expect((await item.reload()).stock).toBe(target + 7);
      const movements = await StockMovement.findAll({ where: { catalogItemId: item.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        tipo: target === 0 ? 'salida' : 'ajuste',
        cantidad: target === 0 ? 5 : target,
        saldoResultante: target,
        warehouseId: selected.id,
        createdBy: admin.id,
      });
      expect(movements[0].referencia).toContain(FILE_NAME);
    },
  );

  it('crea stock inicial positivo mediante un movimiento y permite nuevos registros con stock cero o vacío sin almacén', async () => {
    const positive = await workbook(
      ['Código', 'Nombre', 'Stock'],
      [[`${PREFIX}INITIAL`, `${PREFIX}Inicial`, 8]],
    );
    const positivePlan = await preview(positive, { warehouseId: selected.id });
    expect(await confirm(positive, positivePlan, { warehouseId: selected.id })).toMatchObject({
      created: 1,
      failed: 0,
    });
    const item = (await CatalogItem.findOne({ where: { codigo: `${PREFIX}INITIAL` } }))!;
    expect(item.stock).toBe(8);
    expect(await StockMovement.findOne({ where: { catalogItemId: item.id } })).toMatchObject({
      tipo: 'ajuste',
      cantidad: 8,
      createdBy: admin.id,
    });
    const zero = await workbook(
      ['Código', 'Nombre', 'Stock'],
      [
        [`${PREFIX}ZERO`, `${PREFIX}Cero`, 0],
        [`${PREFIX}BLANK`, `${PREFIX}Vacío`, null],
      ],
    );
    const zeroPlan = await preview(zero);
    expect(await confirm(zero, zeroPlan)).toMatchObject({ created: 2, conflicts: 0 });
    const zeros = await CatalogItem.findAll({
      where: { codigo: [`${PREFIX}ZERO`, `${PREFIX}BLANK`] },
    });
    expect(zeros.every((row) => row.stock === 0)).toBe(true);
    expect(await StockBalance.count({ where: { catalogItemId: zeros.map((row) => row.id) } })).toBe(
      0,
    );
  });

  it.each(['estandar', 'especifico'] as const)(
    'normaliza a cero el stock informado para servicio %s, sin requerir almacén ni permiso de stock',
    async (type) => {
      grantLimited(['taller.read', 'taller.create', 'taller.update']);
      const service = await CatalogItem.create({
        tipo: type,
        nombre: `${PREFIX}Servicio existente`,
        precio: 10,
      });
      const file = await workbook(
        ['Nombre', 'Tipo', 'Precio', 'Stock'],
        [
          [`${PREFIX}Servicio nuevo`, type, 12, 99],
          [service.nombre, type, 20, 99],
        ],
      );
      const plan = await preview(file, { limited: true });
      expect(plan).toMatchObject({ newRows: 1, updateRows: 1, conflictRows: 0, errorRows: 0 });
      expect(
        plan.rows.every(
          (row) =>
            row.values.stock === 0 &&
            row.messages.some((message) => message.includes('se normaliza a 0')),
        ),
      ).toBe(true);
      expect(plan.rows[1].changes!.map((change) => change.field)).toEqual(['precio']);
      expect(await confirm(file, plan, { limited: true })).toMatchObject({
        created: 1,
        updated: 1,
        failed: 0,
      });
      expect((await service.reload()).stock).toBe(0);
      expect(await StockMovement.count({ where: { createdBy: limitedUser.id } })).toBe(0);
    },
  );

  it.each([undefined, 'inactive', 'unknown'] as const)(
    'bloquea cambios de stock sin almacén activo (%s) y no aplica metadatos parcialmente',
    async (warehouse) => {
      const item = await stockedPart();
      const warehouseId =
        warehouse === 'inactive'
          ? inactive.id
          : warehouse === 'unknown'
            ? 2_147_483_647
            : undefined;
      const file = await workbook(
        ['Código', 'Nombre', 'Precio', 'Stock'],
        [
          [item.codigo, `${PREFIX}No guardar`, 999, 9],
          [`${PREFIX}NO-INITIAL`, `${PREFIX}No crear`, 999, 3],
        ],
      );
      const options = { warehouseId };
      const plan = await preview(file, options);
      expect(plan.conflictRows).toBe(2);
      expect(await confirm(file, plan, options)).toMatchObject({
        updated: 0,
        created: 0,
        conflicts: 2,
      });
      expect((await item.reload()).stock).toBe(12);
      expect(Number(item.precio)).toBe(123.45);
      expect(item.nombre).toBe(`${PREFIX}STOCK original`);
      expect(await CatalogItem.findOne({ where: { codigo: `${PREFIX}NO-INITIAL` } })).toBeNull();
    },
  );

  it('exige conciliación para operaciones de stock heredado pero permite actualizar solo metadatos', async () => {
    const item = await createPart('LEGACY', 30);
    await StockBalance.create({ catalogItemId: item.id, warehouseId: selected.id, cantidad: 5 });
    const stockFile = await workbook(
      ['Código', 'Nombre', 'Precio', 'Stock'],
      [[item.codigo, null, 99, 5]],
    );
    const options = { warehouseId: selected.id };
    const blocked = await preview(stockFile, options);
    expect(blocked.rows[0].status).toBe('conflict');
    expect(blocked.rows[0].messages.join(' ')).toContain('conciliación');
    expect(await confirm(stockFile, blocked, options)).toMatchObject({ updated: 0, conflicts: 1 });
    const metadataFile = await workbook(
      ['Código', 'Nombre', 'Precio', 'Stock'],
      [[item.codigo, null, 99, null]],
    );
    const metadataPlan = await preview(metadataFile);
    expect(metadataPlan.rows[0].status).toBe('update');
    expect(await confirm(metadataFile, metadataPlan)).toMatchObject({ updated: 1 });
    expect((await item.reload()).stock).toBe(30);
    expect(Number(item.precio)).toBe(99);
    expect((await StockBalance.findOne({ where: { catalogItemId: item.id } }))!.cantidad).toBe(5);
    expect(await StockMovement.count({ where: { catalogItemId: item.id } })).toBe(0);
  });

  it.each(['global', 'balances', 'both'] as const)(
    'impide convertir repuesto con stock positivo (%s) a servicio aun solicitando stock cero',
    async (stockSource) => {
      const item = await createPart('CONVERT', stockSource === 'balances' ? 0 : 5);
      if (stockSource !== 'global')
        await StockBalance.create({
          catalogItemId: item.id,
          warehouseId: selected.id,
          cantidad: 5,
        });
      const file = await workbook(
        ['Código', 'Nombre', 'Tipo', 'Precio', 'Stock'],
        [[item.codigo, null, 'Servicio', 999, 0]],
      );
      const plan = await preview(file, { warehouseId: selected.id });
      expect(plan.rows[0].status).toBe('conflict');
      expect(await confirm(file, plan, { warehouseId: selected.id })).toMatchObject({
        updated: 0,
        conflicts: 1,
      });
      expect((await item.reload()).tipo).toBe('parte');
      expect(Number(item.precio)).toBe(123.45);
    },
  );

  it('permite convertir repuestos sin existencias a servicio sin generar movimientos', async () => {
    const item = await createPart('SIN-STOCK');
    const file = await workbook(
      ['Código', 'Nombre', 'Tipo', 'Stock'],
      [[item.codigo, null, 'Servicio', 9]],
    );
    const plan = await preview(file);
    expect(plan.rows[0].status).toBe('update');
    expect(await confirm(file, plan)).toMatchObject({ updated: 1 });
    expect(await item.reload()).toMatchObject({ tipo: 'estandar', stock: 0 });
    expect(await StockMovement.count({ where: { catalogItemId: item.id } })).toBe(0);
  });

  it.each([-1, 1.5, 'inválido'])(
    'rechaza stock inválido %s sin guardar precio o nombre de la misma fila',
    async (invalid) => {
      const item = await stockedPart();
      const file = await workbook(
        ['Código', 'Nombre', 'Precio', 'Stock'],
        [[item.codigo, `${PREFIX}Inválido`, 999, invalid]],
      );
      const plan = await preview(file, { warehouseId: selected.id });
      expect(plan.rows[0].status).toBe('error');
      expect(await confirm(file, plan, { warehouseId: selected.id })).toMatchObject({
        updated: 0,
        failed: 1,
      });
      expect((await item.reload()).stock).toBe(12);
      expect(Number(item.precio)).toBe(123.45);
      expect(item.nombre).toBe(`${PREFIX}STOCK original`);
      expect(await StockMovement.count({ where: { catalogItemId: item.id } })).toBe(0);
    },
  );

  it.each(['almacen.read', 'almacen.create'])(
    'requiere ambos permisos de stock; falta %s',
    async (missing) => {
      grantLimited([
        'taller.read',
        'taller.create',
        'taller.update',
        ...['almacen.read', 'almacen.create'].filter((grant) => grant !== missing),
      ]);
      const item = await stockedPart();
      const file = await workbook(
        ['Código', 'Nombre', 'Precio', 'Stock'],
        [
          [item.codigo, null, 999, 9],
          [`${PREFIX}NO-PERM`, `${PREFIX}No autorizado`, 99, 3],
          [`${PREFIX}ZERO-PERM`, `${PREFIX}Cero permitido`, 9, 0],
        ],
      );
      const options = { limited: true, warehouseId: selected.id };
      const plan = await preview(file, options);
      expect(plan).toMatchObject({ conflictRows: 2, newRows: 1 });
      expect(await confirm(file, plan, options)).toMatchObject({
        created: 1,
        updated: 0,
        conflicts: 2,
      });
      expect(Number((await item.reload()).precio)).toBe(123.45);
      expect(await StockMovement.count({ where: { createdBy: limitedUser.id } })).toBe(0);
    },
  );

  it('acepta stock con ambos permisos de almacén y atribuye el movimiento al actor', async () => {
    grantLimited(['taller.read', 'taller.update', 'almacen.read', 'almacen.create']);
    const item = await stockedPart();
    const file = await workbook(['Código', 'Nombre', 'Stock'], [[item.codigo, null, 8]]);
    const options = { limited: true, warehouseId: selected.id };
    expect(await confirm(file, await preview(file, options), options)).toMatchObject({
      updated: 1,
      failed: 0,
    });
    expect(await StockMovement.findOne({ where: { catalogItemId: item.id } })).toMatchObject({
      createdBy: limitedUser.id,
      cantidad: 8,
    });
  });

  it.each(['create', 'update'] as const)(
    'aplica permisos de creación y actualización por fila: permite solo %s',
    async (action) => {
      grantLimited(['comercial.read', `taller.${action}`]);
      const item = await createPart('ACCESS');
      const file = await workbook(
        ['Código', 'Nombre', 'Precio'],
        [
          [item.codigo, null, 999],
          [`${PREFIX}ACCESS-NEW`, `${PREFIX}Permiso crear`, 9],
        ],
      );
      const plan = await preview(file, { limited: true });
      expect(plan.rows.map((row) => row.status)).toEqual(
        action === 'create' ? ['conflict', 'valid'] : ['update', 'conflict'],
      );
      expect(await confirm(file, plan, { limited: true })).toMatchObject({
        created: action === 'create' ? 1 : 0,
        updated: action === 'update' ? 1 : 0,
        conflicts: 1,
      });
    },
  );

  it('oculta valores y diferencias existentes cuando falta lectura, aunque permita importar y actualizar', async () => {
    grantLimited(['taller.create', 'taller.update']);
    const item = await createPart('PRIVATE');
    const file = await workbook(['Código', 'Nombre', 'Precio'], [[item.codigo, null, 999]]);
    const plan = await preview(file, { limited: true });
    expect(plan.rows[0]).toMatchObject({
      status: 'conflict',
      label: 'Fila 2',
      values: {},
      changes: [],
    });
    expect(plan.rows[0].existingId).toBeUndefined();
    expect(JSON.stringify(plan)).not.toContain(item.descripcion);
    expect(JSON.stringify(plan)).not.toContain(item.nombre);
    expect(await confirm(file, plan, { limited: true })).toMatchObject({
      updated: 0,
      conflicts: 1,
    });
  });

  it.each(['metadata', 'balances', 'deleted', 'warehouse'] as const)(
    'invalida la vista previa si cambia %s antes de confirmar',
    async (change) => {
      const item = await stockedPart();
      const file = await workbook(['Código', 'Nombre', 'Precio'], [[item.codigo, null, 999]]);
      const options = { warehouseId: selected.id };
      const plan = await preview(file, options);
      if (change === 'metadata')
        await item.update({ descripcion: 'Cambio posterior a la vista previa' });
      if (change === 'balances') {
        await StockBalance.update(
          { cantidad: 4 },
          { where: { catalogItemId: item.id, warehouseId: selected.id } },
        );
        await StockBalance.update(
          { cantidad: 8 },
          { where: { catalogItemId: item.id, warehouseId: other.id } },
        );
      }
      if (change === 'deleted') await item.destroy();
      if (change === 'warehouse') await selected.update({ activo: false });
      const response = await upload(file, { ...options, previewToken: plan.previewToken });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IMPORT_PREVIEW_CHANGED');
      expect(Number((await CatalogItem.findByPk(item.id, { paranoid: false }))!.precio)).toBe(
        123.45,
      );
      expect(await StockMovement.count({ where: { catalogItemId: item.id } })).toBe(0);
    },
  );

  it('requiere X-Import-Preview y rechaza confirmar con otro almacén', async () => {
    const file = await workbook(['Código', 'Nombre'], [[`${PREFIX}TOKEN`, `${PREFIX}Token`]]);
    const without = await upload(file);
    expect(without.status).toBe(400);
    expect(without.body.error.code).toBe('IMPORT_PREVIEW_REQUIRED');
    const plan = await preview(file, { warehouseId: selected.id });
    const mismatch = await upload(file, { warehouseId: other.id, previewToken: plan.previewToken });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('IMPORT_PREVIEW_CHANGED');
    expect(await CatalogItem.findOne({ where: { codigo: `${PREFIX}TOKEN` } })).toBeNull();
  });

  it.each(['existing', 'new'] as const)(
    'revierte toda la fila %s si falla el movimiento y continúa con la siguiente fila',
    async (kind) => {
      const item = kind === 'existing' ? await stockedPart('ROLLBACK') : null;
      const code = item?.codigo ?? `${PREFIX}ROLLBACK-NEW`;
      const file = await workbook(
        ['Código', 'Nombre', 'Precio', 'Stock'],
        [
          [code, `${PREFIX}Falla atómica`, 999, 9],
          [`${PREFIX}AFTER-FAIL`, `${PREFIX}Siguiente válida`, 99, 2],
        ],
      );
      const options = { warehouseId: selected.id };
      const plan = await preview(file, options);
      vi.spyOn(StockMovement, 'create').mockRejectedValueOnce(
        new Error('Fallo de auditoría simulado'),
      );
      expect(await confirm(file, plan, options)).toMatchObject({
        created: 1,
        updated: 0,
        failed: 1,
      });
      if (item) {
        expect(await item.reload()).toMatchObject({
          nombre: `${PREFIX}ROLLBACK original`,
          stock: 12,
        });
        expect(Number(item.precio)).toBe(123.45);
        expect(
          (await StockBalance.findOne({
            where: { catalogItemId: item.id, warehouseId: selected.id },
          }))!.cantidad,
        ).toBe(5);
        expect(
          (await StockBalance.findOne({
            where: { catalogItemId: item.id, warehouseId: other.id },
          }))!.cantidad,
        ).toBe(7);
        expect(await StockMovement.count({ where: { catalogItemId: item.id } })).toBe(0);
      } else {
        expect(await CatalogItem.findOne({ where: { codigo: code } })).toBeNull();
      }
      const next = (await CatalogItem.findOne({ where: { codigo: `${PREFIX}AFTER-FAIL` } }))!;
      expect(next.stock).toBe(2);
      expect(await StockMovement.count({ where: { catalogItemId: next.id } })).toBe(1);
    },
  );

  it('actualiza solo catálogo y conserva intactas las líneas históricas de OT y COT', async () => {
    const item = await createPart('HISTORY');
    const order = await WorkOrder.create({ codigo: `${PREFIX}OT`, createdBy: admin.id });
    const quotation = await Quotation.create({
      codigo: `${PREFIX}COT`,
      workOrderId: order.id,
      asesorId: admin.id,
    });
    const workLine = await WorkOrderItem.create({
      workOrderId: order.id,
      catalogItemId: item.id,
      tipoLinea: 'parte',
      descripcion: 'Descripción histórica OT',
      cantidad: 2,
      precioUnitario: 123.45,
      subtotal: 246.9,
      unidadMedida: 'juego',
    });
    const quoteLine = await QuotationItem.create({
      quotationId: quotation.id,
      catalogItemId: item.id,
      workOrderItemId: workLine.id,
      tipoLinea: 'parte',
      descripcion: 'Descripción histórica COT',
      cantidad: 2,
      precioUnitario: 123.45,
      subtotal: 246.9,
      unidadMedida: 'juego',
    });
    const beforeWork = structuredClone((await workLine.reload()).toJSON());
    const beforeQuote = structuredClone((await quoteLine.reload()).toJSON());
    const file = await workbook(
      ['ID', 'Código', 'Nombre', 'Precio', 'Unidad'],
      [[item.id, `${PREFIX}HISTORY-NEW`, `${PREFIX}Actualizado`, 999, 'Unidad']],
    );
    const plan = await preview(file);
    expect(await confirm(file, plan)).toMatchObject({ updated: 1, failed: 0 });
    expect((await workLine.reload()).toJSON()).toEqual(beforeWork);
    expect((await quoteLine.reload()).toJSON()).toEqual(beforeQuote);
  });
});
