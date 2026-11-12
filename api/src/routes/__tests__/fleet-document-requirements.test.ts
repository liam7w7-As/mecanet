import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { toFleetDateOnly } from '@unithor/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { FleetDocument } from '../../models/FleetDocument.js';
import { FleetDocumentVersion } from '../../models/FleetDocumentVersion.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { FleetDocumentPublic } from '../../services/fleet-document.service.js';
import type { FleetVehicleDocumentSummaryPublic } from '../../services/fleet-vehicle.service.js';

// Exercise the real storage adapter without contacting R2 or writing local files.
const remote = vi.hoisted(() => ({ files: new Map<string, Buffer>(), send: vi.fn() }));
vi.mock('../../config/env.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../config/env.js')>();
  return {
    env: {
      ...original.env,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
      S3_BUCKET: 'fleet-phase3-test',
      S3_ACCESS_KEY_ID: 'test-key',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_PREFIX: 'fleet-phase3',
    },
  };
});
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  remote.send.mockImplementation(async (command: { input: { Key?: string; Body?: Buffer } }) => {
    const key = command.input.Key ?? '';
    if (command instanceof sdk.PutObjectCommand) {
      remote.files.set(key, Buffer.from(command.input.Body ?? []));
    }
    if (command instanceof sdk.GetObjectCommand) {
      const bytes = remote.files.get(key);
      if (!bytes) throw Object.assign(new Error('Missing test file'), { name: 'NoSuchKey' });
      return { Body: { transformToByteArray: async () => bytes } };
    }
    if (command instanceof sdk.DeleteObjectCommand) remote.files.delete(key);
    return {};
  });
  return {
    ...sdk,
    S3Client: class {
      send = remote.send;
    },
  };
});

const PDF_ONE = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const PDF_TWO = Buffer.from('%PDF-1.7\n2 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const REQUIRED_TYPES = ['permiso_circulacion', 'soap', 'revision_tecnica'];
const CSRF = 'fleet-phase3-csrf';
const vehicles: number[] = [];
let vehicleId: number;
let readerId: number | undefined;
let writerCookies: string[];
let readerCookies: string[];

const documentsPath = () => `/api/fleet-vehicles/${vehicleId}/documents`;
const get = (url: string, cookies = readerCookies) => request(app).get(url).set('Cookie', cookies);
const post = (url: string, cookies = writerCookies) =>
  request(app).post(url).set('Cookie', cookies).set('X-CSRF-Token', CSRF);
const patch = (id: number, data: object, cookies = writerCookies) =>
  request(app)
    .patch(`${documentsPath()}/${id}`)
    .set('Cookie', cookies)
    .set('X-CSRF-Token', CSRF)
    .send(data);
const remove = (id: number, cookies = writerCookies) =>
  request(app).delete(`${documentsPath()}/${id}`).set('Cookie', cookies).set('X-CSRF-Token', CSRF);
const attach = (upload: request.Test, bytes: Buffer = PDF_ONE, filename = 'document.pdf') =>
  upload.attach('file', bytes, { filename, contentType: 'application/pdf' });
const createDocument = async (
  fields: Record<string, string>,
  bytes?: Buffer,
): Promise<FleetDocumentPublic> => {
  let upload = post(documentsPath());
  for (const [key, value] of Object.entries(fields)) upload = upload.field(key, value);
  if (bytes) upload = attach(upload, bytes);
  const response = await upload;
  expect(response.status).toBe(201);
  expect(response.body.document).not.toHaveProperty('storageKey');
  return response.body.document as FleetDocumentPublic;
};
const replace = (
  id: number,
  fields: Partial<Record<string, string>> = {},
  cookies = writerCookies,
) => {
  let upload = post(`${documentsPath()}/${id}/versions`, cookies);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) upload = upload.field(key, value);
  }
  return attach(upload, PDF_TWO, 'replacement.pdf');
};
const readSummary = async (): Promise<FleetVehicleDocumentSummaryPublic> => {
  const detail = await get(`/api/fleet-vehicles/${vehicleId}`);
  const vehicle = await FleetVehicle.findByPk(vehicleId);
  const list = await get(`/api/fleet-vehicles?search=${vehicle!.patente}`);
  expect(detail.status).toBe(200);
  expect(list.status).toBe(200);
  expect(list.body.items).toHaveLength(1);
  expect(list.body.items[0].documentSummary).toEqual(detail.body.fleetVehicle.documentSummary);
  for (const response of [detail, list]) {
    expect(JSON.stringify(response.body)).not.toContain('storageKey');
    expect(JSON.stringify(response.body)).not.toContain('fleet-phase3/');
  }
  return detail.body.fleetVehicle.documentSummary as FleetVehicleDocumentSummaryPublic;
};

