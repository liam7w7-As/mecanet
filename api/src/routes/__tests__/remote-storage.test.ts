import { PutObjectCommand } from '@aws-sdk/client-s3';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { CompanySettings } from '../../models/CompanySettings.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderInspectionPhoto } from '../../models/WorkOrderInspectionPhoto.js';
import * as notificationService from '../../services/notification.service.js';
import { hashPassword } from '../../utils/password.js';

const remote = vi.hoisted(() => ({ files: new Map<string, Buffer>(), send: vi.fn() }));
vi.mock('../../config/env.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../config/env.js')>();
  return {
    env: {
      ...original.env,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
      S3_BUCKET: 'private-test',
      S3_ACCESS_KEY_ID: 'test-key',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_PREFIX: 'unithor',
    },
  };
});
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  remote.send.mockImplementation(
    async (command: { input: { Key?: string; Body?: Buffer; CopySource?: string } }) => {
      const key = command.input.Key ?? '';
      if (command instanceof sdk.PutObjectCommand)
        remote.files.set(key, Buffer.from(command.input.Body ?? []));
      if (command instanceof sdk.GetObjectCommand) {
        const bytes = remote.files.get(key);
        if (!bytes) throw Object.assign(new Error(), { name: 'NoSuchKey' });
        return { Body: { transformToByteArray: async () => bytes } };
      }
      if (command instanceof sdk.CopyObjectCommand) {
        const source =
          command.input.CopySource?.split('/').slice(1).map(decodeURIComponent).join('/') ?? '';
        const bytes = remote.files.get(source);
        if (!bytes) throw Object.assign(new Error(), { name: 'NoSuchKey' });
        remote.files.set(key, Buffer.from(bytes));
      }
      if (command instanceof sdk.DeleteObjectCommand) remote.files.delete(key);
      return {};
    },
  );
  return {
    ...sdk,
    S3Client: class {
      send = remote.send;
    },
  };
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const PASSWORD = 'RemoteStorage2026!';

