import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const TEST_EMAIL = 'financial-report@unithor.local';
const TEST_PASSWORD = 'Finanzas2026!';
const TODAY = new Date().toISOString().slice(0, 10);
const MONTH_START = `${TODAY.slice(0, 8)}01`;

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

const loginCookies = async (): Promise<string[]> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  expect(response.status).toBe(200);
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  return values.map((cookie) => cookie.split(';')[0]);
};

describe('Financial executive reports (E2E)', () => {
  let userId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    const existing = await User.findOne({ where: { email: TEST_EMAIL }, paranoid: false });
    if (existing) {
      await RefreshToken.destroy({ where: { userId: existing.id }, force: true });
      await existing.destroy({ force: true });
    }

    const role = await Role.findOne({ where: { nombre: 'finanzas' } });
    if (!role) throw new Error('Falta el rol finanzas');
    const user = await User.create({
      nombre: 'Finanzas Reportes',
      email: TEST_EMAIL,
      passwordHash: await hashPassword(TEST_PASSWORD),
      roleId: role.id,
      activo: true,
    });
    userId = user.id;
  });

  afterAll(async () => {
    await RefreshToken.destroy({ where: { userId }, force: true });
    await User.destroy({ where: { id: userId }, force: true });
  });

  it('requiere autenticación en ambos formatos', async () => {
    expect((await request(app).get('/api/reports/finance/pdf')).status).toBe(401);
    expect((await request(app).get('/api/reports/finance/excel')).status).toBe(401);
  });

  it('genera un PDF ejecutivo válido', async () => {
    const response = await request(app)
      .get('/api/reports/finance/pdf')
      .query({ fechaDesde: MONTH_START, fechaHasta: TODAY, comparar: 'true' })
      .set('Cookie', await loginCookies())
      .buffer(true)
      .parse(binaryParser);

    const body = response.body as Buffer;
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('.pdf');
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length).toBeGreaterThan(1000);
  });

  it('genera un Excel ejecutivo con resumen y detalles auditables', async () => {
    const response = await request(app)
      .get('/api/reports/finance/excel')
      .query({ fechaDesde: MONTH_START, fechaHasta: TODAY, agruparPor: 'dia' })
      .set('Cookie', await loginCookies())
      .buffer(true)
      .parse(binaryParser);

    const body = response.body as Buffer;
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain('.xlsx');
    expect(body.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(body).buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumen Ejecutivo',
      'Ventas',
      'Pagos',
      'Caja',
      'Productos y Servicios',
    ]);
    expect(workbook.getWorksheet('Resumen Ejecutivo')?.getCell('A1').value).toBe(
      'UNITHOR - INFORME FINANCIERO EJECUTIVO',
    );
  });

  it('rechaza filtros inconsistentes y rangos superiores a un año', async () => {
    const cookies = await loginCookies();
    const inverted = await request(app)
      .get('/api/reports/finance/pdf')
      .query({ fechaDesde: '2026-09-30', fechaHasta: '2026-09-01' })
      .set('Cookie', cookies);
    expect(inverted.status).toBe(400);

    const excessive = await request(app)
      .get('/api/reports/finance/excel')
      .query({ fechaDesde: '2025-01-01', fechaHasta: '2026-09-01' })
      .set('Cookie', cookies);
    expect(excessive.status).toBe(400);
  });
});