beforeAll(async () => {
  if (sequelize.getDatabaseName() !== 'unithor_test')
    throw new Error('Only unithor_test is allowed');
  const developer = await User.findOne({ where: { email: 'dev@unithor.local', activo: true } });
  const role = await Role.findOne({ where: { nombre: 'jefe' } });
  if (!developer || !role) throw new Error('Missing baseline fleet test users/roles');
  const reader = await User.create({
    nombre: 'Fleet Phase 3 Reader',
    email: 'fleet-phase3-reader@example.test',
    passwordHash: 'unused-test-password-hash',
    roleId: role.id,
    activo: true,
  });
  readerId = reader.id;
  writerCookies = [
    `access_token=${signAccessToken({ sub: developer.id, role: 'desarrollador' })}`,
    `csrf_token=${CSRF}`,
  ];
  readerCookies = [
    `access_token=${signAccessToken({ sub: reader.id, role: 'jefe' })}`,
    `csrf_token=${CSRF}`,
  ];
});

beforeEach(async () => {
  const response = await post('/api/fleet-vehicles').send({
    patente: `FR3${String(vehicles.length + 1).padStart(3, '0')}`,
  });
  expect(response.status).toBe(201);
  vehicleId = response.body.fleetVehicle.id as number;
  vehicles.push(vehicleId);
});

afterEach(() => vi.clearAllMocks());

afterAll(async () => {
  if (sequelize.getDatabaseName() !== 'unithor_test')
    throw new Error('Only unithor_test is allowed');
  if (vehicles.length) {
    const documents = await FleetDocument.findAll({
      where: { fleetVehicleId: vehicles },
      paranoid: false,
    });
    const ids = documents.map(({ id }) => id);
    if (ids.length) {
      await FleetDocumentVersion.destroy({ where: { fleetDocumentId: ids }, force: true });
      await FleetDocument.destroy({ where: { id: ids }, force: true });
    }
    await FleetVehicle.destroy({ where: { id: vehicles }, force: true });
  }
  if (readerId) await User.destroy({ where: { id: readerId }, force: true });
  remote.files.clear();
});

