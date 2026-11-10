import { getWorkOrderStatusLabel } from '@unithor/shared';
import { z } from 'zod';

import { exportFilters, EXPORT_MAX_ROWS } from './export-utils.js';
import { ApiError } from '../../utils/ApiError.js';
import { getWorkshopDailyReport } from '../work-order-labor.service.js';

import type { ExportBuilder, ExportTable } from './export-types.js';
import type { WorkOrderStatus } from '@unithor/shared';

export const buildLaborExport: ExportBuilder = async (target, raw, actor) => {
  if (target !== 'workshop-daily') return null;
  const query = z.object({ fecha: z.string().date().optional() }).parse(raw);
  const report = await getWorkshopDailyReport(query.fecha, actor.id);
  const tables: ExportTable[] = [
    {
      name: 'Resumen',
      columns: [
        { key: 'indicador', header: 'Indicador', width: 35 },
        { key: 'valor', header: 'Valor', kind: 'number' },
      ],
      rows: [
        { indicador: 'Horas registradas', valor: report.totalHoras },
        { indicador: 'Sesiones', valor: report.totalSesiones },
        { indicador: 'Trabajos completados', valor: report.totalItemsCompletados },
        { indicador: 'Órdenes con actividad', valor: report.ordenes.length },
      ],
    },
    {
      name: 'Avance por persona',
      columns: [
        { key: 'id', header: 'ID', width: 8, pdf: false },
        { key: 'nombre', header: 'Persona', width: 30 },
        { key: 'rol', header: 'Rol', width: 15 },
        { key: 'horas', header: 'Horas', width: 12, kind: 'number' },
        { key: 'sesiones', header: 'Sesiones', width: 12, kind: 'number' },
        { key: 'completados', header: 'Completados', width: 14, kind: 'number' },
        { key: 'estado', header: 'Estado', width: 17 },
      ],
      rows: report.usuarios.map((person) => ({
        id: person.id,
        nombre: person.nombre,
        rol: person.rol,
        horas: person.horas,
        sesiones: person.sesiones,
        completados: person.itemsCompletados,
        estado: person.enCurso
          ? 'En curso'
          : person.sesiones > 0
            ? 'Con actividad'
            : 'Sin actividad',
      })),
    },
    {
      name: 'Órdenes con actividad',
      columns: [
        { key: 'id', header: 'ID', width: 8, pdf: false },
        { key: 'codigo', header: 'OT', width: 15 },
        { key: 'patente', header: 'Patente', width: 15 },
        { key: 'estado', header: 'Estado', width: 20 },
        { key: 'horas', header: 'Horas', width: 10, kind: 'number' },
        { key: 'completados', header: 'Completados', width: 13, kind: 'number' },
        { key: 'mecanicos', header: 'Mecánicos', width: 32 },
      ],
      rows: report.ordenes.map((order) => ({
        id: order.id,
        codigo: order.codigo,
        patente: order.patente,
        estado: getWorkOrderStatusLabel(order.estado as WorkOrderStatus),
        horas: order.horas,
        completados: order.completados,
        mecanicos: order.mecanicos.join(', '),
      })),
    },
    {
      name: 'Detalle por trabajo',
      columns: [
        { key: 'persona', header: 'Persona', width: 25 },
        { key: 'codigo', header: 'OT', width: 15 },
        { key: 'descripcion', header: 'Trabajo', width: 45 },
        { key: 'minutos', header: 'Minutos', width: 12, kind: 'number' },
        { key: 'estado', header: 'Estado', width: 15 },
      ],
      rows: report.usuarios.flatMap((person) =>
        person.detalle.map((detail) => ({
          persona: person.nombre,
          codigo: detail.workOrderCodigo,
          descripcion: detail.itemDescripcion,
          minutos: detail.minutos,
          estado: detail.estado,
        })),
      ),
    },
  ];
  if (tables.some((table) => table.rows.length > EXPORT_MAX_ROWS))
    throw ApiError.badRequest('El reporte diario supera el máximo de registros exportables.');
  return {
    title: 'Reporte diario de horas de taller',
    filters: exportFilters({ fecha: report.fecha }),
    tables,
  };
};
