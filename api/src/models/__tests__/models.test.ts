import { Sequelize } from 'sequelize-typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CatalogItem,
  Client,
  Payment,
  Permission,
  Quotation,
  QuotationItem,
  RefreshToken,
  Role,
  RolePermission,
  User,
  Vehicle,
  WorkOrder,
  WorkOrderInspection,
  WorkOrderItem,
  initModels,
  models,
} from '../index.js';

describe('Sequelize Models & Database Integration (unithor_test)', () => {
  let testSequelize: Sequelize;

  beforeAll(async () => {
    testSequelize = new Sequelize('mysql://root:@localhost:3306/unithor_test', {
      dialect: 'mysql',
      logging: false,
      define: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        timestamps: true,
        underscored: true,
      },
    });

    initModels(testSequelize);
    await testSequelize.authenticate();
  });

  afterAll(async () => {
    await testSequelize.close();
  });

  beforeEach(async () => {
    // Limpieza de tablas para aislar cada test
    await Payment.destroy({ where: {}, force: true });
    await QuotationItem.destroy({ where: {}, force: true });
    await Quotation.destroy({ where: {}, force: true });
    await WorkOrderItem.destroy({ where: {}, force: true });
    await WorkOrderInspection.destroy({ where: {}, force: true });
    await WorkOrder.destroy({ where: {}, force: true });
    await CatalogItem.destroy({ where: {}, force: true });
    await Vehicle.destroy({ where: {}, force: true });
    await Client.destroy({ where: {}, force: true });
    await RefreshToken.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
    await RolePermission.destroy({ where: {}, force: true });
    await Permission.destroy({ where: {}, force: true });
    await Role.destroy({ where: {}, force: true });
  });

  it('verifica que los 14 modelos se registran correctamente en la instancia Sequelize', () => {
    expect(models.length).toBe(14);

    const registeredModelNames = Object.keys(testSequelize.models);
    expect(registeredModelNames).toContain('Role');
    expect(registeredModelNames).toContain('Permission');
    expect(registeredModelNames).toContain('RolePermission');
    expect(registeredModelNames).toContain('User');
    expect(registeredModelNames).toContain('RefreshToken');
    expect(registeredModelNames).toContain('Client');
    expect(registeredModelNames).toContain('Vehicle');
    expect(registeredModelNames).toContain('CatalogItem');
    expect(registeredModelNames).toContain('WorkOrder');
    expect(registeredModelNames).toContain('WorkOrderItem');
    expect(registeredModelNames).toContain('WorkOrderInspection');
    expect(registeredModelNames).toContain('Quotation');
    expect(registeredModelNames).toContain('QuotationItem');
    expect(registeredModelNames).toContain('Payment');
  });

  it('crea un Role + User y verifica la relación de pertenencia', async () => {
    const role = await Role.create({
      nombre: 'admin',
      descripcion: 'Administrador del sistema',
    });
    expect(role.id).toBeDefined();

    const user = await User.create({
      nombre: 'Administrador Principal',
      email: 'admin@unithor.com',
      passwordHash: '$2b$10$abcdefg1234567890',
      roleId: role.id,
      activo: true,
    });
    expect(user.id).toBeDefined();
    expect(user.username).toBe('admin');

    const userWithRole = await User.findByPk(user.id, {
      include: [{ model: Role }],
    });
    expect(userWithRole?.role).toBeDefined();
    expect(userWithRole?.role?.nombre).toBe('admin');
  });

  it('crea Client + Vehicle y verifica la asociación por Foreign Key', async () => {
    const client = await Client.create({
      nombre: 'Transportes Rápidos SpA',
      rut: '76.123.456-7',
      tipo: 'empresa',
      email: 'contacto@transportes.cl',
      telefono: '+56911223344',
    });

    const vehicle = await Vehicle.create({
      patente: 'ABCD12',
      marca: 'Toyota',
      modelo: 'Hilux',
      ano: 2023,
      clientId: client.id,
    });
    expect(vehicle.id).toBeDefined();

    const clientWithVehicles = await Client.findByPk(client.id, {
      include: [{ model: Vehicle }],
    });
    expect(clientWithVehicles?.vehicles).toBeDefined();
    expect(clientWithVehicles?.vehicles?.length).toBe(1);
    expect(clientWithVehicles?.vehicles?.[0].patente).toBe('ABCD12');
  });

  it('crea WorkOrder + WorkOrderItem y verifica eliminación en cascada', async () => {
    const client = await Client.create({ nombre: 'Juan Soto' });
    const vehicle = await Vehicle.create({ patente: 'XYZW99' });

    const workOrder = await WorkOrder.create({
      codigo: 'OT-2026-0001',
      clientId: client.id,
      vehicleId: vehicle.id,
      estado: 'en_progreso',
    });

    const item = await WorkOrderItem.create({
      workOrderId: workOrder.id,
      descripcion: 'Cambio de pastillas de freno delanteras',
      cantidad: 1,
      precioUnitario: 45000,
      subtotal: 45000,
    });
    expect(item.id).toBeDefined();

    const inspection = await WorkOrderInspection.create({
      workOrderId: workOrder.id,
      nivelCombustible: 'medio',
      llantaDelanteraIzquierda: 'bueno',
      inventario: ['botiquin'],
    });
    expect(inspection.id).toBeDefined();

    // Eliminar la orden de trabajo directamente (hard delete para probar cascade en BD)
    await WorkOrder.destroy({ where: { id: workOrder.id }, force: true });

    const remainingItems = await WorkOrderItem.findAll({
      where: { workOrderId: workOrder.id },
    });
    expect(remainingItems.length).toBe(0);
    const remainingInspections = await WorkOrderInspection.findAll({
      where: { workOrderId: workOrder.id },
    });
    expect(remainingInspections.length).toBe(0);
  });

  it('crea una Quotation con work_order_id = null (COT sin OT) y persiste correctamente', async () => {
    const client = await Client.create({ nombre: 'Empresa Logística' });

    const quotation = await Quotation.create({
      codigo: 'COT-2026-0001',
      workOrderId: null, // Sin OT asociada
      clientId: client.id,
      estadoPago: 'por_pagar',
      subtotal: 100000,
      total: 119000,
      pagado: 0,
    });

    expect(quotation.id).toBeDefined();
    expect(quotation.workOrderId).toBeNull();
    expect(quotation.total).toBe(119000);

    const fetched = await Quotation.findByPk(quotation.id);
    expect(fetched?.workOrderId).toBeNull();
  });

  it('verifica soft delete: destroy() establece deleted_at no nulo y findAll() lo excluye', async () => {
    const client = await Client.create({
      nombre: 'Cliente para Soft Delete',
      tipo: 'cliente',
    });
    expect(client.deletedAt == null).toBe(true);

    // Ejecutar soft delete
    await client.destroy();

    // findAll sin paranoid: false no debe devolverlo
    const activeClients = await Client.findAll({ where: { id: client.id } });
    expect(activeClients.length).toBe(0);

    // Con paranoid: false debe encontrarse y tener deleted_at definido
    const deletedClient = await Client.findOne({
      where: { id: client.id },
      paranoid: false,
    });
    expect(deletedClient).not.toBeNull();
    expect(deletedClient?.deletedAt).not.toBeNull();
    expect(deletedClient?.deletedAt instanceof Date).toBe(true);
  });
});