describe('Fleet required documents in existing API responses', () => {
  it('reports three missing slots without creating records or blocking vehicle saves', async () => {
    const summary = await readSummary();
    expect(summary).toEqual({
      total: 0,
      expired: 0,
      expiringSoon: 0,
      nextExpiry: null,
      required: {
        total: 3,
        registered: 0,
        complete: 0,
        missing: REQUIRED_TYPES,
        missingFiles: [],
        missingExpiryDates: [],
        pending: REQUIRED_TYPES,
      },
    });
    const saved = await request(app)
      .patch(`/api/fleet-vehicles/${vehicleId}`)
      .set('Cookie', writerCookies)
      .set('X-CSRF-Token', CSRF)
      .send({ responsable: 'Encargada' });
    expect(saved.status).toBe(200);
    expect(saved.body.fleetVehicle.documentSummary.required).toEqual(summary.required);
    expect(await FleetDocument.count({ where: { fleetVehicleId: vehicleId } })).toBe(0);
  });

  it('keeps extra insurance and certificates outside the three slots with optional expiry', async () => {
    for (const nombre of ['Seguro complementario', 'Certificado de gases', 'SOAP complementario']) {
      const document = await createDocument({ nombre }, PDF_ONE);
      expect(document).toMatchObject({ fechaVencimiento: null, tieneArchivo: true });
      const updated = await patch(document.id, { notas: 'Sin vencimiento obligatorio' });
      expect(updated.status).toBe(200);
    }
    expect(await readSummary()).toMatchObject({
      total: 3,
      expired: 0,
      expiringSoon: 0,
      nextExpiry: null,
      required: { registered: 0, complete: 0, missing: REQUIRED_TYPES, pending: REQUIRED_TYPES },
    });
  });

  it('matches normalized aliases and reports missing files and dates separately', async () => {
    await createDocument({ nombre: 'PERMISO CIRCULACION' });
    await createDocument({ nombre: 'Seguro obligatorio' }, PDF_ONE);
    await createDocument({
      nombre: 'Certificado de revisión técnica',
      fechaVencimiento: '2099-12-31',
    });
    expect(await readSummary()).toMatchObject({
      total: 3,
      required: {
        total: 3,
        registered: 3,
        complete: 0,
        missing: [],
        missingFiles: ['permiso_circulacion', 'revision_tecnica'],
        missingExpiryDates: ['permiso_circulacion', 'soap'],
        pending: REQUIRED_TYPES,
      },
    });
  });

  it('counts complete slots once while preserving legacy expiry summaries for extras', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    await createDocument(
      { nombre: 'Permiso de circulación', fechaVencimiento: '2099-12-31' },
      PDF_ONE,
    );
    await createDocument(
      { nombre: 'Seguro obligatorio SOAP', fechaVencimiento: '2099-12-31' },
      PDF_ONE,
    );
    await createDocument(
      { nombre: 'Revisión técnica', fechaVencimiento: toFleetDateOnly(soon) },
      PDF_ONE,
    );
    await createDocument({ nombre: 'SOAP', fechaVencimiento: '2099-12-31' }, PDF_ONE);
    const extra = await createDocument({
      nombre: 'Seguro complementario',
      fechaVencimiento: toFleetDateOnly(yesterday),
    });
    expect(await readSummary()).toMatchObject({
      total: 5,
      expired: 1,
      expiringSoon: 1,
      nextExpiry: { documentId: extra.id },
      required: {
        total: 3,
        registered: 3,
        complete: 3,
        missing: [],
        missingFiles: [],
        missingExpiryDates: [],
        pending: [],
      },
    });
  });

  it('does not combine a file and expiry from separate duplicate records into a complete slot', async () => {
    await createDocument({ nombre: 'SOAP' }, PDF_ONE);
    await createDocument({ nombre: 'Seguro obligatorio SOAP', fechaVencimiento: '2099-12-31' });
    expect((await readSummary()).required).toEqual({
      total: 3,
      registered: 1,
      complete: 0,
      missing: ['permiso_circulacion', 'revision_tecnica'],
      missingFiles: [],
      missingExpiryDates: [],
      pending: REQUIRED_TYPES,
    });
  });

  it('removes soft-deleted documents from completeness while keeping committed remote files and history', async () => {
    const document = await createDocument(
      { nombre: 'SOAP', fechaVencimiento: '2099-12-31' },
      PDF_ONE,
    );
    expect((await replace(document.id)).status).toBe(201);
    const files = new Map(remote.files);
    expect((await remove(document.id)).status).toBe(200);
    expect(
      (await FleetDocument.findByPk(document.id, { paranoid: false }))?.deletedAt,
    ).toBeTruthy();
    expect(await FleetDocumentVersion.count({ where: { fleetDocumentId: document.id } })).toBe(1);
    expect((await readSummary()).required).toMatchObject({
      registered: 0,
      complete: 0,
      missing: REQUIRED_TYPES,
    });
    expect((await get(`${documentsPath()}/${document.id}/file`)).status).toBe(404);
    expect(remote.files).toEqual(files);
  });
});

