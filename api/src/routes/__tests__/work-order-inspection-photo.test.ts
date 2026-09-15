import { rm } from 'node:fs/promises';
import path from 'node:path';

import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { env } from '../../config/env.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderInspectionPhoto } from '../../models/WorkOrderInspectionPhoto.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL = 'phase842-client@unithor.local';
const TEST_PLATE = 'P84201';
const TEST_YEAR = new Date().getFullYear();
const TEST_CODE_PREFIX = `OT-${TEST_YEAR}-842`;
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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
    if (separatorIndex > 0) {
      cookies[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
    }
    return cookies;
  }, {});
};

const binaryParser = (
  res: SuperAgentResponse,
  callback: (error: Error | null, body: unknown) => void,
): void => {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

describe('Work Order Inspection Photos Routes (E2E)', () => {
  let devUserId: number;
  let clientId: number;
  let vehicleId: number;
  let editableWorkOrderId: number;
  let closedWorkOrderId: number;
  let cookies: LoginCookies;

  beforeAll(async () => {
    await sequelize.authenticate();

    const existingOrders = await WorkOrder.findAll({
      where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
      paranoid: false,
    });
    await WorkOrder.destroy({
      where: { id: existingOrders.map((workOrder) => workOrder.id) },
      force: true,
    });
    await Vehicle.destroy({ where: { patente: TEST_PLATE }, force: true });
    await Client.destroy({ where: { email: TEST_EMAIL }, force: true });

    const devUser = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!devUser) {
      throw new Error('No se encontró el usuario desarrollador para la prueba de fotos');
    }
    await devUser.update({ passwordHash: await hashPassword(TEST_PASSWORD), activo: true });
    devUserId = devUser.id;

    const client = await Client.create({
      nombre: 'Cliente Fotos Inspección',
      tipo: 'cliente',
      email: TEST_EMAIL,
    });
    clientId = client.id;
    const vehicle = await Vehicle.create({
      patente: TEST_PLATE,
      marca: 'Toyota',
      modelo: 'Yaris',
      clientId,
    });
    vehicleId = vehicle.id;

    const [editableOrder, closedOrder] = await Promise.all([
      WorkOrder.create({
        codigo: `${TEST_CODE_PREFIX}1`,
        clientId,
        vehicleId,
        estado: 'borrador',
        createdBy: devUserId,
      }),
      WorkOrder.create({
        codigo: `${TEST_CODE_PREFIX}2`,
        clientId,
        vehicleId,
        estado: 'entregada',
        createdBy: devUserId,
      }),
    ]);
    editableWorkOrderId = editableOrder.id;
    closedWorkOrderId = closedOrder.id;

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'dev', password: TEST_PASSWORD });
    expect(loginResponse.status).toBe(200);
    const loginCookies = extractCookies(loginResponse);
    cookies = {
      accessToken: loginCookies.access_token,
      csrfToken: loginCookies.csrf_token,
    };
  });

  afterAll(async () => {
    await WorkOrder.destroy({
      where: { id: [editableWorkOrderId, closedWorkOrderId] },
      force: true,
    });
    await Vehicle.destroy({ where: { id: vehicleId }, force: true });
    await Client.destroy({ where: { id: clientId }, force: true });
    await RefreshToken.destroy({ where: { userId: devUserId }, force: true });

    const photoRoot = path.resolve(env.UPLOAD_DIR, 'work-orders');
    await rm(path.join(photoRoot, String(editableWorkOrderId)), { recursive: true, force: true });
    await rm(path.join(photoRoot, String(closedWorkOrderId)), { recursive: true, force: true });
  });

  it('requiere autenticación para leer una foto', async () => {
    const response = await request(app).get(
      `/api/work-orders/${editableWorkOrderId}/inspection/photos/frontal`,
    );
    expect(response.status).toBe(401);
  });

  it('sube, lista, sirve, reemplaza y elimina una foto por ranura', async () => {
    const uploadResponse = await request(app)
      .post(`/api/work-orders/${editableWorkOrderId}/inspection/photos/frontal`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('photo', PNG_BYTES, { filename: 'frontal.png', contentType: 'image/png' });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.photo).toMatchObject({
      slot: 'frontal',
      mimeType: 'image/png',
      sizeBytes: PNG_BYTES.length,
      uploadedBy: devUserId,
      url: `/api/work-orders/${editableWorkOrderId}/inspection/photos/frontal`,
    });

    const detailResponse = await request(app)
      .get(`/api/work-orders/${editableWorkOrderId}`)
      .set('Cookie', authCookie(cookies));
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.workOrder.inspection.photos).toEqual([
      expect.objectContaining({ slot: 'frontal', mimeType: 'image/png' }),
    ]);

    const downloadResponse = await request(app)
      .get(`/api/work-orders/${editableWorkOrderId}/inspection/photos/frontal`)
      .set('Cookie', authCookie(cookies))
      .buffer(true)
      .parse(binaryParser);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers['content-type']).toContain('image/png');
    expect(downloadResponse.body).toEqual(PNG_BYTES);

    const firstStoredPhoto = await WorkOrderInspectionPhoto.findByPk(
      uploadResponse.body.photo.id as number,
    );
    const firstStorageKey = firstStoredPhoto?.storageKey;

    const replacementResponse = await request(app)
      .post(`/api/work-orders/${editableWorkOrderId}/inspection/photos/frontal`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('photo', PNG_BYTES, { filename: 'reemplazo.png', contentType: 'image/png' });
    expect(replacementResponse.status).toBe(201);

    const storedPhotos = await WorkOrderInspectionPhoto.findAll();
    expect(storedPhotos).toHaveLength(1);
    expect(storedPhotos[0].storageKey).not.toBe(firstStorageKey);

    const deleteResponse = await request(app)
      .delete(`/api/work-orders/${editableWorkOrderId}/inspection/photos/frontal`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken);
    expect(deleteResponse.status).toBe(204);
    expect(await WorkOrderInspectionPhoto.count()).toBe(0);

    const missingResponse = await request(app)
      .get(`/api/work-orders/${editableWorkOrderId}/inspection/photos/frontal`)
      .set('Cookie', authCookie(cookies));
    expect(missingResponse.status).toBe(404);
  });

  it('rechaza archivos falsos y ranuras no definidas', async () => {
    const fakeImageResponse = await request(app)
      .post(`/api/work-orders/${editableWorkOrderId}/inspection/photos/interior`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach(
        'photo',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        {
          filename: 'falsa.png',
          contentType: 'image/png',
        },
      );
    expect(fakeImageResponse.status).toBe(400);
    expect(fakeImageResponse.body.error.message).toBe(
      'El contenido del archivo no corresponde a una imagen válida',
    );

    const invalidSlotResponse = await request(app)
      .post(`/api/work-orders/${editableWorkOrderId}/inspection/photos/techo`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('photo', PNG_BYTES, { filename: 'techo.png', contentType: 'image/png' });
    expect(invalidSlotResponse.status).toBe(400);
  });

  it('bloquea cambios de fotos en órdenes entregadas', async () => {
    const response = await request(app)
      .post(`/api/work-orders/${closedWorkOrderId}/inspection/photos/frontal`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .attach('photo', PNG_BYTES, { filename: 'cerrada.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'No se puede modificar la inspección de una orden cerrada',
    );
  });
});
