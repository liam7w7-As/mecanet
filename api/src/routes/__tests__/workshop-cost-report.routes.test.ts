import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import {
  Permission,
  Role,
  RolePermission,
  User,
  WorkOrder,
  WorkOrderItem,
  WorkOrderItemAssignment,
  WorkOrderItemSession,
} from '../../models/index.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { Role as RoleName, WorkshopCostReport } from '@unithor/shared';
import type { Response as SuperAgentResponse } from 'superagent';

// Run this file alone, serially. The default API setup truncates shared test tables.
const DAY = '2002-03-04';
const stamp = (time: string) => new Date(`${DAY}T${time}:00Z`);
const binary = (
  res: SuperAgentResponse,
  done: (error: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => done(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => done(error, Buffer.alloc(0)));
};

describe('Internal workshop cost report with persisted snapshots and permissions', () => {
  const actors = new Map<RoleName, User>();
  const restoreGrants = new Map<number, number[]>();
  let permissions: Permission[];
  let order: WorkOrder;
  let old: WorkOrderItemAssignment;
  let current: WorkOrderItemAssignment;
  const get = (format = 'preview', role: RoleName = 'admin', extra: Record<string, unknown> = {}) =>
    request(app)
      .get(`/api/reports/workshop-costs/${format}`)
      .query({ fechaDesde: DAY, fechaHasta: DAY, workOrderId: order.id, ...extra })
      .set('Cookie', [
        `access_token=${signAccessToken({ sub: actors.get(role)!.id, role: 'admin' })}`,
      ]);
  const grants = async (roleName: RoleName, keys: string[]) => {
    const roleId = actors.get(roleName)!.roleId;
    if (!restoreGrants.has(roleId))
      restoreGrants.set(
        roleId,
        (await RolePermission.findAll({ where: { roleId } })).map((row) => row.permissionId),
      );
    await RolePermission.destroy({ where: { roleId } });
    const ids = permissions
      .filter((permission) => keys.includes(`${permission.modulo}:${permission.accion}`))
      .map((permission) => permission.id);
    if (ids.length)
      await RolePermission.bulkCreate(ids.map((permissionId) => ({ roleId, permissionId })));
    invalidatePermissionCache(roleId);
  };
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test')
      throw new Error('Only unithor_test is allowed');
    await sequelize.authenticate();
    permissions = await Permission.findAll();
    const prefix = `cost-report-${Date.now()}`;
    for (const name of [
      'admin',
      'jefe',
      'finanzas',
      'mecanico',
      'vendedor',
      'bodeguero',
    ] as const) {
      const role = await Role.findOne({ where: { nombre: name } });
      if (!role) throw new Error(`Missing role ${name}`);
      actors.set(
        name,
        await User.create({
          nombre: `Cost report ${name}`,
          email: `${prefix}-${name}@example.invalid`,
          passwordHash: 'unused-jwt-fixture',
          roleId: role.id,
          activo: true,
        }),
      );
    }
    const actorId = actors.get('admin')!.id;
    const historicWorker = await User.create({
      nombre: 'Trabajador histórico inactivo',
      email: `${prefix}-historic@example.invalid`,
      passwordHash: 'unused',
      roleId: actors.get('mecanico')!.roleId,
      activo: false,
    });
    order = await WorkOrder.create({
      codigo: `COST-${Date.now()}`,
      estado: 'en_progreso',
      descripcion: 'Reporte interno',
      fechaIngreso: stamp('09:00'),
      createdBy: actorId,
    });
    const item = await WorkOrderItem.create({
      workOrderId: order.id,
      descripcion: 'Diagnóstico de prueba',
      tipoLinea: 'especifico',
      cantidad: 2,
      horasHombreEstimadas: 99,
      horasHombreReales: 999,
      teamManaged: true,
      estadoOperativo: 'en_proceso',
    });
    old = await WorkOrderItemAssignment.create({
      workOrderId: order.id,
      workOrderItemId: item.id,
      userId: historicWorker.id,
      userName: historicWorker.nombre,
      active: false,
      specialtyId: null,
      specialtyName: 'Mecánica histórica',
      rateId: null,
      costHourly: 10000,
      saleHourly: 15000,
      estimatedHours: 7,
      originalEstimatedHours: 7,
      createdBy: actorId,
      createdAt: stamp('08:00'),
    });
    current = await WorkOrderItemAssignment.create({
      workOrderId: order.id,
      workOrderItemId: item.id,
      userId: actors.get('mecanico')!.id,
      userName: 'Mecánico vigente',
      active: true,
      specialtyId: null,
      specialtyName: null,
      rateId: null,
      costHourly: 20000,
      saleHourly: 30000,
      estimatedHours: 3,
      originalEstimatedHours: 2,
      createdBy: actorId,
      createdAt: stamp('09:00'),
    });
    const session = (
      assignment: WorkOrderItemAssignment | null,
      time: string,
      end: string,
      overrides: Partial<WorkOrderItemSession> = {},
    ) =>
      WorkOrderItemSession.create({
        workOrderId: order.id,
        workOrderItemId: item.id,
        userId: assignment?.userId ?? historicWorker.id,
        userName: assignment?.userName ?? historicWorker.nombre,
        assignmentId: assignment?.id ?? null,
        kind: 'cronometro',
        status: 'cerrada',
        startedAt: stamp(time),
        endedAt: stamp(end),
        durationMinutes: (stamp(end).getTime() - stamp(time).getTime()) / 60000,
        scheduledEndAt: null,
        supersededAt: null,
        closeReason: 'cierre_manual',
        note: null,
        createdBy: actorId,
        ...overrides,
      });
    await session(old, '10:00', '11:00');
    await session(current, '11:00', '13:00', { supersededAt: stamp('18:00') });
    // Approved overtime has no scheduled cutoff and must be included in full.
    await session(current, '19:00', '19:30', { kind: 'manual' });
    await session(current, '20:00', '20:00', { kind: 'ajuste', durationMinutes: -15 });
    await session(current, '14:00', '17:00', {
      status: 'abierta',
      endedAt: null,
      durationMinutes: null,
      scheduledEndAt: stamp('15:00'),
    });
    await session(null, '17:00', '17:15');
  }, 30000);
  afterAll(async () => {
    for (const [roleId, ids] of restoreGrants) {
      await RolePermission.destroy({ where: { roleId } });
      if (ids.length)
        await RolePermission.bulkCreate(ids.map((permissionId) => ({ roleId, permissionId })));
      invalidatePermissionCache(roleId);
    }
    await sequelize.close();
  });

  it('keeps inactive history, exact snapshot links, corrections, signed adjustments and bounded running hours', async () => {
    const res = await get();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const report = res.body as WorkshopCostReport;
    expect(report.rows).toHaveLength(3);
    expect(report.rows.find((row) => row.assignmentId === old.id)).toMatchObject({
      assignmentActive: false,
      userName: 'Trabajador histórico inactivo',
      estimatedHours: null,
      actualMinutes: 60,
      actualCost: 10000,
    });
    expect(report.rows.find((row) => row.assignmentId === current.id)).toMatchObject({
      estimatedHours: 3,
      originalEstimatedHours: 2,
      actualMinutes: 75,
      actualCost: 25000,
      estimatedCost: 60000,
      runningSessions: 0,
    });
    expect(report.rows.find((row) => row.assignmentId === null)).toMatchObject({
      costHourly: null,
      actualCost: null,
      actualMinutes: 15,
    });
    expect(report.totals).toMatchObject({
      actualHours: 2.5,
      actualCost: null,
      knownActualCost: 35000,
      estimatedHours: 3,
      estimatedCost: 60000,
      sessions: 5,
      missingCostRateCount: 1,
      unlinkedSessionCount: 1,
    });
    expect(res.headers['cache-control']).toContain('no-store');
  });
  it('applies date, worker, status and search filters to the complete result', async () => {
    const res = await get('preview', 'admin', {
      userId: current.userId,
      estado: 'en_progreso',
      search: 'Diagnóstico',
    });
    expect(res.status).toBe(200);
    expect((res.body as WorkshopCostReport).rows).toHaveLength(1);
    expect((res.body as WorkshopCostReport).totals.actualCost).toBe(25000);
    const otherState = await get('preview', 'admin', { estado: 'cancelada' });
    expect(otherState.status, JSON.stringify(otherState.body)).toBe(200);
    expect(otherState.body.rows).toEqual([]);
    expect((await get('preview', 'admin', { fechaDesde: '2002-03-05' })).status).toBe(400);
  });
  it('exports a branded inline PDF and Excel with unknown amounts left empty', async () => {
    const pdf = await get('pdf').buffer(true).parse(binary);
    expect(pdf.status, JSON.stringify(pdf.body)).toBe(200);
    expect(pdf.headers['content-disposition']).toMatch(/^inline;/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const excel = await get('excel').buffer(true).parse(binary);
    expect(excel.status).toBe(200);
    expect(excel.headers['content-disposition']).toMatch(/^attachment;/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.body as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Datos')!;
    const headers = sheet.getRow(1).values as string[];
    const amount = headers.indexOf('Costo real');
    const rows = [sheet.getRow(2), sheet.getRow(3), sheet.getRow(4)];
    expect(rows.map((row) => row.getCell(amount).value)).toContain(null);
    expect(rows.map((row) => row.getCell(amount).value)).toEqual(
      expect.arrayContaining([10000, 25000]),
    );
    expect(workbook.creator).toBeTruthy();
  });
  it('denies disallowed roles even with forced read/export grants and privileged token claims', async () => {
    for (const role of ['mecanico', 'vendedor', 'bodeguero'] as const) {
      await grants(role, ['taller:read', 'taller:export', 'finanzas:read', 'finanzas:export']);
      for (const format of ['preview', 'pdf', 'excel'])
        expect((await get(format, role)).status).toBe(403);
    }
    expect((await request(app).get('/api/reports/workshop-costs/preview')).status).toBe(401);
  });
  it('requires read and matching export module; finance-only readers can preview', async () => {
    await grants('jefe', ['taller:read', 'finanzas:export']);
    expect((await get('preview', 'jefe')).status).toBe(200);
    expect((await get('excel', 'jefe')).status).toBe(403);
    await grants('finanzas', ['finanzas:read']);
    expect((await get('preview', 'finanzas')).status).toBe(200);
    expect((await get('pdf', 'finanzas')).status).toBe(403);
    await grants('finanzas', ['finanzas:read', 'finanzas:export']);
    expect((await get('excel', 'finanzas')).status).toBe(200);
    await grants('jefe', ['taller:export']);
    expect((await get('preview', 'jefe')).status).toBe(403);
  });
});
