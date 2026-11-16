import { z } from 'zod';

import type { WorkOrderStatus } from '../constants/work-order-status.js';

export const workshopHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
  fechaDesde: z.string().date().optional(),
  fechaHasta: z.string().date().optional(),
  sameVehicle: z.enum(['true', 'false']).transform((value) => value === 'true').or(z.boolean()).optional(),
  search: z.string().trim().max(80).optional(),
}).strict().refine((value) => !value.fechaDesde || !value.fechaHasta || value.fechaDesde <= value.fechaHasta, {
  path: ['fechaHasta'], message: 'La fecha desde no puede ser posterior a la fecha hasta',
});
export type WorkshopHistoryQuery = z.infer<typeof workshopHistoryQuerySchema>;
export interface WorkshopServiceHistoryRow {
  workOrderId: number;
  codigo: string;
  fechaIngreso: string;
  estado: WorkOrderStatus;
  vehicle: { id: number; patente: string; marca: string | null; modelo: string | null } | null;
  itemId: number;
  description: string;
  quantity: number;
  unit: string;
  estimatedHours: number | null;
  actualHours: number | null;
  hoursPerUnit: number | null;
  netUnitPrice: number | null;
  qualityApproved: boolean;
}
export interface WorkshopServiceHistory {
  workOrderId: number;
  itemId: number;
  matchMode: 'catalog' | 'description';
  service: { description: string; catalogItemId: number | null; unit: string; quantity: number };
  items: WorkshopServiceHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  reference: {
    samples: number; hourSamples: number; priceSamples: number;
    averageHoursPerUnit: number | null; averageNetUnitPrice: number | null;
  };
  notes: string[];
}
