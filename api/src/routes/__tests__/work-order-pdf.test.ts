import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument } from 'pdf-lib';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { env } from '../../config/env.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Permission } from '../../models/Permission.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderInspection } from '../../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../../models/WorkOrderInspectionPhoto.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase43-';
const TEST_PLATE_PREFIX = 'PH43';
const TEST_YEAR = new Date().getFullYear();
const TEST_CODE_PREFIX = `OT-${TEST_YEAR}-43`;
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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

  return {
    accessToken: cookies.access_token,
  };
};

const pdfParser = (
  res: SuperAgentResponse,
  callback: (err: Error | null, body: unknown) => void,
): void => {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (err: Error) => callback(err, Buffer.alloc(0)));
};

const restoreRolePermission = async (roleId: number, permissionId: number): Promise<void> => {
  await RolePermission.findOrCreate({
    where: { roleId, permissionId },
    defaults: { roleId, permissionId },
  });
  invalidatePermissionCache(roleId);
};

describe('Work Order PDF Routes (E2E)', () => {
  let devUserId: number;
  let bodegueroUserId: number;
  let bodegueroRoleId: number;
  let tallerReadPermissionId: number;
  let clientId: number;
  let vehicleId: number;
  let workOrderWithItemsId: number;
  let emptyWorkOrderId: number;
  let removedBodegueroReadPermission = false;

  beforeAll(async () => {
    await sequelize.authenticate();

    const existingWorkOrders = await WorkOrder.findAll({
      where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
      paranoid: false,
    });
    const existingWorkOrderIds = existingWorkOrders.map((workOrder) => workOrder.id);
    if (existingWorkOrderIds.length > 0) {
      await WorkOrderItem.destroy({ where: { workOrderId: existingWorkOrderIds } });
      await WorkOrder.destroy({ where: { id: existingWorkOrderIds }, force: true });
    }

    const existingVehicles = await Vehicle.findAll({
      where: { patente: { [Op.like]: `${TEST_PLATE_PREFIX}%` } },
      paranoid: false,
    });
    await Vehicle.destroy({
      where: { id: existingVehicles.map((vehicle) => vehicle.id) },
      force: true,
    });

    const existingClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Client.destroy({
      where: { id: existingClients.map((client) => client.id) },
      force: true,
    });

    const testUsers = await User.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await RefreshToken.destroy({
      where: { userId: testUsers.map((user) => user.id) },
      force: true,
    });
    await User.destroy({
      where: { id: testUsers.map((user) => user.id) },
      force: true,
    });

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, bodegueroRole, tallerReadPermission] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
      Permission.findOne({ where: { modulo: 'taller', accion: 'read' } }),
    ]);

    if (!devUser || !bodegueroRole || !tallerReadPermission) {
      throw new Error('No se encontraron datos base para work-order-pdf.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;
    bodegueroRoleId = bodegueroRole.id;
    tallerReadPermissionId = tallerReadPermission.id;

    const [bodegueroUser, client] = await Promise.all([
      User.create({
        nombre: 'Bodeguero Fase 43',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRoleId,
        activo: true,
      }),
      Client.create({
        rut: '76430001',
        nombre: 'Cliente PDF Fase 43',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 4300 0001',
        direccion: 'Av. PDF 123',
      }),
    ]);
    bodegueroUserId = bodegueroUser.id;
    clientId = client.id;

    const vehicle = await Vehicle.create({
      patente: 'PH4301',
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2022,
      vinChasis: 'VINPH4301',
      kilometraje: 34500,
      clientId,
    });
    vehicleId = vehicle.id;

    const workOrderWithItems = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}01`,
      clientId,
      contactClientId: clientId,
      billingClientId: clientId,
      contactName: 'Marcela Recepción PDF',
      contactRut: '17654321K',
      contactPhone: '+56 9 8765 4321',
      contactEmail: 'recepcion.pdf@unithor.local',
      billingName: 'Transportes PDF SpA',
      billingRut: '76999001K',
      billingType: 'empresa',
      billingPhone: '+56 2 2345 6789',
      billingEmail: 'facturacion.pdf@unithor.local',
      billingAddress: 'Av. Facturación 456',
      billingRegion: 'Metropolitana',
      billingComuna: 'Santiago',
      vehicleId,
      estado: 'en_progreso',
      descripcion: 'Vibración al frenar y mantenimiento preventivo.',
      kilometrajeIngreso: 34510,
      fechaIngreso: new Date('2026-01-10T12:00:00.000Z'),
      createdBy: devUserId,
    });
    workOrderWithItemsId = workOrderWithItems.id;
    await WorkOrderItem.bulkCreate([
      {
        workOrderId: workOrderWithItemsId,
        descripcion: 'Cambio de pastillas de freno delanteras',
        cantidad: 1,
        precioUnitario: 45000,
        subtotal: 45000,
        estadoOperativo: 'completado',
        notasOperativas: 'Torque verificado según fabricante.',
        stockConsumido: true,
        stockConsumidoCantidad: 1,
        stockConsumidoAt: new Date('2026-01-10T16:00:00.000Z'),
      },
      {
        workOrderId: workOrderWithItemsId,
        descripcion: 'Rectificado de discos',
        cantidad: 2,
        precioUnitario: 18000,
        subtotal: 36000,
        estadoOperativo: 'en_proceso',
      },
    ]);

    const inspection = await WorkOrderInspection.create({
      workOrderId: workOrderWithItemsId,
      nivelCombustible: 'medio',
      llantaDelanteraIzquierda: 'bueno',
      llantaDelanteraDerecha: 'regular',
      llantaTraseraIzquierda: 'bueno',
      llantaTraseraDerecha: 'baja_presion',
      inventario: ['botiquin', 'chaleco_reflectante', 'rueda_repuesto', 'gata'],
      objetosValor: 'Lentes de sol en guantera.',
      observaciones: 'Rayón superficial en puerta trasera derecha.',
      inspectedBy: devUserId,
    });
    const photoStorageKey = path.posix.join(
      'work-orders',
      String(workOrderWithItemsId),
      'frontal-phase849.png',
    );
    const photoPath = path.resolve(env.UPLOAD_DIR, ...photoStorageKey.split('/'));
    await mkdir(path.dirname(photoPath), { recursive: true });
    await writeFile(photoPath, PNG_BYTES);
    await WorkOrderInspectionPhoto.create({
      inspectionId: inspection.id,
      slot: 'frontal',
      storageKey: photoStorageKey,
      mimeType: 'image/png',
      sizeBytes: PNG_BYTES.length,
      sha256: 'a'.repeat(64),
      uploadedBy: devUserId,
    });

    const emptyWorkOrder = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}02`,
      clientId,
      vehicleId,
      estado: 'borrador',
      descripcion: 'Diagnóstico inicial pendiente de aprobación.',
      fechaIngreso: new Date('2026-01-11T12:00:00.000Z'),
      createdBy: devUserId,
    });
    emptyWorkOrderId = emptyWorkOrder.id;
  });

  afterAll(async () => {
    if (removedBodegueroReadPermission) {
      await restoreRolePermission(bodegueroRoleId, tallerReadPermissionId);
    }

    const testWorkOrders = await WorkOrder.findAll({
      where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
      paranoid: false,
    });
    const testWorkOrderIds = testWorkOrders.map((workOrder) => workOrder.id);
    if (testWorkOrderIds.length > 0) {
      await WorkOrderItem.destroy({ where: { workOrderId: testWorkOrderIds } });
      await WorkOrder.destroy({ where: { id: testWorkOrderIds }, force: true });
    }
    await rm(path.resolve(env.UPLOAD_DIR, 'work-orders', String(workOrderWithItemsId)), {
      recursive: true,
      force: true,
    });

    const testVehicles = await Vehicle.findAll({
      where: { patente: { [Op.like]: `${TEST_PLATE_PREFIX}%` } },
      paranoid: false,
    });
    await Vehicle.destroy({ where: { id: testVehicles.map((vehicle) => vehicle.id) }, force: true });

    const testClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Client.destroy({ where: { id: testClients.map((client) => client.id) }, force: true });

    await RefreshToken.destroy({ where: { userId: [devUserId, bodegueroUserId] }, force: true });
    await User.destroy({ where: { id: [bodegueroUserId] }, force: true });
  });

  it('requiere autenticación', async () => {
    const response = await request(app).get(`/api/work-orders/${workOrderWithItemsId}/pdf`);
    expect(response.status).toBe(401);
  });

  it('deniega acceso a usuario sin permiso taller:read', async () => {
    await RolePermission.destroy({
      where: { roleId: bodegueroRoleId, permissionId: tallerReadPermissionId },
    });
    removedBodegueroReadPermission = true;
    invalidatePermissionCache(bodegueroRoleId);

    try {
      const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
      const response = await request(app)
        .get(`/api/work-orders/${workOrderWithItemsId}/pdf`)
        .set('Cookie', [`access_token=${bodegueroCookies.accessToken}`]);

      expect(response.status).toBe(403);
    } finally {
      await restoreRolePermission(bodegueroRoleId, tallerReadPermissionId);
      removedBodegueroReadPermission = false;
    }
  });

  it('devuelve 404 si la orden no existe', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .get('/api/work-orders/999999/pdf')
      .set('Cookie', [`access_token=${devCookies.accessToken}`]);

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('Orden de trabajo no encontrada');
  });

  it('genera un PDF válido para orden con múltiples items', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .get(`/api/work-orders/${workOrderWithItemsId}/pdf`)
      .set('Cookie', [`access_token=${devCookies.accessToken}`])
      .buffer(true)
      .parse(pdfParser);

    const body = response.body as Buffer;
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain(`${TEST_CODE_PREFIX}01.pdf`);
    expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    const document = await PDFDocument.load(body);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(body.length).toBeGreaterThan(1000);
  });

  it('genera el comprobante de recepción enriquecido en un endpoint separado', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .get(`/api/work-orders/${workOrderWithItemsId}/reception-pdf`)
      .set('Cookie', [`access_token=${devCookies.accessToken}`])
      .buffer(true)
      .parse(pdfParser);

    const body = response.body as Buffer;
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain(
      `${TEST_CODE_PREFIX}01-comprobante-recepcion.pdf`,
    );
    expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    const document = await PDFDocument.load(body);
    expect(document.getTitle()).toBe(`Orden de Trabajo ${TEST_CODE_PREFIX}01`);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(4);
    expect(body.length).toBeGreaterThan(5000);
  });

  it('genera un PDF válido para orden sin items', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .get(`/api/work-orders/${emptyWorkOrderId}/pdf`)
      .set('Cookie', [`access_token=${devCookies.accessToken}`])
      .buffer(true)
      .parse(pdfParser);

    const body = response.body as Buffer;
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(body.length).toBeGreaterThan(1000);
  });
});
