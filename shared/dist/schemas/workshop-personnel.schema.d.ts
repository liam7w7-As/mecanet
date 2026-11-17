import { z } from 'zod';
/** Suggestions only: opting in creates names, never rates or worker assignments. */
export declare const DEFAULT_WORKSHOP_SPECIALTIES: readonly ["Mecánico", "Electricista", "Ayudante", "Desabollador", "Pintor"];
export declare const DEFAULT_WORKSHOP_TIMEZONE = "America/Santiago";
export declare const workshopDateSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const workshopTimeSchema: z.ZodString;
export declare const workshopTimezoneSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const createSpecialtySchema: z.ZodObject<{
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const updateSpecialtySchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    active?: boolean | undefined;
    name?: string | undefined;
}, {
    active?: boolean | undefined;
    name?: string | undefined;
}>, {
    active?: boolean | undefined;
    name?: string | undefined;
}, {
    active?: boolean | undefined;
    name?: string | undefined;
}>;
/** There is deliberately no update/delete rate schema. */
export declare const createSpecialtyRateSchema: z.ZodObject<{
    validityFrom: z.ZodEffects<z.ZodString, string, string>;
    costHourly: z.ZodNumber;
    saleHourly: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    validityFrom: string;
    costHourly: number;
    saleHourly: number;
}, {
    validityFrom: string;
    costHourly: number;
    saleHourly: number;
}>;
export declare const updateWorkerSpecialtiesSchema: z.ZodEffects<z.ZodObject<{
    principalSpecialtyId: z.ZodNullable<z.ZodNumber>;
    additionalSpecialtyIds: z.ZodArray<z.ZodNumber, "many">;
}, "strict", z.ZodTypeAny, {
    principalSpecialtyId: number | null;
    additionalSpecialtyIds: number[];
}, {
    principalSpecialtyId: number | null;
    additionalSpecialtyIds: number[];
}>, {
    principalSpecialtyId: number | null;
    additionalSpecialtyIds: number[];
}, {
    principalSpecialtyId: number | null;
    additionalSpecialtyIds: number[];
}>;
export declare const workshopWeeklyDaySchema: z.ZodEffects<z.ZodObject<{
    weekday: z.ZodNumber;
    start: z.ZodString;
    end: z.ZodString;
    breakStart: z.ZodOptional<z.ZodString>;
    breakEnd: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    weekday: number;
    start: string;
    end: string;
    breakStart?: string | undefined;
    breakEnd?: string | undefined;
}, {
    weekday: number;
    start: string;
    end: string;
    breakStart?: string | undefined;
    breakEnd?: string | undefined;
}>, {
    weekday: number;
    start: string;
    end: string;
    breakStart?: string | undefined;
    breakEnd?: string | undefined;
}, {
    weekday: number;
    start: string;
    end: string;
    breakStart?: string | undefined;
    breakEnd?: string | undefined;
}>;
export declare const updateWorkshopScheduleSchema: z.ZodEffects<z.ZodObject<{
    timezone: z.ZodEffects<z.ZodString, string, string>;
    weekly: z.ZodArray<z.ZodEffects<z.ZodObject<{
        weekday: z.ZodNumber;
        start: z.ZodString;
        end: z.ZodString;
        breakStart: z.ZodOptional<z.ZodString>;
        breakEnd: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }>, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    timezone: string;
    weekly: {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }[];
}, {
    timezone: string;
    weekly: {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }[];
}>, {
    timezone: string;
    weekly: {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }[];
}, {
    timezone: string;
    weekly: {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }[];
}>;
export declare const createWorkshopScheduleExceptionSchema: z.ZodEffects<z.ZodObject<{
    date: z.ZodEffects<z.ZodString, string, string>;
    dayOff: z.ZodBoolean;
    start: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    end: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    date: string;
    dayOff: boolean;
    reason: string;
    start?: string | null | undefined;
    end?: string | null | undefined;
}, {
    date: string;
    dayOff: boolean;
    reason: string;
    start?: string | null | undefined;
    end?: string | null | undefined;
}>, {
    date: string;
    dayOff: boolean;
    reason: string;
    start?: string | null | undefined;
    end?: string | null | undefined;
}, {
    date: string;
    dayOff: boolean;
    reason: string;
    start?: string | null | undefined;
    end?: string | null | undefined;
}>;
export declare const workshopSpecialtySchema: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    active: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: number;
    active: boolean;
    name: string;
}, {
    id: number;
    active: boolean;
    name: string;
}>;
export declare const workshopSpecialtyRateSchema: z.ZodObject<{
    id: z.ZodNumber;
    specialtyId: z.ZodNumber;
    validityFrom: z.ZodEffects<z.ZodString, string, string>;
    costHourly: z.ZodNumber;
    saleHourly: z.ZodNumber;
    currency: z.ZodLiteral<"CLP">;
    createdBy: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: number;
    createdAt: string;
    specialtyId: number;
    validityFrom: string;
    costHourly: number;
    saleHourly: number;
    currency: "CLP";
    createdBy: number | null;
}, {
    id: number;
    createdAt: string;
    specialtyId: number;
    validityFrom: string;
    costHourly: number;
    saleHourly: number;
    currency: "CLP";
    createdBy: number | null;
}>;
/** The specialty is independent of the authorization role; the role is shown for orientation only. */
export declare const workshopWorkerSchema: z.ZodObject<{
    id: z.ZodNumber;
    nombre: z.ZodString;
    activo: z.ZodBoolean;
    role: z.ZodNullable<z.ZodEnum<["desarrollador", "admin", "jefe", "mecanico", "vendedor", "bodeguero", "finanzas"]>>;
}, "strip", z.ZodTypeAny, {
    nombre: string;
    activo: boolean;
    id: number;
    role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas" | null;
}, {
    nombre: string;
    activo: boolean;
    id: number;
    role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas" | null;
}>;
export declare const workshopWorkerProfileSchema: z.ZodObject<{
    userId: z.ZodNumber;
    principalSpecialtyId: z.ZodNullable<z.ZodNumber>;
    additionalSpecialtyIds: z.ZodArray<z.ZodNumber, "many">;
}, "strip", z.ZodTypeAny, {
    userId: number;
    principalSpecialtyId: number | null;
    additionalSpecialtyIds: number[];
}, {
    userId: number;
    principalSpecialtyId: number | null;
    additionalSpecialtyIds: number[];
}>;
export declare const workshopScheduleSchema: z.ZodObject<{
    timezone: z.ZodEffects<z.ZodString, string, string>;
    weekly: z.ZodArray<z.ZodEffects<z.ZodObject<{
        weekday: z.ZodNumber;
        start: z.ZodString;
        end: z.ZodString;
        breakStart: z.ZodOptional<z.ZodString>;
        breakEnd: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }>, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }, {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }>, "many">;
    updatedAt: z.ZodNullable<z.ZodString>;
    updatedBy: z.ZodNullable<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    updatedAt: string | null;
    timezone: string;
    weekly: {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }[];
    updatedBy: number | null;
}, {
    updatedAt: string | null;
    timezone: string;
    weekly: {
        weekday: number;
        start: string;
        end: string;
        breakStart?: string | undefined;
        breakEnd?: string | undefined;
    }[];
    updatedBy: number | null;
}>;
export declare const workshopScheduleExceptionSchema: z.ZodObject<{
    id: z.ZodNumber;
    userId: z.ZodNumber;
    date: z.ZodEffects<z.ZodString, string, string>;
    dayOff: z.ZodBoolean;
    start: z.ZodNullable<z.ZodString>;
    end: z.ZodNullable<z.ZodString>;
    reason: z.ZodString;
    version: z.ZodNumber;
    createdBy: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: string;
    id: number;
    createdAt: string;
    userId: number;
    start: string | null;
    end: string | null;
    dayOff: boolean;
    reason: string;
    createdBy: number | null;
    version: number;
}, {
    date: string;
    id: number;
    createdAt: string;
    userId: number;
    start: string | null;
    end: string | null;
    dayOff: boolean;
    reason: string;
    createdBy: number | null;
    version: number;
}>;
export declare const workshopPersonnelConfigSchema: z.ZodObject<{
    specialties: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodString;
        active: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        id: number;
        active: boolean;
        name: string;
    }, {
        id: number;
        active: boolean;
        name: string;
    }>, "many">;
    rates: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        specialtyId: z.ZodNumber;
        validityFrom: z.ZodEffects<z.ZodString, string, string>;
        costHourly: z.ZodNumber;
        saleHourly: z.ZodNumber;
        currency: z.ZodLiteral<"CLP">;
        createdBy: z.ZodNullable<z.ZodNumber>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: number;
        createdAt: string;
        specialtyId: number;
        validityFrom: string;
        costHourly: number;
        saleHourly: number;
        currency: "CLP";
        createdBy: number | null;
    }, {
        id: number;
        createdAt: string;
        specialtyId: number;
        validityFrom: string;
        costHourly: number;
        saleHourly: number;
        currency: "CLP";
        createdBy: number | null;
    }>, "many">;
    workers: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        nombre: z.ZodString;
        activo: z.ZodBoolean;
        role: z.ZodNullable<z.ZodEnum<["desarrollador", "admin", "jefe", "mecanico", "vendedor", "bodeguero", "finanzas"]>>;
    }, "strip", z.ZodTypeAny, {
        nombre: string;
        activo: boolean;
        id: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas" | null;
    }, {
        nombre: string;
        activo: boolean;
        id: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas" | null;
    }>, "many">;
    profiles: z.ZodArray<z.ZodObject<{
        userId: z.ZodNumber;
        principalSpecialtyId: z.ZodNullable<z.ZodNumber>;
        additionalSpecialtyIds: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        userId: number;
        principalSpecialtyId: number | null;
        additionalSpecialtyIds: number[];
    }, {
        userId: number;
        principalSpecialtyId: number | null;
        additionalSpecialtyIds: number[];
    }>, "many">;
    schedule: z.ZodObject<{
        timezone: z.ZodEffects<z.ZodString, string, string>;
        weekly: z.ZodArray<z.ZodEffects<z.ZodObject<{
            weekday: z.ZodNumber;
            start: z.ZodString;
            end: z.ZodString;
            breakStart: z.ZodOptional<z.ZodString>;
            breakEnd: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }, {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }>, {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }, {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }>, "many">;
        updatedAt: z.ZodNullable<z.ZodString>;
        updatedBy: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        updatedAt: string | null;
        timezone: string;
        weekly: {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }[];
        updatedBy: number | null;
    }, {
        updatedAt: string | null;
        timezone: string;
        weekly: {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }[];
        updatedBy: number | null;
    }>;
    exceptions: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        userId: z.ZodNumber;
        date: z.ZodEffects<z.ZodString, string, string>;
        dayOff: z.ZodBoolean;
        start: z.ZodNullable<z.ZodString>;
        end: z.ZodNullable<z.ZodString>;
        reason: z.ZodString;
        version: z.ZodNumber;
        createdBy: z.ZodNullable<z.ZodNumber>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        date: string;
        id: number;
        createdAt: string;
        userId: number;
        start: string | null;
        end: string | null;
        dayOff: boolean;
        reason: string;
        createdBy: number | null;
        version: number;
    }, {
        date: string;
        id: number;
        createdAt: string;
        userId: number;
        start: string | null;
        end: string | null;
        dayOff: boolean;
        reason: string;
        createdBy: number | null;
        version: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    specialties: {
        id: number;
        active: boolean;
        name: string;
    }[];
    rates: {
        id: number;
        createdAt: string;
        specialtyId: number;
        validityFrom: string;
        costHourly: number;
        saleHourly: number;
        currency: "CLP";
        createdBy: number | null;
    }[];
    workers: {
        nombre: string;
        activo: boolean;
        id: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas" | null;
    }[];
    profiles: {
        userId: number;
        principalSpecialtyId: number | null;
        additionalSpecialtyIds: number[];
    }[];
    schedule: {
        updatedAt: string | null;
        timezone: string;
        weekly: {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }[];
        updatedBy: number | null;
    };
    exceptions: {
        date: string;
        id: number;
        createdAt: string;
        userId: number;
        start: string | null;
        end: string | null;
        dayOff: boolean;
        reason: string;
        createdBy: number | null;
        version: number;
    }[];
}, {
    specialties: {
        id: number;
        active: boolean;
        name: string;
    }[];
    rates: {
        id: number;
        createdAt: string;
        specialtyId: number;
        validityFrom: string;
        costHourly: number;
        saleHourly: number;
        currency: "CLP";
        createdBy: number | null;
    }[];
    workers: {
        nombre: string;
        activo: boolean;
        id: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas" | null;
    }[];
    profiles: {
        userId: number;
        principalSpecialtyId: number | null;
        additionalSpecialtyIds: number[];
    }[];
    schedule: {
        updatedAt: string | null;
        timezone: string;
        weekly: {
            weekday: number;
            start: string;
            end: string;
            breakStart?: string | undefined;
            breakEnd?: string | undefined;
        }[];
        updatedBy: number | null;
    };
    exceptions: {
        date: string;
        id: number;
        createdAt: string;
        userId: number;
        start: string | null;
        end: string | null;
        dayOff: boolean;
        reason: string;
        createdBy: number | null;
        version: number;
    }[];
}>;
export type CreateSpecialtyInput = z.infer<typeof createSpecialtySchema>;
export type UpdateSpecialtyInput = z.infer<typeof updateSpecialtySchema>;
export type CreateSpecialtyRateInput = z.infer<typeof createSpecialtyRateSchema>;
export type UpdateWorkerSpecialtiesInput = z.infer<typeof updateWorkerSpecialtiesSchema>;
export type UpdateWorkshopScheduleInput = z.infer<typeof updateWorkshopScheduleSchema>;
export type CreateWorkshopScheduleExceptionInput = z.infer<typeof createWorkshopScheduleExceptionSchema>;
export type WorkshopWeeklyDay = z.infer<typeof workshopWeeklyDaySchema>;
export declare const DEFAULT_WORKSHOP_WEEKLY: WorkshopWeeklyDay[];
export type WorkshopSpecialty = z.infer<typeof workshopSpecialtySchema>;
export type WorkshopSpecialtyRate = z.infer<typeof workshopSpecialtyRateSchema>;
export type WorkshopWorker = z.infer<typeof workshopWorkerSchema>;
export type WorkshopWorkerProfile = z.infer<typeof workshopWorkerProfileSchema>;
export type WorkshopScheduleConfig = z.infer<typeof workshopScheduleSchema>;
export type WorkshopShiftException = z.infer<typeof workshopScheduleExceptionSchema>;
export type WorkshopPersonnelConfig = z.infer<typeof workshopPersonnelConfigSchema>;
export interface WorkerShift {
    configured: boolean;
    /** Current or next working segment; a morning timer stops at lunch. */
    start: Date | null;
    end: Date | null;
    /** All working segments of the day, excluding lunch. Legacy continuous shifts omit this. */
    intervals?: Array<{
        start: Date;
        end: Date;
    }>;
}
export interface WorkerRateSnapshot {
    specialtyId: number | null;
    specialtyName: string | null;
    rateId: number | null;
    costHourly: number | null;
    saleHourly: number | null;
}
