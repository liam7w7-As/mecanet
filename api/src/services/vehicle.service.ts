import { Op } from 'sequelize';

import { Client } from '../models/Client.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination } from '../utils/paginate.js';

import type { CreateVehicleInput, UpdateVehicleInput, VehicleQueryInput } from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

interface VehicleClientPublic {
  id: number;
  rut: string | null;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  telefono: string | null;
}

export interface VehiclePublic {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  color: string | null;
  vinChasis: string | null;
  motor: string | null;
  kilometraje: number | null;
  combustible: string | null;
  transmision: string | null;
  clientId: number | null;
  createdAt: Date;
  updatedAt: Date;
  client?: VehicleClientPublic | null;
}

export interface ListVehiclesResult {
  items: VehiclePublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type VehicleWhere = WhereOptions<InferAttributes<Vehicle>> & {
  [Op.or]?: WhereOptions<InferAttributes<Vehicle>>[];
};

const clientInclude = {
  model: Client,
  attributes: ['id', 'rut', 'nombre', 'tipo', 'telefono'],
};

const normalizePatente = (patente: string): string => {
  return patente.replace(/[\s-]/g, '').trim().toUpperCase();
};

const normalizeVinChasis = (vinChasis?: string | null): string | null | undefined => {
  if (vinChasis === undefined) {
    return undefined;
  }

  if (vinChasis === null) {
    return null;
  }

  const normalized = vinChasis.trim().toUpperCase();
  return normalized === '' ? null : normalized;
};

const toVehiclePublic = (vehicle: Vehicle): VehiclePublic => ({
  id: vehicle.id,
  patente: vehicle.patente,
  marca: vehicle.marca,
  modelo: vehicle.modelo,
  ano: vehicle.ano,
  color: vehicle.color,
  vinChasis: vehicle.vinChasis,
  motor: vehicle.motor,
  kilometraje: vehicle.kilometraje,
  combustible: vehicle.combustible,
  transmision: vehicle.transmision,
  clientId: vehicle.clientId,
  createdAt: vehicle.createdAt,
  updatedAt: vehicle.updatedAt,
  client: vehicle.client
    ? {
        id: vehicle.client.id,
        rut: vehicle.client.rut,
        nombre: vehicle.client.nombre,
        tipo: vehicle.client.tipo,
        telefono: vehicle.client.telefono,
      }
    : vehicle.clientId === null
      ? null
      : undefined,
});

const assertPatenteAvailable = async (
  patente: string,
  ignoreVehicleId?: number,
): Promise<void> => {
  const where: WhereOptions<InferAttributes<Vehicle>> = { patente };
  if (ignoreVehicleId !== undefined) {
    where.id = { [Op.ne]: ignoreVehicleId };
  }

  const existing = await Vehicle.findOne({ where });
  if (existing) {
    throw ApiError.conflict('Ya existe un vehículo con esa patente');
  }
};

const assertClientExists = async (clientId: number): Promise<void> => {
  const client = await Client.findByPk(clientId);
  if (!client) {
    throw ApiError.badRequest('El cliente especificado no existe');
  }
};

const findVehicleWithClient = async (id: number): Promise<Vehicle> => {
  const vehicle = await Vehicle.findByPk(id, {
    include: [clientInclude],
  });

  if (!vehicle) {
    throw ApiError.notFound('Vehículo no encontrado');
  }

  return vehicle;
};

export const listVehicles = async (query: VehicleQueryInput): Promise<ListVehiclesResult> => {
  const pagination = getPagination(query);
  const where: VehicleWhere = {};

  if (query.search) {
    const search = `%${query.search}%`;
    where[Op.or] = [
      { patente: { [Op.like]: search } },
      { marca: { [Op.like]: search } },
      { modelo: { [Op.like]: search } },
      { vinChasis: { [Op.like]: search } },
    ];
  }

  if (query.clientId !== undefined) {
    where.clientId = query.clientId;
  }

  const { rows, count } = await Vehicle.findAndCountAll({
    where,
    include: [clientInclude],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['id', 'DESC']],
  });

