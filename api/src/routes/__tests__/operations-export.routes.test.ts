import ExcelJS from 'exceljs';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashClosure } from '../../models/CashClosure.js';
import { CashMovement } from '../../models/CashMovement.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Permission } from '../../models/Permission.js';
import { Purchase } from '../../models/Purchase.js';
import { Quotation } from '../../models/Quotation.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { Supplier } from '../../models/Supplier.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import * as cashMovementService from '../../services/cash-movement.service.js';
import { buildOperationsExport } from '../../services/exports/operations-export.service.js';
import * as paymentService from '../../services/payment.service.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { ExportActor } from '../../services/exports/export-types.js';
import type { ListExportFormat, ListExportTarget, Module, Role as RoleName } from '@unithor/shared';
import type { Response as SuperAgentResponse } from 'superagent';

// DB suite: run only in the main agent's serialized unithor_test test window.
const PREFIX = 'OPSX';
const DAY = '2001-02-03';
const OTHER_DAY = '2001-02-04';
const ROWS = 105;
const FORMATS: ListExportFormat[] = ['excel', 'pdf'];
const TARGETS = [
  'work-orders',
  'quotations',
  'purchases',
  'suppliers',
  'payments',
  'cash-day',
] as const;
const stamp = (index = 0): Date => new Date(Date.parse(`${DAY}T12:00:00.000Z`) + index * 1000);
const code = (kind: string, index: number): string =>
  `${kind}-${PREFIX}-${String(index).padStart(3, '0')}`;
const binaryParser = (
  response: SuperAgentResponse,
  done: (error: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => done(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => done(error, Buffer.alloc(0)));
};

const workbookFrom = async (bytes: Buffer): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return workbook;
};
const sheetRecords = (sheet: ExcelJS.Worksheet): Record<string, ExcelJS.CellValue>[] => {
  const result: Record<string, ExcelJS.CellValue>[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const record: Record<string, ExcelJS.CellValue> = {};
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      record[String(sheet.getRow(1).getCell(column).value)] = cell.value;
    });
    result.push(record);
  });
  return result;
};
// Read the actual PDF text operators, rather than looking for strings in compressed bytes.
const textFromPdf = async (bytes: Buffer): Promise<{ text: string; pages: number }> => {
  const pdf = await PDFDocument.load(bytes);
  const text: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, index) =>
            contents.lookup(index, PDFRawStream),
          )
        : contents instanceof PDFRawStream
          ? [contents]
          : [];
    for (const stream of streams) {
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      for (const match of operators.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) {
        text.push(Buffer.from(match[1], 'hex').toString('latin1'));
      }
    }
  }
  return { text: text.join('\n'), pages: pdf.getPageCount() };
};

