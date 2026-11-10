import { createClientSchema, createVehicleSchema, normalizeChilePatente } from '@unithor/shared';
import { UniqueConstraintError } from 'sequelize';

import { sequelize } from '../../config/database.js';
import { Client } from '../../models/Client.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Vehicle } from '../../models/Vehicle.js';
import { VEHICLE_IMPORT_COLUMNS, aliasesOf } from './import-columns.js';
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

type ClientType = 'cliente' | 'empresa';

interface OwnerData {
  nombre: string;
  rut: string | null;
  telefono: string | null;
  email: string | null;
  tipo: ClientType;
}

interface VehicleRowData {
  patente: string;
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  color?: string | null;
  vinChasis?: string | null;
  motor?: string | null;
  kilometraje?: number | null;
  combustible?: string | null;
  transmision?: string | null;
  owner: OwnerData | null;
}

interface ParsedVehicleRow {
  row: number;
  label: string;
  values: Record<string, SpreadsheetValue>;
  data: VehicleRowData | null;
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
  'electrico hibrido': 'hibrido',
  gas: 'gas',
  glp: 'gas',
  gnv: 'gas',
};

const TRANSMISSION_ALIASES: Record<string, string> = {
  manual: 'manual',
  automatica: 'automatica',
  automatico: 'automatica',
  cvt: 'cvt',
  'sin especificar': '',
};

const EMPRESA_PATTERN =
  /S\.?\s?A\.?|SPA\b|LTDA|E\.?I\.?R\.?L|FUNDACI[OÓ]N|ASOC|SOC\.|CORP|HOLDING|MINER[AO]S|COLEGIO|TRANSPORTES|MUNICIPAL|GOBIERNO/i;

const addMessage = (messages: Set<string>, message: string): void => {
  messages.add(message);
};

const normalizeFuel = (value: string | null): string | null => {
  if (!value) return null;
  return FUEL_ALIASES[normalizeKeyText(value)] ?? value;
};

const normalizeTransmission = (value: string | null): string | null => {
  if (!value) return null;
  const normalized = TRANSMISSION_ALIASES[normalizeKeyText(value)];
  if (normalized === undefined) return value;
  return normalized === '' ? null : normalized;
};

const parseOwner = (row: SpreadsheetRow, messages: Set<string>): OwnerData | null => {
  const nombre = parseTextValue(row.values.propietario);
  const rut = upperTextValue(row.values.rutPropietario);
  const telefono = parseTextValue(row.values.telefonoPropietario);
  const email = parseTextValue(row.values.emailPropietario);

  if (!nombre && !rut && !telefono && !email) return null;

  if (!nombre) {
    addMessage(
      messages,
      'El propietario requiere un nombre. Agrega la columna Propietario o deja sus datos vacíos.',
    );
    return null;
  }

  const tipo: ClientType = EMPRESA_PATTERN.test(nombre) ? 'empresa' : 'cliente';
  const parsed = createClientSchema.safeParse({ nombre, rut, telefono, email, tipo });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      addMessage(messages, `Propietario: ${issue.message}`);
    }
    return null;
  }

  return {
    nombre: parsed.data.nombre,
    rut: parsed.data.rut ?? null,
    telefono: parsed.data.telefono ?? null,
    email: parsed.data.email ?? null,
    tipo: parsed.data.tipo,
  };
};

const parseRow = (row: SpreadsheetRow): ParsedVehicleRow => {
  const messages = new Set<string>();
  const rawPatente = parseTextValue(row.values.patente);
  const patente = rawPatente ? normalizeChilePatente(rawPatente) : null;

  if (!rawPatente) {
    addMessage(messages, 'La patente es obligatoria.');
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

  const owner = parseOwner(row, messages);

  const payload = {
    patente: patente ?? '',
    marca: parseTextValue(row.values.marca),
    modelo: parseTextValue(row.values.modelo),
    ano,
    color: parseTextValue(row.values.color),
    vinChasis: parseTextValue(row.values.vinChasis),
    motor: parseTextValue(row.values.motor),
    kilometraje,
    combustible: normalizeFuel(parseTextValue(row.values.combustible)),
    transmision: normalizeTransmission(parseTextValue(row.values.transmision)),
  };

  const parsed = createVehicleSchema.safeParse(payload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      addMessage(messages, issue.message);
    }
  }

  const label =
    [patente, [payload.marca, payload.modelo].filter(Boolean).join(' ')]
      .filter((value): value is string => Boolean(value))
      .join(' · ') || `Fila ${row.rowNumber}`;

  return {
    row: row.rowNumber,
    label,
    values: {
      patente,
      marca: payload.marca,
      modelo: payload.modelo,
      ano,
      kilometraje,
      propietario: owner?.nombre ?? null,
    },
    data:
      messages.size === 0 && parsed.success
        ? {
            ...parsed.data,
            owner,
          }
        : null,
    messages: [...messages],
    duplicate: false,
  };
};

