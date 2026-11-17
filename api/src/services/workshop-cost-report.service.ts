import { Op, Transaction } from 'sequelize';

import {
  generateListExportExcel,
  generateListExportPdf,
} from './exports/export-renderer.service.js';
import { EXPORT_MAX_ROWS, exportFilters } from './exports/export-utils.js';
import { calculateWorkshopCostReport } from './workshop-cost-report.calculator.js';
import { getWorkshopDayRange } from './workshop-personnel.service.js';
import { sequelize } from '../config/database.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { ApiError } from '../utils/ApiError.js';

import type { ExportDataset } from './exports/export-types.js';
import type { WorkshopCostReport, WorkshopCostReportFilters } from '@unithor/shared';

const assertSize = (length: number): void => {
  if (length > EXPORT_MAX_ROWS)
    throw ApiError.badRequest(
      'El reporte supera 10.000 registros. Acota las fechas o la OT para obtener el resultado completo.',
    );
};

/** A single read snapshot prevents correction/reassignment races between these queries. */
export const getWorkshopCostReport = async (
  filters: WorkshopCostReportFilters,
  snapshotTransaction?: Transaction,
): Promise<WorkshopCostReport> => {
  const read = async (transaction: Transaction): Promise<WorkshopCostReport> => {
      const now = new Date();
      const { start } = await getWorkshopDayRange(filters.fechaDesde, transaction);
      const { end } = await getWorkshopDayRange(filters.fechaHasta, transaction);
      const orderScope = filters.workOrderId ? { workOrderId: filters.workOrderId } : {};
      const limit = EXPORT_MAX_ROWS + 1;
      const sessions = await WorkOrderItemSession.findAll({
        where: {
          ...orderScope,
          supersededAt: null,
          startedAt: { [Op.lt]: end, [Op.lte]: now },
          [Op.or]: [
            { kind: 'ajuste', startedAt: { [Op.gte]: start } },
            {
              kind: { [Op.ne]: 'ajuste' },
              [Op.or]: [{ endedAt: { [Op.gt]: start } }, { endedAt: null }],
            },
          ],
        },
        order: [['id', 'ASC']],
        limit,
        transaction,
      });
      assertSize(sessions.length);
      const newAssignments = await WorkOrderItemAssignment.findAll({
        attributes: ['id', 'workOrderItemId'],
        where: { ...orderScope, createdAt: { [Op.gte]: start, [Op.lt]: end, [Op.lte]: now } },
        order: [['id', 'ASC']],
        limit,
        transaction,
      });
      assertSize(newAssignments.length);
      const newItems = await WorkOrderItem.findAll({
        attributes: ['id'],
        where: {
          ...orderScope,
          tipoLinea: { [Op.ne]: 'parte' },
          createdAt: { [Op.gte]: start, [Op.lt]: end, [Op.lte]: now },
        },
        order: [['id', 'ASC']],
        limit,
        transaction,
      });
      assertSize(newItems.length);
      const itemIds = [
        ...new Set([
          ...sessions.map((row) => row.workOrderItemId),
          ...newAssignments.map((row) => row.workOrderItemId),
          ...newItems.map((row) => row.id),
        ]),
      ];
      assertSize(itemIds.length);
      if (!itemIds.length)
        return calculateWorkshopCostReport(
          filters,
          { items: [], assignments: [], sessions: [] },
          start,
          end,
          now,
        );
      const items = await WorkOrderItem.findAll({
        attributes: [
          'id',
          'workOrderId',
          'descripcion',
          'tipoLinea',
          'cantidad',
          'horasHombreEstimadas',
          'assignedUserId',
          'createdAt',
        ],
        where: { id: { [Op.in]: itemIds }, tipoLinea: { [Op.ne]: 'parte' } },
        include: [
          {
            model: WorkOrder,
            as: 'workOrder',
            required: true,
            paranoid: false,
            ...(filters.estado ? { where: { estado: filters.estado } } : {}),
            attributes: ['id', 'codigo', 'estado'],
            include: [{ model: Vehicle, as: 'vehicle', attributes: ['patente'], paranoid: false }],
          },
        ],
        order: [['id', 'ASC']],
        transaction,
      });
      // No active-worker or active-assignment predicate: inactive history remains reportable.
      const assignments = await WorkOrderItemAssignment.findAll({
        where: { workOrderItemId: { [Op.in]: items.map((item) => item.id) } },
        order: [['id', 'ASC']],
        limit,
        transaction,
      });
      assertSize(assignments.length);
      const report = calculateWorkshopCostReport(
        filters,
        { items, assignments, sessions },
        start,
        end,
        now,
      );
      assertSize(report.rows.length);
      return report;
  };
  return snapshotTransaction ? read(snapshotTransaction) : sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true }, read,
  );
};

