import { z } from 'zod';
/**
 * Contrato común de las importaciones masivas desde Excel.
 *
 * El servidor hace todo el parseo con ExcelJS: el navegador solo sube el
 * archivo y muestra este resultado. Así no hace falta empaquetar una librería
 * de hojas de cálculo en el frontend.
 */
export const IMPORT_MODULES = ['catalog', 'vehicles', 'fleet-vehicles'];
/** Tope de filas de datos por archivo. Evita importaciones eternas y bloqueos. */
export const IMPORT_MAX_ROWS = 1_000;
/** Tope de tamaño del archivo subido. */
export const IMPORT_MAX_FILE_SIZE_MB = 10;
export const IMPORT_ROW_STATUSES = ['valid', 'created', 'duplicate', 'error'];
export const importModuleSchema = z.enum(IMPORT_MODULES);
/** `?dryRun=true` genera la vista previa sin escribir en la base. */
export const importRequestQuerySchema = z.object({
    dryRun: z
        .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
        .optional()
        .transform((value) => value === true || value === 'true' || value === '1'),
});
