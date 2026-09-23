import { z } from 'zod';
export declare const dashboardSummarySchema: z.ZodObject<{
    metrics: z.ZodObject<{
        activeWorkOrders: z.ZodNumber;
        waitingForParts: z.ZodNumber;
        pendingQuotations: z.ZodNumber;
        pendingBalance: z.ZodNumber;
        monthlyRevenue: z.ZodNumber;
        quotationsWithoutWorkOrder: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        activeWorkOrders: number;
        waitingForParts: number;
        pendingQuotations: number;
        pendingBalance: number;
        monthlyRevenue: number;
        quotationsWithoutWorkOrder: number;
    }, {
        activeWorkOrders: number;
        waitingForParts: number;
        pendingQuotations: number;
        pendingBalance: number;
        monthlyRevenue: number;
        quotationsWithoutWorkOrder: number;
    }>;
    recentWorkOrders: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        codigo: z.ZodString;
        estado: z.ZodEnum<["borrador", "en_progreso", "esperando_repuesto", "finalizada", "entregada", "cancelada"]>;
        fechaIngreso: z.ZodNullable<z.ZodString>;
        updatedAt: z.ZodString;
        client: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            nombre: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            nombre: string;
            id: number;
        }, {
            nombre: string;
            id: number;
        }>>;
        vehicle: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            patente: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: number;
            patente: string;
        }, {
            id: number;
            patente: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        codigo: string;
        estado: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada";
        fechaIngreso: string | null;
        updatedAt: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        vehicle: {
            id: number;
            patente: string;
        } | null;
    }, {
        id: number;
        codigo: string;
        estado: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada";
        fechaIngreso: string | null;
        updatedAt: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        vehicle: {
            id: number;
            patente: string;
        } | null;
    }>, "many">;
    lowStockCount: z.ZodNumber;
    lowStockItems: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        codigo: z.ZodNullable<z.ZodString>;
        nombre: z.ZodString;
        stock: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        nombre: string;
        id: number;
        codigo: string | null;
        stock: number;
    }, {
        nombre: string;
        id: number;
        codigo: string | null;
        stock: number;
    }>, "many">;
    unlinkedQuotations: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        codigo: z.ZodString;
        total: z.ZodNumber;
        estadoPago: z.ZodEnum<["total", "parcial", "por_verificar", "por_pagar", "ot_finalizado"]>;
        client: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            nombre: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            nombre: string;
            id: number;
        }, {
            nombre: string;
            id: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        total: number;
        id: number;
        codigo: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        estadoPago: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado";
    }, {
        total: number;
        id: number;
        codigo: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        estadoPago: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado";
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    metrics: {
        activeWorkOrders: number;
        waitingForParts: number;
        pendingQuotations: number;
        pendingBalance: number;
        monthlyRevenue: number;
        quotationsWithoutWorkOrder: number;
    };
    recentWorkOrders: {
        id: number;
        codigo: string;
        estado: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada";
        fechaIngreso: string | null;
        updatedAt: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        vehicle: {
            id: number;
            patente: string;
        } | null;
    }[];
    lowStockCount: number;
    lowStockItems: {
        nombre: string;
        id: number;
        codigo: string | null;
        stock: number;
    }[];
    unlinkedQuotations: {
        total: number;
        id: number;
        codigo: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        estadoPago: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado";
    }[];
}, {
    metrics: {
        activeWorkOrders: number;
        waitingForParts: number;
        pendingQuotations: number;
        pendingBalance: number;
        monthlyRevenue: number;
        quotationsWithoutWorkOrder: number;
    };
    recentWorkOrders: {
        id: number;
        codigo: string;
        estado: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada";
        fechaIngreso: string | null;
        updatedAt: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        vehicle: {
            id: number;
            patente: string;
        } | null;
    }[];
    lowStockCount: number;
    lowStockItems: {
        nombre: string;
        id: number;
        codigo: string | null;
        stock: number;
    }[];
    unlinkedQuotations: {
        total: number;
        id: number;
        codigo: string;
        client: {
            nombre: string;
            id: number;
        } | null;
        estadoPago: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado";
    }[];
}>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
