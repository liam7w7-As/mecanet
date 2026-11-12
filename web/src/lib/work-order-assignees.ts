import type { WorkOrder } from '../types/entities';

/** Includes service assignments even when there is no general coordinator. */
export const getWorkOrderAssigneeLabel = (order: WorkOrder): string => {
  const people = new Map<number, string>();
  if (order.assignedMechanic) people.set(order.assignedMechanic.id, order.assignedMechanic.nombre);
  for (const item of order.items ?? []) {
    if (item.assignedUser) people.set(item.assignedUser.id, item.assignedUser.nombre);
  }
  if (people.size) return [...people.values()].join(' · ');
  return order.assignedMechanicId || order.items?.some((item) => item.assignedUserId)
    ? 'Asignado por servicio'
    : 'Sin asignar';
};
