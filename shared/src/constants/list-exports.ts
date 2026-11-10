import type { Module } from './permissions.js';

export const LIST_EXPORT_TARGETS = [
  'clients',
  'vehicles',
  'fleet-vehicles',
  'catalog',
  'work-orders',
  'quotations',
  'users',
  'role-permissions',
  'warehouses',
  'stock-balances',
  'stock-movements',
  'warehouse-requests',
  'purchases',
  'suppliers',
  'payments',
  'cash-day',
  'workshop-daily',
] as const;
export type ListExportTarget = (typeof LIST_EXPORT_TARGETS)[number];
export type ListExportFormat = 'excel' | 'pdf';

export interface ListExportPolicy {
  read: readonly Module[];
  export: readonly Module[];
  roles?: readonly string[];
}
const policy = (areas: Module[]): ListExportPolicy => ({ read: areas, export: areas });
export const LIST_EXPORT_POLICIES: Record<ListExportTarget, ListExportPolicy> = {
  clients: policy(['comercial', 'taller']),
  vehicles: policy(['taller', 'comercial']),
  'fleet-vehicles': policy(['flota']),
  catalog: { read: ['taller', 'comercial'], export: ['taller', 'comercial', 'almacen', 'admin'] },
  'work-orders': policy(['taller']),
  quotations: policy(['comercial']),
  users: policy(['admin']),
  'role-permissions': policy(['admin']),
  warehouses: policy(['almacen']),
  'stock-balances': policy(['almacen']),
  'stock-movements': policy(['almacen']),
  'warehouse-requests': policy(['almacen']),
  purchases: policy(['compras']),
  suppliers: policy(['compras']),
  payments: policy(['comercial', 'finanzas']),
  'cash-day': policy(['finanzas']),
  'workshop-daily': { ...policy(['taller']), roles: ['admin', 'desarrollador', 'jefe'] },
};

// Finance already has cross-area report export rights; viewing the source
// module still requires its normal read permission.
for (const target of ['clients', 'vehicles', 'catalog', 'quotations', 'work-orders'] as const) {
  LIST_EXPORT_POLICIES[target] = {
    ...LIST_EXPORT_POLICIES[target],
    export: [...LIST_EXPORT_POLICIES[target].export, 'finanzas'],
  };
}
