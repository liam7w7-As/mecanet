import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildWorkshopCostReportDataset,
  generateWorkshopCostReport,
  getWorkshopCostReport,
} from '../workshop-cost-report.service.js';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  item: { findAll: vi.fn() },
  assignment: { findAll: vi.fn() },
  session: { findAll: vi.fn() },
  dayRange: vi.fn(),
  pdf: vi.fn(),
  excel: vi.fn(),
}));
vi.mock('../../config/database.js', () => ({ sequelize: { transaction: mocks.transaction } }));
vi.mock('../../models/Vehicle.js', () => ({ Vehicle: {} }));
vi.mock('../../models/WorkOrder.js', () => ({ WorkOrder: {} }));
vi.mock('../../models/WorkOrderItem.js', () => ({ WorkOrderItem: mocks.item }));
vi.mock('../../models/WorkOrderItemAssignment.js', () => ({
  WorkOrderItemAssignment: mocks.assignment,
}));
vi.mock('../../models/WorkOrderItemSession.js', () => ({ WorkOrderItemSession: mocks.session }));
vi.mock('../workshop-personnel.service.js', () => ({ getWorkshopDayRange: mocks.dayRange }));
vi.mock('../exports/export-renderer.service.js', () => ({
  generateListExportPdf: mocks.pdf,
  generateListExportExcel: mocks.excel,
}));

const start = new Date('2002-03-04T03:00:00Z');
const end = new Date('2002-03-05T03:00:00Z');
const filters = {
  fechaDesde: '2002-03-04',
  fechaHasta: '2002-03-04',
  estado: 'en_progreso' as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (_options, run) => run({ readOnlyTest: true }));
  mocks.dayRange.mockResolvedValue({ start, end });
  mocks.session.findAll.mockResolvedValue([
    {
      id: 1,
      workOrderId: 4,
      workOrderItemId: 5,
      userId: 6,
      userName: 'Histórico',
      assignmentId: 7,
      kind: 'manual',
      status: 'cerrada',
      startedAt: new Date('2002-03-04T19:00:00Z'),
      endedAt: new Date('2002-03-04T20:00:00Z'),
      durationMinutes: 60,
      scheduledEndAt: null,
      supersededAt: null,
    },
  ]);
  mocks.item.findAll
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        id: 5,
        workOrderId: 4,
        descripcion: 'Servicio',
        tipoLinea: 'especifico',
        cantidad: 1,
        horasHombreEstimadas: 1,
        assignedUserId: 6,
        createdAt: start,
        workOrder: { id: 4, codigo: 'OT4', estado: 'en_progreso' },
      },
    ]);
  mocks.assignment.findAll
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        id: 7,
        workOrderId: 4,
        workOrderItemId: 5,
        userId: 6,
        userName: 'Histórico',
        active: false,
        specialtyId: null,
        specialtyName: null,
        costHourly: null,
        saleHourly: null,
        estimatedHours: 1,
        originalEstimatedHours: 1,
        createdAt: start,
      },
    ]);
});

describe('Workshop cost query and export wiring without a database', () => {
  it('projects status for the combined status/user/search filter and includes inactive snapshots', async () => {
    const result = await getWorkshopCostReport({ ...filters, userId: 6, search: 'servicio' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      actualMinutes: 60,
      actualCost: null,
      assignmentActive: false,
    });
    const query = mocks.item.findAll.mock.calls[1][0];
    expect(query.include[0]).toMatchObject({
      where: { estado: 'en_progreso' },
      attributes: ['id', 'codigo', 'estado'],
      paranoid: false,
    });
    expect(mocks.assignment.findAll.mock.calls[1][0].where).not.toHaveProperty('active');
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true, isolationLevel: 'REPEATABLE READ' }),
      expect.any(Function),
    );
  });
  it('leaves missing costs null through the export dataset, with separate known subtotals', async () => {
    const dataset = buildWorkshopCostReportDataset(await getWorkshopCostReport(filters));
    expect(dataset.tables[0].rows[0]).toMatchObject({
      actualCost: null,
      costHourly: null,
      assignmentState: 'Histórico',
    });
    expect(dataset.tables[1].rows).toContainEqual({
      label: 'Costo real total CLP (vacío = incompleto)',
      value: null,
    });
    expect(dataset.tables[1].rows).toContainEqual({
      label: 'Subtotal de costos reales conocidos CLP',
      value: 0,
    });
    expect(dataset.notes?.some((note) => note.includes('no enviar a clientes'))).toBe(true);
  });
  it.each(['pdf', 'excel'] as const)(
    'uses the existing %s renderer with the same complete filtered dataset',
    async (format) => {
      const renderer = format === 'pdf' ? mocks.pdf : mocks.excel;
      renderer.mockResolvedValue(new Uint8Array([1, 2, 3]));
      expect(await generateWorkshopCostReport(filters, format)).toEqual(new Uint8Array([1, 2, 3]));
      expect(renderer).toHaveBeenCalledWith(
        expect.objectContaining({ filters, title: 'Costos y horas de mano de obra' }),
      );
    },
  );
  it('rejects overlarge results without silently truncating them', async () => {
    mocks.session.findAll.mockResolvedValue(Array.from({ length: 10001 }, (_, id) => ({ id })));
    await expect(getWorkshopCostReport(filters)).rejects.toMatchObject({ statusCode: 400 });
  });
});
