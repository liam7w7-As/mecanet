import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_PREFIX = 'report-workshop-';
const TEST_CODE_PREFIX = `OT-${new Date().getFullYear()}-RP`;
const TODAY = new Date().toISOString().slice(0, 10);
const CURRENT_MONTH_START = `${TODAY.slice(0, 8)}01`;

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
    cookies[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
    return cookies;
  }, {});
};

const loginAs = async (email: string): Promise<string> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  expect(response.status).toBe(200);
  return extractCookies(response).access_token;
};

const binaryParser = (
  res: SuperAgentResponse,
  callback: (err: Error | null, body: unknown) => void,
): void => {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

const removeFixtures = async (): Promise<void> => {
  const workOrders = await WorkOrder.findAll({
    where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
    paranoid: false,
  });
  const workOrderIds = workOrders.map((workOrder) => workOrder.id);
  if (workOrderIds.length > 0) {
    const quotations = await Quotation.findAll({
      where: { workOrderId: workOrderIds },
      paranoid: false,
    });
    const quotationIds = quotations.map((quotation) => quotation.id);
    if (quotationIds.length > 0) {
      await Payment.destroy({ where: { quotationId: quotationIds } });
      await QuotationItem.destroy({ where: { quotationId: quotationIds } });
      await Quotation.destroy({ where: { id: quotationIds }, force: true });
    }
    await WorkOrderItem.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrder.destroy({ where: { id: workOrderIds }, force: true });
  }

  const vehicles = await Vehicle.findAll({
    where: { patente: { [Op.like]: 'RPTW%' } },
    paranoid: false,
  });
  if (vehicles.length > 0) {
    await Vehicle.destroy({ where: { id: vehicles.map((vehicle) => vehicle.id) }, force: true });
  }

  const clients = await Client.findAll({
    where: { email: { [Op.like]: `${TEST_PREFIX}%` } },
    paranoid: false,
  });
  if (clients.length > 0) {
    await Client.destroy({ where: { id: clients.map((client) => client.id) }, force: true });
  }

  const users = await User.findAll({
    where: { email: { [Op.like]: `${TEST_PREFIX}%` } },
    paranoid: false,
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await RefreshToken.destroy({ where: { userId: userIds }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  }
};

describe('Workshop Report Routes (E2E)', () => {
  let jefeEmail: string;

  beforeAll(async () => {
    await sequelize.authenticate();
    await removeFixtures();

    const jefeRole = await Role.findOne({ where: { nombre: 'jefe' } });
    if (!jefeRole) throw new Error('No se encontró el rol jefe para workshop-report.test');

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const jefe = await User.create({
      nombre: 'Jefe Reporte Taller',
      email: `${TEST_PREFIX}jefe@unithor.local`,
      passwordHash,
      roleId: jefeRole.id,
      activo: true,
    });
    jefeEmail = jefe.email;

    const client = await Client.create({
      rut: '77990011',
      nombre: 'Cliente Reporte Taller',
      tipo: 'cliente',
      email: `${TEST_PREFIX}cliente@unithor.local`,
    });
    const vehicle = await Vehicle.create({
      patente: 'RPTW01',
      marca: 'Toyota',
      modelo: 'Hilux',
      clientId: client.id,
    });
    const workOrder = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}01`,
      clientId: client.id,
      vehicleId: vehicle.id,
      assignedMechanicId: jefe.id,
      estado: 'en_progreso',
      descripcion: 'Reporte de taller fixture',
      fechaIngreso: new Date(),
      createdBy: jefe.id,
    });
    await WorkOrderItem.create({
      workOrderId: workOrder.id,
      descripcion: 'Diagnóstico general',
      tipoLinea: 'estandar',
      cantidad: 1,
      precioUnitario: 20000,
      subtotal: 20000,
      estadoOperativo: 'completado',
    });
  });

  afterAll(async () => {
    await removeFixtures();
  });

  it('genera Excel y PDF del reporte de taller', async () => {
    const token = await loginAs(jefeEmail);
    const excelResponse = await request(app)
      .get('/api/reports/workshop/excel')
      .query({ fechaDesde: CURRENT_MONTH_START, fechaHasta: TODAY })
      .set('Cookie', [`access_token=${token}`])
      .buffer(true)
      .parse(binaryParser);
    expect(excelResponse.status).toBe(200);
    expect(excelResponse.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect((excelResponse.body as Buffer).length).toBeGreaterThan(1000);

    const pdfResponse = await request(app)
      .get('/api/reports/workshop/pdf')
      .query({ fechaDesde: CURRENT_MONTH_START, fechaHasta: TODAY })
      .set('Cookie', [`access_token=${token}`])
      .buffer(true)
      .parse(binaryParser);
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    expect((pdfResponse.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
