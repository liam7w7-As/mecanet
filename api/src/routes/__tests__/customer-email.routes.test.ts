import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { WORK_ORDER_INSPECTION_PHOTO_SLOTS } from '@unithor/shared';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { env } from '../../config/env.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { CustomerEmail } from '../../models/CustomerEmail.js';
import { Quotation } from '../../models/Quotation.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import {
  generateOfficialWorkOrderEmailPdf,
  generateQuotationEmailPdf,
} from '../../services/customer-document-pdf.service.js';
import { enqueueCustomerEmail } from '../../services/customer-email-queue.service.js';
import { processCustomerEmailQueue } from '../../services/customer-email-worker.service.js';
import { saveInspectionPhoto } from '../../services/work-order-inspection-photo.service.js';
import { hashPassword } from '../../utils/password.js';

const smtp = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn() }));
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: smtp.send, verify: smtp.verify, close: vi.fn() }),
  },
}));
const password = 'EmailTests2026!';

describe('Customer email outbox and SMTP workflow', () => {
  let admin: User;
  let seller: User;
  let mechanic: User;
  let client: Client;
  let contact: Client;
  let vehicle: Vehicle;
  const cookies: string[][] = [];
  const userIds: number[] = [];
  const orderIds: number[] = [];
  const quotationIds: number[] = [];
  const originalEnabled = env.MAIL_ENABLED;
  const originalUser = env.SMTP_USER;
  const originalFrom = env.MAIL_FROM_ADDRESS;
  const get = (path: string, user = 0) => request(app).get(path).set('Cookie', cookies[user]);
  const post = (path: string, body: object, user = 0) =>
    request(app)
      .post(path)
      .set('Cookie', cookies[user])
      .set(
        'X-CSRF-Token',
        cookies[user].find((value) => value.startsWith('csrf_token='))!.slice(11),
      )
      .send(body);

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test')
      throw new Error('Tests require unithor_test');
    const hash = await hashPassword(password);
    for (const name of ['desarrollador', 'vendedor', 'mecanico']) {
      const role = await Role.findOne({ where: { nombre: name } });
      if (!role) throw new Error('Missing role');
      const user = await User.create({
        nombre: 'Email ' + name,
        email: 'smtp-' + name + '@example.com',
        roleId: role.id,
        passwordHash: hash,
        activo: true,
      });
      userIds.push(user.id);
      if (name === 'desarrollador') admin = user;
      else if (name === 'vendedor') seller = user;
      else mechanic = user;
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password });
      expect(response.status).toBe(200);
      const header: unknown = response.headers['set-cookie'];
      cookies.push(
        (Array.isArray(header) ? (header as string[]) : []).map((value) => value.split(';')[0]),
      );
    }
    client = await Client.create({
      nombre: 'Cliente SMTP',
      tipo: 'cliente',
      email: 'customer@example.com',
    });
    contact = await Client.create({
      nombre: 'Contacto recepción',
      tipo: 'cliente',
      email: 'contact@example.com',
      telefono: '912345678',
    });
    vehicle = await Vehicle.create({
      patente: 'SMTP26',
      clientId: client.id,
      marca: 'Toyota',
      modelo: 'Hilux',
      ano: 2022,
    });
  });
  beforeEach(async () => {
    await CustomerEmail.destroy({ where: {} });
    env.MAIL_ENABLED = true;
    env.SMTP_USER = 'sender@example.com';
    env.MAIL_FROM_ADDRESS = 'sender@example.com';
    smtp.send
      .mockReset()
      .mockResolvedValue({ accepted: ['customer@example.com'], rejected: [], messageId: 'test' });
  });
  afterAll(async () => {
    env.MAIL_ENABLED = originalEnabled;
    env.SMTP_USER = originalUser;
    env.MAIL_FROM_ADDRESS = originalFrom;
    await CustomerEmail.destroy({ where: {} });
    if (orderIds.length) {
      const linked = await Quotation.findAll({ where: { workOrderId: orderIds }, paranoid: false });
      quotationIds.push(...linked.map((item) => item.id));
    }
    if (quotationIds.length) await Quotation.destroy({ where: { id: quotationIds }, force: true });
    if (orderIds.length) await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    if (contact) await contact.destroy({ force: true });
    if (userIds.length) await User.destroy({ where: { id: userIds }, force: true });
  });

  const createQuotation = async () => {
    const result = await post('/api/quotations', {
      clientId: client.id,
      items: [
        {
          descripcion: 'Servicio de prueba',
          cantidad: 2,
          precioUnitario: 12000,
          descuentoTipo: 'porcentaje',
          descuentoValor: 10,
        },
      ],
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    quotationIds.push(Number(result.body.quotation.id));
    return Number(result.body.quotation.id);
  };
  const createOrder = async (extra: object = {}) => {
    const result = await post('/api/work-orders', {
      clientId: client.id,
      contactClientId: contact.id,
      billingClientId: client.id,
      vehicleId: vehicle.id,
      items: [{ descripcion: 'Revisión motor', cantidad: 1, precioUnitario: 15000 }],
      ...extra,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    orderIds.push(Number(result.body.workOrder.id));
    return Number(result.body.workOrder.id);
  };

  it('requires authentication, CSRF and ownership; mechanics cannot resend financial documents', async () => {
    const id = await createOrder();
    const path = '/api/customer-emails/work-orders/' + id;
    expect((await request(app).get(path)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(path + '/send')
          .set('Cookie', cookies[0])
          .send({ requestId: randomUUID() })
      ).status,
    ).toBe(403);
    expect((await get(path, 1)).status).toBe(404);
    await WorkOrder.update({ assignedMechanicId: mechanic.id }, { where: { id } });
    expect((await get(path, 2)).status).toBe(403);
    const cot = await createQuotation();
    expect((await get('/api/customer-emails/quotations/' + cot, 1)).status).toBe(404);
    expect(seller.id).not.toBe(admin.id);
  });

  it('automatically enqueues an independent quote and sends its PDF without frontend action', async () => {
    const id = await createQuotation();
    const queued = await CustomerEmail.findOne({ where: { kind: 'quotation', entityId: id } });
    expect(queued?.status).toBe('pending');
    expect(await processCustomerEmailQueue()).toBe(1);
    const mail = smtp.send.mock.calls[0][0];
    expect(mail.to).toBe(client.email);
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(mail.attachments[0].content);
    expect(pdf.getTitle()).toMatch(/^Cotización COT-/);
    await queued!.reload();
    expect(queued!.status).toBe('sent');
    expect(queued!.acceptedAt).toBeInstanceOf(Date);
  });

  it('enqueues one OT message with OT and mirror COT PDFs, addressed to the reception contact', async () => {
    const id = await createOrder();
    expect(await CustomerEmail.count()).toBe(1);
    expect(await processCustomerEmailQueue()).toBe(1);
    const mail = smtp.send.mock.calls[0][0];
    expect(mail.to).toBe(contact.email);
    expect(mail.attachments.map((file: { filename: string }) => file.filename)).toEqual([
      expect.stringMatching(/^OT-/),
      expect.stringMatching(/^COT-/),
    ]);
    const pdf = await PDFDocument.load(mail.attachments[0].content);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toMatch(/^Orden de trabajo/);
    expect((await get('/api/customer-emails/work-orders/' + id)).body.history[0].status).toBe(
      'sent',
    );
  });

  it('waits for all initially selected photos and then sends automatically', async () => {
    const id = await createOrder({ emailPhotoSlots: ['frontal', 'trasera'] });
    expect(await processCustomerEmailQueue()).toBe(0);
    expect(smtp.send).not.toHaveBeenCalled();
    const photoBytes = await sharp({
      create: { width: 200, height: 320, channels: 3, background: '#0E2B4E' },
    })
      .png()
      .toBuffer();
    const file = {
      buffer: photoBytes,
      mimetype: 'image/png',
      size: photoBytes.length,
    } as Express.Multer.File;
    await saveInspectionPhoto(id, 'frontal', file, admin.id);
    await CustomerEmail.update(
      { nextAttemptAt: new Date(0) },
      { where: { entityId: id, kind: 'work_order' } },
    );
    expect(await processCustomerEmailQueue()).toBe(0);
    await saveInspectionPhoto(id, 'trasera', file, admin.id);
    await CustomerEmail.update(
      { nextAttemptAt: new Date(0) },
      { where: { entityId: id, kind: 'work_order' } },
    );
    expect(await processCustomerEmailQueue()).toBe(1);
    expect(smtp.send).toHaveBeenCalledTimes(1);
  });

  it('does not send when disabled or silently send old disabled jobs after activation', async () => {
    env.MAIL_ENABLED = false;
    const id = await createQuotation();
    expect(
      (await CustomerEmail.findOne({ where: { entityId: id, kind: 'quotation' } }))?.status,
    ).toBe('disabled');
    env.MAIL_ENABLED = true;
    expect(await processCustomerEmailQueue()).toBe(0);
    expect(smtp.send).not.toHaveBeenCalled();
  });

  it('preserves the document when no email exists and exposes an actionable status', async () => {
    await contact.update({ email: null });
    const id = await createOrder();
    expect(await WorkOrder.findByPk(id)).not.toBeNull();
    const overview = await get('/api/customer-emails/work-orders/' + id);
    expect(overview.body.recipient).toBeNull();
    expect(overview.body.history[0].status).toBe('missing_recipient');
    expect(
      (await post('/api/customer-emails/work-orders/' + id + '/send', { requestId: randomUUID() }))
        .status,
    ).toBe(400);
    await contact.update({ email: 'contact@example.com' });
    expect(
      (await post('/api/customer-emails/work-orders/' + id + '/send', { requestId: randomUUID() }))
        .status,
    ).toBe(202);
    expect(await processCustomerEmailQueue()).toBe(1);
  });

  it('retains failed jobs with backoff and reuses the stable message ID on retry', async () => {
    const id = await createQuotation();
    smtp.send.mockRejectedValueOnce(
      Object.assign(new Error('secret SMTP transcript'), { code: 'EAUTH' }),
    );
    expect(await processCustomerEmailQueue()).toBe(0);
    const job = (await CustomerEmail.findOne({ where: { kind: 'quotation', entityId: id } }))!;
    expect(job.status).toBe('failed');
    expect(job.lastError).toBe('EAUTH');
    expect(job.attempts).toBe(1);
    expect(await processCustomerEmailQueue()).toBe(0);
    await job.update({ nextAttemptAt: new Date(0) });
    expect(await processCustomerEmailQueue()).toBe(1);
    expect(smtp.send.mock.calls[0][0].messageId).toBe(smtp.send.mock.calls[1][0].messageId);
    expect(await Quotation.findByPk(id)).not.toBeNull();
  });

  it('claims a pending job once across concurrent workers and manual duplicate requests', async () => {
    const id = await createQuotation();
    const path = '/api/customer-emails/quotations/' + id + '/send';
    const requestId = randomUUID();
    const replies = await Promise.all([post(path, { requestId }), post(path, { requestId })]);
    expect(replies.map((reply) => reply.status)).toEqual([202, 202]);
    expect(await CustomerEmail.count()).toBe(1);
    await Promise.all([processCustomerEmailQueue(), processCustomerEmailQueue()]);
    expect(smtp.send).toHaveBeenCalledTimes(1);
    const resendId = randomUUID();
    await post(path, { requestId: resendId });
    await post(path, { requestId: resendId });
    expect(await CustomerEmail.count()).toBe(2);
  });

  it('rolls back email enqueue when the business transaction rolls back', async () => {
    const id = await createQuotation();
    await CustomerEmail.destroy({ where: {} });
    await expect(
      sequelize.transaction(async (transaction) => {
        await enqueueCustomerEmail(
          { kind: 'quotation', entityId: id, userId: admin.id, dedupeKey: 'rollback-test' },
          transaction,
        );
        throw new Error('Simulated failure');
      }),
    ).rejects.toThrow('Simulated failure');
    expect(await CustomerEmail.count()).toBe(0);
  });

  it('converts a quote without resending its COT, and sends only the new OT', async () => {
    const id = await createQuotation();
    await CustomerEmail.destroy({ where: {} });
    const result = await post('/api/quotations/' + id + '/convert-to-ot', {
      clientId: client.id,
      contactClientId: contact.id,
      vehicleId: vehicle.id,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    orderIds.push(Number(result.body.workOrder.id));
    expect(await CustomerEmail.count()).toBe(1);
    expect(await processCustomerEmailQueue()).toBe(1);
    expect(smtp.send.mock.calls[0][0].attachments).toHaveLength(1);
  });

  it('sends customer-safe progress when a service is completed, without prices or internal notes', async () => {
    const id = await createOrder();
    await CustomerEmail.destroy({ where: {} });
    const item = (await WorkOrderItem.findOne({ where: { workOrderId: id } }))!;
    const result = await request(app)
      .patch('/api/work-orders/' + id + '/execution')
      .set('Cookie', cookies[0])
      .set('X-CSRF-Token', cookies[0].find((value) => value.startsWith('csrf_token='))!.slice(11))
      .send({
        items: [
          {
            id: item.id,
            estadoOperativo: 'completado',
            notasOperativas: 'INTERNO: costo 12345 proveedor',
          },
        ],
      });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const job = (await CustomerEmail.findOne({ where: { kind: 'work_order', entityId: id } }))!;
    expect(job.category).toBe('progress');
    expect(job.payload.message).toContain('Revisión motor');
    expect(job.payload.message).not.toContain('INTERNO');
    expect(job.payload.message).not.toContain('12345');
    expect(await processCustomerEmailQueue()).toBe(1);
    expect(smtp.send.mock.calls[0][0].attachments).toHaveLength(0);
  });

  it('recovers an interrupted sending job after restart', async () => {
    const id = await createQuotation();
    await CustomerEmail.update(
      {
        status: 'sending',
        lockedAt: new Date(Date.now() - 6 * 60000),
        lockToken: randomUUID(),
        attempts: 1,
      },
      { where: { entityId: id, kind: 'quotation' } },
    );
    expect(await processCustomerEmailQueue()).toBe(1);
    expect(smtp.send).toHaveBeenCalledTimes(1);
  });

  it('preserves the two-sided official OT and all nine mixed-orientation photos', async () => {
    const id = await createOrder({
      items: Array.from({ length: 12 }, (_, i) => ({
        descripcion: 'Servicio preventivo número ' + (i + 1),
        cantidad: 1,
        precioUnitario: 12500,
      })),
      inspection: {
        nivelCombustible: 'medio',
        inventario: ['radio', 'rueda_repuesto'],
        observaciones: 'Recepción documentada con fotos verticales y horizontales.',
      },
    });
    for (const [index, slot] of WORK_ORDER_INSPECTION_PHOTO_SLOTS.entries()) {
      const dimensions = index % 2 ? { width: 500, height: 200 } : { width: 200, height: 450 };
      const image = await sharp({
        create: { ...dimensions, channels: 3, background: index % 2 ? '#FFD600' : '#0E2B4E' },
      })
        .png()
        .toBuffer();
      await saveInspectionPhoto(
        id,
        slot,
        { buffer: image, mimetype: 'image/png', size: image.length } as Express.Multer.File,
        admin.id,
      );
    }
    const quotation = (await Quotation.findOne({ where: { workOrderId: id } }))!;
    await quotation.update({
      notas: 'Garantía y condiciones comerciales del presupuesto.',
      disponibilidadTrabajo: 'Disponibilidad en 48 horas',
      validezDias: 5,
    });
    const [ot, cot] = await Promise.all([
      generateOfficialWorkOrderEmailPdf(id),
      generateQuotationEmailPdf(quotation.id),
    ]);
    expect((await PDFDocument.load(ot)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(cot)).getPageCount()).toBeGreaterThanOrEqual(2);
    if (process.env.PDF_QA === '1') {
      const directory = path.resolve(process.cwd(), '../tmp/pdfs');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'smtp-ot.pdf'), ot);
      await writeFile(path.join(directory, 'smtp-cot.pdf'), cot);
    }
  });

  it('does not email soft-deleted records', async () => {
    const id = await createQuotation();
    await Quotation.destroy({ where: { id } });
    expect(await processCustomerEmailQueue()).toBe(0);
    expect(smtp.send).not.toHaveBeenCalled();
    expect(
      (await CustomerEmail.findOne({ where: { kind: 'quotation', entityId: id } }))?.status,
    ).toBe('cancelled');
  });
});
