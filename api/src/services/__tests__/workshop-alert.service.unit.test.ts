import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getWorkOrderAlerts,
  getWorkshopAlerts,
  getWorkshopAlertSettings,
  updateWorkshopAlertSettings,
} from '../workshop-alert.service.js';

const mocks = vi.hoisted(() => {
  const model = () => ({
    findAll: vi.fn(),
    findOne: vi.fn(),
    findByPk: vi.fn(),
    findOrCreate: vi.fn(),
  });
  return {
    user: model(),
    order: model(),
    item: model(),
    assignment: model(),
    session: model(),
    quotation: model(),
    line: model(),
    price: model(),
    time: model(),
    settings: model(),
    schedule: model(),
    specialty: model(),
    transaction: vi.fn(),
    access: vi.fn(),
    assigned: vi.fn(),
    shift: vi.fn(),
    day: vi.fn(),
  };
});
vi.mock('../../config/database.js', () => ({ sequelize: { transaction: mocks.transaction } }));
vi.mock('../../models/User.js', () => ({ User: mocks.user }));
vi.mock('../../models/Role.js', () => ({ Role: {} }));
vi.mock('../../models/Permission.js', () => ({ Permission: {} }));
vi.mock('../../models/WorkOrder.js', () => ({ WorkOrder: mocks.order }));
vi.mock('../../models/WorkOrderItem.js', () => ({ WorkOrderItem: mocks.item }));
vi.mock('../../models/WorkOrderItemAssignment.js', () => ({
  WorkOrderItemAssignment: mocks.assignment,
}));
vi.mock('../../models/WorkOrderItemSession.js', () => ({ WorkOrderItemSession: mocks.session }));
vi.mock('../../models/Quotation.js', () => ({ Quotation: mocks.quotation }));
vi.mock('../../models/QuotationItem.js', () => ({ QuotationItem: mocks.line }));
vi.mock('../../models/WorkOrderPriceSuggestion.js', () => ({
  WorkOrderPriceSuggestion: mocks.price,
}));
vi.mock('../../models/WorkshopTimeRequest.js', () => ({ WorkshopTimeRequest: mocks.time }));
vi.mock('../../models/WorkshopAlertSettings.js', () => ({ WorkshopAlertSettings: mocks.settings }));
vi.mock('../../models/WorkshopSchedule.js', () => ({ WorkshopSchedule: mocks.schedule }));
vi.mock('../../models/WorkerSpecialty.js', () => ({ WorkerSpecialty: mocks.specialty }));
vi.mock('../work-order.service.js', () => ({ assertWorkOrderAccess: mocks.access }));
vi.mock('../work-order-team-access.js', () => ({ getAssignedOrderIds: mocks.assigned }));
vi.mock('../workshop-personnel.service.js', () => ({
  getWorkerShift: mocks.shift,
  getWorkshopDayRange: mocks.day,
}));
vi.mock('../workshop-transaction.js', () => ({
  withWorkshopTransaction: (work: (transaction: object) => Promise<unknown>) =>
    work({ LOCK: { UPDATE: 'UPDATE' } }),
}));

