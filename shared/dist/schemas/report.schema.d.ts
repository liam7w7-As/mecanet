import { z } from 'zod';
export declare const commercialReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    estadoPago: z.ZodOptional<z.ZodEnum<["total", "parcial", "por_verificar", "por_pagar", "ot_finalizado"]>>;
    asesorId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    asesorId?: number | undefined;
}, {
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    asesorId?: number | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    asesorId?: number | undefined;
}, {
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    asesorId?: number | undefined;
}>;
export type CommercialReportFilters = z.infer<typeof commercialReportQuerySchema>;
