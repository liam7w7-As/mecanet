import { createCatalogItemSchema } from '@unithor/shared';
import { UniqueConstraintError } from 'sequelize';

import { sequelize } from '../../config/database.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { CATALOG_IMPORT_COLUMNS, aliasesOf } from './import-columns.js';
import {
  normalizeKeyText,
  parseIntegerValue,
  parseNumberValue,
  parseTextValue,
  readSpreadsheet,
  upperTextValue,
} from './spreadsheet.service.js';

import type {
  ImportPreview,
  ImportResult,
  ImportRowPreview,
  ImportRowStatus,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';
import type { SpreadsheetData, SpreadsheetRow, SpreadsheetValue } from './spreadsheet.service.js';

interface CatalogRowData {
  tipo: 'parte' | 'estandar' | 'especifico';
  codigo?: string | null;
  nombre: string;
  descripcion?: string | null;
  unidadMedida: 'unidad' | 'litro' | 'mililitro' | 'kilogramo' | 'juego' | 'servicio';
  precio: number;
  stock: number;
  stockMinimo: number;
  horasHombreEstandar?: number | null;
}

interface ParsedCatalogRow {
  row: number;
  label: string;
  values: Record<string, SpreadsheetValue>;
  data: CatalogRowData | null;
  messages: string[];
  duplicate: boolean;
}

const PREVIEW_ROW_LIMIT = 200;

const TIPO_LABELS: Record<string, CatalogRowData['tipo']> = {
  parte: 'parte',
  repuesto: 'parte',
  repuestos: 'parte',
  pieza: 'parte',
  piezas: 'parte',
  insumo: 'parte',
  material: 'parte',
  producto: 'parte',
  estandar: 'estandar',
  'servicio estandar': 'estandar',
  servicio: 'estandar',
  'mano de obra': 'estandar',
  especifico: 'especifico',
  'servicio especifico': 'especifico',
  trabajo: 'especifico',
  'trabajo especifico': 'especifico',
  mantencion: 'especifico',
};

const UNIDAD_LABELS: Record<string, CatalogRowData['unidadMedida']> = {
  unidad: 'unidad',
  unidades: 'unidad',
  un: 'unidad',
  u: 'unidad',
  litro: 'litro',
  litros: 'litro',
  lt: 'litro',
  l: 'litro',
  mililitro: 'mililitro',
  mililitros: 'mililitro',
  ml: 'mililitro',
  kilogramo: 'kilogramo',
  kilogramos: 'kilogramo',
  kilo: 'kilogramo',
  kilos: 'kilogramo',
  kg: 'kilogramo',
  juego: 'juego',
  juegos: 'juego',
  set: 'juego',
  servicio: 'servicio',
  servicios: 'servicio',
};

const normalizeType = (value: string | null): CatalogRowData['tipo'] | null => {
  if (!value) return null;
  return TIPO_LABELS[normalizeKeyText(value)] ?? null;
};

const normalizeUnit = (value: string | null): CatalogRowData['unidadMedida'] | null => {
  if (!value) return 'unidad';
  return UNIDAD_LABELS[normalizeKeyText(value)] ?? null;
};

const addMessage = (messages: Set<string>, message: string): void => {
  messages.add(message);
};

const parseRow = (row: SpreadsheetRow): ParsedCatalogRow => {
  const messages = new Set<string>();

  const rawTipo = parseTextValue(row.values.tipo);
  const rawCodigo = upperTextValue(row.values.codigo);
  const rawNombre = parseTextValue(row.values.nombre);
  const rawDescripcion = parseTextValue(row.values.descripcion);
  const rawUnidad = parseTextValue(row.values.unidadMedida);
  const rawPrecio = row.values.precio ?? null;
  const rawStock = row.values.stock ?? null;
  const rawStockMinimo = row.values.stockMinimo ?? null;
  const rawHoras = row.values.horasHombreEstandar ?? null;

  const tipo = normalizeType(rawTipo) ?? (rawCodigo ? 'parte' : 'estandar');
  if (rawTipo && !normalizeType(rawTipo)) {
    addMessage(
      messages,
      `Tipo no reconocido: "${rawTipo}". Usa Repuesto, Servicio estándar o Servicio específico.`,
    );
  }

  if (!rawNombre) {
    addMessage(messages, 'El nombre es obligatorio.');
  }

  const unidadMedida = normalizeUnit(rawUnidad);
  if (!unidadMedida) {
    addMessage(messages, `Unidad de medida no reconocida: "${rawUnidad}".`);
  }

  const precio = parseNumberValue(rawPrecio);
  if (rawPrecio !== null && String(rawPrecio).trim() !== '' && precio === null) {
    addMessage(messages, 'El precio no es un número válido.');
  }

  const stock = parseIntegerValue(rawStock);
  if (rawStock !== null && String(rawStock).trim() !== '' && stock === null) {
    addMessage(messages, 'El stock debe ser un número entero.');
  }

  const stockMinimo = parseIntegerValue(rawStockMinimo);
  if (rawStockMinimo !== null && String(rawStockMinimo).trim() !== '' && stockMinimo === null) {
    addMessage(messages, 'El stock mínimo debe ser un número entero.');
  }

  const horasHombreEstandar = parseNumberValue(rawHoras);
  if (rawHoras !== null && String(rawHoras).trim() !== '' && horasHombreEstandar === null) {
    addMessage(messages, 'Las horas hombre deben ser un número válido.');
  }

  const payload = {
    tipo,
    codigo: rawCodigo,
    nombre: rawNombre ?? '',
    descripcion: rawDescripcion,
    unidadMedida: unidadMedida ?? 'unidad',
    precio: precio ?? 0,
    stock: tipo === 'parte' ? (stock ?? 0) : 0,
    stockMinimo: tipo === 'parte' ? (stockMinimo ?? 0) : 0,
    horasHombreEstandar: tipo === 'parte' ? null : horasHombreEstandar,
  };

  const parsed = createCatalogItemSchema.safeParse(payload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      addMessage(messages, field ? `${field}: ${issue.message}` : issue.message);
    }
  }

  const label =
    [rawCodigo, rawNombre].filter((value): value is string => Boolean(value)).join(' · ') ||
    `Fila ${row.rowNumber}`;

  return {
    row: row.rowNumber,
    label,
    values: {
      codigo: rawCodigo,
      nombre: rawNombre,
      tipo,
      unidadMedida: unidadMedida ?? rawUnidad,
      precio: precio ?? rawPrecio,
      stock: stock ?? rawStock,
      stockMinimo: stockMinimo ?? rawStockMinimo,
      horasHombreEstandar,
    },
    data: messages.size === 0 && parsed.success ? parsed.data : null,
    messages: [...messages],
    duplicate: false,
  };
};

