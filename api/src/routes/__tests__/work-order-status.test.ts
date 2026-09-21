import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Permission } from '../../models/Permission.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderDelivery } from '../../models/WorkOrderDelivery.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { WorkOrderStatus } from '@unithor/shared';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase42-';
const TEST_YEAR = new Date().getFullYear();
const TEST_CODE_PREFIX = `OT-${TEST_YEAR}-42`;

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
    csrfToken: cookies.csrf_token,
  };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

const createWorkOrder = async (
  sequence: number,
  estado: WorkOrderStatus,
): Promise<WorkOrder> => {
  return WorkOrder.create({
    codigo: `${TEST_CODE_PREFIX}${String(sequence).padStart(2, '0')}`,
    estado,
    descripcion: `OT estado ${sequence}`,
  });
};

describe('Work Order State Machine Routes (E2E)', () => {
  let devUserId: number;
  let bodegueroUserId: number;
  let bodegueroRoleId: number;
  let tallerUpdatePermissionId: number;
  let removedBodegueroUpdatePermission = false;

  beforeAll(async () => {
    await sequelize.authenticate();

    const existingWorkOrders = await WorkOrder.findAll({
      where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
      paranoid: false,
    });
    const existingWorkOrderIds = existingWorkOrders.map((workOrder) => workOrder.id);
    if (existingWorkOrderIds.length > 0) {
      const quotations = await Quotation.findAll({
        where: { workOrderId: existingWorkOrderIds },
        paranoid: false,
      });
      const quotationIds = quotations.map((quotation) => quotation.id);
      if (quotationIds.length > 0) {
        await QuotationItem.destroy({ where: { quotationId: quotationIds } });
        await Quotation.destroy({ where: { id: quotationIds }, force: true });
      }
      await WorkOrderItem.destroy({ where: { workOrderId: existingWorkOrderIds } });
      await WorkOrder.destroy({ where: { id: existingWorkOrderIds }, force: true });
    }

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
    const [devUser, bodegueroRole, tallerUpdatePermission] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
      Permission.findOne({ where: { modulo: 'taller', accion: 'update' } }),
    ]);

    if (!devUser || !bodegueroRole || !tallerUpdatePermission) {
      throw new Error('No se encontraron datos base para work-order-status.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;
    bodegueroRoleId = bodegueroRole.id;
    tallerUpdatePermissionId = tallerUpdatePermission.id;

    const bodegueroUser = await User.create({
      nombre: 'Bodeguero Fase 42',
      email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
      passwordHash,
      roleId: bodegueroRoleId,
      activo: true,
    });
    bodegueroUserId = bodegueroUser.id;
  });

  afterAll(async () => {
    if (removedBodegueroUpdatePermission) {
      await RolePermission.findOrCreate({
        where: {
          roleId: bodegueroRoleId,
          permissionId: tallerUpdatePermissionId,
        },
        defaults: {
          roleId: bodegueroRoleId,
          permissionId: tallerUpdatePermissionId,
        },
      });
      invalidatePermissionCache(bodegueroRoleId);
    }

    const testWorkOrders = await WorkOrder.findAll({
      where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
      paranoid: false,
    });
    const testWorkOrderIds = testWorkOrders.map((workOrder) => workOrder.id);
    if (testWorkOrderIds.length > 0) {
      const quotations = await Quotation.findAll({
        where: { workOrderId: testWorkOrderIds },
        paranoid: false,
      });
      const quotationIds = quotations.map((quotation) => quotation.id);
      if (quotationIds.length > 0) {
        await QuotationItem.destroy({ where: { quotationId: quotationIds } });
        await Quotation.destroy({ where: { id: quotationIds }, force: true });
      }
      await WorkOrderItem.destroy({ where: { workOrderId: testWorkOrderIds } });
      await WorkOrder.destroy({ where: { id: testWorkOrderIds }, force: true });
    }

    await RefreshToken.destroy({
      where: { userId: [devUserId, bodegueroUserId] },
      force: true,
    });
    await User.destroy({ where: { id: [bodegueroUserId] }, force: true });
  });

  it('permite transición borrador -> en_progreso', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await createWorkOrder(1, 'borrador');

    const response = await request(app)
      .patch(`/api/work-orders/${workOrder.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'en_progreso' });

    expect(response.status).toBe(200);
    expect(response.body.workOrder.estado).toBe('en_progreso');

    const stored = await WorkOrder.findByPk(workOrder.id);
    expect(stored?.estado).toBe('en_progreso');
  });

  it('permite en_progreso -> esperando_repuesto -> en_progreso', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await createWorkOrder(2, 'en_progreso');

    const waitingResponse = await request(app)
      .patch(`/api/work-orders/${workOrder.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'esperando_repuesto', motivo: 'Falta alternador' });
    expect(waitingResponse.status).toBe(200);
    expect(waitingResponse.body.workOrder.estado).toBe('esperando_repuesto');

    const resumeResponse = await request(app)
      .patch(`/api/work-orders/${workOrder.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'en_progreso' });
    expect(resumeResponse.status).toBe(200);
    expect(resumeResponse.body.workOrder.estado).toBe('en_progreso');
  });

  it('exige el flujo de cierre para finalizada -> entregada y registra el acta', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await createWorkOrder(3, 'finalizada');

    const directResponse = await request(app)
      .patch(`/api/work-orders/${workOrder.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'entregada' });

    expect(directResponse.status).toBe(400);

    const response = await request(app)
      .post(`/api/work-orders/${workOrder.id}/deliver`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        kilometrajeSalida: 125000,
        receptorNombre: 'Cliente de Prueba',
        receptorRut: '12345678-9',
        receptorTelefono: '+56912345678',
        checklist: [
          'trabajos_explicados',
          'vehiculo_revisado',
          'pertenencias_entregadas',
          'documentos_entregados',
        ],
        conformidad: true,
        firmaRecepcion: 'Cliente de Prueba',
        observaciones: 'Entrega sin observaciones',
      });

    expect(response.status).toBe(200);
    expect(response.body.workOrder.estado).toBe('entregada');
    expect(response.body.workOrder.fechaEntrega).toBeDefined();
    expect(response.body.workOrder.delivery).toMatchObject({
      kilometrajeSalida: 125000,
      receptorNombre: 'Cliente de Prueba',
      conformidad: true,
      firmaRecepcion: 'Cliente de Prueba',
    });

    const stored = await WorkOrder.findByPk(workOrder.id);
    expect(stored?.fechaEntrega).not.toBeNull();
    expect(await WorkOrderDelivery.count({ where: { workOrderId: workOrder.id } })).toBe(1);
  });

  it('rechaza transición inválida borrador -> entregada', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await createWorkOrder(4, 'borrador');

    const response = await request(app)
      .patch(`/api/work-orders/${workOrder.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'entregada' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      "Transición inválida: no se puede cambiar de 'borrador' a 'entregada'",
    );
  });

  it('rechaza la entrega con trabajos pendientes o kilometraje de salida inválido', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}09`,
      estado: 'finalizada',
      descripcion: 'OT con controles de cierre',
      kilometrajeIngreso: 90000,
    });
    const item = await WorkOrderItem.create({
      workOrderId: workOrder.id,
      catalogItemId: null,
      descripcion: 'Trabajo aún pendiente',
      cantidad: 1,
      precioUnitario: 1000,
      subtotal: 1000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
    });
    const deliveryPayload = {
      kilometrajeSalida: 90010,
      receptorNombre: 'Receptor Controlado',
      checklist: [
        'trabajos_explicados',
        'vehiculo_revisado',
        'pertenencias_entregadas',
        'documentos_entregados',
      ],
      conformidad: true,
      firmaRecepcion: 'Receptor Controlado',
    };

    const pendingResponse = await request(app)
      .post(`/api/work-orders/${workOrder.id}/deliver`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send(deliveryPayload);
    expect(pendingResponse.status).toBe(400);

    await item.update({ estadoOperativo: 'completado' });
    const invalidMileageResponse = await request(app)
      .post(`/api/work-orders/${workOrder.id}/deliver`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ ...deliveryPayload, kilometrajeSalida: 89999 });
    expect(invalidMileageResponse.status).toBe(400);

    await workOrder.reload();
    expect(workOrder.estado).toBe('finalizada');
    expect(await WorkOrderDelivery.count({ where: { workOrderId: workOrder.id } })).toBe(0);
  });

  it('crea una garantía vinculada, reinicia items y conserva el historial', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const source = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}10`,
      estado: 'entregada',
      descripcion: 'Orden original entregada',
      kilometrajeIngreso: 100000,
      fechaEntrega: new Date(),
    });
    await WorkOrderItem.create({
      workOrderId: source.id,
      catalogItemId: null,
      descripcion: 'Reparación de frenos',
      cantidad: 1,
      precioUnitario: 45000,
      subtotal: 45000,
      estadoOperativo: 'completado',
      notasOperativas: 'Trabajo de origen',
    });

    const response = await request(app)
      .post(`/api/work-orders/${source.id}/reentry`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        tipoIngreso: 'garantia',
        motivo: 'Persistencia de ruido en frenado',
        kilometrajeIngreso: 100250,
        copiarItems: true,
        coberturaGarantia: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.workOrder).toMatchObject({
      estado: 'borrador',
      tipoIngreso: 'garantia',
      sourceWorkOrderId: source.id,
      coberturaGarantia: true,
      kilometrajeIngreso: 100250,
    });
    expect(response.body.workOrder.items).toEqual([
      expect.objectContaining({
        descripcion: 'Reparación de frenos',
        precioUnitario: 0,
        subtotal: 0,
        estadoOperativo: 'pendiente',
      }),
    ]);
    expect(response.body.workOrder.quotation).toMatchObject({ total: 0, pagado: 0 });

    const sourceDetail = await request(app)
      .get(`/api/work-orders/${source.id}`)
      .set('Cookie', authCookie(devCookies));
    expect(sourceDetail.status).toBe(200);
    expect(sourceDetail.body.workOrder.relatedWorkOrders).toEqual([
      expect.objectContaining({
        id: response.body.workOrder.id,
        tipoIngreso: 'garantia',
      }),
    ]);
  });

  it('rechaza crear un reingreso desde una orden que aún no fue entregada', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const source = await createWorkOrder(18, 'finalizada');

    const response = await request(app)
      .post(`/api/work-orders/${source.id}/reentry`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ tipoIngreso: 'reingreso', motivo: 'Nueva revisión', copiarItems: false });

    expect(response.status).toBe(400);
  });

  it('rechaza cambiar estados terminales entregada o cancelada', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const delivered = await createWorkOrder(5, 'entregada');
    const cancelled = await createWorkOrder(6, 'cancelada');

    const deliveredResponse = await request(app)
      .patch(`/api/work-orders/${delivered.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'en_progreso' });
    expect(deliveredResponse.status).toBe(400);

    const cancelledResponse = await request(app)
      .patch(`/api/work-orders/${cancelled.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'en_progreso' });
    expect(cancelledResponse.status).toBe(400);
  });

  it('es idempotente si se envía el mismo estado', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const fechaEntrega = new Date('2026-01-05T12:00:00.000Z');
    const workOrder = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}07`,
      estado: 'entregada',
      descripcion: 'OT idempotente',
      fechaEntrega,
    });

    const response = await request(app)
      .patch(`/api/work-orders/${workOrder.id}/status`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ nuevoEstado: 'entregada' });

    expect(response.status).toBe(200);
    expect(response.body.workOrder.estado).toBe('entregada');
    expect(new Date(response.body.workOrder.fechaEntrega).toISOString()).toBe(
      fechaEntrega.toISOString(),
    );
  });

  it('deniega acceso a usuario sin permiso taller:update', async () => {
    await RolePermission.destroy({
      where: {
        roleId: bodegueroRoleId,
        permissionId: tallerUpdatePermissionId,
      },
    });
    removedBodegueroUpdatePermission = true;
    invalidatePermissionCache(bodegueroRoleId);

    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const workOrder = await createWorkOrder(8, 'borrador');

    const response = await request(app)
      .patch(`/api/work-orders/${workOrder.id}/status`)
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({ nuevoEstado: 'en_progreso' });

    expect(response.status).toBe(403);
  });
});
