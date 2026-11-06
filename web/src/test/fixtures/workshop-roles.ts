import type { MyLaborOrder, WorkOrder, WorkOrderItem, WorkshopDailyReport } from '../../types/entities';
import type { DashboardSummary, ItemOperationalStatus } from '@unithor/shared';

const now = new Date();
const daysAgo = (days: number): string => new Date(now.getTime() - days * 86400000).toISOString();
const item = (id: number, description: string, status: ItemOperationalStatus): WorkOrderItem => ({
  id, catalogItemId: null, descripcion: description, tipoLinea: 'especifico', unidadMedida: 'servicio', cantidad: 1,
  precioUnitario: 10000, subtotal: 10000, estadoOperativo: status, notasOperativas: null,
  horasHombreEstimadas: 2, horasHombreReales: status === 'completado' ? 2 : 0.5,
  assignedUserId: 9, assignedUser: { id: 9, nombre: 'Carlos Mecánico' }, laborValidatedBy: null,
  laborValidatedAt: null, laborValidationNote: null, stockConsumido: false, stockConsumidoCantidad: 0, stockConsumidoAt: null,
});

export const workshopRoleOrders: WorkOrder[] = [
  { id: 41, codigo: 'OT-26-41', clientId: 1, vehicleId: 1, assignedMechanicId: 9, estado: 'en_progreso', descripcion: 'Revisión de tren delantero', kilometrajeIngreso: 98000, fechaIngreso: daysAgo(3), fechaEntrega: null, createdBy: 1, createdAt: daysAgo(3), updatedAt: daysAgo(0), lastWorkActivityAt: daysAgo(0), client: { id: 1, nombre: 'Cliente de prueba', rut: null, telefono: null }, vehicle: { id: 1, patente: 'KJTR84', marca: 'Toyota', modelo: 'Hilux' }, assignedMechanic: { id: 9, nombre: 'Carlos Mecánico', email: 'qa@example.test' }, items: [item(10, 'Revisión de suspensión', 'en_proceso'), item(11, 'Alineación delantera', 'pendiente')] },
  { id: 42, codigo: 'OT-26-42', clientId: 1, vehicleId: 2, assignedMechanicId: 10, estado: 'esperando_repuesto', descripcion: 'Cambio de distribución', kilometrajeIngreso: 74000, fechaIngreso: daysAgo(9), fechaEntrega: null, createdBy: 1, createdAt: daysAgo(9), updatedAt: daysAgo(1), lastWorkActivityAt: daysAgo(1), vehicle: { id: 2, patente: 'BZPL32', marca: 'Nissan', modelo: 'Navara' }, items: [item(12, 'Cambio de kit de distribución', 'pendiente')] },
  { id: 43, codigo: 'OT-26-43', clientId: 1, vehicleId: 3, assignedMechanicId: 9, estado: 'en_progreso', descripcion: 'Servicio de frenos', kilometrajeIngreso: 115000, fechaIngreso: daysAgo(24), fechaEntrega: null, createdBy: 1, createdAt: daysAgo(24), updatedAt: daysAgo(3), lastWorkActivityAt: daysAgo(3), vehicle: { id: 3, patente: 'LXGV65', marca: 'Ford', modelo: 'Ranger' }, items: [item(13, 'Revisión de sistema de frenos', 'en_proceso'), item(14, 'Cambio de pastillas', 'completado')] },
  { id: 44, codigo: 'OT-26-44', clientId: 1, vehicleId: 4, assignedMechanicId: 9, estado: 'finalizada', descripcion: 'Mantención preventiva', kilometrajeIngreso: 60000, fechaIngreso: daysAgo(4), fechaEntrega: null, createdBy: 1, createdAt: daysAgo(4), updatedAt: daysAgo(0), lastWorkActivityAt: daysAgo(0), vehicle: { id: 4, patente: 'TGRD22', marca: 'Mitsubishi', modelo: 'L200' }, items: [item(15, 'Mantención de 60.000 km', 'completado')] },
];

