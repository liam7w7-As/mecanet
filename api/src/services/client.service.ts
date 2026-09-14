import { Op } from 'sequelize';

import { Client } from '../models/Client.js';
import { Vehicle } from '../models/Vehicle.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination } from '../utils/paginate.js';

import type { ClientQueryInput, CreateClientInput, UpdateClientInput } from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

export interface VehicleSummary {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
}

export interface ClientPublic {
  id: number;
  rut: string | null;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  region: string | null;
  comuna: string | null;
  notas: string | null;
  createdAt: Date;
  updatedAt: Date;
  vehicles?: VehicleSummary[];
}

export interface ListClientsResult {
  items: ClientPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type ClientWhere = WhereOptions<InferAttributes<Client>> & {
  [Op.or]?: WhereOptions<InferAttributes<Client>>[];
};

const normalizeRut = (rut?: string | null): string | null | undefined => {
  if (rut === undefined) {
    return undefined;
  }

  if (rut === null) {
    return null;
  }

  const normalized = rut.replace(/[.-]/g, '').trim().toUpperCase();
  return normalized === '' ? null : normalized;
};

const normalizeEmail = (email?: string | null): string | null | undefined => {
  if (email === undefined) {
    return undefined;
  }

  if (email === null) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized === '' ? null : normalized;
};

const toClientPublic = (client: Client): ClientPublic => {
  const result: ClientPublic = {
    id: client.id,
    rut: client.rut,
    nombre: client.nombre,
    tipo: client.tipo,
    email: client.email,
    telefono: client.telefono,
    direccion: client.direccion,
    region: client.region,
    comuna: client.comuna,
    notas: client.notas,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };

  if (client.vehicles) {
    result.vehicles = client.vehicles.map((vehicle) => ({
      id: vehicle.id,
      patente: vehicle.patente,
      marca: vehicle.marca,
      modelo: vehicle.modelo,
      ano: vehicle.ano,
    }));
  }

  return result;
};

const assertRutAvailable = async (rut: string, ignoreClientId?: number): Promise<void> => {
  const where: WhereOptions<InferAttributes<Client>> = { rut };
  if (ignoreClientId !== undefined) {
    where.id = { [Op.ne]: ignoreClientId };
  }

  const existing = await Client.findOne({ where });
  if (existing) {
    throw ApiError.conflict('Ya existe un cliente con ese RUT');
  }
};

export const listClients = async (query: ClientQueryInput): Promise<ListClientsResult> => {
  const pagination = getPagination(query);
  const where: ClientWhere = {};

  if (query.search) {
    where[Op.or] = [
      { nombre: { [Op.like]: `%${query.search}%` } },
      { rut: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
    ];
  }

  if (query.tipo !== undefined) {
    where.tipo = query.tipo;
  }

  const { rows, count } = await Client.findAndCountAll({
    where,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['id', 'DESC']],
  });

  return {
    items: rows.map(toClientPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getClientById = async (
  id: number,
  includeRelations = false,
): Promise<ClientPublic> => {
  const client = await Client.findByPk(id, {
    include: includeRelations
      ? [
          {
            model: Vehicle,
            attributes: ['id', 'patente', 'marca', 'modelo', 'ano'],
          },
        ]
      : undefined,
  });

  if (!client) {
    throw ApiError.notFound('Cliente no encontrado');
  }

  return toClientPublic(client);
};

export const createClient = async (data: CreateClientInput): Promise<ClientPublic> => {
  const rut = normalizeRut(data.rut);
  if (rut) {
    await assertRutAvailable(rut);
  }

  const client = await Client.create({
    rut: rut ?? null,
    nombre: data.nombre,
    tipo: data.tipo,
    email: normalizeEmail(data.email) ?? null,
    telefono: data.telefono ?? null,
    direccion: data.direccion ?? null,
    region: data.region ?? null,
    comuna: data.comuna ?? null,
    notas: data.notas ?? null,
  });

  return toClientPublic(client);
};

export const updateClient = async (
  id: number,
  data: UpdateClientInput,
): Promise<ClientPublic> => {
  const client = await Client.findByPk(id);
  if (!client) {
    throw ApiError.notFound('Cliente no encontrado');
  }

  const updatePayload: Partial<
    Pick<
      Client,
      | 'rut'
      | 'nombre'
      | 'tipo'
      | 'email'
      | 'telefono'
      | 'direccion'
      | 'region'
      | 'comuna'
      | 'notas'
    >
  > = {};

  if (data.rut !== undefined) {
    const rut = normalizeRut(data.rut);
    if (rut && rut !== client.rut) {
      await assertRutAvailable(rut, id);
    }
    updatePayload.rut = rut ?? null;
  }

  if (data.nombre !== undefined) {
    updatePayload.nombre = data.nombre;
  }

  if (data.tipo !== undefined) {
    updatePayload.tipo = data.tipo;
  }

  if (data.email !== undefined) {
    updatePayload.email = normalizeEmail(data.email) ?? null;
  }

  if (data.telefono !== undefined) {
    updatePayload.telefono = data.telefono;
  }

  if (data.direccion !== undefined) {
    updatePayload.direccion = data.direccion;
  }

  if (data.region !== undefined) {
    updatePayload.region = data.region;
  }

  if (data.comuna !== undefined) {
    updatePayload.comuna = data.comuna;
  }

  if (data.notas !== undefined) {
    updatePayload.notas = data.notas;
  }

  await client.update(updatePayload);

  return toClientPublic(client);
};

export const deleteClient = async (id: number): Promise<void> => {
  const client = await Client.findByPk(id);
  if (!client) {
    throw ApiError.notFound('Cliente no encontrado');
  }

  await client.destroy();
};
