import {
  generateListExportExcel,
  generateListExportPdf,
} from './exports/export-renderer.service.js';
import { exportFilters } from './exports/export-utils.js';

import type { ExportColumn, ExportDataset, ExportTable } from './exports/export-types.js';
import type { WorkshopCommercialSnapshot, WorkshopPerformanceReport } from '@unithor/shared';

const commercialColumns: ExportColumn[] = [
  { key: 'actualMinutes', header: 'Minutos acumulados', kind: 'number', pdf: false },
  { key: 'referenceSource', header: 'Origen de referencia', pdf: false },
  { key: 'actualHours', header: 'H. reales acumuladas', kind: 'number', width: 14, pdf: false },
  { key: 'referenceHourlyRate', header: 'Referencia/h CLP', kind: 'money', width: 18, pdf: false },
  { key: 'theoreticalNet', header: 'Teórico neto', kind: 'money', width: 17 },
  { key: 'quotedNet', header: 'Cotizado neto', kind: 'money', width: 17 },
  { key: 'receivedNet', header: 'Recibido neto estimado', kind: 'money', width: 18 },
  {
    key: 'equivalentQuotedHours',
    header: 'H. equivalentes cotizadas',
    kind: 'number',
    width: 18,
    pdf: false,
  },
  {
    key: 'equivalentReceivedHours',
    header: 'H. equivalentes recibidas',
    kind: 'number',
    width: 18,
    pdf: false,
  },
  { key: 'hoursDifference', header: 'Diferencia horas', kind: 'number', width: 15, pdf: false },
  { key: 'netDifference', header: 'Diferencia neta', kind: 'money', width: 17, pdf: false },
  { key: 'actualCost', header: 'Costo acumulado', kind: 'money', width: 17 },
  { key: 'commercialMargin', header: 'Margen comercial', kind: 'money', width: 17 },
];

const snapshotRows = (snapshot: WorkshopCommercialSnapshot) =>
  commercialColumns
    .filter((column) => !['actualMinutes', 'referenceSource'].includes(column.key))
    .map((column) => ({
      indicator: column.header,
      value: snapshot[column.key as keyof WorkshopCommercialSnapshot],
    }));