describe('Private remote storage through existing HTTP endpoints', () => {
  let cookies: string[];
  let csrf: string;
  let userId: number;
  let clientId: number;
  let vehicleId: number;
  let orderId: number;
  let quotationId: number;
  let logoSnapshot: Partial<CompanySettings>;
  const uploadPhoto = () =>
    request(app)
      .post(`/api/work-orders/${orderId}/inspection/photos/frontal`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .attach('photo', PNG, { filename: 'front.png', contentType: 'image/png' });
  const uploadReceipt = (amount: string) =>
    request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .field('quotationId', String(quotationId))
      .field('monto', amount)
      .field('metodo', 'transferencia')
      .field('bancoOrigen', 'BCI')
      .field('numeroTransaccion', 'REMOTE-123')
      .attach('comprobantePago', PNG, { filename: 'receipt.png', contentType: 'image/png' });

  beforeAll(async () => {
    const developer = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!developer) throw new Error('Falta usuario de prueba');
    userId = developer.id;
    await developer.update({ passwordHash: await hashPassword(PASSWORD), activo: true });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'dev', password: PASSWORD });
    expect(login.status).toBe(200);
    const header: unknown = login.headers['set-cookie'];
    cookies = (Array.isArray(header) ? (header as string[]) : []).map(
      (cookie) => cookie.split(';')[0],
    );
    csrf =
      cookies.find((cookie) => cookie.startsWith('csrf_token='))?.slice('csrf_token='.length) ?? '';
    const client = await Client.create({ nombre: 'Remote Storage Client', tipo: 'cliente' });
    clientId = client.id;
    const vehicle = await Vehicle.create({ patente: 'RMT921', clientId });
    vehicleId = vehicle.id;
    const order = await WorkOrder.create({
      codigo: 'OT-STORAGE-1',
      clientId,
      vehicleId,
      estado: 'en_progreso',
      createdBy: userId,
    });
    orderId = order.id;
    const quotation = await Quotation.create({
      codigo: 'COT-STORAGE-1',
      workOrderId: orderId,
      clientId,
      vehicleId,
      subtotal: 10000,
      total: 10000,
      pagado: 0,
    });
    quotationId = quotation.id;
    const settings = await CompanySettings.findByPk(1);
    logoSnapshot = {
      logoStorageKey: settings?.logoStorageKey,
      logoMimeType: settings?.logoMimeType,
      logoSizeBytes: settings?.logoSizeBytes,
      logoUpdatedAt: settings?.logoUpdatedAt,
      updatedBy: settings?.updatedBy,
    };
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await CompanySettings.update(logoSnapshot, { where: { id: 1 } });
    await Payment.destroy({ where: { quotationId } });
    await Quotation.destroy({ where: { id: quotationId }, force: true });
    await WorkOrder.destroy({ where: { id: orderId }, force: true });
    await Vehicle.destroy({ where: { id: vehicleId }, force: true });
    await Client.destroy({ where: { id: clientId }, force: true });
    await RefreshToken.destroy({ where: { userId }, force: true });
  });

  it('keeps operational images authenticated and mutation endpoints CSRF protected', async () => {
    expect(
      (await request(app).get(`/api/work-orders/${orderId}/inspection/photos/frontal`)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/work-orders/${orderId}/inspection/photos/frontal`)
          .set('Cookie', cookies)
          .attach('photo', PNG, { filename: 'front.png', contentType: 'image/png' })
      ).status,
    ).toBe(403);
    expect(remote.files.size).toBe(0);
  });

  it('stores inspection bytes remotely and serves them from both OT and COT URLs', async () => {
    const uploaded = await uploadPhoto();
    expect(uploaded.status).toBe(201);
    expect(remote.files.size).toBe(1);
    expect(remote.send.mock.calls.some(([command]) => command instanceof PutObjectCommand)).toBe(
      true,
    );
    for (const url of [
      `/api/work-orders/${orderId}/inspection/photos/frontal`,
      `/api/quotations/${quotationId}/inspection/photos/frontal`,
    ]) {
      const file = await request(app).get(url).set('Cookie', cookies);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('image/png');
      expect(file.body).toEqual(PNG);
    }
  });

  it('does not update the database if the remote upload fails', async () => {
    const previous = await WorkOrderInspectionPhoto.findOne();
    remote.send.mockRejectedValueOnce(new Error('Remote unavailable'));
    const response = await uploadPhoto();
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('STORAGE_UNAVAILABLE');
    expect((await WorkOrderInspectionPhoto.findByPk(previous?.id))?.storageKey).toBe(
      previous?.storageKey,
    );
  });

  it('retains replaced photos without changing their public URL', async () => {
    expect((await uploadPhoto()).status).toBe(201);
    expect([...remote.files.keys()].some((key) => key.startsWith('unithor/_retained/'))).toBe(true);
    expect(
      (
        await request(app)
          .get(`/api/work-orders/${orderId}/inspection/photos/frontal`)
          .set('Cookie', cookies)
      ).body,
    ).toEqual(PNG);
  });

  it('distinguishes a missing photo (404) from an unavailable provider (503)', async () => {
    const photo = await WorkOrderInspectionPhoto.findOne();
    if (!photo) throw new Error('Falta foto');
    remote.files.delete(`unithor/${photo.storageKey}`);
    expect(
      (
        await request(app)
          .get(`/api/work-orders/${orderId}/inspection/photos/frontal`)
          .set('Cookie', cookies)
      ).status,
    ).toBe(404);
    remote.send.mockRejectedValueOnce(
      Object.assign(new Error('Credentials'), { name: 'AccessDenied' }),
    );
    expect(
      (
        await request(app)
          .get(`/api/work-orders/${orderId}/inspection/photos/frontal`)
          .set('Cookie', cookies)
      ).status,
    ).toBe(503);
    remote.files.set(`unithor/${photo.storageKey}`, PNG);
  });

  it('rolls back an invalid payment and discards its uncommitted upload', async () => {
    const size = remote.files.size;
    expect((await uploadReceipt('20000')).status).toBe(400);
    expect(await Payment.count({ where: { quotationId } })).toBe(0);
    expect(remote.files.size).toBe(size);
  });

  it('keeps a committed receipt even if a subsequent notification fails', async () => {
    const notify = vi
      .spyOn(notificationService, 'notifyByType')
      .mockRejectedValueOnce(new Error('Notification failed'));
    const result = await uploadReceipt('1000');
    expect(result.status).toBe(500);
    const payment = await Payment.findOne({ where: { quotationId } });
    expect(payment?.comprobantePago).toBeTruthy();
    const receipt = await request(app)
      .get(`/api/payments/${payment?.id}/receipt`)
      .set('Cookie', cookies);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toEqual(PNG);
    notify.mockRestore();
  });

  it('preserves the public branding endpoint while storing its logo privately', async () => {
    const response = await request(app)
      .post('/api/settings/company/logo')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(response.status).toBe(200);
    expect(response.body.logo.logoUrl).toBe('/api/settings/company/logo');
    const logo = await request(app).get('/api/settings/company/logo');
    expect(logo.status).toBe(200);
    expect(logo.body).toEqual(PNG);
  });
});
