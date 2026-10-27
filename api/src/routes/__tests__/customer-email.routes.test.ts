import { randomUUID } from 'node:crypto';

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
import { getEmailPreparation } from '../../services/customer-document-preparation.service.js';
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

  type Bundle = Awaited<ReturnType<typeof getEmailPreparation>>;
  const pdfBytes = async (filename: string, pages: number) => {
    const pdf = await PDFDocument.create();
    for (let page = 0; page < pages; page += 1)
      pdf.addPage([612, 792]).drawText('Official fixture ' + filename + ' page ' + (page + 1));
    return Buffer.from(await pdf.save());
  };
  const upload = async (bundle: Bundle, buffers?: Buffer[]) => {
    let pending = request(app)
      .post('/api/customer-emails/preparation/' + bundle.id)
      .set('Cookie', cookies[0])
      .set('X-CSRF-Token', cookies[0].find((value) => value.startsWith('csrf_token='))!.slice(11))
      .field('revision', bundle.revision);
    for (const [index, document] of bundle.documents.entries()) {
      const bytes =
        buffers?.[index] ??
        (await pdfBytes(document.filename, document.type === 'work-order' ? 2 : 1));
      pending = pending.attach('documents', bytes, {
        filename: document.filename,
        contentType: 'application/pdf',
      });
    }
    return pending;
  };
  const prepare = async (id: number) => {
    const response = await get('/api/customer-emails/preparation/' + id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const bundle = response.body as Bundle;
    const buffers = await Promise.all(
      bundle.documents.map((document) =>
        pdfBytes(document.filename, document.type === 'work-order' ? 2 : 1),
      ),
    );
    const result = await upload(bundle, buffers);
    expect(result.status, JSON.stringify(result.body)).toBe(202);
    return { bundle, buffers };
  };
  const jobFor = async (kind: 'quotation' | 'work_order', entityId: number) => {
    const job = await CustomerEmail.findOne({ where: { kind, entityId }, order: [['id', 'DESC']] });
    if (!job) throw new Error('Missing job');
    return job;
  };

  it('requires authentication, CSRF and ownership; mechanics cannot prepare or resend documents', async () => {
    const id = await createOrder();
    const job = await jobFor('work_order', id);
    const route = '/api/customer-emails/preparation/' + job.id;
    expect((await request(app).get(route)).status).toBe(401);
    expect((await request(app).post(route).set('Cookie', cookies[0])).status).toBe(403);
    expect((await get(route, 1)).status).toBe(404);
    await WorkOrder.update({ assignedMechanicId: mechanic.id }, { where: { id } });
    expect((await get(route, 2)).status).toBe(403);
    const quotationId = await createQuotation();
    expect(
      (
        await get(
          '/api/customer-emails/preparation/' + (await jobFor('quotation', quotationId)).id,
          1,
        )
      ).status,
    ).toBe(404);
    expect(seller.id).not.toBe(admin.id);
  });

  it('returns from saving before PDF/SMTP work, then emails exactly the approved uploaded bytes', async () => {
    const id = await createQuotation();
    const job = await jobFor('quotation', id);
    expect(job.status).toBe('waiting_documents');
    expect(await processCustomerEmailQueue()).toBe(0);
    expect(smtp.send).not.toHaveBeenCalled();
    const { buffers } = await prepare(job.id);
    expect(await processCustomerEmailQueue()).toBe(1);
    const mail = smtp.send.mock.calls[0][0];
    expect(mail.to).toBe(client.email);
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].content.equals(buffers[0])).toBe(true);
    await job.reload();
    expect(job.status).toBe('sent');
    expect(job.acceptedAt).toBeInstanceOf(Date);
  });

  it('sends the approved OT and its mirror COT in one message to the designated contact', async () => {
    const id = await createOrder();
    expect(await CustomerEmail.count()).toBe(1);
    const { bundle, buffers } = await prepare((await jobFor('work_order', id)).id);
    expect(bundle.documents.map((document) => document.type)).toEqual(['work-order', 'quotation']);
    expect(await processCustomerEmailQueue()).toBe(1);
    const mail = smtp.send.mock.calls[0][0];
    expect(mail.to).toBe(contact.email);
    expect(mail.attachments).toHaveLength(2);
    for (const [index, file] of buffers.entries())
      expect(mail.attachments[index].content.equals(file)).toBe(true);
    expect((await PDFDocument.load(mail.attachments[0].content)).getPageCount()).toBe(2);
  });

  it('waits for every initially selected photo before preparing either official document', async () => {
    const id = await createOrder({ emailPhotoSlots: ['frontal', 'trasera'] });
    const job = await jobFor('work_order', id);
    expect(job.status).toBe('waiting_photos');
    expect((await get('/api/customer-emails/preparation/' + job.id)).status).toBe(409);
    const bytes = await sharp({
      create: { width: 200, height: 320, channels: 3, background: '#0E2B4E' },
    })
      .png()
      .toBuffer();
    const file = {
      buffer: bytes,
      mimetype: 'image/png',
      size: bytes.length,
    } as Express.Multer.File;
    await saveInspectionPhoto(id, 'frontal', file, admin.id);
    expect((await get('/api/customer-emails/preparation/' + job.id)).status).toBe(409);
    expect(await processCustomerEmailQueue()).toBe(0);
    await saveInspectionPhoto(id, 'trasera', file, admin.id);
    const { bundle } = await prepare(job.id);
    const ot = bundle.documents.find((document) => document.type === 'work-order');
    const cot = bundle.documents.find((document) => document.type === 'quotation');
    expect(ot?.workOrder?.inspection?.photos).toHaveLength(2);
    expect(cot?.quotation?.workOrder?.inspectionPhotos).toHaveLength(2);
    expect(await processCustomerEmailQueue()).toBe(1);
  });

  it('does not send old disabled records after activating mail', async () => {
    env.MAIL_ENABLED = false;
    const id = await createQuotation();
    expect((await jobFor('quotation', id)).status).toBe('disabled');
    env.MAIL_ENABLED = true;
    expect(await processCustomerEmailQueue()).toBe(0);
    expect((await get('/api/customer-emails/preparation')).body.jobs).toHaveLength(0);
  });

  it('keeps missing-recipient records saved and allows preparing after correcting the contact', async () => {
    await contact.update({ email: null });
    const id = await createOrder();
    expect(await WorkOrder.findByPk(id)).not.toBeNull();
    expect((await jobFor('work_order', id)).status).toBe('missing_recipient');
    await contact.update({ email: 'contact@example.com' });
    expect(
      (await post('/api/customer-emails/work-orders/' + id + '/send', { requestId: randomUUID() }))
        .status,
    ).toBe(202);
    await prepare((await jobFor('work_order', id)).id);
    expect(await processCustomerEmailQueue()).toBe(1);
  });

  it('preserves prepared PDFs through SMTP failures and reuses the message ID on retry', async () => {
    const id = await createQuotation();
    const job = await jobFor('quotation', id);
    await prepare(job.id);
    smtp.send.mockRejectedValueOnce(
      Object.assign(new Error('private transcript'), { code: 'EAUTH' }),
    );
    expect(await processCustomerEmailQueue()).toBe(0);
    await job.reload();
    expect(job.status).toBe('failed');
    expect(job.lastError).toBe('EAUTH');
    expect(await processCustomerEmailQueue()).toBe(0);
    await job.update({ nextAttemptAt: new Date(0) });
    expect(await processCustomerEmailQueue()).toBe(1);
    expect(smtp.send.mock.calls[0][0].messageId).toBe(smtp.send.mock.calls[1][0].messageId);
    expect(
      smtp.send.mock.calls[0][0].attachments[0].content.equals(
        smtp.send.mock.calls[1][0].attachments[0].content,
      ),
    ).toBe(true);
  });

  it('deduplicates manual requests and claims prepared jobs once across concurrent workers', async () => {
    const id = await createQuotation();
    const route = '/api/customer-emails/quotations/' + id + '/send';
    const requestId = randomUUID();
    const results = await Promise.all([post(route, { requestId }), post(route, { requestId })]);
    expect(results.map((result) => result.status)).toEqual([202, 202]);
    expect(await CustomerEmail.count()).toBe(1);
    await prepare((await jobFor('quotation', id)).id);
    await Promise.all([processCustomerEmailQueue(), processCustomerEmailQueue()]);
    expect(smtp.send).toHaveBeenCalledTimes(1);
    const resend = randomUUID();
    await post(route, { requestId: resend });
    await post(route, { requestId: resend });
    expect(await CustomerEmail.count()).toBe(2);
  });

  it('rolls back the queued job with the business transaction', async () => {
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

  it('converts a quote and prepares only the newly created OT', async () => {
    const id = await createQuotation();
    await CustomerEmail.destroy({ where: {} });
    const result = await post('/api/quotations/' + id + '/convert-to-ot', {
      clientId: client.id,
      contactClientId: contact.id,
      vehicleId: vehicle.id,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    const otId = Number(result.body.workOrder.id);
    orderIds.push(otId);
    const { bundle } = await prepare((await jobFor('work_order', otId)).id);
    expect(bundle.documents.map((document) => document.type)).toEqual(['work-order']);
    expect(await processCustomerEmailQueue()).toBe(1);
  });

  it('sends safe progress without waiting for PDF generation or exposing internal notes', async () => {
    const id = await createOrder();
    await CustomerEmail.destroy({ where: {} });
    const item = (await WorkOrderItem.findOne({ where: { workOrderId: id } }))!;
    const result = await request(app)
      .patch('/api/work-orders/' + id + '/execution')
      .set('Cookie', cookies[0])
      .set('X-CSRF-Token', cookies[0].find((value) => value.startsWith('csrf_token='))!.slice(11))
      .send({
        items: [{ id: item.id, estadoOperativo: 'completado', notasOperativas: 'INTERNO 12345' }],
      });
    expect(result.status).toBe(200);
    const job = await jobFor('work_order', id);
    expect(job.payload.message).toContain('Revisión motor');
    expect(job.payload.message).not.toContain('INTERNO');
    expect(await processCustomerEmailQueue()).toBe(1);
    expect(smtp.send.mock.calls[0][0].attachments).toHaveLength(0);
  });

  it('recovers a prepared job interrupted during SMTP delivery', async () => {
    const id = await createQuotation();
    const job = await jobFor('quotation', id);
    await prepare(job.id);
    await job.update({
      status: 'sending',
      lockedAt: new Date(Date.now() - 6 * 60000),
      lockToken: randomUUID(),
      attempts: 1,
    });
    expect(await processCustomerEmailQueue()).toBe(1);
  });

  it('rejects stale documents when the quote changes while its PDF is prepared', async () => {
    const id = await createQuotation();
    const job = await jobFor('quotation', id);
    const bundle = (await get('/api/customer-emails/preparation/' + job.id)).body as Bundle;
    await Quotation.update({ notas: 'Nueva condición comercial' }, { where: { id } });
    expect((await upload(bundle)).status).toBe(409);
    expect(await processCustomerEmailQueue()).toBe(0);
    expect(smtp.send).not.toHaveBeenCalled();
    expect((await job.reload()).payload.documents).toBeUndefined();
  });

  it('rejects a PDF with missing pages instead of sending an incomplete OT', async () => {
    const id = await createOrder();
    const job = await jobFor('work_order', id);
    const bundle = (await get('/api/customer-emails/preparation/' + job.id)).body as Bundle;
    const buffers = await Promise.all(
      bundle.documents.map((document) => pdfBytes(document.filename, 1)),
    );
    expect((await upload(bundle, buffers)).status).toBe(400);
    expect(smtp.send).not.toHaveBeenCalled();
  });

  it('moves old jobs away from the alternate generator and waits for the approved PDF', async () => {
    const id = await createQuotation();
    const job = await jobFor('quotation', id);
    await job.update({ status: 'pending', payload: {} });
    expect(await processCustomerEmailQueue()).toBe(0);
    expect((await job.reload()).status).toBe('waiting_documents');
    expect(smtp.send).not.toHaveBeenCalled();
  });

  it('retains preparation failures for automatic retry while keeping the business document intact', async () => {
    const id = await createQuotation();
    const job = await jobFor('quotation', id);
    expect((await post('/api/customer-emails/preparation/' + job.id + '/error', {})).status).toBe(
      204,
    );
    await job.reload();
    expect(job.status).toBe('waiting_documents');
    expect(job.lastError).toBe('PDF_PREPARATION_FAILED');
    expect(await Quotation.findByPk(id)).not.toBeNull();
    expect(smtp.send).not.toHaveBeenCalled();
  });

  it('cancels prepared email for a soft-deleted record', async () => {
    const id = await createQuotation();
    const job = await jobFor('quotation', id);
    await prepare(job.id);
    await Quotation.destroy({ where: { id } });
    expect(await processCustomerEmailQueue()).toBe(0);
    expect((await job.reload()).status).toBe('cancelled');
    expect(smtp.send).not.toHaveBeenCalled();
  });
});