const actor = (role = 'admin', granted = true) => ({
  id: 7,
  nombre: 'Actor',
  role: {
    nombre: role,
    permissions: granted
      ? [
          { modulo: 'taller', accion: 'read' },
          { modulo: 'taller', accion: 'update' },
        ]
      : [],
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((_options, run) => run({}));
  mocks.user.findOne.mockResolvedValue(actor());
  for (const model of [
    mocks.user,
    mocks.order,
    mocks.item,
    mocks.assignment,
    mocks.session,
    mocks.quotation,
    mocks.line,
    mocks.price,
    mocks.time,
    mocks.specialty,
  ])
    model.findAll.mockResolvedValue([]);
  mocks.settings.findByPk.mockResolvedValue(null);
  mocks.schedule.findByPk.mockResolvedValue(null);
  mocks.assigned.mockResolvedValue([]);
  mocks.day.mockResolvedValue({
    start: new Date('2026-11-16T03:00:00Z'),
    end: new Date('2026-11-17T03:00:00Z'),
  });
});

describe('Workshop alert services without database connections', () => {
  it.each(['admin', 'desarrollador'])(
    'preserves %s bypass with an empty matrix and GET never creates settings',
    async (role) => {
      mocks.user.findOne.mockResolvedValue(actor(role, false));
      expect(await getWorkshopAlertSettings(7)).toMatchObject({
        id: 1,
        timeTolerancePercent: 0,
        commercialTolerancePercent: 0,
        updatedAt: null,
      });
      expect(mocks.settings.findOrCreate).not.toHaveBeenCalled();
      expect(mocks.user.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ as: 'role', include: expect.any(Array) }),
          ]),
        }),
      );
    },
  );
  it('denies forbidden persisted roles despite forced grants and requires workshop read for mechanics', async () => {
    for (const role of ['vendedor', 'bodeguero', 'finanzas']) {
      mocks.user.findOne.mockResolvedValue(actor(role));
      await expect(getWorkshopAlertSettings(7)).rejects.toMatchObject({ statusCode: 403 });
    }
    mocks.user.findOne.mockResolvedValue(actor('mecanico', false));
    await expect(getWorkshopAlerts('2026-11-16', 7)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('restricts settings mutation to administration and updates only the provided tolerance', async () => {
    mocks.user.findOne.mockResolvedValue(actor('jefe'));
    await expect(
      updateWorkshopAlertSettings({ timeTolerancePercent: 10 }, 7),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.settings.findOrCreate).not.toHaveBeenCalled();
    mocks.user.findOne.mockResolvedValue(actor('admin', false));
    const row = {
      timeTolerancePercent: 0,
      commercialTolerancePercent: 25,
      updatedBy: null,
      updatedAt: new Date('2026-11-16'),
      update: vi.fn(),
    };
    row.update.mockImplementation(async (values) => Object.assign(row, values));
    mocks.settings.findByPk.mockResolvedValue(row);
    const result = await updateWorkshopAlertSettings({ timeTolerancePercent: 10 }, 7);
    expect(row.update).toHaveBeenCalledWith(
      { timeTolerancePercent: 10, updatedBy: 7 },
      expect.any(Object),
    );
    expect(result).toMatchObject({ timeTolerancePercent: 10, commercialTolerancePercent: 25 });
  });
  it('keeps GET reads bounded and read-only without creating missing settings or settling timers', async () => {
    expect(await getWorkshopAlerts('2026-11-16', 7)).toMatchObject({
      alerts: [],
      counts: { total: 0, high: 0 },
      scheduleConfigured: false,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true, isolationLevel: 'REPEATABLE READ' }),
      expect.any(Function),
    );
    expect(mocks.order.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 501 }));
    expect(mocks.settings.findOrCreate).not.toHaveBeenCalled();
  });
  it('uses bounded current-team access for mechanics, excludes commercial reads and validates per-OT access', async () => {
    mocks.user.findOne.mockResolvedValue(actor('mecanico'));
    await getWorkshopAlerts('2026-11-16', 7);
    expect(mocks.assigned).toHaveBeenCalledWith(7, expect.any(Object), {
      activeOnly: true,
      limit: 501,
    });
    expect(mocks.quotation.findAll).not.toHaveBeenCalled();
    expect(mocks.price.findAll).not.toHaveBeenCalled();
    await expect(getWorkOrderAlerts(9, 7)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.access).toHaveBeenCalledWith(9, 7, expect.any(Object));
  });
  it('fails explicitly rather than silently truncating overlarge overviews', async () => {
    mocks.order.findAll.mockResolvedValue(Array.from({ length: 501 }, (_, id) => ({ id })));
    await expect(getWorkshopAlerts('2026-11-16', 7)).rejects.toMatchObject({ statusCode: 400 });
  });
});
