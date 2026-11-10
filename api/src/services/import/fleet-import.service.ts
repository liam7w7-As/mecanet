import { createFleetVehicleSchema, normalizeChilePatente } from '@unithor/shared';
import { UniqueConstraintError } from 'sequelize';

import { sequelize } from '../../config/database.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Vehicle } from '../../models/Vehicle.js';
import { FLEET_IMPORT_COLUMNS, aliasesOf } from './import-columns.js';
import {
  normalizeKeyText,
  parseIntegerValue,
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

type FleetStatus = 'disponible' | 'en_mantencion' | 'fuera_de_servicio';

interface FleetRowData {
  patente: string;
  codigoInterno?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  color?: string | null;
  vinChasis?: string | null;
  motor?: string | null;
  kilometraje?: number | null;
  combustible?: string | null;
  transmision?: string | null;
  estadoOperativo: FleetStatus;
  sucursal?: string | null;
  responsable?: string | null;
}

interface ParsedFleetRow {
  row: number;
  label: string;
  values: Record<string, SpreadsheetValue>;
  data: FleetRowData | null;
  messages: string[];
  duplicate: boolean;
}

const PREVIEW_ROW_LIMIT = 200;
const CURRENT_YEAR = new Date().getFullYear();

const FUEL_ALIASES: Record<string, string> = {
  bencina: 'bencina',
  gasolina: 'bencina',
  diesel: 'diesel',
  'diesel oil': 'diesel',
  hibrido: 'hibrido',
  electrico: 'electrico',
  gas: 'gas',
  glp: 'gas',
  gnv: 'gas',
};

const TRANSMISSION_ALIASES: Record<string, string> = {
  manual: 'manual',
  automatica: 'automatica',
  automatico: 'automatica',
  cvt: 'cvt',
};

const STATUS_ALIASES: Record<string, FleetStatus> = {
  disponible: 'disponible',
  disponibles: 'disponible',
  activo: 'disponible',
  activa: 'disponible',
  operativo: 'disponible',
  ok: 'disponible',
  'en mantencion': 'en_mantencion',
  mantencion: 'en_mantencion',
  mantenimiento: 'en_mantencion',
  'en taller': 'en_mantencion',
  'en reparacion': 'en_mantencion',
  'fuera de servicio': 'fuera_de_servicio',
  inactivo: 'fuera_de_servicio',
  inactiva: 'fuera_de_servicio',
  'no operativo': 'fuera_de_servicio',
  'dado de baja': 'fuera_de_servicio',
  'en desuso': 'fuera_de_servicio',
};

const addMessage = (messages: Set<string>, message: string): void => {
  messages.add(message);
};

const normalizeFuel = (value: string | null): string | null => {
  if (!value) return null;
  return FUEL_ALIASES[normalizeKeyText(value)] ?? value;
};

const normalizeTransmission = (value: string | null): string | null => {
  if (!value) return null;
  return TRANSMISSION_ALIASES[normalizeKeyText(value)] ?? value;
};

const normalizeStatus = (value: string | null): FleetStatus | null => {
  if (!value) return 'disponible';
  return STATUS_ALIASES[normalizeKeyText(value)] ?? null;
};

const parseRow = (row: SpreadsheetRow): ParsedFleetRow => {
  const messages = new Set<string>();
  const rawPatente = parseTextValue(row.values.patente);
  const patente = rawPatente ? normalizeChilePatente(rawPatente) : null;

  if (!rawPatente) {
    addMessage(messages, 'La patente es obligatoria.');
  }

  const rawEstado = parseTextValue(row.values.estadoOperativo);
  const estadoOperativo = normalizeStatus(rawEstado);
  if (!estadoOperativo) {
    addMessage(
      messages,
      `Estado operativo no reconocido: "${rawEstado}". Usa Disponible, En mantención o Fuera de servicio.`,
    );
  }

  const rawAno = row.values.ano ?? null;
  const ano = parseIntegerValue(rawAno);
  if (rawAno !== null && String(rawAno).trim() !== '' && ano === null) {
    addMessage(messages, 'El año no es un número válido.');
  } else if (ano !== null && (ano < 1950 || ano > CURRENT_YEAR + 1)) {
    addMessage(messages, `El año debe estar entre 1950 y ${CURRENT_YEAR + 1}.`);
  }

  const rawKilometraje = row.values.kilometraje ?? null;
  const kilometraje = parseIntegerValue(rawKilometraje);
  if (
    rawKilometraje !== null &&
    String(rawKilometraje).trim() !== '' &&
    (kilometraje === null || kilometraje < 0)
  ) {
    addMessage(messages, 'El kilometraje debe ser un número entero mayor o igual a 0.');
  }

  const payload = {
    patente: patente ?? '',
    codigoInterno: upperTextValue(row.values.codigoInterno),
    marca: parseTextValue(row.values.marca),
    modelo: parseTextValue(row.values.modelo),
    ano,
    color: parseTextValue(row.values.color),
    vinChasis: parseTextValue(row.values.vinChasis),
    motor: parseTextValue(row.values.motor),
    kilometraje,
    combustible: normalizeFuel(parseTextValue(row.values.combustible)),
    transmision: normalizeTransmission(parseTextValue(row.values.transmision)),
    estadoOperativo: estadoOperativo ?? 'disponible',
    sucursal: parseTextValue(row.values.sucursal),
    responsable: parseTextValue(row.values.responsable),
  };

  const parsed = createFleetVehicleSchema.safeParse(payload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      addMessage(messages, issue.message);
    }
  }

  const label =
    [patente, payload.codigoInterno, [payload.marca, payload.modelo].filter(Boolean).join(' ')]
      .filter((value): value is string => Boolean(value))
      .join(' · ') || `Fila ${row.rowNumber}`;

  return {
    row: row.rowNumber,
    label,
    values: {
      patente,
      codigoInterno: payload.codigoInterno,
      marca: payload.marca,
      modelo: payload.modelo,
      estadoOperativo,
      sucursal: payload.sucursal,
    },
    data: messages.size === 0 && parsed.success ? (parsed.data as FleetRowData) : null,
    messages: [...messages],
    duplicate: false,
  };
};

