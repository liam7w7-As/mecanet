import { z } from 'zod';

/**
 * Contrato común de las importaciones masivas desde Excel.
 *
 * El servidor hace todo el parseo con ExcelJS: el navegador solo sube el
 * archivo y muestra este resultado. Así no hace falta empaquetar una librería
 * de hojas de cálculo en el frontend.
 */

export const IMPORT_MODULES = ['catalog', 'vehicles', 'fleet-vehicles'] as const;

export type ImportModule = (typeof IMPORT_MODULES)[number];

/** Tope de filas de datos por archivo. Evita importaciones eternas y bloqueos. */
export const IMPORT_MAX_ROWS = 1_000;

/** Tope de tamaño del archivo subido. */
export const IMPORT_MAX_FILE_SIZE_MB = 10;

export const IMPORT_ROW_STATUSES = ['valid', 'created', 'duplicate', 'error'] as const;

export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const importModuleSchema = z.enum(IMPORT_MODULES);

/** `?dryRun=true` genera la vista previa sin escribir en la base. */
export const importRequestQuerySchema = z.object({
  dryRun: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
});

export type ImportRequestQuery = z.infer<typeof importRequestQuerySchema>;

export type ImportCellValue = string | number | null;

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
}

export interface ImportResult extends ImportPreview {
  created: number;
  skipped: number;
  failed: number;
  /** Clientes creados automáticamente al importar vehículos de taller. */
  clientsCreated: number;
}
