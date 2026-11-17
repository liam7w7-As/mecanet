import { z } from 'zod';

export const WORKSHOP_TIME_REQUEST_KINDS = ['manual', 'correction'] as const;
export const WORKSHOP_TIME_REQUEST_STATUS = ['pendiente', 'aprobada', 'rechazada'] as const;
export type WorkshopTimeRequestKind = (typeof WORKSHOP_TIME_REQUEST_KINDS)[number];
export type WorkshopTimeRequestStatus = (typeof WORKSHOP_TIME_REQUEST_STATUS)[number];
export type WorkshopTimeActivityStatus = 'en_proceso' | 'completado';

const positiveId = z.number().int().positive();
const note = z.string().trim().min(1, 'Debe indicar el motivo').max(2000);
const interval = {
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  note,
};

export const createWorkshopTimeRequestSchema = z
  .union([
    z
      .object({
        workOrderId: positiveId,
        itemId: positiveId,
        userId: positiveId.optional(),
        overtime: z.boolean().default(false),
        activityStatus: z.enum(['en_proceso', 'completado']).optional(),
        ...interval,
      })
      .strict(),
    z.object({ sourceSessionId: positiveId, ...interval }).strict(),
  ])
  .superRefine((value, context) => {
    const start = Date.parse(value.startedAt);
    const end = Date.parse(value.endedAt);
    if (end - start < 60_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endedAt'],
        message: 'El intervalo debe durar al menos un minuto',
      });
    }
    if (start > Date.now() || end > Date.now()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endedAt'],
        message: 'No se pueden registrar horas futuras',
      });
    }
  });

export const reviewWorkshopTimeRequestSchema = z.object({ approve: z.boolean(), note }).strict();
export const workshopTimeQuerySchema = z
  .object({
    fecha: z.string().date('La fecha debe ser YYYY-MM-DD'),
    userId: z.coerce.number().int().positive().optional(),
  })
  .strict();
export const workshopTimeEligibleQuerySchema = workshopTimeQuerySchema.partial({ fecha: true });
export const pauseWorkshopTimerSchema = z.object({ note }).strict();
export const workshopTimeRequestParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export type CreateWorkshopTimeRequestInput = z.input<typeof createWorkshopTimeRequestSchema>;
export type ReviewWorkshopTimeRequestInput = z.infer<typeof reviewWorkshopTimeRequestSchema>;
export type WorkshopTimeQueryInput = z.infer<typeof workshopTimeQuerySchema>;

export interface WorkshopTimeWorker {
  id: number;
  nombre: string;
}
export interface WorkshopTimeEligibleItem {
  workOrderId: number;
  workOrderCode: string;
  patente: string | null;
  itemId: number;
  description: string;
  userId: number;
}
export interface WorkshopTimeEntry {
  id: number;
  workOrderId: number;
  workOrderCode: string;
  itemId: number;
  description: string;
  userId: number;
  userName: string | null;
  kind: 'cronometro' | 'ajuste' | 'manual';
  overtime: boolean;
  status: 'abierta' | 'cerrada';
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  minutesOnDate: number;
  note: string | null;
  supersededAt: string | null;
  scheduledEndAt: string | null;
}
export interface WorkshopTimeRequestRecord {
  id: number;
  kind: WorkshopTimeRequestKind;
  overtime: boolean;
  activityStatus: WorkshopTimeActivityStatus | null;
  status: WorkshopTimeRequestStatus;
  workOrderId: number;
  workOrderCode: string;
  itemId: number;
  description: string;
  userId: number;
  userName: string;
  sourceSessionId: number | null;
  replacementSessionId: number | null;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  minutesOnDate: number;
  note: string;
  createdBy: number;
  createdAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}
export interface WorkshopTimeJournal {
  entries: WorkshopTimeEntry[];
  requests: WorkshopTimeRequestRecord[];
  workers: WorkshopTimeWorker[];
  totals: {
    registeredMinutes: number;
    pendingMinutes: number;
    scheduledMinutes: number | null;
    unregisteredMinutes: number | null;
  };
  date: string;
}
