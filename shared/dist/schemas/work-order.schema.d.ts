import { z } from 'zod';
export declare const workOrderInspectionSchema: z.ZodObject<{
    inventario: z.ZodDefault<z.ZodEffects<z.ZodArray<z.ZodEnum<["botiquin", "chaleco_reflectante", "extintor", "triangulo", "control_remoto", "manual", "radio", "usb", "rueda_repuesto", "llave_ruedas", "gata", "herramientas", "perno_seguridad", "enganche", "antena", "tapa_combustible", "tapas_ruedas", "limpiaparabrisas"]>, "many">, ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[], ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[]>>;
    nivelCombustible: z.ZodOptional<z.ZodNullable<z.ZodEnum<["vacio", "cuarto", "medio", "tres_cuartos", "lleno"]>>>;
    llantaDelanteraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    llantaDelanteraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    llantaTraseraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    llantaTraseraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    objetosValor: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    observaciones: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    inventario: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[];
    nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
    llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    objetosValor?: string | null | undefined;
    observaciones?: string | null | undefined;
}, {
    inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
    nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
    llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    objetosValor?: string | null | undefined;
    observaciones?: string | null | undefined;
}>;
export declare const updateWorkOrderInspectionSchema: z.ZodEffects<z.ZodObject<{
    inventario: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodEnum<["botiquin", "chaleco_reflectante", "extintor", "triangulo", "control_remoto", "manual", "radio", "usb", "rueda_repuesto", "llave_ruedas", "gata", "herramientas", "perno_seguridad", "enganche", "antena", "tapa_combustible", "tapas_ruedas", "limpiaparabrisas"]>, "many">, ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[], ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[]>>;
    nivelCombustible: z.ZodOptional<z.ZodNullable<z.ZodEnum<["vacio", "cuarto", "medio", "tres_cuartos", "lleno"]>>>;
    llantaDelanteraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    llantaDelanteraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    llantaTraseraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    llantaTraseraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
    objetosValor: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    observaciones: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
    nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
    llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    objetosValor?: string | null | undefined;
    observaciones?: string | null | undefined;
}, {
    inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
    nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
    llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    objetosValor?: string | null | undefined;
    observaciones?: string | null | undefined;
}>, {
    inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
    nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
    llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    objetosValor?: string | null | undefined;
    observaciones?: string | null | undefined;
}, {
    inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
    nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
    llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
    objetosValor?: string | null | undefined;
    observaciones?: string | null | undefined;
}>;
export declare const workOrderItemInputSchema: z.ZodObject<{
    catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tipoLinea: z.ZodDefault<z.ZodEnum<["parte", "estandar", "especifico"]>>;
    descripcion: z.ZodString;
    cantidad: z.ZodDefault<z.ZodNumber>;
    unidadMedida: z.ZodDefault<z.ZodEnum<["unidad", "litro", "mililitro", "kilogramo", "juego", "servicio"]>>;
    precioUnitario: z.ZodDefault<z.ZodNumber>;
    estadoOperativo: z.ZodDefault<z.ZodEnum<["pendiente", "en_proceso", "completado", "omitido"]>>;
    notasOperativas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    descripcion: string;
    unidadMedida: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio";
    tipoLinea: "parte" | "estandar" | "especifico";
    cantidad: number;
    precioUnitario: number;
    estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
    catalogItemId?: number | null | undefined;
    notasOperativas?: string | null | undefined;
}, {
    descripcion: string;
    unidadMedida?: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio" | undefined;
    catalogItemId?: number | null | undefined;
    tipoLinea?: "parte" | "estandar" | "especifico" | undefined;
    cantidad?: number | undefined;
    precioUnitario?: number | undefined;
    estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
    notasOperativas?: string | null | undefined;
}>;
export declare const createWorkOrderSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    contactClientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    billingClientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    assignedMechanicId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    kilometrajeIngreso: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    fechaIngreso: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaEntrega: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    items: z.ZodDefault<z.ZodArray<z.ZodObject<{
        catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        tipoLinea: z.ZodDefault<z.ZodEnum<["parte", "estandar", "especifico"]>>;
        descripcion: z.ZodString;
        cantidad: z.ZodDefault<z.ZodNumber>;
        unidadMedida: z.ZodDefault<z.ZodEnum<["unidad", "litro", "mililitro", "kilogramo", "juego", "servicio"]>>;
        precioUnitario: z.ZodDefault<z.ZodNumber>;
        estadoOperativo: z.ZodDefault<z.ZodEnum<["pendiente", "en_proceso", "completado", "omitido"]>>;
        notasOperativas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        descripcion: string;
        unidadMedida: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio";
        tipoLinea: "parte" | "estandar" | "especifico";
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }, {
        descripcion: string;
        unidadMedida?: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio" | undefined;
        catalogItemId?: number | null | undefined;
        tipoLinea?: "parte" | "estandar" | "especifico" | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }>, "many">>;
    inspection: z.ZodOptional<z.ZodObject<{
        inventario: z.ZodDefault<z.ZodEffects<z.ZodArray<z.ZodEnum<["botiquin", "chaleco_reflectante", "extintor", "triangulo", "control_remoto", "manual", "radio", "usb", "rueda_repuesto", "llave_ruedas", "gata", "herramientas", "perno_seguridad", "enganche", "antena", "tapa_combustible", "tapas_ruedas", "limpiaparabrisas"]>, "many">, ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[], ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[]>>;
        nivelCombustible: z.ZodOptional<z.ZodNullable<z.ZodEnum<["vacio", "cuarto", "medio", "tres_cuartos", "lleno"]>>>;
        llantaDelanteraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        llantaDelanteraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        llantaTraseraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        llantaTraseraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        objetosValor: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
        observaciones: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        inventario: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[];
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    }, {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    items: {
        descripcion: string;
        unidadMedida: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio";
        tipoLinea: "parte" | "estandar" | "especifico";
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }[];
    fechaIngreso?: string | null | undefined;
    clientId?: number | null | undefined;
    descripcion?: string | null | undefined;
    contactClientId?: number | null | undefined;
    billingClientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    assignedMechanicId?: number | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
    inspection?: {
        inventario: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[];
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    } | undefined;
}, {
    fechaIngreso?: string | null | undefined;
    clientId?: number | null | undefined;
    descripcion?: string | null | undefined;
    contactClientId?: number | null | undefined;
    billingClientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    assignedMechanicId?: number | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
    items?: {
        descripcion: string;
        unidadMedida?: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio" | undefined;
        catalogItemId?: number | null | undefined;
        tipoLinea?: "parte" | "estandar" | "especifico" | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    inspection?: {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    } | undefined;
}>;
export declare const updateWorkOrderSchema: z.ZodEffects<z.ZodObject<{
    clientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    contactClientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    billingClientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    kilometrajeIngreso: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    fechaIngreso: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaEntrega: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        tipoLinea: z.ZodDefault<z.ZodEnum<["parte", "estandar", "especifico"]>>;
        descripcion: z.ZodString;
        cantidad: z.ZodDefault<z.ZodNumber>;
        unidadMedida: z.ZodDefault<z.ZodEnum<["unidad", "litro", "mililitro", "kilogramo", "juego", "servicio"]>>;
        precioUnitario: z.ZodDefault<z.ZodNumber>;
        estadoOperativo: z.ZodDefault<z.ZodEnum<["pendiente", "en_proceso", "completado", "omitido"]>>;
        notasOperativas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        descripcion: string;
        unidadMedida: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio";
        tipoLinea: "parte" | "estandar" | "especifico";
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }, {
        descripcion: string;
        unidadMedida?: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio" | undefined;
        catalogItemId?: number | null | undefined;
        tipoLinea?: "parte" | "estandar" | "especifico" | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }>, "many">>;
    inspection: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        inventario: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodEnum<["botiquin", "chaleco_reflectante", "extintor", "triangulo", "control_remoto", "manual", "radio", "usb", "rueda_repuesto", "llave_ruedas", "gata", "herramientas", "perno_seguridad", "enganche", "antena", "tapa_combustible", "tapas_ruedas", "limpiaparabrisas"]>, "many">, ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[], ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[]>>;
        nivelCombustible: z.ZodOptional<z.ZodNullable<z.ZodEnum<["vacio", "cuarto", "medio", "tres_cuartos", "lleno"]>>>;
        llantaDelanteraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        llantaDelanteraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        llantaTraseraIzquierda: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        llantaTraseraDerecha: z.ZodOptional<z.ZodNullable<z.ZodEnum<["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"]>>>;
        objetosValor: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
        observaciones: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    }, {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    }>, {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    }, {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    fechaIngreso?: string | null | undefined;
    clientId?: number | null | undefined;
    descripcion?: string | null | undefined;
    contactClientId?: number | null | undefined;
    billingClientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
    items?: {
        descripcion: string;
        unidadMedida: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio";
        tipoLinea: "parte" | "estandar" | "especifico";
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    inspection?: {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    } | undefined;
}, {
    fechaIngreso?: string | null | undefined;
    clientId?: number | null | undefined;
    descripcion?: string | null | undefined;
    contactClientId?: number | null | undefined;
    billingClientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
    items?: {
        descripcion: string;
        unidadMedida?: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio" | undefined;
        catalogItemId?: number | null | undefined;
        tipoLinea?: "parte" | "estandar" | "especifico" | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    inspection?: {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    } | undefined;
}>, {
    fechaIngreso?: string | null | undefined;
    clientId?: number | null | undefined;
    descripcion?: string | null | undefined;
    contactClientId?: number | null | undefined;
    billingClientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
    items?: {
        descripcion: string;
        unidadMedida: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio";
        tipoLinea: "parte" | "estandar" | "especifico";
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    inspection?: {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    } | undefined;
}, {
    fechaIngreso?: string | null | undefined;
    clientId?: number | null | undefined;
    descripcion?: string | null | undefined;
    contactClientId?: number | null | undefined;
    billingClientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
    items?: {
        descripcion: string;
        unidadMedida?: "unidad" | "litro" | "mililitro" | "kilogramo" | "juego" | "servicio" | undefined;
        catalogItemId?: number | null | undefined;
        tipoLinea?: "parte" | "estandar" | "especifico" | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    inspection?: {
        inventario?: ("botiquin" | "chaleco_reflectante" | "extintor" | "triangulo" | "control_remoto" | "manual" | "radio" | "usb" | "rueda_repuesto" | "llave_ruedas" | "gata" | "herramientas" | "perno_seguridad" | "enganche" | "antena" | "tapa_combustible" | "tapas_ruedas" | "limpiaparabrisas")[] | undefined;
        nivelCombustible?: "vacio" | "cuarto" | "medio" | "tres_cuartos" | "lleno" | null | undefined;
        llantaDelanteraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaDelanteraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraIzquierda?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        llantaTraseraDerecha?: "no_revisado" | "bueno" | "regular" | "desgaste_severo" | "baja_presion" | null | undefined;
        objetosValor?: string | null | undefined;
        observaciones?: string | null | undefined;
    } | undefined;
}>;
export declare const workOrderQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    estado: z.ZodOptional<z.ZodEnum<["borrador", "en_progreso", "esperando_repuesto", "finalizada", "entregada", "cancelada"]>>;
    clientId: z.ZodOptional<z.ZodNumber>;
    vehicleId: z.ZodOptional<z.ZodNumber>;
    fechaDesde: z.ZodOptional<z.ZodString>;
    fechaHasta: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    estado?: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    estado?: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
}>;
export declare const changeWorkOrderStatusSchema: z.ZodObject<{
    nuevoEstado: z.ZodEnum<["borrador", "en_progreso", "esperando_repuesto", "finalizada", "entregada", "cancelada"]>;
    motivo: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    nuevoEstado: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada";
    motivo?: string | null | undefined;
}, {
    nuevoEstado: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada";
    motivo?: string | null | undefined;
}>;
export declare const deliverWorkOrderSchema: z.ZodObject<{
    kilometrajeSalida: z.ZodNumber;
    receptorNombre: z.ZodString;
    receptorRut: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    receptorTelefono: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    checklist: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodEnum<["trabajos_explicados", "vehiculo_revisado", "pertenencias_entregadas", "documentos_entregados"]>, "many">, ("trabajos_explicados" | "vehiculo_revisado" | "pertenencias_entregadas" | "documentos_entregados")[], ("trabajos_explicados" | "vehiculo_revisado" | "pertenencias_entregadas" | "documentos_entregados")[]>, ("trabajos_explicados" | "vehiculo_revisado" | "pertenencias_entregadas" | "documentos_entregados")[], ("trabajos_explicados" | "vehiculo_revisado" | "pertenencias_entregadas" | "documentos_entregados")[]>;
    conformidad: z.ZodLiteral<true>;
    firmaRecepcion: z.ZodString;
    observaciones: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    kilometrajeSalida: number;
    receptorNombre: string;
    checklist: ("trabajos_explicados" | "vehiculo_revisado" | "pertenencias_entregadas" | "documentos_entregados")[];
    conformidad: true;
    firmaRecepcion: string;
    observaciones?: string | null | undefined;
    receptorRut?: string | null | undefined;
    receptorTelefono?: string | null | undefined;
}, {
    kilometrajeSalida: number;
    receptorNombre: string;
    checklist: ("trabajos_explicados" | "vehiculo_revisado" | "pertenencias_entregadas" | "documentos_entregados")[];
    conformidad: true;
    firmaRecepcion: string;
    observaciones?: string | null | undefined;
    receptorRut?: string | null | undefined;
    receptorTelefono?: string | null | undefined;
}>;
export declare const createWorkOrderReentrySchema: z.ZodObject<{
    tipoIngreso: z.ZodEnum<["garantia", "reingreso"]>;
    motivo: z.ZodString;
    kilometrajeIngreso: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    fechaIngreso: z.ZodOptional<z.ZodString>;
    copiarItems: z.ZodDefault<z.ZodBoolean>;
    coberturaGarantia: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    motivo: string;
    tipoIngreso: "garantia" | "reingreso";
    copiarItems: boolean;
    fechaIngreso?: string | undefined;
    kilometrajeIngreso?: number | null | undefined;
    coberturaGarantia?: boolean | undefined;
}, {
    motivo: string;
    tipoIngreso: "garantia" | "reingreso";
    fechaIngreso?: string | undefined;
    kilometrajeIngreso?: number | null | undefined;
    copiarItems?: boolean | undefined;
    coberturaGarantia?: boolean | undefined;
}>;
export declare const assignWorkOrderMechanicSchema: z.ZodObject<{
    mechanicId: z.ZodNullable<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    mechanicId: number | null;
}, {
    mechanicId: number | null;
}>;
export declare const workOrderProgressReportSchema: z.ZodObject<{
    porcentaje: z.ZodNumber;
    comentario: z.ZodString;
    bloqueos: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    porcentaje: number;
    comentario: string;
    bloqueos?: string | null | undefined;
}, {
    porcentaje: number;
    comentario: string;
    bloqueos?: string | null | undefined;
}>;
export declare const updateWorkOrderExecutionSchema: z.ZodEffects<z.ZodObject<{
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        estadoOperativo: z.ZodEnum<["pendiente", "en_proceso", "completado", "omitido"]>;
        notasOperativas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        notasOperativas?: string | null | undefined;
    }, {
        id: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        notasOperativas?: string | null | undefined;
    }>, "many">>;
    reporte: z.ZodOptional<z.ZodObject<{
        porcentaje: z.ZodNumber;
        comentario: z.ZodString;
        bloqueos: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        porcentaje: number;
        comentario: string;
        bloqueos?: string | null | undefined;
    }, {
        porcentaje: number;
        comentario: string;
        bloqueos?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    items?: {
        id: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    reporte?: {
        porcentaje: number;
        comentario: string;
        bloqueos?: string | null | undefined;
    } | undefined;
}, {
    items?: {
        id: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    reporte?: {
        porcentaje: number;
        comentario: string;
        bloqueos?: string | null | undefined;
    } | undefined;
}>, {
    items?: {
        id: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    reporte?: {
        porcentaje: number;
        comentario: string;
        bloqueos?: string | null | undefined;
    } | undefined;
}, {
    items?: {
        id: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    reporte?: {
        porcentaje: number;
        comentario: string;
        bloqueos?: string | null | undefined;
    } | undefined;
}>;
export declare const createWorkOrderRequestSchema: z.ZodDiscriminatedUnion<"tipo", [z.ZodObject<{
    tipo: z.ZodLiteral<"repuesto">;
    catalogItemId: z.ZodNumber;
    cantidad: z.ZodNumber;
    motivo: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tipo: "repuesto";
    motivo: string;
    catalogItemId: number;
    cantidad: number;
}, {
    tipo: "repuesto";
    motivo: string;
    catalogItemId: number;
    cantidad: number;
}>, z.ZodObject<{
    tipo: z.ZodLiteral<"aumento_precio">;
    workOrderItemId: z.ZodNumber;
    precioSugerido: z.ZodNumber;
    motivo: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tipo: "aumento_precio";
    motivo: string;
    workOrderItemId: number;
    precioSugerido: number;
}, {
    tipo: "aumento_precio";
    motivo: string;
    workOrderItemId: number;
    precioSugerido: number;
}>]>;
export declare const reviewWorkOrderRequestSchema: z.ZodObject<{
    decision: z.ZodEnum<["aprobar", "rechazar"]>;
    precioAprobado: z.ZodOptional<z.ZodNumber>;
    comentario: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    decision: "aprobar" | "rechazar";
    comentario?: string | null | undefined;
    precioAprobado?: number | undefined;
}, {
    decision: "aprobar" | "rechazar";
    comentario?: string | null | undefined;
    precioAprobado?: number | undefined;
}>;
export type WorkOrderItemInput = z.infer<typeof workOrderItemInputSchema>;
export type WorkOrderInspectionInput = z.infer<typeof workOrderInspectionSchema>;
export type UpdateWorkOrderInspectionInput = z.infer<typeof updateWorkOrderInspectionSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type WorkOrderQueryInput = z.infer<typeof workOrderQuerySchema>;
export type ChangeWorkOrderStatusInput = z.infer<typeof changeWorkOrderStatusSchema>;
export type DeliverWorkOrderInput = z.infer<typeof deliverWorkOrderSchema>;
export type CreateWorkOrderReentryInput = z.infer<typeof createWorkOrderReentrySchema>;
export type AssignWorkOrderMechanicInput = z.infer<typeof assignWorkOrderMechanicSchema>;
export type WorkOrderProgressReportInput = z.infer<typeof workOrderProgressReportSchema>;
export type UpdateWorkOrderExecutionInput = z.infer<typeof updateWorkOrderExecutionSchema>;
export type CreateWorkOrderRequestInput = z.infer<typeof createWorkOrderRequestSchema>;
export type ReviewWorkOrderRequestInput = z.infer<typeof reviewWorkOrderRequestSchema>;
