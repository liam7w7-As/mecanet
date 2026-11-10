import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
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
    where: { patente: { [Op.in]: [FLEET_DUPLICATE, FLEET_NEW] } },
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

describe('Import Routes (E2E)', () => {
  let jefeEmail = '';
  let jefeUserId = 0;
  let adminEmail = '';
  let adminUserId = 0;
  let duplicateCatalogPrice = 0;

  beforeAll(async () => {
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

    const duplicateCatalog = await CatalogItem.create({
      tipo: 'parte',
      codigo: `${CODE_PREFIX}DUP-01`,
      nombre: `${NAME_MARKER} duplicado`,
      precio: 1_000,
      stock: 4,
    });
    duplicateCatalogPrice = duplicateCatalog.precio;

    await Vehicle.create({ patente: VEHICLE_DUPLICATE, marca: 'Toyota' });
    await FleetVehicle.create({
      patente: FLEET_DUPLICATE,
      codigoInterno: 'IMP-F-001',
      marca: 'Ford',
      estadoOperativo: 'disponible',
    });
  });

  afterAll(async () => {
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

  it('previsualiza el catálogo sin escribir y reporta duplicados', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const workbook = await buildWorkbook(
      ['Tipo', 'Código', 'Nombre', 'Precio', 'Stock'],
      [
        ['Repuesto', `${CODE_PREFIX}NEW-01`, `${NAME_MARKER} nuevo`, 8_500, 3],
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
      duplicateRows: 1,
      errorRows: 0,
    });
    expect(await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}NEW-01` } })).toBeNull();
    expect(await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}DUP-01` } })).not.toBeNull();
  });

  it('importa solo las filas nuevas y no sobrescribe precios existentes', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const workbook = await buildWorkbook(
      ['Código', 'Nombre', 'Precio', 'Stock'],
      [
        [`${CODE_PREFIX}NEW-01`, `${NAME_MARKER} nuevo`, 8_500, 3],
        [`${CODE_PREFIX}DUP-01`, `${NAME_MARKER} duplicado`, 9_999, 99],
      ],
    );

    const response = await request(app)
      .post('/api/catalog/import')
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
      skipped: 1,
      failed: 0,
      clientsCreated: 0,
    });

    const created = await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}NEW-01` } });
    expect(created).not.toBeNull();
    expect(Number(created?.precio)).toBe(8_500);
    expect(created?.stock).toBe(3);

    const duplicate = await CatalogItem.findOne({ where: { codigo: `${CODE_PREFIX}DUP-01` } });
    expect(Number(duplicate?.precio)).toBe(Number(duplicateCatalogPrice));
    expect(duplicate?.stock).toBe(4);
  });

  it('importa vehículos de taller y crea el cliente inexistente', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const workbook = await buildWorkbook(
      ['Patente', 'Marca', 'Modelo', 'Año', 'Propietario', 'RUT propietario'],
      [
        [VEHICLE_DUPLICATE, 'Toyota', 'Hilux', 2020, 'Propietario Existente', null],
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
      skipped: 1,
      failed: 0,
      clientsCreated: 1,
    });

    const vehicle = await Vehicle.findOne({ where: { patente: VEHICLE_NEW } });
    expect(vehicle).toMatchObject({ marca: 'Nissan', modelo: 'Navara', ano: 2022 });
    expect(vehicle?.clientId).toBeTruthy();

    const client = await Client.findByPk(vehicle?.clientId ?? 0);
    expect(client?.nombre).toContain(OWNER_MARKER);
  });

  it('importa vehículos de flota y omite patentes existentes', async () => {
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