const loadExistingPatentes = async (
  transaction?: Transaction,
): Promise<{ workshop: Set<string>; fleet: Set<string> }> => {
  const [vehicles, fleetVehicles] = await Promise.all([
    Vehicle.findAll({ attributes: ['patente'], paranoid: false, transaction }),
    FleetVehicle.findAll({ attributes: ['patente'], paranoid: false, transaction }),
  ]);

  return {
    workshop: new Set(vehicles.map((vehicle) => vehicle.patente.toUpperCase())),
    fleet: new Set(fleetVehicles.map((vehicle) => vehicle.patente.toUpperCase())),
  };
};

const prepareRows = async (
  spreadsheet: SpreadsheetData,
  transaction?: Transaction,
): Promise<ParsedVehicleRow[]> => {
  const existing = await loadExistingPatentes(transaction);
  const seen = new Set<string>();

  return spreadsheet.rows.map((row) => {
    const parsed = parseRow(row);
    if (!parsed.data) return parsed;

    const patente = parsed.data.patente.toUpperCase();

    if (existing.fleet.has(patente)) {
      parsed.duplicate = true;
      parsed.messages = ['Ya existe un vehículo de flota con esa patente; se omitirá.'];
    } else if (existing.workshop.has(patente) || seen.has(patente)) {
      parsed.duplicate = true;
      parsed.messages = ['Ya existe un vehículo con esa patente; se omitirá.'];
    } else {
      seen.add(patente);
    }

    return parsed;
  });
};

const toPreviewRow = (
  parsed: ParsedVehicleRow,
  status: ImportRowStatus,
): ImportRowPreview => ({
  row: parsed.row,
  status,
  label: parsed.label,
  values: parsed.values,
  messages: parsed.messages,
});

const statusOf = (parsed: ParsedVehicleRow): ImportRowStatus => {
  if (parsed.messages.length > 0 && !parsed.duplicate) return 'error';
  if (parsed.duplicate) return 'duplicate';
  return 'valid';
};

const buildPreview = (
  fileName: string,
  spreadsheet: SpreadsheetData,
  parsedRows: ParsedVehicleRow[],
): ImportPreview => {
  const rows = parsedRows.map((parsed) => toPreviewRow(parsed, statusOf(parsed)));

  return {
    module: 'vehicles',
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
    return 'Ya existe un vehículo con esa patente.';
  }
  return error instanceof Error ? error.message : 'No fue posible crear el vehículo.';
};

const resolveClient = async (
  owner: OwnerData,
  transaction: Transaction,
  cache: Map<string, number>,
  counters: { created: number },
): Promise<number> => {
  const rutKey = owner.rut ? `rut:${owner.rut}` : null;
  const nameKey = `name:${normalizeKeyText(owner.nombre)}`;

  const cached = (rutKey ? cache.get(rutKey) : undefined) ?? cache.get(nameKey);
  if (cached !== undefined) return cached;

  const existing = await Client.findOne({
    where: owner.rut ? { rut: owner.rut } : { nombre: owner.nombre },
    paranoid: false,
    transaction,
  });

  if (existing) {
    if (existing.deletedAt) {
      await existing.restore({ transaction });
    }
    if (rutKey) cache.set(rutKey, existing.id);
    cache.set(nameKey, existing.id);
    return existing.id;
  }

  const created = await Client.create(
    {
      nombre: owner.nombre,
      rut: owner.rut,
      telefono: owner.telefono,
      email: owner.email,
      tipo: owner.tipo,
    },
    { transaction },
  );

  counters.created += 1;
  if (rutKey) cache.set(rutKey, created.id);
  cache.set(nameKey, created.id);
  return created.id;
};

export const previewVehicleImport = async (
  buffer: Buffer,
  fileName: string,
): Promise<ImportPreview> => {
  const spreadsheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(VEHICLE_IMPORT_COLUMNS),
    required: ['patente'],
    fileName,
  });

  const parsedRows = await prepareRows(spreadsheet);
  return buildPreview(fileName, spreadsheet, parsedRows);
};

export const importVehicles = async (
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
): Promise<ImportResult> => {
  if (dryRun) {
    const preview = await previewVehicleImport(buffer, fileName);
    return {
      ...preview,
      created: 0,
      skipped: preview.duplicateRows,
      failed: preview.errorRows,
      clientsCreated: 0,
    };
  }

  const spreadsheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(VEHICLE_IMPORT_COLUMNS),
    required: ['patente'],
    fileName,
  });

  return sequelize.transaction(async (transaction) => {
    const parsedRows = await prepareRows(spreadsheet, transaction);
    const resultRows: ImportRowPreview[] = [];
    const clientCache = new Map<string, number>();
    const counters = { created: 0 };
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
        const clientId = parsed.data.owner
          ? await resolveClient(parsed.data.owner, transaction, clientCache, counters)
          : null;

        const { owner: _owner, ...vehicleData } = parsed.data;
        await Vehicle.create({ ...vehicleData, clientId }, { transaction });
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
      clientsCreated: counters.created,
    };
  });
};