export const workshopRoleMine: MyLaborOrder[] = workshopRoleOrders.map((order, index) => ({
  id: order.id, codigo: order.codigo, estado: order.estado, fechaIngreso: order.fechaIngreso,
  patente: order.vehicle?.patente ?? null, marca: order.vehicle?.marca ?? null, modelo: order.vehicle?.modelo ?? null,
  items: order.items?.length ?? 0, completados: order.items?.filter((line) => line.estadoOperativo === 'completado').length ?? 0,
  enProceso: index === 0 ? 1 : 0, horasEstimadas: 2, horasReales: index + 0.5,
  activeItemId: index === 0 ? 10 : null, activeItemDescripcion: index === 0 ? 'Revisión de suspensión' : null,
  activeSince: index === 0 ? daysAgo(0) : null,
}));

export const workshopRoleReport: WorkshopDailyReport = {
  fecha: now.toISOString().slice(0, 10), generadoEn: now.toISOString(), totalHoras: 3.5, totalItemsCompletados: 2, totalSesiones: 4,
  usuarios: [
    { id: 9, nombre: 'Carlos Mecánico', rol: 'mecanico', minutos: 150, horas: 2.5, sesiones: 3, itemsCompletados: 1, eventos: 2, enCurso: true, detalle: [{ workOrderId: 41, workOrderCodigo: 'OT-26-41', itemDescripcion: 'Revisión de suspensión', minutos: 150, estado: 'en_proceso' }] },
    { id: 10, nombre: 'Luis Mecánico', rol: 'mecanico', minutos: 60, horas: 1, sesiones: 1, itemsCompletados: 1, eventos: 1, enCurso: false, detalle: [{ workOrderId: 44, workOrderCodigo: 'OT-26-44', itemDescripcion: 'Mantención preventiva', minutos: 60, estado: 'completado' }] },
  ],
  ordenes: [{ id: 41, codigo: 'OT-26-41', patente: 'KJTR84', estado: 'en_progreso', horas: 2.5, completados: 1, enProceso: 1, mecanicos: ['Carlos Mecánico'] }, { id: 44, codigo: 'OT-26-44', patente: 'TGRD22', estado: 'finalizada', horas: 1, completados: 1, enProceso: 0, mecanicos: ['Luis Mecánico'] }],
};

export const workshopRoleSummary: DashboardSummary = {
  metrics: { activeWorkOrders: 3, waitingForParts: 1, pendingQuotations: 2, pendingBalance: 150000, monthlyRevenue: 850000, quotationsWithoutWorkOrder: 1 },
  recentWorkOrders: workshopRoleOrders.map((order) => ({ id: order.id, codigo: order.codigo, estado: order.estado, fechaIngreso: order.fechaIngreso, updatedAt: order.updatedAt, client: order.client ? { id: order.client.id, nombre: order.client.nombre } : null, vehicle: order.vehicle ? { id: order.vehicle.id, patente: order.vehicle.patente } : null })),
  lowStockCount: 2, lowStockItems: [{ id: 1, codigo: 'FLT-010', nombre: 'Filtro de aceite', stock: 2, stockMinimo: 5 }, { id: 2, codigo: 'KIT-022', nombre: 'Kit de distribución', stock: 0, stockMinimo: 2 }],
  unlinkedQuotations: [], operationalInbox: { role: 'jefe', total: 3, counts: { approvals: 1, warehouseDeliveries: 0, assignedWorkOrders: 0, paymentVerifications: 0, quotationFollowUps: 0, stockAlerts: 2, fleetDocumentAlerts: 0 }, items: [{ id: 'approval-1', type: 'work_order_approval', title: 'Aprobar solicitud de repuesto', description: 'OT-26-42 · Kit de distribución', href: '/work-orders/42', createdAt: daysAgo(0), priority: 'high' }] },
};
