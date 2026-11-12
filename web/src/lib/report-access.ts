import { hasUserPermission } from './permissions';

import type { UserPublic } from '../stores/auth.store';
import type { Module } from '@unithor/shared';

export type ReportArea = 'finance' | 'commercial' | 'workshop' | 'inventory' | 'catalog' | 'fleet' | 'administration';
const areas: Record<ReportArea, Module[]> = {
  finance: ['finanzas'], commercial: ['comercial'], workshop: ['taller'],
  inventory: ['almacen'], catalog: ['almacen', 'taller', 'comercial'],
  fleet: ['comercial', 'taller'], administration: ['admin'],
};

export const canReadReport = (user: UserPublic | null, area: ReportArea): boolean => Boolean(user &&
  !(area === 'fleet' && user.role === 'mecanico') &&
  areas[area].some((module) => hasUserPermission(user, module, 'read')));

export const canExportReport = (user: UserPublic | null, area: ReportArea): boolean => Boolean(user &&
  canReadReport(user, area) &&
  (areas[area].some((module) => hasUserPermission(user, module, 'export')) ||
    (area !== 'administration' && hasUserPermission(user, 'finanzas', 'export'))));

/** Rechecking this after a download prevents delivery to a changed session. */
export const reportActorKey = (user: UserPublic | null): string => JSON.stringify([
  user?.id, user?.role,
  user?.permissions?.map(({ modulo, accion }) => `${modulo}:${accion}`).sort() ?? 'role-defaults',
]);
