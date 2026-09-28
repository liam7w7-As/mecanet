import { z } from 'zod';
export declare const OPERATIONAL_TASK_TYPES: readonly ["work_order_approval", "warehouse_delivery", "assigned_work_order", "payment_verification", "quotation_follow_up", "stock_alert"];
export declare const operationalTaskSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["work_order_approval", "warehouse_delivery", "assigned_work_order", "payment_verification", "quotation_follow_up", "stock_alert"]>;
    title: z.ZodString;
    description: z.ZodString;
    href: z.ZodString;
    createdAt: z.ZodString;
    priority: z.ZodEnum<["high", "medium", "normal"]>;
}, "strip", z.ZodTypeAny, {
    type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
    id: string;
    title: string;
    description: string;
    href: string;
    createdAt: string;
    priority: "normal" | "high" | "medium";
}, {
    type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
    id: string;
    title: string;
    description: string;
    href: string;
    createdAt: string;
    priority: "normal" | "high" | "medium";
}>;
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
        stockMinimo: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        nombre: string;
        id: number;
        codigo: string | null;
        stock: number;
        stockMinimo: number;
    }, {
        nombre: string;
        id: number;
        codigo: string | null;
        stock: number;
        stockMinimo?: number | undefined;
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
    operationalInbox: z.ZodObject<{
        role: z.ZodEnum<["desarrollador", "admin", "jefe", "mecanico", "vendedor", "bodeguero", "finanzas"]>;
        total: z.ZodNumber;
        counts: z.ZodObject<{
            approvals: z.ZodNumber;
            warehouseDeliveries: z.ZodNumber;
            assignedWorkOrders: z.ZodNumber;
            paymentVerifications: z.ZodNumber;
            quotationFollowUps: z.ZodNumber;
            stockAlerts: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            approvals: number;
            warehouseDeliveries: number;
            assignedWorkOrders: number;
            paymentVerifications: number;
            quotationFollowUps: number;
            stockAlerts: number;
        }, {
            approvals: number;
            warehouseDeliveries: number;
            assignedWorkOrders: number;
            paymentVerifications: number;
            quotationFollowUps: number;
            stockAlerts: number;
        }>;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["work_order_approval", "warehouse_delivery", "assigned_work_order", "payment_verification", "quotation_follow_up", "stock_alert"]>;
            title: z.ZodString;
            description: z.ZodString;
            href: z.ZodString;
            createdAt: z.ZodString;
            priority: z.ZodEnum<["high", "medium", "normal"]>;
        }, "strip", z.ZodTypeAny, {
            type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
            id: string;
            title: string;
            description: string;
            href: string;
            createdAt: string;
            priority: "normal" | "high" | "medium";
        }, {
            type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
            id: string;
            title: string;
            description: string;
            href: string;
            createdAt: string;
            priority: "normal" | "high" | "medium";
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        total: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas";
        counts: {
            approvals: number;
            warehouseDeliveries: number;
            assignedWorkOrders: number;
            paymentVerifications: number;
            quotationFollowUps: number;
            stockAlerts: number;
        };
        items: {
            type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
            id: string;
            title: string;
            description: string;
            href: string;
            createdAt: string;
            priority: "normal" | "high" | "medium";
        }[];
    }, {
        total: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas";
        counts: {
            approvals: number;
            warehouseDeliveries: number;
            assignedWorkOrders: number;
            paymentVerifications: number;
            quotationFollowUps: number;
            stockAlerts: number;
        };
        items: {
            type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
            id: string;
            title: string;
            description: string;
            href: string;
            createdAt: string;
            priority: "normal" | "high" | "medium";
        }[];
    }>;
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
        stockMinimo: number;
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
    operationalInbox: {
        total: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas";
        counts: {
            approvals: number;
            warehouseDeliveries: number;
            assignedWorkOrders: number;
            paymentVerifications: number;
            quotationFollowUps: number;
            stockAlerts: number;
        };
        items: {
            type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
            id: string;
            title: string;
            description: string;
            href: string;
            createdAt: string;
            priority: "normal" | "high" | "medium";
        }[];
    };
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
        stockMinimo?: number | undefined;
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
    operationalInbox: {
        total: number;
        role: "desarrollador" | "admin" | "jefe" | "mecanico" | "vendedor" | "bodeguero" | "finanzas";
        counts: {
            approvals: number;
            warehouseDeliveries: number;
            assignedWorkOrders: number;
            paymentVerifications: number;
            quotationFollowUps: number;
            stockAlerts: number;
        };
        items: {
            type: "work_order_approval" | "warehouse_delivery" | "assigned_work_order" | "payment_verification" | "quotation_follow_up" | "stock_alert";
            id: string;
            title: string;
            description: string;
            href: string;
            createdAt: string;
            priority: "normal" | "high" | "medium";
        }[];
    };
}>;
export type OperationalTaskType = (typeof OPERATIONAL_TASK_TYPES)[number];
export type OperationalTask = z.infer<typeof operationalTaskSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
