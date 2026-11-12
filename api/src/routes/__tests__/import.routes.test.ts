import ExcelJS from 'exceljs';
import express from 'express';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import {
  downloadImportTemplateHandler,
  importSpreadsheetHandler,
} from '../../controllers/import.controller.js';
import { app } from '../../main.js';
import { errorHandler } from '../../middlewares/error-handler.js';
import { spreadsheetUpload } from '../../middlewares/spreadsheet-upload.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { previewFleetImport } from '../../services/import/fleet-import.service.js';
import { buildImportTemplate } from '../../services/import/import-template.service.js';
import * as permissions from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'import-routes-';
const CODE_PREFIX = 'IMPEXP-';
const NAME_MARKER = 'Importación prueba';
const OWNER_MARKER = 'Cliente Importación Prueba';
const VEHICLE_DUPLICATE = 'IMPT11';
const VEHICLE_NEW = 'IMPT22';
const FLEET_DUPLICATE = 'IMPF11';
const FLEET_NEW = 'IMPF22';
const FLEET_FIRST_PHASE = ['IMPF31', 'IMPF32', 'IMPF33', 'IMPF41', 'IMPF42', 'IMPF43'];
const EXCEL_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface LoginCookies {
  accessToken: string;
  csrfToken: string;
}

const extractCookies = (res: request.Response): Record<string, string> => {
  const rawHeader = res.headers['set-cookie'];
  const rawCookies: string[] = Array.isArray(rawHeader)
    ? rawHeader
    : typeof rawHeader === 'string'
      ? [rawHeader]
      : [];

  return rawCookies.reduce<Record<string, string>>((cookies, cookieStr) => {
    const [pair] = cookieStr.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) return cookies;
    cookies[pair.slice(0, separatorIndex).trim()] = pair
      .slice(separatorIndex + 1)
      .trim();
    return cookies;
  }, {});
};

const loginAs = async (email: string): Promise<LoginCookies> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  expect(response.status).toBe(200);
  const cookies = extractCookies(response);
  return { accessToken: cookies.access_token, csrfToken: cookies.csrf_token };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

const buildWorkbook = async (
  headers: string[],
  rows: Array<Array<string | number | null>>,
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Datos');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const previewTokenFor = async (path: string, workbook: Buffer, cookies: LoginCookies, filename: string): Promise<string> => {
  const response = await request(app).post(path).query({ dryRun: 'true' })
    .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
    .attach('file', workbook, { filename, contentType: EXCEL_MIME });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.preview.previewToken).toEqual(expect.any(String));
  return response.body.preview.previewToken as string;
};

const readWorkbook = async (buffer: Buffer): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
};

// Aísla el controlador de los permisos de ruta para probar roles sin privilegios
// privados, usando req.user como lo entrega el middleware de autenticación.
const fleetControllerApp = (actorRole: string | undefined) => {
  const testApp = express();
  testApp.use((req, res, next) => {
    if (actorRole) {
      req.user = { id: 1, nombre: 'Prueba', email: 'prueba@unithor.local', role: actorRole };
    }
    res.locals.validatedQuery = { dryRun: req.query.dryRun === 'true' };
    next();
  });
  testApp.get('/template', downloadImportTemplateHandler('fleet-vehicles'));
  testApp.post('/import', spreadsheetUpload, importSpreadsheetHandler('fleet-vehicles'));
  testApp.use(errorHandler);
  return testApp;
};

const assertTestDatabase = (): void => {
  if (sequelize.getDatabaseName() !== 'unithor_test') {
    throw new Error('Las pruebas de importación requieren unithor_test');
  }
};

