import { hasUserPermission } from '../../lib/permissions';

import type { UserPublic } from '../../stores/auth.store';
import type { DpConfiguration } from '@unithor/shared';

export const canReadDpSettings = (user: UserPublic | null): boolean =>
  Boolean(user && ['admin', 'desarrollador'].includes(user.role) && hasUserPermission(user, 'admin', 'read'));
export const canEditDpSettings = (user: UserPublic | null): boolean =>
  Boolean(user && ['admin', 'desarrollador'].includes(user.role) && hasUserPermission(user, 'admin', 'update'));
export const canReadDpCatalog = (user: UserPublic | null): boolean =>
  Boolean(user && (hasUserPermission(user, 'taller', 'read') || hasUserPermission(user, 'comercial', 'read')));

export const DP_FORMULA_LABELS = {
  painting: 'Pintura · base × tamaño × pieza',
  repair: 'Reparación · base × (tamaño + daño) × pieza',
  dismantling: 'Desmontaje y montaje · base × tamaño × pieza',
  fixed: 'Tarifa fija',
} as const;
export const DP_SCOPE_LABELS = { piece: 'Por pieza', additional: 'Adicional', global: 'Vehículo completo' } as const;

export function nextDpId(prefix: string, rows: ReadonlyArray<{ id: string }>): string {
  const ids = new Set(rows.map((row) => row.id));
  let number = 1;
  while (ids.has(`${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}

export type DpConfigurationTab = 'prices' | 'vehicles' | 'pieces' | 'damage' | 'stages' | 'history';
export const DP_SETTINGS_TABS: Array<{ id: DpConfigurationTab; label: string }> = [
  { id: 'prices', label: 'Tarifas y servicios' },
  { id: 'vehicles', label: 'Carrocerías y tamaños' },
  { id: 'pieces', label: 'Piezas y ubicaciones' },
  { id: 'damage', label: 'Niveles de daño' },
  { id: 'stages', label: 'Pasos D&P' },
  { id: 'history', label: 'Historial' },
];

export function dpIssueLabel(path: (string | number)[], configuration: DpConfiguration): string {
  const [section, index, field] = path;
  const label = DP_SETTINGS_TABS.find((tab) =>
    tab.id === ({ tables: 'prices', operations: 'prices', bodyTypes: 'vehicles', rates: 'pieces', pieces: 'pieces', damageLevels: 'damage', stages: 'stages' } as Record<string, string>)[String(section)],
  )?.label ?? 'Configuración';
  const rows = section && section in configuration ? configuration[section as keyof DpConfiguration] : undefined;
  const row = typeof index === 'number' ? rows?.[index] : undefined;
  const name = row && 'label' in row ? row.label : `fila ${typeof index === 'number' ? index + 1 : ''}`;
  const fields: Record<string, string> = {
    label: 'nombre', factor: 'factor', basePrice: 'precio base', multiplier: 'multiplicador', increment: 'incremento',
    paintingFactor: 'factor de pintura', repairFactor: 'factor de reparación', dismantlingFactor: 'factor de desmontaje',
    specialties: 'especialidades', positionLabel: 'ubicación', tableId: 'tabla de precios',
  };
  return `${label}${typeof index === 'number' ? ` · ${name}` : ''}${field ? ` · ${fields[String(field)] ?? String(field)}` : ''}`;
}
