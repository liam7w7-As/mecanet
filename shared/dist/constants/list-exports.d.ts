import type { Module } from './permissions.js';
export declare const LIST_EXPORT_TARGETS: readonly ["clients", "vehicles", "fleet-vehicles", "catalog", "work-orders", "quotations", "users", "role-permissions", "warehouses", "stock-balances", "stock-movements", "warehouse-requests", "purchases", "suppliers", "payments", "cash-day", "workshop-daily"];
export type ListExportTarget = (typeof LIST_EXPORT_TARGETS)[number];
export type ListExportFormat = 'excel' | 'pdf';
export interface ListExportPolicy {
    read: readonly Module[];
    export: readonly Module[];
    roles?: readonly string[];
}
export declare const LIST_EXPORT_POLICIES: Record<ListExportTarget, ListExportPolicy>;
