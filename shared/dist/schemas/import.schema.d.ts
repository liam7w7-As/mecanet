import { z } from 'zod';
/**
 * Contrato común de las importaciones masivas desde Excel.
 *
 * El servidor hace todo el parseo con ExcelJS: el navegador solo sube el
 * archivo y muestra este resultado. Así no hace falta empaquetar una librería
 * de hojas de cálculo en el frontend.
 */
export declare const IMPORT_MODULES: readonly ["catalog", "vehicles", "fleet-vehicles"];
export type ImportModule = (typeof IMPORT_MODULES)[number];
/** Tope de filas de datos por archivo. Evita importaciones eternas y bloqueos. */
export declare const IMPORT_MAX_ROWS = 1000;
/** Tope de tamaño del archivo subido. */
export declare const IMPORT_MAX_FILE_SIZE_MB = 10;
export declare const IMPORT_ROW_STATUSES: readonly ["valid", "update", "created", "updated", "unchanged", "conflict", "duplicate", "error"];
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];
export declare const importModuleSchema: z.ZodEnum<["catalog", "vehicles", "fleet-vehicles"]>;
/** `?dryRun=true` genera la vista previa sin escribir en la base. */
export declare const importRequestQuerySchema: z.ZodObject<{
    warehouseId: z.ZodOptional<z.ZodNumber>;
    dryRun: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false", "1", "0"]>]>>, boolean, boolean | "0" | "1" | "true" | "false" | undefined>;
}, "strip", z.ZodTypeAny, {
    dryRun: boolean;
    warehouseId?: number | undefined;
}, {
    warehouseId?: number | undefined;
    dryRun?: boolean | "0" | "1" | "true" | "false" | undefined;
}>;
export type ImportRequestQuery = z.infer<typeof importRequestQuerySchema>;
export type ImportCellValue = string | number | null;
export interface ImportChange {
    field: string;
    label: string;
    before: ImportCellValue;
    after: ImportCellValue;
}
export interface ImportRowPreview {
    /** Número de fila real dentro del Excel, contando desde 1. */
    row: number;
    status: ImportRowStatus;
    /** Referencia legible: patente, código + nombre, etc. */
    label: string;
    /** Valores normalizados que se muestran en la vista previa. */
    values: Record<string, ImportCellValue>;
    /** Errores, advertencias o motivo de omisión. */
    messages: string[];
    existingId?: number;
    changes?: ImportChange[];
}
export interface ImportPreview {
    module: ImportModule;
    fileName: string;
    sheetName: string;
    headerRow: number;
    headers: string[];
    /** Columna canónica -> encabezado encontrado en el Excel. */
    mappedColumns: Record<string, string>;
    missingColumns: string[];
    totalRows: number;
    validRows: number;
    duplicateRows: number;
    errorRows: number;
    rows: ImportRowPreview[];
    truncated: boolean;
    maxRows: number;
    newRows?: number;
    updateRows?: number;
    unchangedRows?: number;
    conflictRows?: number;
    previewToken?: string;
    warehouseId?: number;
}
export interface ImportResult extends ImportPreview {
    created: number;
    skipped: number;
    failed: number;
    /** Clientes creados automáticamente al importar vehículos de taller. */
    clientsCreated: number;
    updated?: number;
    unchanged?: number;
    conflicts?: number;
}
