export const WORK_ORDER_ENTRY_TYPES = ['normal', 'garantia', 'reingreso'] as const;

export type WorkOrderEntryType = (typeof WORK_ORDER_ENTRY_TYPES)[number];

