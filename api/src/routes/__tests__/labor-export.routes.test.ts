import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import * as permissions from '../../services/permission.service.js';
import { signAccessToken } from '../../utils/jwt.js';

const ids: number[] = [];
let adminCookie: string;
let mechanicCookie: string;
const binaryParser = (response: request.Response, callback: (error: Error | null, data: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Exportación de actividad diaria del taller', () => {
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Requires unithor_test');
    for (const roleName of ['admin', 'mecanico'] as const) {
      const role = await Role.findOne({ where: { nombre: roleName } });
      if (!role) throw new Error('Missing seeded role');
      const user = await User.create({ nombre: `Daily export ${roleName}`, email: `daily-export-${roleName}@test.local`, passwordHash: 'test-signed-session-only', roleId: role.id, activo: true });
      ids.push(user.id);
      const cookie = `access_token=${signAccessToken({ sub: user.id, role: roleName })}`;
      if (roleName === 'admin') adminCookie = cookie; else mechanicCookie = cookie;
    }
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { if (ids.length) await User.destroy({ where: { id: ids }, force: true }); });

  it('exporta Excel del día con todas las tablas y conserva las horas registradas', async () => {
    const sessions = await WorkOrderItemSession.count();
    const response = await request(app).get('/api/exports/workshop-daily/excel').query({ fecha: '2026-11-10' }).set('Cookie', adminCookie).buffer(true).parse(binaryParser);
    expect(response.status).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(response.body as unknown as ExcelJS.Buffer);
    expect(book.getWorksheet('Datos')).toBeDefined();
    expect(book.getWorksheet('Avance por persona')).toBeDefined();
    expect(book.getWorksheet('Órdenes con actividad')).toBeDefined();
    expect(book.getWorksheet('Detalle por trabajo')).toBeDefined();
    expect(await WorkOrderItemSession.count()).toBe(sessions);
  });

  it('abre el PDF inline con el día seleccionado y sin mutaciones', async () => {
    const response = await request(app).get('/api/exports/workshop-daily/pdf').query({ fecha: '2026-11-10' }).set('Cookie', adminCookie).buffer(true).parse(binaryParser);
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('inline;');
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('mantiene la restricción de supervisor incluso si un mecánico tiene exportación', async () => {
    vi.spyOn(permissions, 'hasPermission').mockResolvedValue(true);
    const response = await request(app).get('/api/exports/workshop-daily/excel').set('Cookie', mechanicCookie);
    expect(response.status).toBe(403);
  });

  it('rechaza fechas inexistentes y formatos de exportación inválidos', async () => {
    expect((await request(app).get('/api/exports/workshop-daily/pdf').query({ fecha: '2026-02-31' }).set('Cookie', adminCookie)).status).toBe(400);
    expect((await request(app).get('/api/exports/workshop-daily/csv').set('Cookie', adminCookie)).status).toBe(400);
  });
});