const loadExistingKeys = async (
  transaction?: Transaction,
): Promise<{ codes: Set<string>; names: Set<string> }> => {
  const items = await CatalogItem.findAll({
    attributes: ['codigo', 'nombre'],
    paranoid: false,
    transaction,
  });

  return {
    codes: new Set(
      items
        .map((item) => item.codigo)
        .filter((code): code is string => Boolean(code))
        .map((code) => code.toUpperCase()),
    ),
    names: new Set(items.map((item) => normalizeKeyText(item.nombre))),
  };
};

const prepareRows = async (
  spreadsheet: SpreadsheetData,
  transaction?: Transaction,
): Promise<ParsedCatalogRow[]> => {
  const existing = await loadExistingKeys(transaction);
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();

  return spreadsheet.rows.map((row) => {
    const parsed = parseRow(row);
    if (!parsed.data) return parsed;

    const code = parsed.data.codigo;
    const name = normalizeKeyText(parsed.data.nombre);

    if (code) {
      if (existing.codes.has(code) || seenCodes.has(code)) {
        parsed.duplicate = true;
        parsed.messages = ['Ya existe un registro con ese código; se omitirá.'];
      } else {
        seenCodes.add(code);
      }
    } else if (existing.names.has(name) || seenNames.has(name)) {
      parsed.duplicate = true;
      parsed.messages = ['Ya existe un registro con ese nombre; se omitirá.'];
    }

    if (!parsed.duplicate) {
      seenNames.add(name);
    }

    return parsed;
  });
};