/** Both formats consume exactly the same filtered calculation as the JSON preview. */
export const buildWorkshopCostReportDataset = (report: WorkshopCostReport): ExportDataset => ({
  title: 'Costos y horas de mano de obra',
  filters: exportFilters(report.filters),
  notes: [...report.notes, `Corte de los datos: ${report.generadoEn}`],
  tables: [
    {
      name: 'Mano de obra',
      columns: [
        { key: 'workOrderCodigo', header: 'OT', width: 15 },
        { key: 'patente', header: 'Patente', width: 12, pdf: false },
        { key: 'estado', header: 'Estado OT', width: 18, pdf: false },
        { key: 'descripcion', header: 'Servicio', width: 30 },
        { key: 'userName', header: 'Trabajador', width: 23 },
        { key: 'specialtyName', header: 'Especialidad', width: 20, pdf: false },
        { key: 'assignmentId', header: 'Asignación ID', width: 15, kind: 'number', pdf: false },
        { key: 'assignmentState', header: 'Equipo', width: 15, pdf: false },
        {
          key: 'originalEstimatedHours',
          header: 'H. originales (referencia)',
          width: 18,
          kind: 'number',
          pdf: false,
        },
        { key: 'estimatedHours', header: 'H. estimadas', width: 13, kind: 'number' },
        { key: 'actualHours', header: 'H. reales', width: 12, kind: 'number' },
        { key: 'actualMinutes', header: 'Minutos reales', width: 15, kind: 'number', pdf: false },
        { key: 'costHourly', header: 'Costo/h CLP', width: 17, kind: 'money', pdf: false },
        { key: 'saleHourly', header: 'Venta/h CLP', width: 17, kind: 'money', pdf: false },
        { key: 'estimatedCost', header: 'Costo estimado', width: 19, kind: 'money' },
        { key: 'actualCost', header: 'Costo real', width: 19, kind: 'money' },
        { key: 'actualSale', header: 'Venta referencial', width: 19, kind: 'money', pdf: false },
        { key: 'actualMargin', header: 'Margen referencial', width: 19, kind: 'money', pdf: false },
        { key: 'sessions', header: 'Sesiones', width: 12, kind: 'number', pdf: false },
        { key: 'runningSessions', header: 'En curso', width: 12, kind: 'number', pdf: false },
        { key: 'rateStatus', header: 'Tarifa', width: 20 },
      ],
      rows: report.rows.map((row) => ({
        ...row,
        userName:
          row.userName ?? (row.userId === null ? 'Sin atribuir' : `Trabajador #${row.userId}`),
        assignmentState:
          row.assignmentActive === null
            ? 'Sin vínculo'
            : row.assignmentActive
              ? 'Vigente'
              : 'Histórico',
        rateStatus: row.costHourly === null ? 'Sin tarifa de costo' : 'Costo conocido',
      })),
    },
    {
      name: 'Totales del período',
      columns: [
        { key: 'label', header: 'Indicador', width: 48 },
        { key: 'value', header: 'Valor', width: 24, kind: 'number' },
      ],
      rows: [
        { label: 'Horas estimadas del equipo vigente', value: report.totals.estimatedHours },
        { label: 'Horas reales del período', value: report.totals.actualHours },
        {
          label: 'Costo estimado total CLP (vacío = incompleto)',
          value: report.totals.estimatedCost,
        },
        { label: 'Costo real total CLP (vacío = incompleto)', value: report.totals.actualCost },
        { label: 'Subtotal de costos reales conocidos CLP', value: report.totals.knownActualCost },
        { label: 'Filas sin tarifa histórica de costo', value: report.totals.missingCostRateCount },
        { label: 'Filas sin tarifa histórica de venta', value: report.totals.missingSaleRateCount },
        { label: 'Estimaciones pendientes', value: report.totals.missingEstimateCount },
        { label: 'Sesiones sin asignación vinculada', value: report.totals.unlinkedSessionCount },
      ],
    },
  ],
});

export const generateWorkshopCostReport = async (
  filters: WorkshopCostReportFilters,
  format: 'pdf' | 'excel',
): Promise<Uint8Array> => {
  const dataset = buildWorkshopCostReportDataset(await getWorkshopCostReport(filters));
  return format === 'pdf' ? generateListExportPdf(dataset) : generateListExportExcel(dataset);
};
