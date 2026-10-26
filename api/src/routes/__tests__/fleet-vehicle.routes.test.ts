import { toFleetDateOnly } from '@unithor/shared';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { FleetDocument } from '../../models/FleetDocument.js';
import { FleetDocumentVersion } from '../../models/FleetDocumentVersion.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const TEST_PASSWORD = 'Flota2026!';
const TEST_EMAIL_PREFIX = 'flota40-';
const TEST_PLATE_PREFIX = 'FL40';

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
    if (separatorIndex <= 0) {
      return cookies;
    }

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

  return {
    accessToken: cookies.access_token,
    csrfToken: cookies.csrf_token,
  };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

const binaryParser = (
  response: SuperAgentResponse,
  callback: (error: Error | null, body: unknown) => void,
): void => {
  const chunks: Buffer[] = [];
  const stream = response as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

const daysFromToday = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toFleetDateOnly(date);
};

const PDF_ONE = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const PDF_TWO = Buffer.from('%PDF-1.7\n2 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

const removeFleetFixtures = async (): Promise<void> => {
  const fleetVehicles = await FleetVehicle.findAll({
    where: { patente: { [Op.like]: `${TEST_PLATE_PREFIX}%` } },
    paranoid: false,
  });
  const vehicleIds = fleetVehicles.map((vehicle) => vehicle.id);

  const documents =
    vehicleIds.length > 0
      ? await FleetDocument.findAll({
          where: { fleetVehicleId: vehicleIds },
          paranoid: false,
        })
      : [];
  const documentIds = documents.map((document) => document.id);

  if (documentIds.length > 0) {
    await FleetDocumentVersion.destroy({
      where: { fleetDocumentId: documentIds },
      force: true,
    });
    await FleetDocument.destroy({ where: { id: documentIds }, force: true });
  }

  if (vehicleIds.length > 0) {
    await FleetVehicle.destroy({ where: { id: vehicleIds }, force: true });
  }

  const workshopVehicles = await Vehicle.findAll({
    where: { patente: { [Op.like]: `${TEST_PLATE_PREFIX}%` } },
    paranoid: false,
  });
  if (workshopVehicles.length > 0) {
    await Vehicle.destroy({
      where: { id: workshopVehicles.map((vehicle) => vehicle.id) },
      force: true,
    });
  }

  const testUsers = await User.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (testUsers.length > 0) {
    await RefreshToken.destroy({
      where: { userId: testUsers.map((user) => user.id) },
      force: true,
    });
    await User.destroy({ where: { id: testUsers.map((user) => user.id) }, force: true });
  }
};

describe('Fleet Vehicle Routes (E2E)', () => {
  let devCookies: LoginCookies;
  let jefeCookies: LoginCookies;
  let fleetVehicleId: number;
  let documentId: number;
  let expiredDocumentId: number;
  let firstVersionId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await removeFleetFixtures();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, jefeRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'jefe' } }),
    ]);

    if (!devUser || !jefeRole) {
      throw new Error('No se encontraron usuarios o roles base para fleet-vehicle.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    await User.create({
      nombre: 'Jefe Flota Fase 40',
      email: `${TEST_EMAIL_PREFIX}jefe@unithor.local`,
      passwordHash,
      roleId: jefeRole.id,
      activo: true,
    });

    devCookies = await loginAs('dev@unithor.local');
    jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
  });

  afterAll(async () => {
    await removeFleetFixtures();
  });

  it('requiere autenticación para listar la flota', async () => {
    const response = await request(app).get('/api/fleet-vehicles');
    expect(response.status).toBe(401);
  });

  it('impide que un rol de solo lectura cree vehículos de flota', async () => {
    const response = await request(app)
      .post('/api/fleet-vehicles')
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .send({ patente: `${TEST_PLATE_PREFIX}01` });

    expect(response.status).toBe(403);
  });

  it('crea un vehículo de flota normalizado y sin dueño externo', async () => {
    const response = await request(app)
      .post('/api/fleet-vehicles')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        patente: 'fl 40-01',
        codigoInterno: 'flt-001',
        marca: 'Toyota',
        modelo: 'Hilux',
        ano: 2024,
        estadoOperativo: 'en_mantencion',
        sucursal: 'Casa matriz',
        responsable: 'María Soto',
      });

    expect(response.status).toBe(201);
    expect(response.body.fleetVehicle).toMatchObject({
      patente: 'FL4001',
      codigoInterno: 'FLT-001',
      marca: 'Toyota',
      modelo: 'Hilux',
      estadoOperativo: 'en_mantencion',
      sucursal: 'Casa matriz',
      responsable: 'María Soto',
      documentSummary: {
        total: 0,
        expired: 0,
        expiringSoon: 0,
        nextExpiry: null,
      },
    });
    fleetVehicleId = response.body.fleetVehicle.id as number;
  });

  it('lista la flota para un rol con permiso de lectura', async () => {
    const response = await request(app)
      .get('/api/fleet-vehicles')
      .query({ search: 'FL4001' })
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      id: fleetVehicleId,
      patente: 'FL4001',
      estadoOperativo: 'en_mantencion',
    });
  });

  it('mantiene la flota fuera de los vehículos de taller y de la búsqueda rápida', async () => {
    const workshopList = await request(app)
      .get('/api/vehicles')
      .query({ search: 'FL4001' })
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);
    expect(workshopList.status).toBe(200);
    expect(workshopList.body.items).toHaveLength(0);

    const quickSearch = await request(app)
      .get('/api/search/quick')
      .query({ q: 'FL4001' })
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);
    expect(quickSearch.status).toBe(200);
    expect(quickSearch.body.vehicles).toHaveLength(0);
  });

  it('impide repetir una patente entre taller y flota', async () => {
    const workshopCreate = await request(app)
      .post('/api/vehicles')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ patente: 'FL4001' });
    expect(workshopCreate.status).toBe(409);

    const workshopVehicle = await Vehicle.create({ patente: 'FL4099' });
    const fleetCreate = await request(app)
      .post('/api/fleet-vehicles')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ patente: workshopVehicle.patente });
    expect(fleetCreate.status).toBe(409);
  });

  it('registra un documento de flota sin archivo y calcula su vencimiento', async () => {
    const response = await request(app)
      .post(`/api/fleet-vehicles/${fleetVehicleId}/documents`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .field('nombre', 'Revisión técnica')
      .field('referencia', 'RT-2026-001')
      .field('fechaEmision', daysFromToday(-360))
      .field('fechaVencimiento', daysFromToday(5));

    expect(response.status).toBe(201);
    expect(response.body.document).toMatchObject({
      nombre: 'Revisión técnica',
      referencia: 'RT-2026-001',
      archivoNombre: null,
      version: 0,
      tieneArchivo: false,
    });
    expect(response.body.document.expiry).toMatchObject({ state: 'critico' });
    documentId = response.body.document.id as number;
  });

  it('actualiza metadata sin crear una versión', async () => {
    const response = await request(app)
      .patch(`/api/fleet-vehicles/${fleetVehicleId}/documents/${documentId}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ notas: 'Renovar durante la primera semana de noviembre' });

    expect(response.status).toBe(200);
    expect(response.body.document).toMatchObject({
      id: documentId,
      notas: 'Renovar durante la primera semana de noviembre',
      version: 0,
      tieneArchivo: false,
    });
  });

  it('rechaza un vencimiento anterior a la emisión guardada al editar solo esa fecha', async () => {
    const response = await request(app)
      .patch(`/api/fleet-vehicles/${fleetVehicleId}/documents/${documentId}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ fechaVencimiento: daysFromToday(-400) });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'El vencimiento no puede ser anterior a la emisión',
    );
  });

  it('adjunta un archivo como versión 1 y lo sirve autenticado', async () => {
    const upload = await request(app)
      .post(`/api/fleet-vehicles/${fleetVehicleId}/documents/${documentId}/versions`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .field('nombre', 'Revisión técnica')
      .attach('file', PDF_ONE, {
        filename: 'revision-tecnica.pdf',
        contentType: 'application/pdf',
      });

    expect(upload.status).toBe(201);
    expect(upload.body.document).toMatchObject({
      id: documentId,
      archivoNombre: 'revision-tecnica.pdf',
      mimeType: 'application/pdf',
      version: 1,
      tieneArchivo: true,
    });

    const file = await request(app)
      .get(`/api/fleet-vehicles/${fleetVehicleId}/documents/${documentId}/file`)
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`])
      .buffer(true)
      .parse(binaryParser);

    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(Buffer.compare(file.body as Buffer, PDF_ONE)).toBe(0);
  });

  it('archiva la versión anterior al reemplazar el archivo', async () => {
    const upload = await request(app)
      .post(`/api/fleet-vehicles/${fleetVehicleId}/documents/${documentId}/versions`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .field('fechaVencimiento', daysFromToday(380))
      .attach('file', PDF_TWO, {
        filename: 'revision-tecnica-2027.pdf',
        contentType: 'application/pdf',
      });

    expect(upload.status).toBe(201);
    expect(upload.body.document).toMatchObject({
      version: 2,
      archivoNombre: 'revision-tecnica-2027.pdf',
    });
    expect(upload.body.document.expiry.state).toBe('vigente');

    const versions = await request(app)
      .get(`/api/fleet-vehicles/${fleetVehicleId}/documents/${documentId}/versions`)
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);

    expect(versions.status).toBe(200);
    expect(versions.body.current.version).toBe(2);
    expect(versions.body.versions).toHaveLength(1);
    expect(versions.body.versions[0]).toMatchObject({
      version: 1,
      archivoNombre: 'revision-tecnica.pdf',
    });
    firstVersionId = versions.body.versions[0].id as number;

    const archivedFile = await request(app)
      .get(`/api/fleet-vehicles/${fleetVehicleId}/documents/${documentId}/file`)
      .query({ versionId: firstVersionId })
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`])
      .buffer(true)
      .parse(binaryParser);

    expect(archivedFile.status).toBe(200);
    expect(Buffer.compare(archivedFile.body as Buffer, PDF_ONE)).toBe(0);
  });

  it('expone vencidos y por vencer en la ficha y en los filtros', async () => {
    const expired = await request(app)
      .post(`/api/fleet-vehicles/${fleetVehicleId}/documents`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .field('nombre', 'Seguro obligatorio')
      .field('fechaVencimiento', daysFromToday(-2));

    expect(expired.status).toBe(201);
    expect(expired.body.document.expiry).toMatchObject({
      state: 'vencido',
      daysRemaining: -2,
    });
    expiredDocumentId = expired.body.document.id as number;

    const detail = await request(app)
      .get(`/api/fleet-vehicles/${fleetVehicleId}`)
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);

    expect(detail.status).toBe(200);
    expect(detail.body.fleetVehicle.documents).toHaveLength(2);
    expect(detail.body.fleetVehicle.documentSummary).toMatchObject({
      total: 2,
      expired: 1,
      expiringSoon: 0,
    });
    expect(detail.body.fleetVehicle.documentSummary.nextExpiry.documentId).toBe(
      expiredDocumentId,
    );

    const expiredList = await request(app)
      .get('/api/fleet-vehicles')
      .query({ vencimiento: 'vencido' })
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);
    expect(expiredList.status).toBe(200);
    expect(expiredList.body.items.map((item: { id: number }) => item.id)).toContain(
      fleetVehicleId,
    );
  });

  it('incluye las alertas de flota en el dashboard para roles con lectura', async () => {
    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.operationalInbox.counts.fleetDocumentAlerts).toBe(1);
    expect(
      response.body.operationalInbox.items.some(
        (task: { type: string; href: string }) =>
          task.type === 'fleet_document_expiring' &&
          task.href === `/vehicles?tab=flota&fleetVehicleId=${fleetVehicleId}`,
      ),
    ).toBe(true);
  });

  it('elimina un documento de forma lógica y conserva sus versiones', async () => {
    const response = await request(app)
      .delete(`/api/fleet-vehicles/${fleetVehicleId}/documents/${expiredDocumentId}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(200);

    const deleted = await FleetDocument.findByPk(expiredDocumentId, { paranoid: false });
    expect(deleted?.deletedAt).not.toBeNull();

    const detail = await request(app)
      .get(`/api/fleet-vehicles/${fleetVehicleId}`)
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);
    expect(detail.body.fleetVehicle.documents).toHaveLength(1);

    const versions = await FleetDocumentVersion.findAll({
      where: { fleetDocumentId: documentId },
    });
    expect(versions).toHaveLength(1);
  });

  it('elimina el vehículo de flota de forma lógica', async () => {
    const response = await request(app)
      .delete(`/api/fleet-vehicles/${fleetVehicleId}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(200);

    const deleted = await FleetVehicle.findByPk(fleetVehicleId, { paranoid: false });
    expect(deleted?.deletedAt).not.toBeNull();

    const detail = await request(app)
      .get(`/api/fleet-vehicles/${fleetVehicleId}`)
      .set('Cookie', [`access_token=${jefeCookies.accessToken}`]);
    expect(detail.status).toBe(404);
  });
});