const removeFixtures = async (): Promise<void> => {
  await Vehicle.destroy({
    where: { patente: { [Op.in]: [VEHICLE_DUPLICATE, VEHICLE_NEW] } },
    force: true,
  });
  await Client.destroy({
    where: {
      [Op.or]: [
        { nombre: { [Op.like]: `%${OWNER_MARKER}%` } },
        { nombre: { [Op.like]: `%${NAME_MARKER}%` } },
      ],
    },
    force: true,
  });
  await FleetVehicle.destroy({
    where: { patente: { [Op.in]: [FLEET_DUPLICATE, FLEET_NEW, ...FLEET_FIRST_PHASE] } },
    force: true,
  });
  await CatalogItem.destroy({
    where: {
      [Op.or]: [
        { codigo: { [Op.like]: `${CODE_PREFIX}%` } },
        { nombre: { [Op.like]: `%${NAME_MARKER}%` } },
      ],
    },
    force: true,
  });
};

const removeUserFixtures = async (): Promise<void> => {
  const users = await User.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await RefreshToken.destroy({ where: { userId: userIds }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  }
};

describe('Importación de flota: plantilla y privacidad', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([undefined, false, true])(
    'genera la plantilla con privacidad por defecto (incluir privados: %s)',
    async (includePrivateFields) => {
      const workbook = await readWorkbook(
        await buildImportTemplate('fleet-vehicles', includePrivateFields),
      );
      const data = workbook.getWorksheet('Datos')!;
      const headers = data.getRow(1).values as string[];
      expect(headers).toContain('Responsable');
      expect(headers).toContain('Motivo de baja');
      expect(headers.includes('Propietario')).toBe(includePrivateFields === true);

      const statusColumn = headers.indexOf('Estado operativo');
      expect(data.getCell(2, statusColumn).dataValidation.formulae).toEqual([
        '"Disponible,En mantención,Fuera de servicio,Dado de baja"',
      ]);
      const instructionRows: string[][] = [];
      workbook.getWorksheet('Instrucciones')!.eachRow((row) => {
        instructionRows.push((row.values as string[]).slice(1));
      });
      const ownerInstructions = instructionRows.find(([header]) => header === 'Propietario');
      if (includePrivateFields) {
        expect(ownerInstructions?.[1]).toBe('No');
        expect(ownerInstructions?.[2]).toContain('privado');
        expect(ownerInstructions?.[2]).toContain('admin y desarrollador');
      } else {
        expect(ownerInstructions).toBeUndefined();
      }
      expect(instructionRows.find(([header]) => header === 'Motivo de baja')?.[2]).toContain(
        'Solo se conserva con estado Dado de baja',
      );
    },
  );

  it('conserva propietario en la plantilla de taller con privacidad desactivada', async () => {
    const workbook = await readWorkbook(await buildImportTemplate('vehicles'));
    expect(workbook.getWorksheet('Datos')!.getRow(1).values).toContain('Propietario');
  });

  it.each(['admin', 'desarrollador', 'jefe', undefined])(
    'filtra la plantilla según req.user.role (%s) e ignora roles enviados en query',
    async (actorRole) => {
      const response = await request(fleetControllerApp(actorRole))
        .get('/template')
        .query({ role: 'admin', includePrivateFields: 'true' })
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(response.status).toBe(200);
      const workbook = await readWorkbook(response.body as Buffer);
      const headers = workbook.getWorksheet('Datos')!.getRow(1).values as string[];
      expect(headers.includes('Propietario')).toBe(actorRole === 'admin' || actorRole === 'desarrollador');
    },
  );

  it.each(['jefe', 'vendedor', 'mecanico', undefined])(
    'rechaza propietario con 403 antes de acceder a DB en preview e importación (%s)',
    async (actorRole) => {
      const fleetRead = vi.spyOn(FleetVehicle, 'findAll').mockResolvedValue([]);
      const workshopRead = vi.spyOn(Vehicle, 'findAll').mockResolvedValue([]);
      const create = vi.spyOn(FleetVehicle, 'create').mockRejectedValue(new Error('No crear'));
      const transaction = vi.spyOn(sequelize, 'transaction').mockRejectedValue(new Error('No abrir'));
      const workbook = await buildWorkbook(
        ['Patente', 'Propietario'],
        [[FLEET_DUPLICATE, 'Propietario reservado']],
      );

      await expect(previewFleetImport(workbook, 'flota.xlsx', actorRole)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
      for (const dryRun of [true, false]) {
        const response = await request(fleetControllerApp(actorRole))
          .post('/import')
          .query({ dryRun: String(dryRun), role: 'admin' })
          .field('role', 'desarrollador')
          .field('actorRole', 'admin')
          .attach('file', workbook, { filename: 'flota.xlsx', contentType: EXCEL_MIME });
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
        expect(JSON.stringify(response.body)).not.toContain('Propietario reservado');
      }
      expect(fleetRead).not.toHaveBeenCalled();
      expect(workshopRead).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('permite propietario vacío sin privilegios y no lo expone en preview', async () => {
    // This isolated controller test grants ordinary import/create rights,
    // while the actor still has no access to the private fleet owner.
    vi.spyOn(permissions, 'hasPermission').mockResolvedValue(true);
    vi.spyOn(FleetVehicle, 'findAll').mockResolvedValue([]);
    vi.spyOn(Vehicle, 'findAll').mockResolvedValue([]);
    const create = vi.spyOn(FleetVehicle, 'create').mockRejectedValue(new Error('No crear'));
    const workbook = await buildWorkbook(
      ['Patente', 'Propietario', 'Responsable'],
      [['IMPS01', '   ', 'Ana Soto']],
    );
    const response = await request(fleetControllerApp('jefe'))
      .post('/import')
      .query({ dryRun: 'true' })
      .attach('file', workbook, { filename: 'flota.xlsx', contentType: EXCEL_MIME });
    expect(response.status).toBe(200);
    expect(response.body.preview.validRows).toBe(1);
    expect(response.body.preview.rows[0].values.responsable).toBe('Ana Soto');
    expect(response.body.preview.rows[0].values).not.toHaveProperty('propietario');
    expect(response.body.preview.mappedColumns).not.toHaveProperty('propietario');
    expect(response.body.preview.headers).not.toContain('Propietario');
    expect(create).not.toHaveBeenCalled();
  });

  it('valida los límites de propietario y motivo de baja con el esquema shared', async () => {
    vi.spyOn(FleetVehicle, 'findAll').mockResolvedValue([]);
    vi.spyOn(Vehicle, 'findAll').mockResolvedValue([]);
    const workbook = await buildWorkbook(
      ['Patente', 'Estado operativo', 'Propietario', 'Motivo de baja'],
      [
        ['IMPS01', 'Dado de baja', 'P'.repeat(181), 'Motivo válido'],
        ['IMPS02', 'Dado de baja', 'Propietario válido', 'M'.repeat(501)],
      ],
    );
    const preview = await previewFleetImport(workbook, 'flota.xlsx', 'desarrollador');
    expect(preview.validRows).toBe(0);
    expect(preview.errorRows).toBe(2);
  });
});

describe('Import Routes (E2E)', () => {
  let jefeEmail = '';
  let jefeUserId = 0;
  let adminEmail = '';
  let adminUserId = 0;

  beforeAll(async () => {
    assertTestDatabase();
    await sequelize.authenticate();
    await removeFixtures();
    await removeUserFixtures();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, jefeRole, adminRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'jefe' } }),
      Role.findOne({ where: { nombre: 'admin' } }),
    ]);
    if (!devUser || !jefeRole || !adminRole) {
      throw new Error('No se encontraron los usuarios o roles base para import.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });

    jefeEmail = `${TEST_EMAIL_PREFIX}jefe@unithor.local`;
    const jefe = await User.create({
      nombre: 'Jefe Importación Prueba',
      email: jefeEmail,
      passwordHash,
      roleId: jefeRole.id,
      activo: true,
    });
    jefeUserId = jefe.id;

    adminEmail = `${TEST_EMAIL_PREFIX}admin@unithor.local`;
    const admin = await User.create({
      nombre: 'Admin Importación Prueba',
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
      activo: true,
    });
    adminUserId = admin.id;

    await CatalogItem.create({
      tipo: 'parte',
      codigo: `${CODE_PREFIX}DUP-01`,
      nombre: `${NAME_MARKER} duplicado`,
      precio: 1_000,
      stock: 4,
    });

    await Vehicle.create({ patente: VEHICLE_DUPLICATE, marca: 'Toyota' });
    await FleetVehicle.create({
      patente: FLEET_DUPLICATE,
      codigoInterno: 'IMP-F-001',
      marca: 'Ford',
      estadoOperativo: 'disponible',
    });
  });

  afterAll(async () => {
    assertTestDatabase();
    await removeFixtures();
    await RefreshToken.destroy({ where: { userId: [jefeUserId, adminUserId] }, force: true });
    await removeUserFixtures();
  });

  it('requiere autenticación para importar', async () => {
    const response = await request(app).get('/api/catalog/import/template');
    expect(response.status).toBe(401);
  });

  it('rechaza a un rol sin permiso de importación', async () => {
    const cookies = await loginAs(jefeEmail);
    const response = await request(app)
      .get('/api/catalog/import/template')
      .set('Cookie', authCookie(cookies));

    expect(response.status).toBe(403);
  });

  it('permite a un administrador descargar la plantilla', async () => {
    const cookies = await loginAs(adminEmail);
    const response = await request(app)
      .get('/api/catalog/import/template')
      .set('Cookie', authCookie(cookies));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(EXCEL_MIME);
  });

  it('descarga la plantilla de catálogo como Excel', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .get('/api/catalog/import/template')
      .set('Cookie', authCookie(cookies))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(EXCEL_MIME);
    expect(response.headers['content-disposition']).toContain('plantilla-catalogo.xlsx');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('previsualiza el catálogo sin escribir y señala stock inconsistente como conflicto', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const workbook = await buildWorkbook(
      ['Tipo', 'Código', 'Nombre', 'Precio', 'Stock'],
      [
        ['Repuesto', `${CODE_PREFIX}NEW-01`, `${NAME_MARKER} nuevo`, 8_500, 0],
        ['Repuesto', `${CODE_PREFIX}DUP-01`, `${NAME_MARKER} duplicado`, 9_999, 99],
      ],
    );

    const response = await request(app)
      .post('/api/catalog/import')
      .query({ dryRun: 'true' })
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('file', workbook, {
        filename: 'catalogo.xlsx',
        contentType: EXCEL_MIME,
      });

    expect(response.status).toBe(200);
    expect(response.body.preview).toMatchObject({
      module: 'catalog',
      sheetName: 'Datos',
      totalRows: 2,
      validRows: 1,
      conflictRows: 1,
      errorRows: 0,
    });
    expect(await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}NEW-01` } })).toBeNull();
    expect(await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}DUP-01` } })).not.toBeNull();
  });

  it('agrega filas nuevas y actualiza precios conservando el stock si la columna no viene', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const workbook = await buildWorkbook(
      ['Código', 'Nombre', 'Precio'],
      [
        [`${CODE_PREFIX}NEW-01`, `${NAME_MARKER} nuevo`, 8_500],
        [`${CODE_PREFIX}DUP-01`, `${NAME_MARKER} duplicado`, 9_999],
      ],
    );

    const response = await request(app)
      .post('/api/catalog/import')
      .set('X-Import-Preview', await previewTokenFor('/api/catalog/import', workbook, cookies, 'catalogo.xlsx'))
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('file', workbook, {
        filename: 'catalogo.xlsx',
        contentType: EXCEL_MIME,
      });

    expect(response.status).toBe(201);
    expect(response.body.result).toMatchObject({
      module: 'catalog',
      created: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
      clientsCreated: 0,
    });

    const created = await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}NEW-01` } });
    expect(created).not.toBeNull();
    expect(Number(created?.precio)).toBe(8_500);
    expect(created?.stock).toBe(0);

    const duplicate = await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}DUP-01` } });
    expect(Number(duplicate?.precio)).toBe(9_999);
    expect(duplicate?.stock).toBe(4);
  });

  it('importa vehículos de taller y crea el cliente inexistente', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const workbook = await buildWorkbook(
      ['Patente', 'Marca', 'Modelo', 'Año', 'Propietario', 'RUT propietario'],
      [
        [VEHICLE_DUPLICATE, 'Toyota', 'Hilux', 2020, `${OWNER_MARKER} Existente`, null],
        [
          VEHICLE_NEW,
          'Nissan',
          'Navara',
          2022,
          `${OWNER_MARKER} Nuevo`,
          '11.111.111-1',
        ],
      ],
    );

    const response = await request(app)
      .post('/api/vehicles/import')
      .set('X-Import-Preview', await previewTokenFor('/api/vehicles/import', workbook, cookies, 'vehiculos-taller.xlsx'))
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('file', workbook, {
        filename: 'vehiculos-taller.xlsx',
        contentType: EXCEL_MIME,
      });

    expect(response.status).toBe(201);
    expect(response.body.result).toMatchObject({
      module: 'vehicles',
      created: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
      clientsCreated: 2,
    });

    const vehicle = await Vehicle.findOne({ where: { patente: VEHICLE_NEW } });
    expect(vehicle).toMatchObject({ marca: 'Nissan', modelo: 'Navara', ano: 2022 });
    expect(vehicle?.clientId).toBeTruthy();

    const client = await Client.findByPk(vehicle?.clientId ?? 0);
    expect(client?.nombre).toContain(OWNER_MARKER);
  });

  it.each(['admin', 'desarrollador'] as const)(
    'previsualiza bajas, responsable y propietario privado sin escribir (%s)',
    async (actorRole) => {
      const cookies = await loginAs(actorRole === 'admin' ? adminEmail : 'dev@unithor.local');
      const estados = ['Dado de baja', 'baja', 'retirado', 'dado_de_baja', 'Fuera de servicio', 'Otro'];
      const patentes = estados.map((_, index) => `IMPS0${index + 1}`);
      const workbook = await buildWorkbook(
        ['Patente', 'Estado operativo', 'Responsable', 'Propietario', 'Motivo de baja'],
        estados.map((estado, index) => [
          patentes[index],
          estado,
          'Ana Soto',
          'Propietario privado',
          'Retiro definitivo',
        ]),
      );
      const response = await request(app)
        .post('/api/fleet-vehicles/import')
        .query({ dryRun: 'true' })
        .set('Cookie', authCookie(cookies))
        .set('X-CSRF-Token', cookies.csrfToken)
        .attach('file', workbook, { filename: 'flota.xlsx', contentType: EXCEL_MIME });

      expect(response.status).toBe(200);
      expect(response.body.preview).toMatchObject({ validRows: 5, errorRows: 1, created: 0 });
      for (const row of response.body.preview.rows.slice(0, 4)) {
        expect(row.values).toMatchObject({
          estadoOperativo: 'dado_de_baja',
          responsable: 'Ana Soto',
          propietario: 'Propietario privado',
          motivoBaja: 'Retiro definitivo',
        });
      }
      expect(response.body.preview.rows[4].values).toMatchObject({
        estadoOperativo: 'fuera_de_servicio',
        motivoBaja: null,
      });
      expect(response.body.preview.rows[5].messages.join(' ')).toContain('Dado de baja');
      expect(await FleetVehicle.count({ where: { patente: { [Op.in]: patentes } } })).toBe(0);
    },
  );

  it.each(['admin', 'desarrollador'] as const)(
    'crea y actualiza bajas con fecha del servidor y conserva datos privados (%s)',
    async (actorRole) => {
      const cookies = await loginAs(actorRole === 'admin' ? adminEmail : 'dev@unithor.local');
      const plates = FLEET_FIRST_PHASE.slice(actorRole === 'admin' ? 0 : 3, actorRole === 'admin' ? 3 : 6);
      const propietario = 'P'.repeat(180);
      const motivoBaja = 'M'.repeat(500);
      const workbook = await buildWorkbook(
        ['Patente', 'Estado operativo', 'Responsable', 'Propietario', 'Motivo de baja', 'Fecha de baja'],
        [
          [plates[0], 'baja', 'Ana Soto', propietario, motivoBaja, '2000-01-01'],
          [plates[1], 'Fuera de servicio', 'Luis Pérez', propietario, 'M'.repeat(501), '2000-01-01'],
          [plates[2], 'Disponible', null, null, 'No corresponde', '2000-01-01'],
          [FLEET_DUPLICATE, 'retirado', 'Otro responsable', propietario, motivoBaja, '2000-01-01'],
        ],
      );
      const startedAt = Date.now();
      const response = await request(app)
        .post('/api/fleet-vehicles/import')
        .set('X-Import-Preview', await previewTokenFor('/api/fleet-vehicles/import', workbook, cookies, 'flota.xlsx'))
        .set('Cookie', authCookie(cookies))
        .set('X-CSRF-Token', cookies.csrfToken)
        .attach('file', workbook, { filename: 'flota.xlsx', contentType: EXCEL_MIME });
      const endedAt = Date.now();

      expect(response.status).toBe(201);
      expect(response.body.result).toMatchObject({ created: 3, updated: actorRole === 'admin' ? 1 : 0, skipped: actorRole === 'admin' ? 0 : 1, failed: 0 });
      const retired = await FleetVehicle.findOne({ where: { patente: plates[0] } });
      expect(retired).toMatchObject({
        estadoOperativo: 'dado_de_baja',
        responsable: 'Ana Soto',
        propietario,
        motivoBaja,
      });
      expect(retired?.fechaBaja).toBeInstanceOf(Date);
      expect(retired!.fechaBaja!.getTime()).toBeGreaterThanOrEqual(Math.floor(startedAt / 1_000) * 1_000);
      expect(retired!.fechaBaja!.getTime()).toBeLessThanOrEqual(endedAt);
      for (const patente of plates.slice(1)) {
        const vehicle = await FleetVehicle.findOne({ where: { patente } });
        expect(vehicle?.fechaBaja).toBeNull();
        expect(vehicle?.motivoBaja).toBeNull();
      }
      expect(response.body.result.rows[0].values).toMatchObject({
        responsable: 'Ana Soto',
        propietario,
        motivoBaja,
      });
      const duplicate = await FleetVehicle.findOne({ where: { patente: FLEET_DUPLICATE } });
      expect(duplicate).toMatchObject({
        codigoInterno: 'IMP-F-001',
        estadoOperativo: 'dado_de_baja',
        responsable: 'Otro responsable',
        propietario,
        motivoBaja,
      });
    },
  );

  it('importa vehículos de flota y no reactiva vehículos dados de baja', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const workbook = await buildWorkbook(
      ['Patente', 'Código interno', 'Marca', 'Estado operativo', 'Sucursal'],
      [
        [FLEET_DUPLICATE, 'IMP-F-002', 'Ford', 'Disponible', 'Casa Central'],
        [FLEET_NEW, 'IMP-F-003', 'Chevrolet', 'En mantención', 'Sucursal Norte'],
      ],
    );

    const response = await request(app)
      .post('/api/fleet-vehicles/import')
      .set('X-Import-Preview', await previewTokenFor('/api/fleet-vehicles/import', workbook, cookies, 'vehiculos-flota.xlsx'))
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('file', workbook, {
        filename: 'vehiculos-flota.xlsx',
        contentType: EXCEL_MIME,
      });

    expect(response.status).toBe(201);
    expect(response.body.result).toMatchObject({
      module: 'fleet-vehicles',
      created: 1,
      skipped: 1,
      failed: 0,
    });

    expect(await FleetVehicle.findOne({ where: { patente: FLEET_NEW } })).toMatchObject({
      codigoInterno: 'IMP-F-003',
      estadoOperativo: 'en_mantencion',
      sucursal: 'Sucursal Norte',
    });
    const duplicate = await FleetVehicle.findOne({ where: { patente: FLEET_DUPLICATE } });
    expect(duplicate?.codigoInterno).toBe('IMP-F-001');
  });

  it('rechaza un archivo que no es .xlsx', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .post('/api/catalog/import')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('file', Buffer.from('nombre,precio\nA,1\n'), {
        filename: 'catalogo.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('.xlsx');
  });
});
