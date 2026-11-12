import { createFleetVehicleSchema, normalizeChilePatente } from '@unithor/shared';

import { FLEET_IMPORT_COLUMNS, aliasesOf } from './import-columns.js';
import {
  applyImportAccess,
  changesBetween,
  executePlannedImport,
  getImportAccess,
  hasCell,
  importCell,
  importContext,
  importRecordId,
} from './import-plan.service.js';
import {
  normalizeKeyText,
  parseNumberValue,
  parseTextValue,
  readSpreadsheet,
  upperTextValue,
} from './spreadsheet.service.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Vehicle } from '../../models/Vehicle.js';
import { ApiError } from '../../utils/ApiError.js';

import type { ImportAccess, ImportActor, ImportPlanRow } from './import-plan.service.js';
import type { SpreadsheetData, SpreadsheetRow } from './spreadsheet.service.js';
import type {
  CreateFleetVehicleInput,
  FleetVehicleStatus,
  ImportPreview,
  ImportResult,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

const TEXT_FIELDS = [
  'codigoInterno',
  'marca',
  'modelo',
  'color',
  'vinChasis',
  'motor',
  'combustible',
  'transmision',
  'sucursal',
  'responsable',
  'motivoBaja',
] as const;
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
const STATUS_ALIASES: Record<string, FleetVehicleStatus> = {
  disponible: 'disponible',
  disponibles: 'disponible',
  activo: 'disponible',
  activa: 'disponible',
  operativo: 'disponible',
  ok: 'disponible',
  'en mantencion': 'en_mantencion',
  en_mantencion: 'en_mantencion',
  mantencion: 'en_mantencion',
  mantenimiento: 'en_mantencion',
  'en taller': 'en_mantencion',
  'en reparacion': 'en_mantencion',
  'fuera de servicio': 'fuera_de_servicio',
  fuera_de_servicio: 'fuera_de_servicio',
  inactivo: 'fuera_de_servicio',
  inactiva: 'fuera_de_servicio',
  'no operativo': 'fuera_de_servicio',
  'en desuso': 'fuera_de_servicio',
  'dado de baja': 'dado_de_baja',
  dado_de_baja: 'dado_de_baja',
  baja: 'dado_de_baja',
  retirado: 'dado_de_baja',
};
const LABELS = Object.fromEntries(
  FLEET_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
);
const codeKey = (value: string): string => value.trim().toUpperCase();
const snapshotOf = (record: Vehicle | FleetVehicle): Record<string, unknown> =>
  JSON.parse(JSON.stringify(record.get({ plain: true }))) as Record<string, unknown>;

export const canAccessFleetOwner = (actorRole: string | undefined): boolean =>
  actorRole === 'admin' || actorRole === 'desarrollador';

const fleetPayload = (
  row: SpreadsheetRow,
  includePrivate: boolean,
  existing?: FleetVehicle,
): CreateFleetVehicleInput => {
  const rawStatus = parseTextValue(row.values.estadoOperativo);
  const estadoOperativo = rawStatus
    ? STATUS_ALIASES[normalizeKeyText(rawStatus)]
    : (existing?.estadoOperativo ?? 'disponible');
  if (!estadoOperativo)
    throw ApiError.badRequest(
      'Estado operativo no reconocido. Usa Disponible, En mantención, Fuera de servicio o Dado de baja.',
    );
  const payload: Record<string, unknown> = {
    patente: parseTextValue(row.values.patente) ?? existing?.patente ?? '',
    estadoOperativo,
  };
  for (const field of TEXT_FIELDS) {
    let value = hasCell(row.values[field])
      ? parseTextValue(row.values[field])
      : (existing?.[field] ?? null);
    if (hasCell(row.values[field]) && value) {
      if (field === 'codigoInterno') value = codeKey(value);
      if (field === 'combustible') value = FUEL_ALIASES[normalizeKeyText(value)] ?? value;
      if (field === 'transmision') value = TRANSMISSION_ALIASES[normalizeKeyText(value)] ?? value;
    }
    payload[field] = value;
  }
  if (includePrivate)
    payload.propietario = hasCell(row.values.propietario)
      ? parseTextValue(row.values.propietario)
      : (existing?.propietario ?? null);
  for (const field of ['ano', 'kilometraje'] as const) {
    const value = hasCell(row.values[field])
      ? parseNumberValue(row.values[field])
      : (existing?.[field] ?? null);
    if (hasCell(row.values[field]) && (value === null || !Number.isInteger(value)))
      throw ApiError.badRequest(`${LABELS[field]} debe ser un número entero válido.`);
    payload[field] = value;
  }
  // Preserve phase 1 semantics: a reason only belongs to a retired vehicle.
  if (estadoOperativo !== 'dado_de_baja') payload.motivoBaja = existing?.motivoBaja ?? null;
  const parsed = createFleetVehicleSchema.safeParse(payload);
  if (!parsed.success)
    throw ApiError.badRequest(parsed.error.issues.map((issue) => issue.message).join(' '));
  // A display separator must not turn an unchanged import into an update.
  if (existing && normalizeChilePatente(existing.patente) === normalizeChilePatente(parsed.data.patente)) {
    return { ...parsed.data, patente: existing.patente };
  }
  return parsed.data;
};

const prepareRows = async (
  sheet: SpreadsheetData,
  includePrivate: boolean,
  access: ImportAccess,
  transaction?: Transaction,
): Promise<ImportPlanRow[]> => {
  const options = { paranoid: false, transaction, lock: transaction?.LOCK.UPDATE };
  const workshop = await Vehicle.findAll({ ...options, order: [['id', 'ASC']] });
  const fleet = await FleetVehicle.findAll({
    ...options,
    ...(!includePrivate ? { attributes: { exclude: ['propietario'] } } : {}),
    order: [['id', 'ASC']],
  });
  const fileKeys = new Map<string, ImportPlanRow[]>();
  const register = (key: string, plan: ImportPlanRow) =>
    fileKeys.set(key, [...(fileKeys.get(key) ?? []), plan]);
  const plans = sheet.rows.map((row): ImportPlanRow => {
    const rawPlate = parseTextValue(row.values.patente);
    const code = upperTextValue(row.values.codigoInterno);
    const plates = rawPlate
      ? fleet.filter(
          (vehicle) => normalizeChilePatente(vehicle.patente) === normalizeChilePatente(rawPlate),
        )
      : [];
    const codes = code
      ? fleet.filter((vehicle) => vehicle.codigoInterno && codeKey(vehicle.codigoInterno) === code)
      : [];
    const snapshot: Record<string, unknown> = {
      access: { ...access },
      plates: plates.map(snapshotOf),
      codes: codes.map(snapshotOf),
    };
    const values = Object.fromEntries(
      Object.entries(row.values).filter(([field]) => includePrivate || field !== 'propietario'),
    );
    const plan: ImportPlanRow = {
      row: row.rowNumber,
      label: rawPlate ?? code ?? `Fila ${row.rowNumber}`,
      values,
      status: 'error',
      changes: [],
      messages: [],
      snapshot,
    };
    if (rawPlate) register(`plate:${normalizeChilePatente(rawPlate)}`, plan);
    if (code) register(`code:${code}`, plan);
    try {
      const id = importRecordId(row);
      if (id) register(`id:${id}`, plan);
      const existing = id ? fleet.find((vehicle) => vehicle.id === id) : (plates[0] ?? codes[0]);
      if (existing) {
        plan.existingId = existing.id;
        snapshot.vehicle = snapshotOf(existing);
        register(`target:${existing.id}`, plan);
      }
      if (id && !existing) throw ApiError.conflict('El ID no existe en vehículos de flota.');
      if (existing?.deletedAt || [...plates, ...codes].some((vehicle) => vehicle.deletedAt))
        throw ApiError.conflict(
          'El vehículo está eliminado. La importación no restaura registros.',
        );
      if (
        plates.length > 1 ||
        codes.length > 1 ||
        [...plates, ...codes].some((vehicle) => vehicle.id !== existing?.id)
      )
        throw ApiError.conflict(
          'El ID, la patente o el código interno apuntan a distintos vehículos.',
        );
      const effectivePlate = rawPlate ?? existing?.patente;
      const workshopMatches = effectivePlate
        ? workshop.filter(
            (vehicle) =>
              normalizeChilePatente(vehicle.patente) === normalizeChilePatente(effectivePlate),
          )
        : [];
      snapshot.workshop = workshopMatches.map(snapshotOf);
      if (workshopMatches.length)
        throw ApiError.conflict('La patente ya pertenece a un vehículo de taller.');
      const data = fleetPayload(row, includePrivate, existing);
      if (existing?.estadoOperativo === 'dado_de_baja' && data.estadoOperativo !== 'dado_de_baja')
        throw ApiError.conflict('La importación no puede reactivar un vehículo dado de baja.');
      const payload: Record<string, unknown> = existing
        ? Object.fromEntries(Object.entries(data).filter(([field]) => hasCell(row.values[field])))
        : { ...data };
      plan.changes = changesBetween(existing ? snapshotOf(existing) : {}, payload, LABELS).filter(
        (change) => includePrivate || change.field !== 'propietario',
      );
      plan.values = {
        ...(id ? { id } : {}),
        ...Object.fromEntries(
          Object.entries(data)
            .filter(([field]) => includePrivate || field !== 'propietario')
            .map(([field, value]) => [field, importCell(value)]),
        ),
      };
      plan.label = [data.patente, data.codigoInterno].filter(Boolean).join(' · ');
      plan.status = existing ? (plan.changes.length ? 'update' : 'unchanged') : 'valid';
      plan.apply = async (savepoint) => {
        const retirement =
          data.estadoOperativo === 'dado_de_baja' && existing?.estadoOperativo !== 'dado_de_baja';
        if (existing)
          await existing.update(
            { ...payload, ...(retirement ? { fechaBaja: new Date() } : {}) },
            { transaction: savepoint },
          );
        else
          await FleetVehicle.create(
            {
              ...data,
              estadoOperativo: data.estadoOperativo ?? 'disponible',
              fechaBaja: retirement ? new Date() : null,
            },
            { transaction: savepoint },
          );
      };
    } catch (error) {
      plan.status = error instanceof ApiError && error.statusCode === 409 ? 'conflict' : 'error';
      plan.messages.push(
        error instanceof ApiError ? error.message : 'No fue posible preparar esta fila.',
      );
      plan.apply = undefined;
    }
    return plan;
  });
  for (const group of fileKeys.values()) {
    if (group.length < 2) continue;
    for (const plan of group) {
      plan.status = 'conflict';
      plan.apply = undefined;
      const message =
        'El archivo repite un ID, una patente, un código interno o el mismo vehículo de destino.';
      if (!plan.messages.includes(message)) plan.messages.push(message);
    }
  }
  return plans.map((plan) => applyImportAccess(plan, access));
};

export const importFleetVehicles = async (
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
  actor?: ImportActor,
): Promise<ImportResult> => {
  const context = importContext(actor);
  const sheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(FLEET_IMPORT_COLUMNS),
    required: [],
    fileName,
  });
  const includePrivate = canAccessFleetOwner(context.role);
  // This must run before permission/record reads or opening a transaction.
  if (!includePrivate && sheet.rows.some((row) => hasCell(row.values.propietario)))
    throw ApiError.forbidden(
      'Solo admin y desarrollador pueden importar el propietario privado de flota.',
    );
  if (!sheet.mappedColumns.id && !sheet.mappedColumns.patente && !sheet.mappedColumns.codigoInterno)
    throw ApiError.badRequest('Incluye la columna ID, Patente o Código interno.');
  return executePlannedImport(
    'fleet-vehicles',
    buffer,
    fileName,
    dryRun,
    sheet,
    context,
    async (transaction) =>
      prepareRows(
        sheet,
        includePrivate,
        await getImportAccess('fleet-vehicles', context),
        transaction,
      ),
    includePrivate ? [] : ['propietario'],
  );
};

export const previewFleetImport = async (
  buffer: Buffer,
  fileName: string,
  actor?: ImportActor,
): Promise<ImportPreview> => importFleetVehicles(buffer, fileName, true, actor);
