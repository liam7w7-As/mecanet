import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  FLEET_EXPIRY_WARNING_DAYS,
  formatChilePatente,
  getFleetExpiryInfo,
  getFleetRequiredDocumentSummary,
  isValidChilePatente,
  normalizeChilePatente,
  toFleetDateOnly,
} from '@unithor/shared';
import { Op, UniqueConstraintError, col, fn, literal, where as sqlWhere } from 'sequelize';
import sharp from 'sharp';

import { readStoredFile, removeStoredFile, storeFile } from './file-storage.service.js';
import { toFleetDocumentPublic } from './fleet-document.service.js';
import { FleetDocument } from '../models/FleetDocument.js';
import { FleetVehicle } from '../models/FleetVehicle.js';
import { Vehicle } from '../models/Vehicle.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination } from '../utils/paginate.js';
import { vehiclePhotoUrl } from '../utils/vehicle-photo.js';


import type { FleetDocumentPublic } from './fleet-document.service.js';
import type {
  CreateFleetVehicleInput,
  FleetVehicleQueryInput,
  FleetVehicleStatus,
  UpdateFleetVehicleInput,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

interface SummaryDocument {
  id: number;
  nombre: string;
  fechaVencimiento: string | null;
  tieneArchivo: boolean;
}

export interface FleetVehicleNextExpiryPublic {
  documentId: number;
  nombre: string;
  fechaVencimiento: string;
  state: ReturnType<typeof getFleetExpiryInfo>['state'];
  daysRemaining: number | null;
}

export interface FleetVehicleDocumentSummaryPublic {
  total: number;
  expired: number;
  expiringSoon: number;
  nextExpiry: FleetVehicleNextExpiryPublic | null;
  required: ReturnType<typeof getFleetRequiredDocumentSummary>;
}

export interface FleetVehiclePublic {
  id: number;
  patente: string;
  codigoInterno: string | null;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  color: string | null;
  vinChasis: string | null;
  motor: string | null;
  kilometraje: number | null;
  combustible: string | null;
  transmision: string | null;
  fotoUrl: string | null;
  estadoOperativo: FleetVehicleStatus;
  sucursal: string | null;
  responsable: string | null;
  propietario?: string | null;
  fechaBaja: Date | null;
  motivoBaja: string | null;
  createdAt: Date;
  updatedAt: Date;
  documentSummary: FleetVehicleDocumentSummaryPublic;
}

export interface FleetVehicleDetailPublic extends FleetVehiclePublic {
  documents: FleetDocumentPublic[];
}

export interface ListFleetVehiclesResult {
  items: FleetVehiclePublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type FleetVehicleWhere = WhereOptions<InferAttributes<FleetVehicle>> & {
  [Op.or]?: WhereOptions<InferAttributes<FleetVehicle>>[];
};

const buildDocumentSummary = (
  documents: SummaryDocument[],
  today: Date = new Date(),
): FleetVehicleDocumentSummaryPublic => {
  let expired = 0;
  let expiringSoon = 0;
  let nextExpiry: FleetVehicleNextExpiryPublic | null = null;

  for (const document of documents) {
    if (!document.fechaVencimiento) {
      continue;
    }

    const expiry = getFleetExpiryInfo(document.fechaVencimiento, today);
    if (expiry.state === 'vencido') {
      expired += 1;
    } else if (
      expiry.state === 'vence_hoy' ||
      expiry.state === 'critico' ||
      expiry.state === 'advertencia'
    ) {
      expiringSoon += 1;
    }

    if (!nextExpiry || document.fechaVencimiento < nextExpiry.fechaVencimiento) {
      nextExpiry = {
        documentId: document.id,
        nombre: document.nombre,
        fechaVencimiento: document.fechaVencimiento,
        state: expiry.state,
        daysRemaining: expiry.daysRemaining,
      };
    }
  }

  return {
    total: documents.length,
    expired,
    expiringSoon,
    nextExpiry,
    required: getFleetRequiredDocumentSummary(documents),
  };
};

const toPublic = (
  vehicle: FleetVehicle,
  documentSummary: FleetVehicleDocumentSummaryPublic,
  actorRole?: string,
): FleetVehiclePublic => ({
  id: vehicle.id,
  patente: vehicle.patente,
  codigoInterno: vehicle.codigoInterno,
  marca: vehicle.marca,
  modelo: vehicle.modelo,
  ano: vehicle.ano,
  color: vehicle.color,
  vinChasis: vehicle.vinChasis,
  motor: vehicle.motor,
  kilometraje: vehicle.kilometraje,
  combustible: vehicle.combustible,
  transmision: vehicle.transmision,
  fotoUrl: vehiclePhotoUrl('fleet-vehicles', vehicle.id, vehicle.fotoStorageKey),
  estadoOperativo: vehicle.estadoOperativo,
  sucursal: vehicle.sucursal,
  responsable: vehicle.responsable,
  ...(canAccessOwner(actorRole) ? { propietario: vehicle.propietario ?? null } : {}),
  fechaBaja: vehicle.fechaBaja ?? null,
  motivoBaja: vehicle.motivoBaja ?? null,
  createdAt: vehicle.createdAt,
  updatedAt: vehicle.updatedAt,
  documentSummary,
});

const canAccessOwner = (role?: string): boolean => role === 'admin' || role === 'desarrollador';

const assertOwnerWriteAccess = (data: { propietario?: string | null }, actorRole?: string): void => {
  if (data.propietario !== undefined && !canAccessOwner(actorRole)) {
    throw ApiError.forbidden('Solo administración y desarrollador pueden modificar el propietario de flota');
  }
};

const normalizeCodigo = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized === '' ? null : normalized;
};

const normalizePatente = (patente: string): string => {
  const trimmed = patente.trim().toUpperCase();
  if (isValidChilePatente(trimmed)) {
    return formatChilePatente(trimmed);
  }
  return trimmed;
};

const assertPatenteAvailable = async (
  patente: string,
  ignoreVehicleId?: number,
): Promise<void> => {
  const clean = normalizeChilePatente(patente);
  const formatted = formatChilePatente(patente);
  const variants = isValidChilePatente(patente) ? [clean, formatted] : [patente.trim().toUpperCase()];

  const workshopVehicle = await Vehicle.findOne({ where: { patente: { [Op.in]: variants } }, paranoid: false });
  if (workshopVehicle) {
    throw ApiError.conflict('Ya existe un vehículo con esa patente');
  }

  const fleetWhere: WhereOptions<InferAttributes<FleetVehicle>> = { patente: { [Op.in]: variants } };
  if (ignoreVehicleId !== undefined) {
    fleetWhere.id = { [Op.ne]: ignoreVehicleId };
  }

  const fleetVehicle = await FleetVehicle.findOne({ where: fleetWhere, paranoid: false });
  if (fleetVehicle) {
    throw ApiError.conflict('Ya existe un vehículo con esa patente');
  }
};

const assertCodigoAvailable = async (
  codigoInterno: string | null,
  ignoreVehicleId?: number,
): Promise<void> => {
  if (!codigoInterno) {
    return;
  }

  const where: WhereOptions<InferAttributes<FleetVehicle>> = { codigoInterno };
  if (ignoreVehicleId !== undefined) {
    where.id = { [Op.ne]: ignoreVehicleId };
  }

  const existing = await FleetVehicle.findOne({ where, paranoid: false });
  if (existing) {
    throw ApiError.conflict('Ya existe un vehículo de flota con ese código interno');
  }
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const orderDocuments = <T extends { fechaVencimiento: string | null; id: number }>(
  documents: T[],
): T[] =>
  [...documents].sort((left, right) => {
    if (!left.fechaVencimiento && !right.fechaVencimiento) {
      return right.id - left.id;
    }
    if (!left.fechaVencimiento) {
      return 1;
    }
    if (!right.fechaVencimiento) {
      return -1;
    }
    return left.fechaVencimiento.localeCompare(right.fechaVencimiento);
  });

export const listFleetVehicles = async (
  query: FleetVehicleQueryInput,
  actorRole?: string,
): Promise<ListFleetVehiclesResult> => {
  const pagination = getPagination(query);
  const where: FleetVehicleWhere = {};

  if (query.search) {
    const trimmedSearch = query.search.trim();
    const search = `%${trimmedSearch}%`;
    const cleanSearch = `%${trimmedSearch.replace(/[\s-]/g, '')}%`;
    const formattedSearch = `%${formatChilePatente(trimmedSearch)}%`;
    where[Op.or] = [
      { patente: { [Op.like]: search } },
      { patente: { [Op.like]: cleanSearch } },
      { patente: { [Op.like]: formattedSearch } },
      sqlWhere(fn('REPLACE', col('FleetVehicle.patente'), '-', ''), { [Op.like]: cleanSearch }),
      { codigoInterno: { [Op.like]: search } },
      { marca: { [Op.like]: search } },
      { modelo: { [Op.like]: search } },
      { vinChasis: { [Op.like]: search } },
      { sucursal: { [Op.like]: search } },
      { responsable: { [Op.like]: search } },
    ];
  }

  if (query.estado) {
    where.estadoOperativo = query.estado;
  }

  const include: Array<Record<string, unknown>> = [];
  if (query.vencimiento) {
    const today = toFleetDateOnly(new Date());
    const warningLimit = toFleetDateOnly(addDays(new Date(), FLEET_EXPIRY_WARNING_DAYS));
    include.push({
      model: FleetDocument,
      as: 'documents',
      attributes: [],
      required: true,
      where: {
        fechaVencimiento:
          query.vencimiento === 'vencido'
            ? { [Op.lt]: today }
            : { [Op.between]: [today, warningLimit] },
      },
    });
  }

  const { rows, count } = await FleetVehicle.findAndCountAll({
    where,
    attributes: {
      ...(!canAccessOwner(actorRole) ? { exclude: ['propietario'] } : {}),
      // Project the rank so both the paginated subquery and outer document join can order by it.
      include: [[literal("CASE `FleetVehicle`.`estado_operativo` WHEN 'disponible' THEN 0 WHEN 'en_mantencion' THEN 1 WHEN 'fuera_de_servicio' THEN 2 WHEN 'dado_de_baja' THEN 3 ELSE 4 END"), 'fleetStateOrder']],
    },
    include,
    distinct: true,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [
      [literal('`fleetStateOrder`'), 'ASC'],
      ['id', 'DESC'],
    ],
  });

  const ids = rows.map((row) => row.id);
  const documents =
    ids.length > 0
      ? await FleetDocument.findAll({
          where: { fleetVehicleId: { [Op.in]: ids } },
          attributes: ['id', 'fleetVehicleId', 'nombre', 'fechaVencimiento', 'storageKey'],
        })
      : [];

  const documentsByVehicle = new Map<number, SummaryDocument[]>();
  for (const document of documents) {
    const current = documentsByVehicle.get(document.fleetVehicleId) ?? [];
    current.push({
      id: document.id,
      nombre: document.nombre,
      fechaVencimiento: document.fechaVencimiento,
      tieneArchivo: Boolean(document.storageKey),
    });
    documentsByVehicle.set(document.fleetVehicleId, current);
  }

  return {
    items: rows.map((vehicle) =>
      toPublic(vehicle, buildDocumentSummary(documentsByVehicle.get(vehicle.id) ?? []), actorRole),
    ),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getFleetVehicleById = async (id: number, actorRole?: string): Promise<FleetVehicleDetailPublic> => {
  const vehicle = await FleetVehicle.findByPk(id, !canAccessOwner(actorRole) ? { attributes: { exclude: ['propietario'] } } : {});
  if (!vehicle) {
    throw ApiError.notFound('Vehículo de flota no encontrado');
  }

  const documents = await FleetDocument.findAll({ where: { fleetVehicleId: id } });
  const publicDocuments = documents.map(toFleetDocumentPublic);

  return {
    ...toPublic(vehicle, buildDocumentSummary(publicDocuments), actorRole),
    documents: orderDocuments(publicDocuments),
  };
};

export const createFleetVehicle = async (
  data: CreateFleetVehicleInput,
  actorRole?: string,
): Promise<FleetVehicleDetailPublic> => {
  assertOwnerWriteAccess(data, actorRole);
  const patente = normalizePatente(data.patente);
  const codigoInterno = normalizeCodigo(data.codigoInterno);

  await assertPatenteAvailable(patente);
  await assertCodigoAvailable(codigoInterno);

  try {
    const vehicle = await FleetVehicle.create({
      patente,
      codigoInterno,
      marca: data.marca ?? null,
      modelo: data.modelo ?? null,
      ano: data.ano ?? null,
      color: data.color ?? null,
      vinChasis: data.vinChasis ?? null,
      motor: data.motor ?? null,
      kilometraje: data.kilometraje ?? null,
      combustible: data.combustible ?? null,
      transmision: data.transmision ?? null,
      estadoOperativo: data.estadoOperativo ?? 'disponible',
      sucursal: data.sucursal ?? null,
      responsable: data.responsable ?? null,
      propietario: data.propietario ?? null,
      fechaBaja: data.estadoOperativo === 'dado_de_baja' ? new Date() : null,
      motivoBaja: data.estadoOperativo === 'dado_de_baja' ? data.motivoBaja ?? null : null,
    });

    return getFleetVehicleById(vehicle.id, actorRole);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw ApiError.conflict('Ya existe un vehículo de flota con esa patente o código interno');
    }
    throw error;
  }
};

export const updateFleetVehicle = async (
  id: number,
  data: UpdateFleetVehicleInput,
  actorRole?: string,
): Promise<FleetVehicleDetailPublic> => {
  assertOwnerWriteAccess(data, actorRole);
  const vehicle = await FleetVehicle.findByPk(id);
  if (!vehicle) {
    throw ApiError.notFound('Vehículo de flota no encontrado');
  }

  const updatePayload: Partial<
    Pick<
      FleetVehicle,
      | 'patente'
      | 'codigoInterno'
      | 'marca'
      | 'modelo'
      | 'ano'
      | 'color'
      | 'vinChasis'
      | 'motor'
      | 'kilometraje'
      | 'combustible'
      | 'transmision'
      | 'estadoOperativo'
      | 'sucursal'
      | 'responsable'
      | 'propietario'
      | 'fechaBaja'
      | 'motivoBaja'
    >
  > = {};

  if (data.patente !== undefined) {
    const patente = normalizePatente(data.patente);
    if (patente !== vehicle.patente) {
      await assertPatenteAvailable(patente, id);
    }
    updatePayload.patente = patente;
  }

  if (data.codigoInterno !== undefined) {
    const codigoInterno = normalizeCodigo(data.codigoInterno);
    if (codigoInterno !== vehicle.codigoInterno) {
      await assertCodigoAvailable(codigoInterno, id);
    }
    updatePayload.codigoInterno = codigoInterno;
  }

  if (data.marca !== undefined) updatePayload.marca = data.marca;
  if (data.modelo !== undefined) updatePayload.modelo = data.modelo;
  if (data.ano !== undefined) updatePayload.ano = data.ano;
  if (data.color !== undefined) updatePayload.color = data.color;
  if (data.vinChasis !== undefined) updatePayload.vinChasis = data.vinChasis;
  if (data.motor !== undefined) updatePayload.motor = data.motor;
  if (data.kilometraje !== undefined) updatePayload.kilometraje = data.kilometraje;
  if (data.combustible !== undefined) updatePayload.combustible = data.combustible;
  if (data.transmision !== undefined) updatePayload.transmision = data.transmision;
  if (data.estadoOperativo !== undefined) updatePayload.estadoOperativo = data.estadoOperativo;
  if (data.sucursal !== undefined) updatePayload.sucursal = data.sucursal;
  if (data.responsable !== undefined) updatePayload.responsable = data.responsable;
  if (data.propietario !== undefined) updatePayload.propietario = data.propietario;
  if (data.estadoOperativo === 'dado_de_baja' && vehicle.estadoOperativo !== 'dado_de_baja') {
    updatePayload.fechaBaja = new Date();
    updatePayload.motivoBaja = data.motivoBaja ?? null;
  } else if (data.motivoBaja !== undefined && (data.estadoOperativo ?? vehicle.estadoOperativo) === 'dado_de_baja') {
    updatePayload.motivoBaja = data.motivoBaja;
  }

  try {
    await vehicle.update(updatePayload);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw ApiError.conflict('Ya existe un vehículo de flota con esa patente o código interno');
    }
    throw error;
  }

  return getFleetVehicleById(vehicle.id, actorRole);
};

export const deleteFleetVehicle = async (id: number): Promise<void> => {
  const vehicle = await FleetVehicle.findByPk(id);
  if (!vehicle) {
    throw ApiError.notFound('Vehículo de flota no encontrado');
  }

  // Keep its stored photo with the soft-deleted record, just like its documents.
  await vehicle.destroy();
};

const FLEET_VEHICLE_PHOTO_FOLDER = 'fleet-vehicles';

export const saveFleetVehiclePhoto = async (
  vehicleId: number,
  file: Express.Multer.File,
  actorRole?: string,
): Promise<FleetVehicleDetailPublic> => {
  const vehicle = await FleetVehicle.findByPk(vehicleId);
  if (!vehicle) {
    throw ApiError.notFound('Vehículo de flota no encontrado');
  }

  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(file.buffer)
      .rotate()
      .resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw ApiError.badRequest('El archivo de imagen no es válido o está dañado');
  }

  const storageKey = path.posix.join(
    FLEET_VEHICLE_PHOTO_FOLDER,
    `fleet-${vehicle.id}-${randomUUID()}.webp`,
  );
  await storeFile(storageKey, webpBuffer, 'image/webp');

  const previousStorageKey = vehicle.fotoStorageKey;
  try {
    await vehicle.update({ fotoStorageKey: storageKey });
    if (previousStorageKey) {
      await removeStoredFile(previousStorageKey, true);
    }
  } catch (error) {
    await removeStoredFile(storageKey, false);
    throw error;
  }

  return getFleetVehicleById(vehicle.id, actorRole);
};

export const getFleetVehiclePhoto = async (
  vehicleId: number,
): Promise<{ bytes: Buffer; mimeType: string }> => {
  const vehicle = await FleetVehicle.findByPk(vehicleId);
  if (!vehicle || !vehicle.fotoStorageKey) {
    throw ApiError.notFound('Foto de vehículo de flota no encontrada');
  }

  const bytes = await readStoredFile(vehicle.fotoStorageKey, 'Foto de vehículo de flota no encontrada');
  return { bytes, mimeType: 'image/webp' };
};

export const deleteFleetVehiclePhoto = async (
  vehicleId: number,
  actorRole?: string,
): Promise<FleetVehicleDetailPublic> => {
  const vehicle = await FleetVehicle.findByPk(vehicleId);
  if (!vehicle) {
    throw ApiError.notFound('Vehículo de flota no encontrado');
  }

  if (vehicle.fotoStorageKey) {
    const previous = vehicle.fotoStorageKey;
    await vehicle.update({ fotoStorageKey: null });
    await removeStoredFile(previous, true);
  }

  return getFleetVehicleById(vehicle.id, actorRole);
};
