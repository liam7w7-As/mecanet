import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'extra-reports-';
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

describe('Operational extra report routes (E2E)', () => {
  let adminEmail: string;

  beforeAll(async () => {
    await sequelize.authenticate();
    await removeFixtures();

    const adminRole = await Role.findOne({ where: { nombre: 'admin' } });
    if (!adminRole) throw new Error('No se encontró el rol admin para operational-extra-reports.test');

    adminEmail = `${TEST_EMAIL_PREFIX}admin@unithor.local`;
    await User.create({
      nombre: 'Admin Reportes Extendidos',
      email: adminEmail,
      passwordHash: await hashPassword(TEST_PASSWORD),
      roleId: adminRole.id,
      activo: true,
    });
  });

  afterAll(async () => {
    await removeFixtures();
  });

  const login = async (): Promise<string> => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    return extractCookies(response).access_token;
  };

  it('requiere autenticación para reportes extendidos', async () => {
    const response = await request(app).get('/api/reports/catalog/pdf');
    expect(response.status).toBe(401);
  });

  it.each([
    ['inventory', 'excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined],
    ['inventory', 'pdf', 'application/pdf', '%PDF-'],
    ['catalog', 'excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined],
    ['catalog', 'pdf', 'application/pdf', '%PDF-'],
    ['fleet', 'excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined],
    ['fleet', 'pdf', 'application/pdf', '%PDF-'],
    ['administration', 'excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined],
    ['administration', 'pdf', 'application/pdf', '%PDF-'],
  ])(
    'genera reporte %s en formato %s',
    async (area, format, contentType, magicPrefix) => {
      const token = await login();
      const response = await request(app)
        .get(`/api/reports/${area}/${format}`)
        .query({ fechaDesde: CURRENT_MONTH_START, fechaHasta: TODAY })
        .set('Cookie', [`access_token=${token}`])
        .buffer(true)
        .parse(binaryParser);

      const body = response.body as Buffer;
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(contentType);
      expect(body.length).toBeGreaterThan(500);
      if (magicPrefix) {
        expect(body.subarray(0, 5).toString()).toBe(magicPrefix);
      }
    },
  );

  it.each([
    ['clients', 'Clientes', 'Vehículos'],
    ['vehicles', 'Vehículos', 'Clientes'],
  ] as const)(
    'respeta el alcance %s e incrusta el logo en el Excel de clientes y vehículos',
    async (scope, expectedSheet, excludedSheet) => {
      const token = await login();
      const response = await request(app)
        .get('/api/reports/fleet/excel')
        .query({ fechaDesde: CURRENT_MONTH_START, fechaHasta: TODAY, scope })
        .set('Cookie', [`access_token=${token}`])
        .buffer(true)
        .parse(binaryParser);

      expect(response.status).toBe(200);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Uint8Array.from(response.body as Buffer).buffer);

      expect(workbook.getWorksheet(expectedSheet)).toBeDefined();
      expect(workbook.getWorksheet(excludedSheet)).toBeUndefined();
      expect(workbook.worksheets.length).toBeGreaterThanOrEqual(3);
      expect(workbook.worksheets.every((sheet) => sheet.getImages().length > 0)).toBe(true);
    },
  );
});
