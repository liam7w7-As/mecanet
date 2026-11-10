import ExcelJS from 'exceljs';

import { IMPORT_MAX_ROWS } from '@unithor/shared';

import { ApiError } from '../../utils/ApiError.js';

export type SpreadsheetValue = string | number | null;

export interface SpreadsheetRow {
  rowNumber: number;
  values: Record<string, SpreadsheetValue>;
}

export interface SpreadsheetData {
  sheetName: string;
  headerRow: number;
  headers: string[];
  mappedColumns: Record<string, string>;
  missingColumns: string[];
  rows: SpreadsheetRow[];
  totalRows: number;
  truncated: boolean;
  maxRows: number;
}

export type SpreadsheetAliases = Record<string, readonly string[]>;

const cleanText = (value: string): string =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim();

const valueOfUnknown = (raw: unknown): SpreadsheetValue => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return cleanText(raw);
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 'SÍ' : 'NO';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'object') {
    const object = raw as Record<string, unknown>;

    if (Array.isArray(object.richText)) {
      return cleanText(
        object.richText
          .map((part) => String((part as { text?: unknown }).text ?? ''))
          .join(''),
      );
    }

    if (typeof object.text === 'string') return cleanText(object.text);
    if ('result' in object) return valueOfUnknown(object.result);
    // Una fórmula sin resultado cacheado no aporta un dato confiable.
    if ('formula' in object || 'sharedFormula' in object) return null;
    if ('error' in object) return null;
  }

  return cleanText(String(raw));
};

export const cellValue = (cell: ExcelJS.Cell): SpreadsheetValue => valueOfUnknown(cell.value);

export const normalizeHeader = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface HeaderCell {
  column: number;
  text: string;
  normalized: string;
}

const readHeaderCells = (row: ExcelJS.Row): HeaderCell[] => {
  const cells: HeaderCell[] = [];

  row.eachCell({ includeEmpty: false }, (cell, column) => {
    const value = cellValue(cell);
    const text = value === null ? '' : String(value).trim();
    if (!text) return;
    cells.push({ column, text, normalized: normalizeHeader(text) });
  });

  return cells;
};

const resolveColumnMap = (
  cells: HeaderCell[],
  aliases: SpreadsheetAliases,
): Record<string, number> => {
  const mapped: Record<string, number> = {};

  for (const [key, aliasList] of Object.entries(aliases)) {
    const normalizedKey = normalizeHeader(key);
    const exact = cells.find((cell) => cell.normalized === normalizedKey);
    if (exact) {
      mapped[key] = exact.column;
      continue;
    }

    const normalizedAliases = aliasList.map(normalizeHeader).filter(Boolean);
    const alias = cells.find((cell) => normalizedAliases.includes(cell.normalized));
    if (alias) {
      mapped[key] = alias.column;
    }
  }

  return mapped;
};

const findHeaderRow = (
  sheet: ExcelJS.Worksheet,
  aliases: SpreadsheetAliases,
  required: readonly string[],
): { rowNumber: number; cells: HeaderCell[]; map: Record<string, number>; score: number } | null => {
  const scanLimit = Math.min(sheet.rowCount, 25);
  let best: {
    rowNumber: number;
    cells: HeaderCell[];
    map: Record<string, number>;
    score: number;
  } | null = null;

  for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber += 1) {
    const cells = readHeaderCells(sheet.getRow(rowNumber));
    if (cells.length < 2) continue;

    const map = resolveColumnMap(cells, aliases);
    const mappedCount = Object.keys(map).length;
    if (mappedCount === 0) continue;

    const requiredMapped = required.filter((key) => map[key] !== undefined).length;
    const score = mappedCount + requiredMapped * 4;

    if (!best || score > best.score) {
      best = { rowNumber, cells, map, score };
    }

    if (requiredMapped === required.length && mappedCount >= Math.max(required.length + 1, 2)) {
      break;
    }
  }

  return best;
};

const pickWorksheet = (workbook: ExcelJS.Workbook): ExcelJS.Worksheet => {
  const dataSheet = workbook.getWorksheet('Datos');
  if (dataSheet) return dataSheet;

  const sheets = workbook.worksheets.filter(
    (sheet) => normalizeHeader(sheet.name) !== 'instrucciones',
  );

  const first = sheets[0] ?? workbook.worksheets[0];
  if (!first) {
    throw ApiError.badRequest('El archivo Excel no contiene hojas de datos');
  }

  return first;
};

