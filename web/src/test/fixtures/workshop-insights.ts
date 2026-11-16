import type { WorkshopAlertSettingsPublic, WorkshopAlertSummary, WorkshopServiceHistory } from '@unithor/shared';

export const insightSettings: WorkshopAlertSettingsPublic = { id: 1, timeTolerancePercent: 20, commercialTolerancePercent: 10, updatedAt: null, updatedBy: null };
export const insightAlerts: WorkshopAlertSummary = {
  generatedAt: '2026-11-16T12:00:00Z', counts: { total: 3, high: 1 }, settings: { timeTolerancePercent: 20, commercialTolerancePercent: 10 }, scheduleConfigured: false,
  alerts: [
    { id: 'own-time', kind: 'time_deviation', priority: 'high', title: 'Horas superiores al estimado', description: 'Carlos tiene tiempo por revisar.', workOrderId: 41, workOrderCodigo: 'OT-26-41', itemId: 10, userId: 9, href: '/work-orders?manage=41' },
    { id: 'other-time', kind: 'unregistered_time', priority: 'medium', title: 'Registro de otro trabajador', description: 'Luis debe registrar horas.', workOrderId: 41, workOrderCodigo: 'OT-26-41', itemId: 10, userId: 10, href: '/work-orders/41' },
    { id: 'commercial', kind: 'commercial_difference', priority: 'normal', title: 'Diferencia comercial', description: 'Referencia comercial de $30.000.', workOrderId: 41, workOrderCodigo: 'OT-26-41', itemId: 10, userId: 9, href: '/work-orders?manage=41' },
  ],
};
export const insightHistory: WorkshopServiceHistory = {
  workOrderId: 41, itemId: 10, matchMode: 'description', service: { description: 'Revisión de suspensión', catalogItemId: null, unit: 'servicio', quantity: 2 },
  items: [{ workOrderId: 12, codigo: 'OT-26-12', fechaIngreso: '2026-10-02T12:00:00Z', estado: 'entregada', vehicle: { id: 4, patente: 'BCDF71', marca: 'Toyota', modelo: 'Hilux' }, itemId: 25, description: 'Revisión de suspensión', quantity: 2, unit: 'servicio', estimatedHours: 3, actualHours: 4, hoursPerUnit: 2, netUnitPrice: 15000, qualityApproved: false }],
  total: 12, page: 1, pageSize: 10, totalPages: 2,
  reference: { samples: 1, hourSamples: 1, priceSamples: 1, averageHoursPerUnit: 2, averageNetUnitPrice: 15000 },
  notes: ['La referencia corresponde a la página filtrada actual.'],
};