/** Pure builder: no DB reads or recalculation; preview and files consume the same server snapshot. */
export const buildWorkshopPerformanceDataset = (
  report: WorkshopPerformanceReport,
): ExportDataset => {
  const { utilization: u, efficiency: e, quality: q, commercial, periods } = report.analysis;
  const { groupBy, catalogItemId, workOrderItemId, ...scopeFilters } = report.filters;
  const summary: ExportTable = {
    name: 'Indicadores del período',
    columns: [
      { key: 'indicator', header: 'Indicador (h, %, CLP según etiqueta)', width: 60 },
      { key: 'value', header: 'Valor', kind: 'number', width: 22 },
    ],
    rows: [
      { indicator: 'Utilización (%)', value: u.registeredPercent },
      { indicator: 'Eficiencia (%)', value: e.percent },
      { indicator: 'Trabajadores', value: u.workers },
      { indicator: 'Horas registradas', value: u.registeredHours },
      { indicator: 'Horas regulares', value: u.regularHours },
      { indicator: 'Horas extra', value: u.extraHours },
      { indicator: 'Horas programadas', value: u.scheduledHours },
      { indicator: 'Horas sin registro', value: u.unregisteredHours },
      { indicator: 'Horas estimadas (eficiencia)', value: e.estimatedHours },
      { indicator: 'Horas reales (eficiencia)', value: e.actualHours },
      { indicator: 'Desviación de horas', value: e.deviationHours },
      { indicator: 'Servicios revisados', value: q.reviewedServices },
      { indicator: 'Aprobados a la primera', value: q.firstPassApproved },
      { indicator: 'Primera aprobación (%)', value: q.firstPassPercent },
      { indicator: 'Rechazos', value: q.rejections },
      { indicator: 'Servicios pendientes', value: q.pendingServices },
      { indicator: 'Horas de retrabajo', value: q.reworkHours },
      { indicator: 'Horas estimadas del equipo vigente', value: report.totals.estimatedHours },
      { indicator: 'Horas reales del período (costos)', value: report.totals.actualHours },
      { indicator: 'Costo estimado del período CLP', value: report.totals.estimatedCost },
      { indicator: 'Costo real del período CLP', value: report.totals.actualCost },
      { indicator: 'Subtotal de costos conocidos CLP', value: report.totals.knownActualCost },
      {
        indicator: 'Filas sin tarifa histórica de costo',
        value: report.totals.missingCostRateCount,
      },
      { indicator: 'Estimaciones pendientes', value: report.totals.missingEstimateCount },
    ],
  };
  const commercialSummary: ExportTable = {
    name: 'Comercial acumulado',
    columns: summary.columns,
    rows: snapshotRows(commercial.totals),
  };
  const commercialServices: ExportTable = {
    name: 'Comparación por servicio',
    columns: [
      { key: 'workOrderCodigo', header: 'OT', width: 14 },
      { key: 'description', header: 'Servicio', width: 30 },
      { key: 'patente', header: 'Patente', width: 14, pdf: false },
      { key: 'workOrderId', header: 'OT ID', kind: 'number', pdf: false },
      { key: 'workOrderItemId', header: 'Servicio OT ID', kind: 'number', pdf: false },
      { key: 'quotationId', header: 'Cotización ID', kind: 'number', pdf: false },
      { key: 'quotationCode', header: 'Cotización', pdf: false },
      ...commercialColumns,
      { key: 'latestReviewId', header: 'Última revisión ID', kind: 'number', pdf: false },
    ],
    rows: commercial.services.map(({ latestReview, ...service }) => ({
      ...service,
      latestReviewId: latestReview?.id ?? null,
    })),
  };
  const assignments: ExportTable = {
    name: 'Detalle por asignación',
    columns: [
      { key: 'key', header: 'Clave', pdf: false },
      { key: 'workOrderId', header: 'OT ID', kind: 'number', pdf: false },
      { key: 'workOrderCodigo', header: 'OT', width: 14 },
      { key: 'workOrderItemId', header: 'Servicio OT ID', kind: 'number', pdf: false },
      { key: 'descripcion', header: 'Servicio', width: 30 },
      { key: 'estado', header: 'Estado OT', pdf: false },
      { key: 'patente', header: 'Patente', pdf: false },
      { key: 'assignmentId', header: 'Asignación ID', kind: 'number', pdf: false },
      { key: 'assignmentActive', header: 'Asignación vigente', kind: 'boolean', pdf: false },
      { key: 'assignmentState', header: 'Equipo', pdf: false },
      { key: 'userId', header: 'Trabajador ID', kind: 'number', pdf: false },
      { key: 'userName', header: 'Trabajador', width: 23 },
      { key: 'specialtyId', header: 'Especialidad ID', kind: 'number', pdf: false },
      { key: 'specialtyName', header: 'Especialidad', pdf: false },
      { key: 'includesEstimate', header: 'Aporta estimación', kind: 'boolean', pdf: false },
      { key: 'originalEstimatedHours', header: 'H. originales', kind: 'number', pdf: false },
      { key: 'estimatedHours', header: 'H. estimadas', width: 14, kind: 'number' },
      { key: 'actualHours', header: 'H. reales', width: 13, kind: 'number' },
      { key: 'actualMinutes', header: 'Minutos reales', kind: 'number', pdf: false },
      { key: 'sessions', header: 'Sesiones', kind: 'number', pdf: false },
      { key: 'runningSessions', header: 'En curso', kind: 'number', pdf: false },
      { key: 'costHourly', header: 'Costo/h CLP', kind: 'money', pdf: false },
      { key: 'saleHourly', header: 'Venta/h CLP', kind: 'money', pdf: false },
      { key: 'estimatedCost', header: 'Costo estimado', kind: 'money', width: 18 },
      { key: 'actualCost', header: 'Costo real', kind: 'money', width: 18 },
      { key: 'actualSale', header: 'Venta referencial', kind: 'money', pdf: false },
      { key: 'actualMargin', header: 'Margen referencial', kind: 'money', pdf: false },
      { key: 'rateStatus', header: 'Tarifa', width: 18 },
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
  };
  const reviews = [
    ...new Map(
      [
        ...commercial.services.flatMap((service) =>
          service.latestReview ? [service.latestReview] : [],
        ),
        ...commercial.reviews,
      ].map((review) => [review.id, review]),
    ).values(),
  ];
  return {
    title: 'Costos y desempeño del taller',
    filters: {
      ...exportFilters(scopeFilters),
      Agrupación: { day: 'Día', week: 'Semana', month: 'Mes' }[groupBy],
      ...(catalogItemId === undefined ? {} : { 'Servicio de catálogo': catalogItemId }),
      ...(workOrderItemId === undefined ? {} : { 'Servicio de OT': workOrderItemId }),
    },
    notes: [
      'Uso interno y confidencial. No enviar a clientes ni adjuntar al PDF del cliente.',
      `Corte de los datos: ${report.generadoEn}. Moneda: ${report.currency}.`,
      'Productividad, calidad y costos: período seleccionado. Comercial: acumulado de los servicios seleccionados.',
      'Recibido neto estimado: prorrateo de abonos de la cotización; no es un cobro atribuido directamente al servicio.',
      'Diferencias: cotizado menos teórico; horas equivalentes cotizadas menos horas reales. Margen comercial: cotizado neto menos costo, no beneficio contable.',
      'Vacío o guion = sin base, sin tarifa o incompleto; cero = valor conocido. Las revisiones conservan la captura del servidor al guardar.',
      ...report.notes,
    ],
    tables: [
      summary,
      commercialSummary,
      {
        name: 'Períodos agrupados',
        columns: [
          { key: 'key', header: 'Clave de período', pdf: false },
          { key: 'label', header: 'Período', width: 25 },
          { key: 'registeredHours', header: 'H. registradas', kind: 'number', width: 17 },
          { key: 'extraHours', header: 'H. extra', kind: 'number', width: 13 },
          { key: 'scheduledHours', header: 'H. programadas', kind: 'number', width: 18 },
          { key: 'unregisteredHours', header: 'H. sin registro', kind: 'number', width: 18 },
          { key: 'utilizationPercent', header: 'Utilización %', kind: 'number', width: 16 },
        ],
        rows: periods.map((period) => ({ ...period })),
      },
      commercialServices,
      assignments,
      {
        name: 'Historial de análisis',
        columns: [
          { key: 'id', header: 'Revisión ID', kind: 'number', pdf: false },
          { key: 'workOrderId', header: 'OT ID', kind: 'number', pdf: false },
          { key: 'workOrderItemId', header: 'Servicio OT ID', kind: 'number', width: 15 },
          { key: 'reason', header: 'Motivo', width: 18 },
          { key: 'note', header: 'Nota', width: 52 },
          { key: 'createdBy', header: 'Autor ID', kind: 'number', pdf: false },
          { key: 'createdByName', header: 'Autor', width: 22 },
          { key: 'createdAt', header: 'Fecha captura', kind: 'datetime', width: 23 },
          ...commercialColumns.map((column) => ({
            ...column,
            header: `Captura: ${column.header}`,
            pdf: false,
          })),
        ],
        rows: reviews.map(({ snapshot, ...review }) => ({ ...review, ...snapshot })),
      },
      {
        name: 'Control de costos',
        columns: summary.columns.map((column) => ({ ...column, pdf: false })),
        rows: Object.entries(report.totals).map(([indicator, value]) => ({ indicator, value })),
      },
    ],
  };
};

export const generateWorkshopPerformanceExport = async (
  report: WorkshopPerformanceReport,
  format: 'pdf' | 'excel',
): Promise<Uint8Array> => {
  const dataset = buildWorkshopPerformanceDataset(report);
  if (format === 'excel') return generateListExportExcel(dataset);
  // Split the wide commercial table across two readable views in the compact PDF.
  const services = dataset.tables.find((table) => table.name === 'Comparación por servicio')!;
  const hourKeys = new Set([
    'workOrderCodigo',
    'description',
    'referenceHourlyRate',
    'actualHours',
    'equivalentQuotedHours',
    'equivalentReceivedHours',
    'hoursDifference',
    'netDifference',
  ]);
  dataset.tables.splice(dataset.tables.indexOf(services) + 1, 0, {
    name: 'Equivalencias por servicio',
    columns: services.columns
      .filter((column) => hourKeys.has(column.key))
      .map((column) => ({ ...column, pdf: true })),
    rows: services.rows,
  });
  return generateListExportPdf(dataset);
};
