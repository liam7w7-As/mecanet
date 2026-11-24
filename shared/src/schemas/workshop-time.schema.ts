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

const validateInterval = (
  value: { startedAt: string; endedAt: string },
  context: z.RefinementCtx,
): void => {
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
};

export const createWorkshopTimeRequestSchema = z
  .union([
    z
      .object({
        workOrderId: positiveId,
        itemId: positiveId,
        dpStageId: positiveId.optional(),
        userId: positiveId.optional(),
        overtime: z.boolean().default(false),
        activityStatus: z.enum(['en_proceso', 'completado']).optional(),
        ...interval,
      })
      .strict(),
    z.object({ sourceSessionId: positiveId, ...interval }).strict(),
  ])
  .superRefine(validateInterval);

const dailyEntryFields = {
  clientRequestId: z.string().uuid().transform((value) => value.toLowerCase()),
  workOrderId: positiveId,
  itemId: positiveId,
  dpStageId: positiveId.optional(),
  userId: positiveId.optional(),
  fecha: z.string().date('La fecha debe ser YYYY-MM-DD'),
  note,
  activityStatus: z.enum(['en_proceso', 'completado']),
};
export const createWorkshopDailyEntrySchema = z.union([
  z.object({ ...dailyEntryFields, horasUtilizadas: z.number().finite().min(1 / 60, 'Indica al menos un minuto de trabajo') }).strict(),
  // Keep previously saved drafts and queued requests compatible.
  z.object({ ...dailyEntryFields, ...interval }).strict().superRefine(validateInterval),
]);

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
export type CreateWorkshopDailyEntryInput = z.input<typeof createWorkshopDailyEntrySchema>;
export type ReviewWorkshopTimeRequestInput = z.infer<typeof reviewWorkshopTimeRequestSchema>;
export type WorkshopTimeQueryInput = z.infer<typeof workshopTimeQuerySchema>;

export interface WorkshopTimeWorker {
  id: number;
  nombre: string;
}
export interface WorkshopTimeEligibleItem {
  dpStageId?: number;
  dpStageLabel?: string;
  blocked?: boolean;
  workOrderId: number;
  workOrderCode: string;
  patente: string | null;
  itemId: number;
  description: string;
  userId: number;
  division?: 'DP' | 'ACC' | 'MEC' | null;
}
export interface WorkshopTimeEntry {
  dpStageId?: number | null;
  id: number;
  reportedDate?: string | null;
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
  activityStatus?: 'pendiente' | WorkshopTimeActivityStatus | 'omitido' | null;
  ownPartCompleted?: boolean;
}
export interface WorkshopTimeRequestRecord {
  dpStageId?: number | null;
  id: number;
  reportedDate?: string | null;
  dailyEntry?: boolean;
  clientRequestId?: string | null;
  teamPending?: boolean;
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
  timezone?: string;
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