const toPreviewRow = (
  parsed: ParsedCatalogRow,
  status: ImportRowStatus,
): ImportRowPreview => ({
  row: parsed.row,
  status,
  label: parsed.label,
  values: parsed.values,
  messages: parsed.messages,
});

const statusOf = (parsed: ParsedCatalogRow): ImportRowStatus => {
  if (parsed.messages.length > 0 && !parsed.duplicate) return 'error';
  if (parsed.duplicate) return 'duplicate';
  return 'valid';
};

const buildPreview = (
  fileName: string,
  spreadsheet: SpreadsheetData,
  parsedRows: ParsedCatalogRow[],
): ImportPreview => {
  const rows = parsedRows.map((parsed) => toPreviewRow(parsed, statusOf(parsed)));

  return {
    module: 'catalog',
    fileName,
    sheetName: spreadsheet.sheetName,
    headerRow: spreadsheet.headerRow,
    headers: spreadsheet.headers,
    mappedColumns: spreadsheet.mappedColumns,
    missingColumns: spreadsheet.missingColumns,
    totalRows: spreadsheet.totalRows,
    validRows: rows.filter((row) => row.status === 'valid').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
    errorRows: rows.filter((row) => row.status === 'error').length,
    rows: rows.slice(0, PREVIEW_ROW_LIMIT),
    truncated: spreadsheet.truncated,
    maxRows: spreadsheet.maxRows,
  };
};

const describeError = (error: unknown): string => {
  if (error instanceof UniqueConstraintError) {
    return 'Ya existe un registro con ese código o nombre.';
  }
  return error instanceof Error ? error.message : 'No fue posible crear el registro.';
};

export const previewCatalogImport = async (
  buffer: Buffer,
  fileName: string,
): Promise<ImportPreview> => {
  const spreadsheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(CATALOG_IMPORT_COLUMNS),
    required: ['nombre'],
    fileName,
  });

  const parsedRows = await prepareRows(spreadsheet);
  return buildPreview(fileName, spreadsheet, parsedRows);
};

export const importCatalog = async (
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
): Promise<ImportResult> => {
  if (dryRun) {
    const preview = await previewCatalogImport(buffer, fileName);
    return {
      ...preview,
      created: 0,
      skipped: preview.duplicateRows,
      failed: preview.errorRows,
      clientsCreated: 0,
    };
  }

  const spreadsheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(CATALOG_IMPORT_COLUMNS),
    required: ['nombre'],
    fileName,
  });

  return sequelize.transaction(async (transaction) => {
    const parsedRows = await prepareRows(spreadsheet, transaction);
    const resultRows: ImportRowPreview[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const parsed of parsedRows) {
      if (!parsed.data) {
        failed += 1;
        resultRows.push(toPreviewRow(parsed, 'error'));
        continue;
      }

      if (parsed.duplicate) {
        skipped += 1;
        resultRows.push(toPreviewRow(parsed, 'duplicate'));
        continue;
      }

      if (parsed.messages.length > 0) {
        failed += 1;
        resultRows.push(toPreviewRow(parsed, 'error'));
        continue;
      }

      try {
        await CatalogItem.create({ ...parsed.data }, { transaction });
        created += 1;
        resultRows.push(toPreviewRow(parsed, 'created'));
      } catch (error) {
        failed += 1;
        resultRows.push({
          ...toPreviewRow(parsed, 'error'),
          messages: [...parsed.messages, describeError(error)],
        });
      }
    }

    return {
      ...buildPreview(fileName, spreadsheet, parsedRows),
      rows: resultRows.slice(0, PREVIEW_ROW_LIMIT),
      validRows: created,
      duplicateRows: skipped,
      errorRows: failed,
      created,
      skipped,
      failed,
      clientsCreated: 0,
    };
  });
};