describe('Fleet metadata and version date validation', () => {
  it.each([{ fechaEmision: '2031-01-01' }, { fechaVencimiento: '2029-01-01' }])(
    'rejects a partial metadata range against the stored opposite date: %j',
    async (change) => {
      const document = await createDocument(
        { nombre: 'SOAP', fechaEmision: '2030-01-01', fechaVencimiento: '2030-12-31' },
        PDF_ONE,
      );
      const response = await patch(document.id, change);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('El vencimiento no puede ser anterior a la emisión');
      expect((await FleetDocument.findByPk(document.id))?.fechaEmision).toBe('2030-01-01');
      expect((await FleetDocument.findByPk(document.id))?.fechaVencimiento).toBe('2030-12-31');
      expect(await FleetDocumentVersion.count({ where: { fleetDocumentId: document.id } })).toBe(0);
    },
  );

  it('allows equal dates, explicit date clearing and metadata edits without versions', async () => {
    const document = await createDocument(
      { nombre: 'Seguro complementario', fechaEmision: '2030-01-01' },
      PDF_ONE,
    );
    const equal = await patch(document.id, { fechaVencimiento: '2030-01-01' });
    expect(equal.status).toBe(200);
    const cleared = await patch(document.id, {
      fechaVencimiento: null,
      fechaEmision: '2031-01-01',
      notas: 'Opcional',
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.document).toMatchObject({
      fechaEmision: '2031-01-01',
      fechaVencimiento: null,
      version: 1,
      expiry: { state: 'sin_vencimiento', daysRemaining: null },
    });
    const clearIssue = await patch(document.id, {
      fechaEmision: null,
      fechaVencimiento: '2029-01-01',
    });
    expect(clearIssue.status).toBe(200);
    expect(await FleetDocumentVersion.count({ where: { fleetDocumentId: document.id } })).toBe(0);
  });

  it.each([
    { fechaEmision: '2031-01-01' },
    { fechaVencimiento: '2029-01-01' },
    { fechaEmision: '2031-01-01', fechaVencimiento: '2030-01-01' },
  ])(
    'rolls back an invalid replacement range and only removes its uncommitted upload: %j',
    async (change) => {
      const document = await createDocument(
        { nombre: 'SOAP', fechaEmision: '2030-01-01', fechaVencimiento: '2030-12-31' },
        PDF_ONE,
      );
      const before = (await FleetDocument.findByPk(document.id))!.toJSON();
      const files = new Map(remote.files);
      const response = await replace(document.id, change);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('El vencimiento no puede ser anterior a la emisión');
      expect((await FleetDocument.findByPk(document.id))!.toJSON()).toEqual(before);
      expect(await FleetDocumentVersion.count({ where: { fleetDocumentId: document.id } })).toBe(0);
      expect(remote.files).toEqual(files);
      expect((await get(`${documentsPath()}/${document.id}/file`)).body).toEqual(PDF_ONE);
    },
  );

  it('archives optional-expiry metadata and serves both versions without exposing storage keys', async () => {
    const document = await createDocument(
      { nombre: 'Seguro complementario', referencia: 'ORIGINAL', fechaEmision: '2030-01-01' },
      PDF_ONE,
    );
    const response = await replace(document.id, {
      referencia: 'NUEVA',
      fechaEmision: '2031-01-01',
    });
    expect(response.status).toBe(201);
    expect(response.body.document).toMatchObject({
      version: 2,
      fechaVencimiento: null,
      tieneArchivo: true,
    });
    const history = await get(`${documentsPath()}/${document.id}/versions`);
    expect(history.status).toBe(200);
    expect(history.body.versions).toHaveLength(1);
    expect(history.body.versions[0]).toMatchObject({
      version: 1,
      referencia: 'ORIGINAL',
      fechaEmision: '2030-01-01',
      fechaVencimiento: null,
    });
    const archiveId = history.body.versions[0].id as number;
    expect(
      (await get(`${documentsPath()}/${document.id}/file?versionId=${archiveId}`)).body,
    ).toEqual(PDF_ONE);
    expect((await get(`${documentsPath()}/${document.id}/file`)).body).toEqual(PDF_TWO);
    expect(JSON.stringify([response.body, history.body])).not.toContain('storageKey');
    expect(JSON.stringify([response.body, history.body])).not.toContain('fleet-phase3/');
    const latest = await replace(document.id, { fechaVencimiento: '2031-01-01' });
    expect(latest.status).toBe(201);
    expect(latest.body.document).toMatchObject({
      version: 3,
      fechaEmision: '2031-01-01',
      fechaVencimiento: '2031-01-01',
    });
    expect(
      (await get(`${documentsPath()}/${document.id}/versions`)).body.versions.map(
        (item: { version: number }) => item.version,
      ),
    ).toEqual([2, 1]);
    expect(
      (await get(`${documentsPath()}/${document.id}/file?versionId=${archiveId}`)).body,
    ).toEqual(PDF_ONE);
  });

  it('rolls back the archived row if updating the current document fails after archival', async () => {
    const document = await createDocument(
      { nombre: 'SOAP', fechaVencimiento: '2099-12-31' },
      PDF_ONE,
    );
    const before = (await FleetDocument.findByPk(document.id))!.toJSON();
    const files = new Map(remote.files);
    remote.send.mockClear();
    const update = vi
      .spyOn(FleetDocument.prototype, 'update')
      .mockRejectedValueOnce(new Error('Injected update failure'));
    const response = await replace(document.id);
    update.mockRestore();
    expect(response.status).toBe(500);
    expect((await FleetDocument.findByPk(document.id))!.toJSON()).toEqual(before);
    expect(await FleetDocumentVersion.count({ where: { fleetDocumentId: document.id } })).toBe(0);
    expect(remote.files).toEqual(files);
    expect(
      remote.send.mock.calls.filter(([command]) => command instanceof PutObjectCommand),
    ).toHaveLength(1);
    expect(
      remote.send.mock.calls.filter(([command]) => command instanceof DeleteObjectCommand),
    ).toHaveLength(1);
    expect((await get(`${documentsPath()}/${document.id}/file`)).body).toEqual(PDF_ONE);
  });

  it('keeps committed metadata and history when the replacement storage provider fails', async () => {
    const document = await createDocument({ nombre: 'SOAP' }, PDF_ONE);
    const before = (await FleetDocument.findByPk(document.id))!.toJSON();
    const files = new Map(remote.files);
    remote.send.mockRejectedValueOnce(new Error('R2 unavailable'));
    const response = await replace(document.id);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('STORAGE_UNAVAILABLE');
    expect((await FleetDocument.findByPk(document.id))!.toJSON()).toEqual(before);
    expect(await FleetDocumentVersion.count({ where: { fleetDocumentId: document.id } })).toBe(0);
    expect(remote.files).toEqual(files);
  });

  it('preserves read-only permissions, authentication and CSRF checks for document mutations', async () => {
    const document = await createDocument({ nombre: 'SOAP' }, PDF_ONE);
    expect((await replace(document.id)).status).toBe(201);
    const files = new Map(remote.files);
    const history = await get(`${documentsPath()}/${document.id}/versions`);
    expect(history.status).toBe(200);
    expect(
      (await get(`${documentsPath()}/${document.id}/file?versionId=${history.body.versions[0].id}`))
        .status,
    ).toBe(200);
    expect((await request(app).get(documentsPath())).status).toBe(401);
    expect((await request(app).get(`${documentsPath()}/${document.id}/file`)).status).toBe(401);
    expect((await post(documentsPath(), readerCookies).field('nombre', 'Extra')).status).toBe(403);
    expect((await patch(document.id, { notas: 'No permitido' }, readerCookies)).status).toBe(403);
    expect((await replace(document.id, {}, readerCookies)).status).toBe(403);
    expect((await remove(document.id, readerCookies)).status).toBe(403);
    expect(
      (
        await request(app)
          .patch(`${documentsPath()}/${document.id}`)
          .set('Cookie', writerCookies)
          .send({ notas: 'Sin CSRF' })
      ).status,
    ).toBe(403);
    expect(remote.files).toEqual(files);
    expect((await FleetDocument.findByPk(document.id))?.version).toBe(2);
    expect(await FleetDocumentVersion.count({ where: { fleetDocumentId: document.id } })).toBe(1);
  });
});
