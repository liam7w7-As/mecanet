import { useQuery } from '@tanstack/react-query';

import { workOrderKeys } from './useWorkOrders';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type { WorkOrder, WorkOrderWorksheet } from '../types/entities';

/** Mechanics request the operational worksheet only; financial values are never fetched. */
export const useManagedWorkOrder = (id: number) => {
  const user = useAuthStore((state) => state.user);
  const mechanic = user?.role === 'mecanico';
  return useQuery({
    queryKey: mechanic ? [...workOrderKeys.detail(id), 'mechanic', user.id] : workOrderKeys.detail(id),
    enabled: Number.isInteger(id) && id > 0,
    queryFn: async (): Promise<WorkOrder> => {
      if (!mechanic) return (await api.get<{ workOrder: WorkOrder }>(`/work-orders/${id}`)).data.workOrder;
      const { worksheet } = (await api.get<{ worksheet: WorkOrderWorksheet }>(`/work-orders/${id}/worksheet`)).data;
      const order = worksheet.workOrder;
      // Shared presentation requires the full shape. Financial placeholders stay hidden for mechanics.
      return {
        id: order.id, codigo: order.codigo, estado: order.estado, clientId: null, vehicleId: order.vehiculo.id,
        descripcion: order.descripcion, kilometrajeIngreso: null, fechaIngreso: order.fechaIngreso,
        fechaEntrega: order.fechaEntrega ?? null, createdBy: null, assignedMechanicId: order.assignedMechanicId ?? null,
        createdAt: order.createdAt ?? order.fechaIngreso ?? '', updatedAt: order.updatedAt ?? order.fechaIngreso ?? '',
        vehicle: order.vehiculo.id ? { ...order.vehiculo, id: order.vehiculo.id, patente: order.vehiculo.patente ?? '' } : null,
        items: worksheet.items.map((item) => ({ id: item.id, descripcion: item.descripcion, tipoLinea: item.tipoLinea,
          unidadMedida: item.unidadMedida, cantidad: item.cantidad, estadoOperativo: item.estadoOperativo, notasOperativas: item.notasOperativas,
          horasHombreEstimadas: item.horasHombreEstimadas, horasHombreReales: item.horasHombreReales, assignedUser: item.assignedUser,
          assignedUserId: item.assignedUser?.id ?? null, laborValidatedBy: null, laborValidatedAt: item.laborValidatedAt, laborValidationNote: item.laborValidationNote,
          catalogItemId: null, precioUnitario: 0, subtotal: 0, stockConsumido: false, stockConsumidoCantidad: 0, stockConsumidoAt: null })),
        progressReports: worksheet.progressReports,
        requests: (worksheet.requests ?? []).map((request) => ({ ...request, workOrderItemId: null, precioSugerido: null,
          catalogItem: request.catalogItem ? { ...request.catalogItem, precio: 0 } : null,
          precioAprobado: null, reviewNote: null, reviewedAt: null, deliveredWarehouseId: null, deliveredBy: null,
          deliveredAt: null, deliveryNote: null })),
      };
    },
  });
};