describe('Operational list exports (real authentication and role scope)', () => {
  const actors = new Map<string, ExportActor>();
  const roleIds = new Map<RoleName, number>();
  const originalPermissions = new Map<number, number[]>();
  let permissions: Permission[] = [];
  let client: Client;
  let vehicle: Vehicle;
  let suppliers: Supplier[] = [];
  let orders: WorkOrder[] = [];
  let quotations: Quotation[] = [];
  let purchases: Purchase[] = [];
  let payments: Payment[] = [];
  let standalone: Quotation;
  let archived: Quotation;
  let expired: Quotation;
  let foreignOrder: WorkOrder;
  let itemAssignedOrder: WorkOrder;
  let foreignQuotation: Quotation;
  let voidedMovement: CashMovement;
  let pendingPayment: Payment;
  const actor = (name: string): ExportActor => {
    const value = actors.get(name);
    if (!value) throw new Error(`Falta el actor ${name}`);
    return value;
  };
  const setPermissions = async (name: RoleName, grants: readonly string[]): Promise<void> => {
    const roleId = roleIds.get(name);
    if (roleId === undefined) throw new Error(`Falta el rol ${name}`);
    await RolePermission.destroy({ where: { roleId } });
    const selected = permissions.filter((permission) =>
      grants.includes(`${permission.modulo}:${permission.accion}`),
    );
    if (selected.length)
      await RolePermission.bulkCreate(
        selected.map((permission) => ({ roleId, permissionId: permission.id })),
      );
    invalidatePermissionCache(roleId);
  };
  const download = (
    target: ListExportTarget,
    format: ListExportFormat,
    who = 'seller',
    query: Record<string, unknown> = {},
  ) =>
    request(app)
      .get(`/api/exports/${target}/${format}`)
      .query(query)
      // The JWT deliberately claims developer: authenticate must reload the real persisted role.
      .set('Cookie', [
        `access_token=${signAccessToken({ sub: actor(who).id, role: 'desarrollador' })}`,
      ])
      .buffer(true)
      .parse(binaryParser);
  const excelRecords = async (
    target: ListExportTarget,
    who: string,
    query: Record<string, unknown> = {},
  ) => {
    const response = await download(target, 'excel', who, query);
    expect(response.status).toBe(200);
    const workbook = await workbookFrom(response.body as Buffer);
    const sheet = workbook.getWorksheet('Datos');
    if (!sheet) throw new Error('El Excel no contiene la hoja Datos');
    return sheetRecords(sheet);
  };

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test')
      throw new Error('Esta suite solo permite unithor_test');
    await sequelize.authenticate();
    permissions = await Permission.findAll();
    for (const name of [
      'desarrollador',
      'vendedor',
      'mecanico',
      'finanzas',
      'bodeguero',
    ] as const) {
      const role = await Role.findOne({ where: { nombre: name } });
      if (!role) throw new Error(`Falta el rol base ${name}`);
      roleIds.set(name, role.id);
      if (name !== 'desarrollador') {
        originalPermissions.set(
          role.id,
          (await RolePermission.findAll({ where: { roleId: role.id } })).map(
            (entry) => entry.permissionId,
          ),
        );
      }
    }
    await setPermissions('vendedor', [
      'taller:read',
      'taller:export',
      'comercial:read',
      'comercial:export',
    ]);
    await setPermissions('mecanico', ['taller:read', 'taller:export']);
    await setPermissions('finanzas', [
      'finanzas:read',
      'finanzas:export',
      'compras:read',
      'compras:export',
    ]);
    await setPermissions('bodeguero', []);
    const run = Date.now();
    for (const [name, role] of [
      ['developer', 'desarrollador'],
      ['seller', 'vendedor'],
      ['otherSeller', 'vendedor'],
      ['mechanic', 'mecanico'],
      ['otherMechanic', 'mecanico'],
      ['finance', 'finanzas'],
      ['restricted', 'bodeguero'],
    ] as const) {
      const user = await User.create({
        nombre: `${PREFIX} ${name}`,
        email: `${PREFIX}-${run}-${name}@unithor.local`,
        passwordHash: 'JWT-only-export-fixture',
        roleId: roleIds.get(role)!,
        activo: true,
      });
      actors.set(name, { id: user.id, role });
    }
    client = await Client.create({
      nombre: `${PREFIX} cliente`,
      email: `${PREFIX}-${run}@unithor.local`,
    });
    vehicle = await Vehicle.create({
      patente: `OX${String(run).slice(-8)}`,
      clientId: client.id,
      marca: 'Toyota',
      modelo: 'Hilux',
    });
    suppliers = await Supplier.bulkCreate(
      Array.from({ length: ROWS }, (_, index) => ({
        nombre: `${PREFIX} incompleto ${String(index).padStart(3, '0')}`,
      })),
    );
    await Supplier.create({
      nombre: `${PREFIX} completo`,
      datosCompletos: true,
      email: 'completo@example.test',
    });
    orders = await WorkOrder.bulkCreate(
      Array.from({ length: ROWS }, (_, index) => ({
        codigo: code('OT', index),
        clientId: client.id,
        vehicleId: vehicle.id,
        descripcion: `${PREFIX} lote`,
        estado: 'en_progreso' as const,
        fechaIngreso: stamp(index),
        createdAt: stamp(index),
        createdBy: actor('seller').id,
        assignedMechanicId: actor('mechanic').id,
      })),
    );
    foreignOrder = await WorkOrder.create({
      codigo: code('OT', 900),
      descripcion: `${PREFIX} ajena`,
      estado: 'en_progreso',
      createdBy: actor('otherSeller').id,
      assignedMechanicId: actor('otherMechanic').id,
      clientId: client.id,
      vehicleId: vehicle.id,
      fechaIngreso: stamp(),
    });
    itemAssignedOrder = await WorkOrder.create({
      codigo: code('OT', 901),
      descripcion: `${PREFIX} tarea asignada`,
      estado: 'esperando_repuesto',
      createdBy: actor('otherSeller').id,
      assignedMechanicId: actor('otherMechanic').id,
      clientId: client.id,
      vehicleId: vehicle.id,
      fechaIngreso: stamp(),
    });
    await WorkOrderItem.bulkCreate([
      {
        workOrderId: orders[0].id,
        descripcion: 'Trabajo completado',
        estadoOperativo: 'completado',
        subtotal: 100,
      },
      {
        workOrderId: orders[0].id,
        descripcion: 'Trabajo pendiente',
        estadoOperativo: 'pendiente',
        subtotal: 200,
      },
      {
        workOrderId: orders[0].id,
        descripcion: 'Trabajo omitido',
        estadoOperativo: 'omitido',
        subtotal: 50,
      },
      {
        workOrderId: itemAssignedOrder.id,
        descripcion: 'Solo tarea asignada',
        assignedUserId: actor('mechanic').id,
      },
    ]);
    quotations = await Quotation.bulkCreate(
      orders.map((order, index) => ({
        codigo: code('COT', index),
        workOrderId: order.id,
        clientId: client.id,
        vehicleId: vehicle.id,
        asesorId: actor('seller').id,
        estadoPago: 'parcial' as const,
        total: 1000,
        pagado: 100,
        notas: `${PREFIX} lote`,
        createdAt: stamp(index),
      })),
    );
    foreignQuotation = await Quotation.create({
      codigo: code('COT', 900),
      workOrderId: foreignOrder.id,
      clientId: client.id,
      vehicleId: vehicle.id,
      asesorId: actor('otherSeller').id,
      estadoPago: 'parcial',
      total: 1000,
      pagado: 100,
    });
    standalone = await Quotation.create({
      codigo: code('COT', 901),
      clientId: client.id,
      asesorId: actor('seller').id,
      notas: `${PREFIX} sin OT`,
      validezDias: 365,
    });
    archived = await Quotation.create({
      codigo: code('COT', 902),
      clientId: client.id,
      asesorId: actor('seller').id,
      archivedAt: new Date(),
      notas: `${PREFIX} archivada`,
    });
    expired = await Quotation.create({
      codigo: code('COT', 903),
      clientId: client.id,
      asesorId: actor('seller').id,
      createdAt: stamp(),
      validezDias: 1,
      notas: `${PREFIX} vencida`,
    });
    payments = await Payment.bulkCreate(
      Array.from({ length: ROWS }, (_, index) => ({
        quotationId: quotations[0].id,
        monto: 10,
        metodo: 'transferencia',
        estado: 'por_verificar' as const,
        referencia: `${PREFIX}-LOTE-${String(index).padStart(3, '0')}`,
        bancoOrigen: 'Banco de Chile',
        numeroTransaccion: `000${index}`,
        comprobantePago: 'payment-receipts/private/OPSX-SECRETO.pdf?signature=PRIVATE',
        fecha: stamp(index),
        createdBy: actor('seller').id,
      })),
    );
    pendingPayment = payments[0];
    await Payment.bulkCreate([
      {
        quotationId: quotations[0].id,
        monto: 15,
        metodo: 'efectivo',
        estado: 'confirmado',
        referencia: `${PREFIX}-CONFIRMADO`,
        fecha: stamp(),
        createdBy: actor('seller').id,
      },
      {
        quotationId: quotations[0].id,
        monto: 40,
        metodo: 'transferencia',
        estado: 'rechazado',
        referencia: `${PREFIX}-RECHAZADO`,
        fecha: stamp(),
        createdBy: actor('seller').id,
      },
      {
        quotationId: foreignQuotation.id,
        monto: 50,
        metodo: 'transferencia',
        estado: 'por_verificar',
        referencia: `${PREFIX}-AJENO`,
        fecha: stamp(),
        createdBy: actor('otherSeller').id,
      },
    ]);
    purchases = await Purchase.bulkCreate(
      Array.from({ length: ROWS }, (_, index) => ({
        codigo: code('COM', index),
        supplierId: suppliers[0].id,
        vehicleId: vehicle.id,
        workOrderId: orders[0].id,
        origenVehiculo: 'taller' as const,
        formaPago: 'credito' as const,
        tipoDocumento: 'factura' as const,
        folio: `${PREFIX}-F-${index}`,
        fechaEmision: DAY,
        montoComprobante: 119,
        neto: 100,
        iva: 19,
        total: 119,
        numeroOperacion: `000${index}`,
        banco: 'Banco de Chile',
        comprobanteNombre: 'factura.pdf',
        comprobanteStorageKey: 'purchase-receipts/private/OPSX-SECRETO.pdf',
        comprobanteMimeType: 'application/pdf',
        comprobanteSizeBytes: 100,
        createdBy: actor('finance').id,
        createdAt: stamp(index),
      })),
    );
    for (const [index, estado, documento] of [
      [900, 'anulada', 'factura'],
      [901, 'registrada', 'boleta'],
    ] as const) {
      await Purchase.create({
        codigo: code('COM', index),
        supplierId: suppliers[1].id,
        formaPago: 'contado',
        estado,
        tipoDocumento: documento,
        folio: `${PREFIX}-fuera-${index}`,
        fechaEmision: OTHER_DAY,
        montoComprobante: 1,
        numeroOperacion: '1',
        banco: 'Banco de Chile',
        comprobanteNombre: 'fuera.pdf',
        comprobanteStorageKey: 'private/fuera.pdf',
        comprobanteMimeType: 'application/pdf',
        comprobanteSizeBytes: 1,
        createdAt: new Date(`${OTHER_DAY}T12:00:00Z`),
      });
    }
    await CashMovement.bulkCreate(
      Array.from({ length: ROWS }, (_, index) => ({
        tipo: 'ingreso' as const,
        categoria: 'apertura_caja' as const,
        monto: 1,
        metodo: 'efectivo' as const,
        descripcion: `${PREFIX}-CAJA-${String(index).padStart(3, '0')}`,
        fecha: stamp(index),
        createdBy: actor('finance').id,
      })),
    );
    await CashMovement.create({
      tipo: 'egreso',
      categoria: 'gasto_operativo',
      monto: 5,
      metodo: 'efectivo',
      descripcion: `${PREFIX}-EGRESO`,
      fecha: stamp(),
      createdBy: actor('finance').id,
    });
    voidedMovement = await CashMovement.create({
      tipo: 'egreso',
      categoria: 'otro',
      monto: 60,
      metodo: 'efectivo',
      descripcion: `${PREFIX}-ANULADO`,
      fecha: stamp(),
      createdBy: actor('finance').id,
      voidedAt: stamp(),
      voidedBy: actor('finance').id,
      voidReason: 'Duplicado de prueba',
    });
    await CashMovement.create({
      tipo: 'ingreso',
      categoria: 'otro',
      monto: 999,
      metodo: 'efectivo',
      descripcion: `${PREFIX}-OTRO-DIA`,
      fecha: new Date(`${OTHER_DAY}T12:00:00Z`),
      createdBy: actor('finance').id,
    });
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (sequelize.getDatabaseName() !== 'unithor_test') return;
    for (const [roleId, permissionIds] of originalPermissions) {
      await RolePermission.destroy({ where: { roleId } });
      if (permissionIds.length)
        await RolePermission.bulkCreate(
          permissionIds.map((permissionId) => ({ roleId, permissionId })),
        );
      invalidatePermissionCache(roleId);
    }
    // Only this file's fixtures; preserve seeds and all other agents' data.
    const orderIds = (
      await WorkOrder.findAll({
        where: { codigo: { [Op.like]: `OT-${PREFIX}-%` } },
        paranoid: false,
      })
    ).map((row) => row.id);
    const quotationIds = (
      await Quotation.findAll({
        where: { codigo: { [Op.like]: `COT-${PREFIX}-%` } },
        paranoid: false,
      })
    ).map((row) => row.id);
    if (quotationIds.length) {
      await Payment.destroy({ where: { quotationId: quotationIds } });
      await Quotation.destroy({ where: { id: quotationIds }, force: true });
    }
    await Purchase.destroy({ where: { codigo: { [Op.like]: `COM-${PREFIX}-%` } } });
    await Supplier.destroy({ where: { nombre: { [Op.like]: `${PREFIX}%` } } });
    await CashMovement.destroy({ where: { descripcion: { [Op.like]: `${PREFIX}%` } } });
    if (orderIds.length) {
      await WorkOrderItem.destroy({ where: { workOrderId: orderIds } });
      await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    }
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    const userIds = [...actors.values()].map((value) => value.id);
    if (userIds.length) {
      await RefreshToken.destroy({ where: { userId: userIds }, force: true });
      await User.destroy({ where: { id: userIds }, force: true });
    }
  }, 60_000);

  it('requires authentication for every owned target and format', async () => {
    for (const target of TARGETS)
      for (const format of FORMATS) {
        expect((await request(app).get(`/api/exports/${target}/${format}`)).status).toBe(401);
      }
  }, 60_000);

  it('requires BOTH read and export permissions, including finance policy for cash-day', async () => {
    const modules: Record<(typeof TARGETS)[number], Module> = {
      'work-orders': 'taller',
      quotations: 'comercial',
      purchases: 'compras',
      suppliers: 'compras',
      payments: 'finanzas',
      'cash-day': 'finanzas',
    };
    try {
      for (const target of TARGETS) {
        for (const action of ['read', 'export']) {
          await setPermissions('bodeguero', [`${modules[target]}:${action}`]);
          for (const format of FORMATS) {
            const response = await download(target, format, 'restricted', {
              fecha: DAY,
              role: 'admin',
            });
            expect(response.status).toBe(403);
          }
        }
      }
      await setPermissions('bodeguero', ['comercial:read', 'comercial:export']);
      expect((await download('cash-day', 'excel', 'restricted', { fecha: DAY })).status).toBe(403);
    } finally {
      await setPermissions('bodeguero', []);
    }
  }, 60_000);

  it('isolates genuine sellers even with forged role, userId, asesorId and page query parameters', async () => {
    const attack = {
      search: PREFIX,
      userId: actor('otherSeller').id,
      role: 'admin',
      asesorId: actor('otherSeller').id,
      createdBy: actor('otherSeller').id,
      page: 99_999,
      pageSize: 100_000,
    };
    const ownOrders = await excelRecords('work-orders', 'seller', attack);
    expect(ownOrders).toHaveLength(ROWS);
    expect(ownOrders.map((row) => row.OT)).not.toContain(foreignOrder.codigo);
    const otherOrders = await excelRecords('work-orders', 'otherSeller', {
      ...attack,
      userId: actor('seller').id,
    });
    expect(otherOrders.map((row) => row.OT).sort()).toEqual(
      [foreignOrder.codigo, itemAssignedOrder.codigo].sort(),
    );
    const ownQuotations = await excelRecords('quotations', 'seller', attack);
    expect(ownQuotations).toHaveLength(ROWS + 3);
    expect(ownQuotations.map((row) => row.Cotización)).not.toContain(foreignQuotation.codigo);
    const otherQuotations = await excelRecords('quotations', 'otherSeller', {
      ...attack,
      userId: actor('seller').id,
    });
    expect(otherQuotations.map((row) => row.Cotización)).toEqual([foreignQuotation.codigo]);
    const ownPayments = await excelRecords('payments', 'seller', attack);
    expect(ownPayments).toHaveLength(ROWS + 2);
    expect(ownPayments.map((row) => row.Referencia)).not.toContain(`${PREFIX}-AJENO`);
    expect(
      (await excelRecords('payments', 'otherSeller', attack)).map((row) => row.Referencia),
    ).toEqual([`${PREFIX}-AJENO`]);
    expect(
      await excelRecords('payments', 'seller', { quotationId: foreignQuotation.id, ...attack }),
    ).toHaveLength(0);
    expect(
      await excelRecords('quotations', 'seller', { workOrderId: foreignOrder.id, ...attack }),
    ).toHaveLength(0);
  });

  it('restricts mechanics to order/item assignments and hides the financial columns of their cards', async () => {
    const query = {
      search: PREFIX,
      assignedMechanicId: actor('otherMechanic').id,
      userId: actor('developer').id,
      role: 'admin',
      page: -99,
      pageSize: 'invalid',
    };
    const records = await excelRecords('work-orders', 'mechanic', query);
    expect(records).toHaveLength(ROWS + 1);
    expect(records.map((row) => row.OT)).toContain(itemAssignedOrder.codigo);
    expect(records.map((row) => row.OT)).not.toContain(foreignOrder.codigo);
    for (const row of records) {
      expect(row).not.toHaveProperty('Total estimado');
      expect(row).not.toHaveProperty('Pagado');
      expect(row).not.toHaveProperty('Saldo pendiente');
    }
    const response = await download('work-orders', 'pdf', 'mechanic', query);
    expect(response.status).toBe(200);
    const pdf = await textFromPdf(response.body as Buffer);
    expect(pdf.text).toContain(itemAssignedOrder.codigo);
    expect(pdf.text).not.toContain(foreignOrder.codigo);
    expect(pdf.text).not.toContain('Total estimado');
  });

  const listingCases = (): {
    target: ListExportTarget;
    who: string;
    query: Record<string, unknown>;
    identities: string[];
    ids: number[];
  }[] => [
    {
      target: 'work-orders',
      who: 'seller',
      query: {
        search: PREFIX,
        estado: 'en_progreso',
        clientId: client.id,
        vehicleId: vehicle.id,
        fechaDesde: DAY,
        fechaHasta: DAY,
      },
      identities: orders.map((row) => row.codigo),
      ids: orders.map((row) => row.id),
    },
    {
      target: 'quotations',
      who: 'seller',
      query: {
        search: PREFIX,
        workOrderLinked: 'true',
        archiveStatus: 'active',
        estadoPago: 'parcial',
        clientId: client.id,
        vehicleId: vehicle.id,
        fechaDesde: DAY,
        fechaHasta: DAY,
      },
      identities: quotations.map((row) => row.codigo),
      ids: quotations.map((row) => row.id),
    },
    {
      target: 'purchases',
      who: 'finance',
      query: {
        search: PREFIX,
        estado: 'registrada',
        formaPago: 'credito',
        tipoDocumento: 'factura',
        proveedorId: suppliers[0].id,
        fechaDesde: DAY,
        fechaHasta: DAY,
      },
      identities: purchases.map((row) => row.codigo),
      ids: purchases.map((row) => row.id),
    },
    {
      target: 'suppliers',
      who: 'finance',
      query: { search: PREFIX, soloIncompletos: 'true' },
      identities: suppliers.map((row) => row.nombre),
      ids: suppliers.map((row) => row.id),
    },
    {
      target: 'payments',
      who: 'seller',
      query: {
        search: `${PREFIX}-LOTE`,
        quotationId: quotations[0].id,
        estado: 'por_verificar',
        metodo: 'transferencia',
        fechaDesde: DAY,
        fechaHasta: DAY,
      },
      identities: Array.from(
        { length: ROWS },
        (_, index) => `${PREFIX}-LOTE-${String(index).padStart(3, '0')}`,
      ),
      ids: payments.map((row) => row.id),
    },
  ];
  for (const format of FORMATS) {
    it(`exports every matching page as ${format}, ignoring browser pagination`, async () => {
      for (const entry of listingCases()) {
        const response = await download(entry.target, format, entry.who, {
          ...entry.query,
          page: 99_999,
          pageSize: 1,
        });
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('no-store');
        if (format === 'excel') {
          expect(response.headers['content-type']).toContain('spreadsheetml');
          const workbook = await workbookFrom(response.body as Buffer);
          const sheet = workbook.getWorksheet('Datos')!;
          const records = sheetRecords(sheet);
          expect(records).toHaveLength(ROWS);
          for (const row of records) expect(typeof row.ID).toBe('number');
          expect(new Set(records.map((row) => row.ID))).toEqual(new Set(entry.ids));
          const exportedValues = records.flatMap((row) => Object.values(row));
          for (const identity of entry.identities) expect(exportedValues).toContain(identity);
          if (entry.target === 'work-orders') {
            const order = records.find((row) => row.OT === orders[0].codigo)!;
            expect(order['Avance (%)']).toBe(50);
            expect(order['Tareas completadas']).toBe('1/2');
            expect(order['Total estimado']).toBe(350);
          }
          if (entry.target === 'payments') {
            expect(records[0]['Estado']).toBe('Por verificar');
            expect(records[0]['Banco de procedencia']).toBe('Banco de Chile');
            expect(records[0]['Comprobante disponible']).toBe('Sí');
            expect(typeof records[0]['Número de transacción']).toBe('string');
            expect(JSON.stringify(workbook.model)).not.toMatch(
              /OPSX-SECRETO|payment-receipts|purchase-receipts|signature=PRIVATE/,
            );
          }
          if (entry.target === 'purchases')
            expect(JSON.stringify(workbook.model)).not.toContain('purchase-receipts');
        } else {
          expect(response.headers['content-type']).toContain('application/pdf');
          const pdf = await textFromPdf(response.body as Buffer);
          expect(pdf.pages).toBeGreaterThan(1);
          expect(pdf.text.split('\n')).not.toContain('ID');
          // Cells may wrap across lines; compare all identifiers after collapsing whitespace.
          const compact = pdf.text.replace(/\s/g, '');
          for (const identity of entry.identities)
            expect(compact).toContain(identity.replace(/\s/g, ''));
          expect(pdf.text).not.toMatch(/OPSX-SECRETO|payment-receipts|purchase-receipts/);
        }
      }
    }, 60_000);

    it(`renders valid empty ${format} reports without leaking records from other filters`, async () => {
      for (const entry of listingCases()) {
        const response = await download(entry.target, format, entry.who, {
          ...entry.query,
          search: 'OPSX-NO-EXISTE',
          page: 999,
        });
        expect(response.status).toBe(200);
        if (format === 'excel') {
          const workbook = await workbookFrom(response.body as Buffer);
          expect(sheetRecords(workbook.getWorksheet('Datos')!)).toHaveLength(0);
        } else {
          const pdf = await textFromPdf(response.body as Buffer);
          expect(pdf.text).toContain('No hay registros');
          expect(pdf.text).not.toContain(orders[0].codigo);
        }
      }
    });
  }

  it('keeps general, linked, SIN OT, manual archive and expired archive query semantics', async () => {
    const general = await excelRecords('quotations', 'seller', { search: PREFIX });
    expect(general).toHaveLength(ROWS + 3);
    const linked = await excelRecords('quotations', 'seller', {
      search: PREFIX,
      workOrderLinked: 'true',
    });
    expect(linked).toHaveLength(ROWS);
    const withoutOrder = await excelRecords('quotations', 'seller', {
      search: PREFIX,
      workOrderLinked: 'false',
      archiveStatus: 'active',
    });
    expect(withoutOrder.map((row) => row.Cotización)).toEqual([standalone.codigo]);
    const archive = await excelRecords('quotations', 'seller', {
      search: PREFIX,
      archiveStatus: 'archived',
    });
    expect(archive.map((row) => row.Cotización).sort()).toEqual(
      [archived.codigo, expired.codigo].sort(),
    );
    const singleOrder = await excelRecords('quotations', 'seller', {
      workOrderId: orders[0].id,
      workOrderLinked: 'false',
    });
    expect(singleOrder.map((row) => row.Cotización)).toEqual([quotations[0].codigo]);
  });

  it('preserves rejected and pending payment states without exporting receipt paths or signed URLs', async () => {
    const records = await excelRecords('payments', 'seller', { search: PREFIX });
    expect(new Set(records.map((row) => row.Estado))).toEqual(
      new Set(['Confirmado', 'Por verificar', 'Rechazado']),
    );
    const rejected = await excelRecords('payments', 'seller', {
      estado: 'rechazado',
      search: PREFIX,
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].Referencia).toBe(`${PREFIX}-RECHAZADO`);
    const pdf = await download('payments', 'pdf', 'seller', {
      estado: 'rechazado',
      search: PREFIX,
    });
    expect(pdf.status).toBe(200);
    expect((await textFromPdf(pdf.body as Buffer)).text).toContain('Rechazado');
  });

  it('exports the selected cash day, method totals and ALL movements including voided ones', async () => {
    for (const format of FORMATS) {
      const response = await download('cash-day', format, 'finance', {
        fecha: DAY,
        page: 999,
        pageSize: 1,
      });
      expect(response.status).toBe(200);
      if (format === 'excel') {
        const workbook = await workbookFrom(response.body as Buffer);
        const summary = sheetRecords(workbook.getWorksheet('Datos')!)[0];
        expect(summary['Caja']).toBe('Abierta');
        expect(summary['Abonos confirmados']).toBe(15);
        expect(summary['Ingresos manuales']).toBe(ROWS);
        expect(summary['Egresos']).toBe(5);
        expect(summary['Neto del día']).toBe(15 + ROWS - 5);
        expect(summary['Transferencias por verificar']).toBe(ROWS + 1);
        const methods = sheetRecords(workbook.getWorksheet('Totales por método')!);
        expect(
          methods.find((row) => row['Método de pago'] === 'Efectivo')?.['Abonos confirmados'],
        ).toBe(15);
        const movements = sheetRecords(workbook.getWorksheet('Movimientos de caja')!);
        expect(movements).toHaveLength(ROWS + 2);
        expect(
          movements.find((row) => row.Descripción === voidedMovement.descripcion)?.Estado,
        ).toBe('Anulado');
        expect(
          movements.find((row) => row.Descripción === voidedMovement.descripcion)?.[
            'Motivo de anulación'
          ],
        ).toBe('Duplicado de prueba');
        expect(movements.map((row) => row.Descripción)).not.toContain(`${PREFIX}-OTRO-DIA`);
      } else {
        const pdf = await textFromPdf(response.body as Buffer);
        expect(pdf.text).toContain(voidedMovement.descripcion);
        expect(pdf.text).toContain('Anulado');
        expect(pdf.text).not.toContain(`${PREFIX}-OTRO-DIA`);
        expect(pdf.pages).toBeGreaterThan(1);
      }
    }
    const empty = await download('cash-day', 'excel', 'finance', { fecha: '1999-01-01' });
    expect(empty.status).toBe(200);
    const workbook = await workbookFrom(empty.body as Buffer);
    expect(sheetRecords(workbook.getWorksheet('Movimientos de caja')!)).toHaveLength(0);
    expect(sheetRecords(workbook.getWorksheet('Datos')!)[0]['Neto del día']).toBe(0);
  });

  it('validates the existing list and selected-day schemas', async () => {
    for (const [target, who, query] of [
      ['work-orders', 'seller', { estado: 'inventado' }],
      ['quotations', 'seller', { fechaDesde: OTHER_DAY, fechaHasta: DAY }],
      ['quotations', 'seller', { workOrderLinked: 'invalid' }],
      ['payments', 'seller', { estado: 'inventado' }],
      ['purchases', 'finance', { formaPago: 'inventada' }],
      ['suppliers', 'finance', { soloIncompletos: 'invalid' }],
      ['cash-day', 'finance', { fecha: '2001-02-30' }],
      ['cash-day', 'finance', { fecha: '2999-01-01' }],
    ] as const) {
      const response = await download(target, 'excel', who, query);
      expect([400, 422]).toContain(response.status);
    }
  });

  it('fails instead of truncating over 10,000 matches in either format', async () => {
    for (const format of FORMATS) {
      const spy = vi.spyOn(paymentService, 'listPayments').mockResolvedValueOnce({
        items: [],
        total: 10_001,
        totalPages: 101,
        page: 1,
        pageSize: 100,
      });
      try {
        const response = await download('payments', format, 'seller');
        expect(response.status).toBe(400);
        expect((response.body as Buffer).toString()).toContain('10.000');
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({ page: 1, pageSize: 100 }),
          actor('seller').id,
        );
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    }
    const movements = await cashMovementService.listCashMovements(DAY);
    const spy = vi
      .spyOn(cashMovementService, 'listCashMovements')
      .mockResolvedValueOnce(Array.from({ length: 10_001 }, () => movements[0]));
    try {
      expect((await download('cash-day', 'excel', 'finance', { fecha: DAY })).status).toBe(400);
    } finally {
      spy.mockRestore();
    }
  });

  it('leaves lifecycle rows, balances, payment verification and cash closure unchanged', async () => {
    const snapshot = async () => ({
      orders: await WorkOrder.findAll({
        where: { id: [...orders.map((row) => row.id), foreignOrder.id, itemAssignedOrder.id] },
        order: [['id', 'ASC']],
        paranoid: false,
        raw: true,
      }),
      items: await WorkOrderItem.findAll({
        where: { workOrderId: [orders[0].id, itemAssignedOrder.id] },
        order: [['id', 'ASC']],
        raw: true,
      }),
      quotations: await Quotation.findAll({
        where: { codigo: { [Op.like]: `COT-${PREFIX}-%` } },
        order: [['id', 'ASC']],
        paranoid: false,
        raw: true,
      }),
      payments: await Payment.findAll({
        where: { quotationId: [quotations[0].id, foreignQuotation.id] },
        order: [['id', 'ASC']],
        raw: true,
      }),
      purchases: await Purchase.findAll({
        where: { codigo: { [Op.like]: `COM-${PREFIX}-%` } },
        order: [['id', 'ASC']],
        raw: true,
      }),
      movements: await CashMovement.findAll({
        where: { descripcion: { [Op.like]: `${PREFIX}%` } },
        order: [['id', 'ASC']],
        raw: true,
      }),
      closures: await CashClosure.findAll({ where: { fecha: DAY }, raw: true }),
      events: await WorkOrderEvent.count(),
    });
    const before = await snapshot();
    for (const format of FORMATS)
      for (const target of TARGETS) {
        expect(
          (
            await download(
              target,
              format,
              'developer',
              target === 'cash-day' ? { fecha: DAY } : { search: PREFIX },
            )
          ).status,
        ).toBe(200);
      }
    expect(await snapshot()).toEqual(before);
    await pendingPayment.reload();
    expect(pendingPayment.estado).toBe('por_verificar');
    expect(await buildOperationsExport('clients', {}, actor('seller'))).toBeNull();
  }, 60_000);
});