const loadExistingKeys = async (
  transaction?: Transaction,
): Promise<{ patentes: Set<string>; codigos: Set<string>; workshopPatentes: Set<string> }> => {
  const [fleetVehicles, workshopVehicles] = await Promise.all([
    FleetVehicle.findAll({
      attributes: ['patente', 'codigoInterno'],
      paranoid: false,
      transaction,
    }),
    Vehicle.findAll({ attributes: ['patente'], paranoid: false, transaction }),
  ]);

  return {
    patentes: new Set(fleetVehicles.map((vehicle) => vehicle.patente.toUpperCase())),
    codigos: new Set(
      fleetVehicles
        .map((vehicle) => vehicle.codigoInterno)
        .filter((code): code is string => Boolean(code))
        .map((code) => code.toUpperCase()),
    ),
    workshopPatentes: new Set(workshopVehicles.map((vehicle) => vehicle.patente.toUpperCase())),
  };
};

const prepareRows = async (
  spreadsheet: SpreadsheetData,
  transaction?: Transaction,
): Promise<ParsedFleetRow[]> => {
  const existing = await loadExistingKeys(transaction);
  const seenPatentes = new Set<string>();
  const seenCodigos = new Set<string>();

  return spreadsheet.rows.map((row) => {
    const parsed = parseRow(row);
    if (!parsed.data) return parsed;

    const patente = parsed.data.patente.toUpperCase();
    const codigo = parsed.data.codigoInterno?.toUpperCase() ?? null;

    if (existing.workshopPatentes.has(patente)) {
      parsed.duplicate = true;
      parsed.messages = ['Ya existe un vehículo de taller con esa patente; se omitirá.'];
    } else if (existing.patentes.has(patente) || seenPatentes.has(patente)) {
      parsed.duplicate = true;
      parsed.messages = ['Ya existe un vehículo de flota con esa patente; se omitirá.'];
    } else if (codigo && (existing.codigos.has(codigo) || seenCodigos.has(codigo))) {
      parsed.duplicate = true;
      parsed.messages = ['Ya existe un vehículo de flota con ese código interno; se omitirá.'];
    } else {
      seenPatentes.add(patente);
      if (codigo) seenCodigos.add(codigo);
    }

    return parsed;
  });
};

const toPreviewRow = (parsed: ParsedFleetRow, status: ImportRowStatus): ImportRowPreview => ({
  row: parsed.row,
  status,
  label: parsed.label,
  values: parsed.values,
  messages: parsed.messages,
});

const statusOf = (parsed: ParsedFleetRow): ImportRowStatus => {
  if (parsed.messages.length > 0 && !parsed.duplicate) return 'error';
  if (parsed.duplicate) return 'duplicate';
  return 'valid';
};

const buildPreview = (
  fileName: string,
  spreadsheet: SpreadsheetData,
  parsedRows: ParsedFleetRow[],
): ImportPreview => {
  const rows = parsedRows.map((parsed) => toPreviewRow(parsed, statusOf(parsed)));

  return {
    module: 'fleet-vehicles',
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
    return 'Ya existe un vehículo de flota con esa patente o código interno.';
  }
  return error instanceof Error ? error.message : 'No fue posible crear el vehículo de flota.';
};

export const previewFleetImport = async (
  buffer: Buffer,
  fileName: string,
): Promise<ImportPreview> => {
  const spreadsheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(FLEET_IMPORT_COLUMNS),
    required: ['patente'],
    fileName,
  });

  const parsedRows = await prepareRows(spreadsheet);
  return buildPreview(fileName, spreadsheet, parsedRows);
};

export const importFleetVehicles = async (
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
): Promise<ImportResult> => {
  if (dryRun) {
    const preview = await previewFleetImport(buffer, fileName);
    return {
      ...preview,
      created: 0,
      skipped: preview.duplicateRows,
      failed: preview.errorRows,
      clientsCreated: 0,
    };
  }

  const spreadsheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(FLEET_IMPORT_COLUMNS),
    required: ['patente'],
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
        await FleetVehicle.create({ ...parsed.data }, { transaction });
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
