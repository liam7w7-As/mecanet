import { z } from 'zod';

export const WORKSHOP_ALERT_KINDS = [
  'time_deviation',
  'unregistered_time',
  'no_daily_record',
  'quality_pending',
  'quality_rejected',
  'commercial_difference',
  'time_review_pending',
  'price_review_pending',
  'delivery_overdue',
  'waiting_parts',
  'valuation_pending',
] as const;
export const workshopAlertKindSchema = z.enum(WORKSHOP_ALERT_KINDS);
export type WorkshopAlertKind = z.infer<typeof workshopAlertKindSchema>;

export const workshopAlertQuerySchema = z.object({ fecha: z.string().date().optional() }).strict();
const tolerance = z.number().finite().min(0).max(1000);
export const updateWorkshopAlertSettingsSchema = z
  .object({
    timeTolerancePercent: tolerance.optional(),
    commercialTolerancePercent: tolerance.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, 'Indica al menos una tolerancia');
export type UpdateWorkshopAlertSettingsInput = z.infer<typeof updateWorkshopAlertSettingsSchema>;

export interface WorkshopAlertTolerances {
  timeTolerancePercent: number;
  commercialTolerancePercent: number;
}
export interface WorkshopAlertSettingsPublic extends WorkshopAlertTolerances {
  id: 1;
  updatedBy: number | null;
  updatedAt: string | null;
}
export interface WorkshopOperationalAlert {
  id: string;
  kind: WorkshopAlertKind;
  priority: 'high' | 'medium' | 'normal';
  title: string;
  description: string;
  workOrderId: number | null;
  workOrderCodigo: string | null;
  itemId: number | null;
  userId: number | null;
  href: string;
}
export interface WorkshopAlertSummary {
  generatedAt: string;
  alerts: WorkshopOperationalAlert[];
  counts: { total: number; high: number };
  settings: WorkshopAlertTolerances;
  scheduleConfigured: boolean;
}
