import { z } from 'zod';
export declare const WORKSHOP_TIME_REQUEST_KINDS: readonly ["manual", "correction"];
export declare const WORKSHOP_TIME_REQUEST_STATUS: readonly ["pendiente", "aprobada", "rechazada"];
export type WorkshopTimeRequestKind = (typeof WORKSHOP_TIME_REQUEST_KINDS)[number];
export type WorkshopTimeRequestStatus = (typeof WORKSHOP_TIME_REQUEST_STATUS)[number];
export type WorkshopTimeActivityStatus = 'en_proceso' | 'completado';
export declare const createWorkshopTimeRequestSchema: z.ZodEffects<z.ZodUnion<[z.ZodObject<{
    startedAt: z.ZodString;
    endedAt: z.ZodString;
    note: z.ZodString;
    workOrderId: z.ZodNumber;
    itemId: z.ZodNumber;
    dpStageId: z.ZodOptional<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodNumber>;
    overtime: z.ZodDefault<z.ZodBoolean>;
    activityStatus: z.ZodOptional<z.ZodEnum<["en_proceso", "completado"]>>;
}, "strict", z.ZodTypeAny, {
    workOrderId: number;
    note: string;
    itemId: number;
    overtime: boolean;
    startedAt: string;
    endedAt: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
    activityStatus?: "completado" | "en_proceso" | undefined;
}, {
    workOrderId: number;
    note: string;
    itemId: number;
    startedAt: string;
    endedAt: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
    overtime?: boolean | undefined;
    activityStatus?: "completado" | "en_proceso" | undefined;
}>, z.ZodObject<{
    startedAt: z.ZodString;
    endedAt: z.ZodString;
    note: z.ZodString;
    sourceSessionId: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    note: string;
    startedAt: string;
    endedAt: string;
    sourceSessionId: number;
}, {
    note: string;
    startedAt: string;
    endedAt: string;
    sourceSessionId: number;
}>]>, {
    workOrderId: number;
    note: string;
    itemId: number;
    overtime: boolean;
    startedAt: string;
    endedAt: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
    activityStatus?: "completado" | "en_proceso" | undefined;
} | {
    note: string;
    startedAt: string;
    endedAt: string;
    sourceSessionId: number;
}, {
    workOrderId: number;
    note: string;
    itemId: number;
    startedAt: string;
    endedAt: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
    overtime?: boolean | undefined;
    activityStatus?: "completado" | "en_proceso" | undefined;
} | {
    note: string;
    startedAt: string;
    endedAt: string;
    sourceSessionId: number;
}>;
export declare const createWorkshopDailyEntrySchema: z.ZodUnion<[z.ZodObject<{
    horasUtilizadas: z.ZodNumber;
    clientRequestId: z.ZodEffects<z.ZodString, string, string>;
    workOrderId: z.ZodNumber;
    itemId: z.ZodNumber;
    dpStageId: z.ZodOptional<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodNumber>;
    fecha: z.ZodString;
    note: z.ZodString;
    activityStatus: z.ZodEnum<["en_proceso", "completado"]>;
}, "strict", z.ZodTypeAny, {
    fecha: string;
    workOrderId: number;
    note: string;
    itemId: number;
    activityStatus: "completado" | "en_proceso";
    horasUtilizadas: number;
    clientRequestId: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
}, {
    fecha: string;
    workOrderId: number;
    note: string;
    itemId: number;
    activityStatus: "completado" | "en_proceso";
    horasUtilizadas: number;
    clientRequestId: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
}>, z.ZodEffects<z.ZodObject<{
    startedAt: z.ZodString;
    endedAt: z.ZodString;
    note: z.ZodString;
    clientRequestId: z.ZodEffects<z.ZodString, string, string>;
    workOrderId: z.ZodNumber;
    itemId: z.ZodNumber;
    dpStageId: z.ZodOptional<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodNumber>;
    fecha: z.ZodString;
    activityStatus: z.ZodEnum<["en_proceso", "completado"]>;
}, "strict", z.ZodTypeAny, {
    fecha: string;
    workOrderId: number;
    note: string;
    itemId: number;
    activityStatus: "completado" | "en_proceso";
    startedAt: string;
    endedAt: string;
    clientRequestId: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
}, {
    fecha: string;
    workOrderId: number;
    note: string;
    itemId: number;
    activityStatus: "completado" | "en_proceso";
    startedAt: string;
    endedAt: string;
    clientRequestId: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
}>, {
    fecha: string;
    workOrderId: number;
    note: string;
    itemId: number;
    activityStatus: "completado" | "en_proceso";
    startedAt: string;
    endedAt: string;
    clientRequestId: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
}, {
    fecha: string;
    workOrderId: number;
    note: string;
    itemId: number;
    activityStatus: "completado" | "en_proceso";
    startedAt: string;
    endedAt: string;
    clientRequestId: string;
    userId?: number | undefined;
    dpStageId?: number | undefined;
}>]>;
export declare const reviewWorkshopTimeRequestSchema: z.ZodObject<{
    approve: z.ZodBoolean;
    note: z.ZodString;
}, "strict", z.ZodTypeAny, {
    note: string;
    approve: boolean;
}, {
    note: string;
    approve: boolean;
}>;
export declare const workshopTimeQuerySchema: z.ZodObject<{
    fecha: z.ZodString;
    userId: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    fecha: string;
    userId?: number | undefined;
}, {
    fecha: string;
    userId?: number | undefined;
}>;
export declare const workshopTimeEligibleQuerySchema: z.ZodObject<{
    userId: z.ZodOptional<z.ZodNumber>;
    fecha: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    userId?: number | undefined;
    fecha?: string | undefined;
}, {
    userId?: number | undefined;
    fecha?: string | undefined;
}>;
export declare const pauseWorkshopTimerSchema: z.ZodObject<{
    note: z.ZodString;
}, "strict", z.ZodTypeAny, {
    note: string;
}, {
    note: string;
}>;
export declare const workshopTimeRequestParamsSchema: z.ZodObject<{
    id: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: number;
}, {
    id: number;
}>;
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
