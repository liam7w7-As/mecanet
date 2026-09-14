import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase54-';
const TEST_CODE_PREFIX = `COT-${new Date().getFullYear()}-54`;
const TEST_PLATE_PREFIX = 'PH54';
const TODAY = new Date().toISOString().slice(0, 10);
const CURRENT_MONTH_START = `${TODAY.slice(0, 8)}01`;

interface LoginCookies {
  accessToken: string;
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
  return { accessToken: cookies.access_token };
};

const xlsxParser = (
  res: SuperAgentResponse,
  callback: (err: Error | null, body: unknown) => void,
): void => {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

const removeReportFixtures = async (): Promise<void> => {
  const quotations = await Quotation.findAll({
    where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
    paranoid: false,
  });
  const quotationIds = quotations.map((quotation) => quotation.id);
  if (quotationIds.length > 0) {
    await Payment.destroy({ where: { quotationId: quotationIds } });
    await Quotation.destroy({ where: { id: quotationIds }, force: true });
  }

  const vehicles = await Vehicle.findAll({
    where: { patente: { [Op.like]: `${TEST_PLATE_PREFIX}%` } },
    paranoid: false,
  });
  const vehicleIds = vehicles.map((vehicle) => vehicle.id);
  if (vehicleIds.length > 0) {
    await Vehicle.destroy({ where: { id: vehicleIds }, force: true });
  }

  const clients = await Client.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length > 0) {
    await Client.destroy({ where: { id: clientIds }, force: true });
  }

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

describe('Commercial Excel Report Routes (E2E)', () => {
  let vendedorEmail: string;
  let bodegueroEmail: string;

  beforeAll(async () => {
    await sequelize.authenticate();
    await removeReportFixtures();

    const [vendedorRole, bodegueroRole] = await Promise.all([
      Role.findOne({ where: { nombre: 'vendedor' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);
    if (!vendedorRole || !bodegueroRole) {
      throw new Error('No se encontraron los roles requeridos para commercial-report.test');
    }

    const passwordHash = await hashPassword(TEST_PASSWORD);
    vendedorEmail = `${TEST_EMAIL_PREFIX}vendedor@unithor.local`;
    bodegueroEmail = `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`;

    const [vendedor, client] = await Promise.all([
      User.create({
        nombre: 'Vendedor Reporte Fase 54',
        email: vendedorEmail,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76540001',
        nombre: 'Cliente Reporte Fase 54',
        tipo: 'empresa',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
      }),
      User.create({
        nombre: 'Bodeguero Reporte Fase 54',
        email: bodegueroEmail,
        passwordHash,
        roleId: bodegueroRole.id,
        activo: true,
      }),
    ]);

    const vehicle = await Vehicle.create({
      patente: `${TEST_PLATE_PREFIX}01`,
      marca: 'Ford',
      modelo: 'Ranger',
      clientId: client.id,
    });

    const quotation = await Quotation.create({
      codigo: `${TEST_CODE_PREFIX}01`,
      clientId: client.id,
      vehicleId: vehicle.id,
      asesorId: vendedor.id,
      estadoPago: 'parcial',
      subtotal: 100000,
      total: 100000,
      pagado: 25000,
      notas: 'Cotización para reporte comercial',
    });

    await Payment.create({
      quotationId: quotation.id,
      monto: 25000,
      metodo: 'transferencia',
      fecha: new Date(),
      createdBy: vendedor.id,
    });

    const historicalQuotation = await Quotation.create({
      codigo: `${TEST_CODE_PREFIX}02`,
      clientId: client.id,
      asesorId: vendedor.id,
      estadoPago: 'parcial',
      subtotal: 50000,
      total: 50000,
      pagado: 10000,
      notas: 'Cotización histórica con pago en el período actual',
      createdAt: new Date('2000-01-15T12:00:00.000Z'),
    });

    await Payment.create({
      quotationId: historicalQuotation.id,
      monto: 10000,
      metodo: 'efectivo',
      fecha: new Date(),
      createdBy: vendedor.id,
    });
  });

  afterAll(async () => {
    await removeReportFixtures();
  });

  it('requiere autenticación', async () => {
    const response = await request(app).get('/api/reports/commercial/excel');
    expect(response.status).toBe(401);
  });

  it('deniega la exportación a un rol sin permiso comercial:export', async () => {
    const cookies = await loginAs(bodegueroEmail);
    const response = await request(app)
      .get('/api/reports/commercial/excel')
      .set('Cookie', [`access_token=${cookies.accessToken}`]);

    expect(response.status).toBe(403);
  });

  it('genera un libro xlsx con resumen y detalle de pagos', async () => {
    const cookies = await loginAs(vendedorEmail);
    const response = await request(app)
      .get('/api/reports/commercial/excel')
      .query({ fechaDesde: CURRENT_MONTH_START, fechaHasta: TODAY })
      .set('Cookie', [`access_token=${cookies.accessToken}`])
      .buffer(true)
      .parse(xlsxParser);

    const body = response.body as Buffer;
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain('.xlsx');
    expect(body.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(body).buffer);
    const summarySheet = workbook.getWorksheet('Resumen Comercial');
    const paymentSheet = workbook.getWorksheet('Detalle de Pagos - Abonos');

    expect(summarySheet).toBeDefined();
    expect(paymentSheet).toBeDefined();
    expect(summarySheet?.getCell('A1').value).toBe(
      'UNITHOR - INFORME DE VENTAS Y COBRANZAS',
    );
    expect(summarySheet?.getCell('A5').value).toBe(`${TEST_CODE_PREFIX}01`);
    expect(summarySheet?.getCell('J5').value).toBe(25000);
    expect(summarySheet?.getCell('A6').value).toBe('TOTALES GENERALES');
    expect(paymentSheet?.getCell('A5').value).toBe(`${TEST_CODE_PREFIX}01`);
    expect(paymentSheet?.getCell('E5').value).toBe(25000);
    expect(paymentSheet?.getCell('A6').value).toBe(`${TEST_CODE_PREFIX}02`);
    expect(paymentSheet?.getCell('E6').value).toBe(10000);
  });

  it('rechaza un rango de fechas invertido', async () => {
    const cookies = await loginAs(vendedorEmail);
    const response = await request(app)
      .get('/api/reports/commercial/excel')
      .query({ fechaDesde: '2026-09-30', fechaHasta: '2026-09-01' })
      .set('Cookie', [`access_token=${cookies.accessToken}`]);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Error de validación');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'fechaHasta',
          message: 'fechaDesde no puede ser posterior a fechaHasta',
        }),
      ]),
    );
  });

  it('genera la estructura del libro aunque el rango no tenga cotizaciones', async () => {
    const cookies = await loginAs(vendedorEmail);
    const response = await request(app)
      .get('/api/reports/commercial/excel')
      .query({ fechaDesde: '1990-01-01', fechaHasta: '1990-01-31' })
      .set('Cookie', [`access_token=${cookies.accessToken}`])
      .buffer(true)
      .parse(xlsxParser);

    const body = response.body as Buffer;
    expect(response.status).toBe(200);
    expect(body.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(body).buffer);
    expect(workbook.getWorksheet('Resumen Comercial')?.getCell('A5').value).toBe(
      'TOTALES GENERALES',
    );
    expect(workbook.getWorksheet('Detalle de Pagos - Abonos')?.getCell('A5').value).toBe(
      'TOTAL PAGOS RECIBIDOS',
    );
  });
});
