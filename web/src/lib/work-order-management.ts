import type { Role } from '@unithor/shared';

/** One operational destination; mechanics stay on their assigned-orders board. */
export const getWorkOrderManagementPath = (id: number, role?: Role): string => {
  const board = role === 'mecanico' ? '/work-orders/mine' : '/work-orders';
  return Number.isSafeInteger(id) && id > 0 ? `${board}?manage=${id}` : board;
};