export const readSpreadsheet = async (
  buffer: Buffer,
  options: {
    aliases: SpreadsheetAliases;
    required: readonly string[];
    maxRows?: number;
    fileName?: string;
  },
): Promise<SpreadsheetData> => {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw ApiError.badRequest(
      'No se pudo leer el archivo. Asegúrate de que sea un Excel .xlsx válido y no esté protegido.',
    );
  }

  const sheet = pickWorksheet(workbook);
  const maxRows = options.maxRows ?? IMPORT_MAX_ROWS;
  const header = findHeaderRow(sheet, options.aliases, options.required);

  if (!header) {
    throw ApiError.badRequest(
      'No se reconocieron las columnas del Excel. Descarga la plantilla y usa sus encabezados.',
      { fileName: options.fileName ?? null },
    );
  }

  const missingColumns = options.required.filter((key) => header.map[key] === undefined);
  if (missingColumns.length > 0) {
    const labels = missingColumns.join(', ');
    throw ApiError.badRequest(`Faltan columnas obligatorias: ${labels}`, {
      missingColumns,
    });
  }

  const headers = header.cells.map((cell) => cell.text);
  const mappedColumns: Record<string, string> = {};
  for (const [key, column] of Object.entries(header.map)) {
    const headerCell = header.cells.find((cell) => cell.column === column);
    if (headerCell) mappedColumns[key] = headerCell.text;
  }

  const rows: SpreadsheetRow[] = [];
  const columnKeys = Object.keys(header.map);
  let totalRows = 0;
  let truncated = false;

  // Un archivo enorme no debe bloquear el proceso: se leen como máximo unas
  // pocas filas de margen y el resto se informa como truncado.
  const scanLimit = Math.min(sheet.rowCount, header.rowNumber + maxRows + 5_000);

  for (let rowNumber = header.rowNumber + 1; rowNumber <= scanLimit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    // Las columnas opcionales que el usuario omitió quedan en null, no en
    // undefined: así los servicios las tratan como "vacío" y no como el texto
    // literal "undefined".
    const values: Record<string, SpreadsheetValue> = {};
    for (const key of columnKeys) {
      values[key] = null;
    }
    let hasValue = false;

    for (const [key, column] of Object.entries(header.map)) {
      const value = cellValue(row.getCell(column));
      values[key] = value;
      if (value !== null && value !== '') hasValue = true;
    }

    if (!hasValue) continue;

    totalRows += 1;
    if (rows.length < maxRows) {
      rows.push({ rowNumber, values });
    }
  }

  if (sheet.rowCount > scanLimit || totalRows > maxRows) {
    truncated = true;
  }

  if (rows.length === 0) {
    throw ApiError.badRequest('El archivo no contiene filas de datos para importar');
  }

  return {
    sheetName: sheet.name,
    headerRow: header.rowNumber,
    headers,
    mappedColumns,
    missingColumns,
    rows,
    totalRows: Math.min(totalRows, maxRows + (truncated ? 1 : 0)),
    truncated,
    maxRows,
  };
};

/**
 * Convierte montos, años y kilómetros escritos por humanos.
 *
 * Acepta celdas numéricas y textos como `$1.234.567`, `1.234,56`, `12,5` o
 * `45 200`. Si el texto no contiene un número válido devuelve null; el servicio
 * que llama decide si eso es un error o un campo vacío.
 */
export const parseNumberValue = (value: SpreadsheetValue | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = value.trim();
  if (!text) return null;

  text = text
    .replace(/\s/g, '')
    .replace(/[^\d.,-]/g, '');

  if (!text || text === '-' || text === '.' || text === ',') return null;

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }
  text = text.replace(/-/g, '');

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const parts = text.split(',');
    const isThousands =
      parts.length > 2 ||
      (parts.length === 2 && parts[1]?.length === 3 && parts[0]?.length <= 3);
    text = isThousands ? text.replace(/,/g, '') : text.replace(/,/g, '.');
  } else if (lastDot !== -1) {
    const parts = text.split('.');
    const isThousands =
      parts.length > 2 ||
      (parts.length === 2 && parts[1]?.length === 3 && parts[0]?.length <= 3);
    if (isThousands) text = text.replace(/\./g, '');
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;

  return negative ? -parsed : parsed;
};

export const parseIntegerValue = (value: SpreadsheetValue | undefined): number | null => {
  const parsed = parseNumberValue(value);
  if (parsed === null) return null;
  return Number.isInteger(parsed) ? parsed : Math.trunc(parsed);
};

export const parseTextValue = (value: SpreadsheetValue | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

export const upperTextValue = (value: SpreadsheetValue | undefined): string | null => {
  const text = parseTextValue(value);
  return text === null ? null : text.toUpperCase();
};

export const normalizeKeyText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