  return {
    items: rows.map(toVehiclePublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getVehicleById = async (id: number): Promise<VehiclePublic> => {
  const vehicle = await findVehicleWithClient(id);
  return toVehiclePublic(vehicle);
};

export const getVehicleByPatente = async (patente: string): Promise<VehiclePublic> => {
  const vehicle = await Vehicle.findOne({
    where: { patente: normalizePatente(patente) },
    include: [clientInclude],
  });

  if (!vehicle) {
    throw ApiError.notFound('Vehículo no encontrado');
  }

  return toVehiclePublic(vehicle);
};

export const createVehicle = async (data: CreateVehicleInput): Promise<VehiclePublic> => {
  const patente = normalizePatente(data.patente);
  await assertPatenteAvailable(patente);

  if (data.clientId !== undefined && data.clientId !== null) {
    await assertClientExists(data.clientId);
  }

  const vehicle = await Vehicle.create({
    patente,
    marca: data.marca ?? null,
    modelo: data.modelo ?? null,
    ano: data.ano ?? null,
    color: data.color ?? null,
    vinChasis: normalizeVinChasis(data.vinChasis) ?? null,
    motor: data.motor ?? null,
    kilometraje: data.kilometraje ?? null,
    combustible: data.combustible ?? null,
    transmision: data.transmision ?? null,
    clientId: data.clientId ?? null,
  });

  return getVehicleById(vehicle.id);
};

export const updateVehicle = async (
  id: number,
  data: UpdateVehicleInput,
): Promise<VehiclePublic> => {
  const vehicle = await Vehicle.findByPk(id);
  if (!vehicle) {
    throw ApiError.notFound('Vehículo no encontrado');
  }

  const updatePayload: Partial<
    Pick<
      Vehicle,
      | 'patente'
      | 'marca'
      | 'modelo'
      | 'ano'
      | 'color'
      | 'vinChasis'
      | 'motor'
      | 'kilometraje'
      | 'combustible'
      | 'transmision'
      | 'clientId'
    >
  > = {};

  if (data.patente !== undefined) {
    const patente = normalizePatente(data.patente);
    if (patente !== vehicle.patente) {
      await assertPatenteAvailable(patente, id);
    }
    updatePayload.patente = patente;
  }

  if (data.marca !== undefined) {
    updatePayload.marca = data.marca;
  }

  if (data.modelo !== undefined) {
    updatePayload.modelo = data.modelo;
  }

  if (data.ano !== undefined) {
    updatePayload.ano = data.ano;
  }

  if (data.color !== undefined) {
    updatePayload.color = data.color;
  }

  if (data.vinChasis !== undefined) {
    updatePayload.vinChasis = normalizeVinChasis(data.vinChasis) ?? null;
  }

  if (data.motor !== undefined) {
    updatePayload.motor = data.motor;
  }

  if (data.kilometraje !== undefined) {
    updatePayload.kilometraje = data.kilometraje;
  }

  if (data.combustible !== undefined) {
    updatePayload.combustible = data.combustible;
  }

  if (data.transmision !== undefined) {
    updatePayload.transmision = data.transmision;
  }

  if (data.clientId !== undefined) {
    if (data.clientId !== null) {
      await assertClientExists(data.clientId);
    }
    updatePayload.clientId = data.clientId;
  }

  await vehicle.update(updatePayload);

  return getVehicleById(vehicle.id);
};

export const deleteVehicle = async (id: number): Promise<void> => {
  const vehicle = await Vehicle.findByPk(id);
  if (!vehicle) {
    throw ApiError.notFound('Vehículo no encontrado');
  }

  const openWorkOrders = await WorkOrder.count({
    where: {
      vehicleId: id,
      estado: { [Op.notIn]: ['finalizada', 'entregada', 'cancelada'] },
    },
  });

  if (openWorkOrders > 0) {
    throw ApiError.badRequest('No se puede eliminar un vehículo con órdenes de trabajo activas');
  }

  await vehicle.destroy();
};
