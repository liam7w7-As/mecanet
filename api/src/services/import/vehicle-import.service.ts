import {
  createClientSchema,
  createVehicleSchema,
  isValidChilePatente,
  normalizeChilePatente,
  normalizeRut,
  rutSchema,
} from '@unithor/shared';

import { VEHICLE_IMPORT_COLUMNS, aliasesOf } from './import-columns.js';
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
} from './spreadsheet.service.js';
import { Client } from '../../models/Client.js';
import { FleetVehicle } from '../../models/FleetVehicle.js';
import { Vehicle } from '../../models/Vehicle.js';
import { ApiError } from '../../utils/ApiError.js';

import type { ImportAccess, ImportActor, ImportPlanRow } from './import-plan.service.js';
import type { SpreadsheetData, SpreadsheetRow } from './spreadsheet.service.js';
import type {
  CreateClientInput,
  CreateVehicleInput,
  ImportPreview,
  ImportResult,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

const TEXT_FIELDS = [
  'marca',
  'modelo',
  'color',
  'vinChasis',
  'motor',
  'combustible',
  'transmision',
] as const;
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
const TRANSMISSION_ALIASES: Record<string, string | null> = {
  manual: 'manual',
  automatica: 'automatica',
  automatico: 'automatica',
  cvt: 'cvt',
  'sin especificar': null,
};
const EMPRESA_PATTERN =
  /S\.?\s?A\.?|SPA\b|LTDA|E\.?I\.?R\.?L|FUNDACI[OÓ]N|ASOC|SOC\.|CORP|HOLDING|MINER[AO]S|COLEGIO|TRANSPORTES|MUNICIPAL|GOBIERNO/i;
const LABELS = Object.fromEntries(
  VEHICLE_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
);
const plateKey = (value: string, foreign = !isValidChilePatente(value)): string =>
  foreign ? value.trim().toUpperCase() : normalizeChilePatente(value);
const nameKey = (value: string): string => normalizeKeyText(value).replace(/\s+/g, ' ');

// Dates and Sequelize dataValues must not remain live references in the signed plan.
const snapshotOf = (record: Vehicle | FleetVehicle | Client): Record<string, unknown> =>
  JSON.parse(JSON.stringify(record.get({ plain: true }))) as Record<string, unknown>;

interface OwnerPlan {
  client: Client | null;
  data: CreateClientInput;
}

const ownerPlan = (
  row: SpreadsheetRow,
  current: Client | undefined,
  clients: Client[],
  pending: OwnerPlan[],
  access: ImportAccess,
): OwnerPlan | null => {
  const nombre = parseTextValue(row.values.propietario);
  const rawRut = parseTextValue(row.values.rutPropietario);
  const telefono = parseTextValue(row.values.telefonoPropietario);
  const email = parseTextValue(row.values.emailPropietario);
  if (!nombre && !rawRut && !telefono && !email) return null;
  const parsedRut = rutSchema.safeParse(rawRut);
  if (!parsedRut.success)
    throw ApiError.badRequest(parsedRut.error.issues.map((issue) => issue.message).join(' '));
  const rut = parsedRut.data ?? null;
  const rutMatches = rut ? clients.filter((client) => normalizeRut(client.rut ?? '') === rut) : [];
  const matches = rutMatches.length
    ? rutMatches
    : nombre
      ? clients.filter((client) => nameKey(client.nombre) === nameKey(nombre))
      : !rut && current
        ? [current]
        : [];
  if (matches.some((client) => client.deletedAt))
    throw ApiError.conflict('El cliente está eliminado. La importación no restaura clientes.');
  if (matches.length > 1)
    throw ApiError.conflict('Hay varios clientes con ese RUT o nombre. Revisa el propietario.');
  const client = matches[0];
  if (client) {
    if (rut && client.rut && normalizeRut(client.rut) !== rut)
      throw ApiError.conflict('El nombre del cliente corresponde a otro RUT.');
    // Never modify an existing client, even if the file supplies new contact details.
    return { client, data: { nombre: client.nombre, tipo: client.tipo, rut: client.rut } };
  }
  if (!nombre) throw ApiError.badRequest('Agrega el nombre del propietario para crear el cliente.');
  // These OR permissions are precisely those required by POST /clients.
  if (!access.canCreate)
    throw ApiError.conflict(
      'No tienes permiso comercial.create o taller.create para crear el cliente.',
    );
  const parsed = createClientSchema.safeParse({
    nombre,
    rut,
    telefono,
    email,
    tipo: EMPRESA_PATTERN.test(nombre) ? 'empresa' : 'cliente',
  });
  if (!parsed.success)
    throw ApiError.badRequest(
      parsed.error.issues.map((issue) => `Propietario: ${issue.message}`).join(' '),
    );
  const previous = pending.find(
    (owner) => (rut && owner.data.rut === rut) || nameKey(owner.data.nombre) === nameKey(nombre),
  );
  if (previous) {
    if (rut && previous.data.rut && previous.data.rut !== rut)
      throw ApiError.conflict('El nombre del cliente aparece con distintos RUT en el archivo.');
    return previous;
  }
  const owner = { client: null, data: parsed.data };
  pending.push(owner);
  return owner;
};

const parseForeign = (row: SpreadsheetRow, existing?: Vehicle): boolean => {
  if (!hasCell(row.values.esExtranjera))
    return existing ? !isValidChilePatente(existing.patente) : false;
  const value = normalizeKeyText(String(row.values.esExtranjera));
  if (['si', 's', 'true', '1', 'yes'].includes(value)) return true;
  if (['no', 'n', 'false', '0'].includes(value)) return false;
  throw ApiError.badRequest('Patente extranjera debe ser Sí o No (también acepta 1 o 0).');
};

const vehiclePayload = (row: SpreadsheetRow, existing?: Vehicle): CreateVehicleInput => {
  const payload: Record<string, unknown> = {
    patente: parseTextValue(row.values.patente) ?? existing?.patente ?? '',
    esExtranjera: parseForeign(row, existing),
  };
  for (const field of TEXT_FIELDS) {
    let value = hasCell(row.values[field])
      ? parseTextValue(row.values[field])
      : (existing?.[field] ?? null);
    if (hasCell(row.values[field]) && value) {
      if (field === 'combustible') value = FUEL_ALIASES[normalizeKeyText(value)] ?? value;
      if (field === 'transmision') {
        const normalized = TRANSMISSION_ALIASES[normalizeKeyText(value)];
        if (normalized !== undefined) value = normalized;
      }
    }
    payload[field] = value;
  }
  for (const field of ['ano', 'kilometraje'] as const) {
    const value = hasCell(row.values[field])
      ? parseNumberValue(row.values[field])
      : (existing?.[field] ?? null);
    if (hasCell(row.values[field]) && (value === null || !Number.isInteger(value)))
      throw ApiError.badRequest(`${LABELS[field]} debe ser un número entero válido.`);
    payload[field] = value;
  }
  const parsed = createVehicleSchema.safeParse(payload);
  if (!parsed.success)
    throw ApiError.badRequest(parsed.error.issues.map((issue) => issue.message).join(' '));
  return parsed.data;
};

const prepareRows = async (
  sheet: SpreadsheetData,
  access: ImportAccess,
  transaction?: Transaction,
): Promise<ImportPlanRow[]> => {
  // Use the same table/row lock order as the fleet importer, including deleted keys.
  const options = { paranoid: false, transaction, lock: transaction?.LOCK.UPDATE };
  const vehicles = await Vehicle.findAll({ ...options, order: [['id', 'ASC']] });
  const fleet = await FleetVehicle.findAll({ ...options, order: [['id', 'ASC']] });
  const clients = await Client.findAll({ ...options, order: [['id', 'ASC']] });
  const pendingOwners: OwnerPlan[] = [];
  const fileKeys = new Map<string, ImportPlanRow[]>();
  const register = (key: string, plan: ImportPlanRow) =>
    fileKeys.set(key, [...(fileKeys.get(key) ?? []), plan]);
  const plans = sheet.rows.map((row): ImportPlanRow => {
    const rawPlate = parseTextValue(row.values.patente);
    const foreignLookup = hasCell(row.values.esExtranjera)
      ? ['si', 's', 'true', '1', 'yes'].includes(normalizeKeyText(String(row.values.esExtranjera)))
      : rawPlate
        ? !isValidChilePatente(rawPlate)
        : false;
    const inputKey = rawPlate ? plateKey(rawPlate, foreignLookup) : null;
    const matches = inputKey
      ? vehicles.filter((vehicle) => plateKey(vehicle.patente, foreignLookup) === inputKey)
      : [];
    let fleetMatches = inputKey
      ? fleet.filter((vehicle) => plateKey(vehicle.patente, foreignLookup) === inputKey)
      : [];
    const snapshot: Record<string, unknown> = {
      access: { ...access },
      matches: matches.map(snapshotOf),
      fleet: fleetMatches.map(snapshotOf),
    };
    const plan: ImportPlanRow = {
      row: row.rowNumber,
      label: rawPlate ?? `Fila ${row.rowNumber}`,
      values: { ...row.values },
      status: 'error',
      changes: [],
      messages: [],
      snapshot,
    };
    if (inputKey) register(`plate:${inputKey}`, plan);
    try {
      const id = importRecordId(row);
      if (id) register(`id:${id}`, plan);
      const existing = id ? vehicles.find((vehicle) => vehicle.id === id) : matches[0];
      if (existing) {
        plan.existingId = existing.id;
        snapshot.vehicle = snapshotOf(existing);
        register(`target:${existing.id}`, plan);
      }
      if (id && !existing) throw ApiError.conflict('El ID no existe en vehículos de taller.');
      if (!rawPlate && existing) {
        fleetMatches = fleet.filter(
          (vehicle) => plateKey(vehicle.patente) === plateKey(existing.patente),
        );
        snapshot.fleet = fleetMatches.map(snapshotOf);
      }
      if (existing?.deletedAt || matches.some((vehicle) => vehicle.deletedAt))
        throw ApiError.conflict(
          'El vehículo está eliminado. La importación no restaura registros.',
        );
      if (matches.length > 1 || matches.some((vehicle) => vehicle.id !== existing?.id))
        throw ApiError.conflict('El ID y la patente apuntan a distintos vehículos.');
      if (fleetMatches.length)
        throw ApiError.conflict('La patente ya pertenece a un vehículo de flota.');
      const data = vehiclePayload(row, existing);
      const currentClient = clients.find((client) => client.id === existing?.clientId);
      snapshot.clients = clients
        .filter(
          (client) =>
            client.id === existing?.clientId ||
            (hasCell(row.values.rutPropietario) &&
              normalizeRut(client.rut ?? '') === normalizeRut(String(row.values.rutPropietario))) ||
            (hasCell(row.values.propietario) &&
              nameKey(client.nombre) === nameKey(String(row.values.propietario))),
        )
        .map(snapshotOf);
      const owner = ownerPlan(row, currentClient, clients, pendingOwners, access);
      snapshot.newClient = owner && !owner.client ? { ...owner.data } : null;
      const { esExtranjera, ...stored } = data;
      const payload: Record<string, unknown> = existing
        ? Object.fromEntries(Object.entries(stored).filter(([field]) => hasCell(row.values[field])))
        : { ...stored };
      if (owner?.client) payload.clientId = owner.client.id;
      if (!existing) payload.clientId = owner?.client?.id ?? null;
      plan.changes = changesBetween(existing ? snapshotOf(existing) : {}, payload, {
        ...LABELS,
        clientId: 'Cliente',
      });
      if (owner && !owner.client)
        plan.changes.push({
          field: 'propietario',
          label: 'Cliente nuevo',
          before: currentClient?.nombre ?? null,
          after: owner.data.nombre,
        });
      plan.values = {
        ...(hasCell(row.values.id) ? { id: id! } : {}),
        ...Object.fromEntries(
          Object.entries(stored).map(([field, value]) => [field, importCell(value)]),
        ),
        esExtranjera: importCell(esExtranjera),
        propietario: owner?.client?.nombre ?? owner?.data.nombre ?? currentClient?.nombre ?? null,
      };
      plan.label = data.patente;
      plan.status = existing ? (plan.changes.length ? 'update' : 'unchanged') : 'valid';
      plan.apply = async (savepoint) => {
        let clientId = owner?.client?.id ?? existing?.clientId ?? null;
        let clientsCreated = 0;
        if (owner && !owner.client) {
          // Re-read within this savepoint to reuse clients created by earlier
          // successful rows. A rolled-back row cannot poison a client cache.
          const available = await Client.findAll({
            paranoid: false,
            transaction: savepoint,
            lock: savepoint.LOCK.UPDATE,
            order: [['id', 'ASC']],
          });
          const resolved = ownerPlan(row, undefined, available, [], access);
          if (resolved?.client) clientId = resolved.client.id;
          else {
            const created = await Client.create(owner.data, { transaction: savepoint });
            clientId = created.id;
            clientsCreated = 1;
          }
        }
        if (existing)
          await existing.update(
            { ...payload, ...(owner ? { clientId } : {}) },
            { transaction: savepoint },
          );
        else await Vehicle.create({ ...stored, clientId }, { transaction: savepoint });
        return { clientsCreated };
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
      const message = 'El archivo repite un ID, una patente o el mismo vehículo de destino.';
      if (!plan.messages.includes(message)) plan.messages.push(message);
    }
  }
  return plans.map((plan) => applyImportAccess(plan, access));
};

export const importVehicles = async (
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
  actor?: ImportActor,
): Promise<ImportResult> => {
  const context = importContext(actor);
  const sheet = await readSpreadsheet(buffer, {
    aliases: aliasesOf(VEHICLE_IMPORT_COLUMNS),
    required: [],
    fileName,
  });
  if (!sheet.mappedColumns.id && !sheet.mappedColumns.patente)
    throw ApiError.badRequest('Incluye la columna ID o Patente.');
  return executePlannedImport(
    'vehicles',
    buffer,
    fileName,
    dryRun,
    sheet,
    context,
    async (transaction) =>
      prepareRows(sheet, await getImportAccess('vehicles', context), transaction),
  );
};

export const previewVehicleImport = async (
  buffer: Buffer,
  fileName: string,
  actor?: ImportActor,
): Promise<ImportPreview> => importVehicles(buffer, fileName, true, actor);
