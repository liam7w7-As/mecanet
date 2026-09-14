import { Op } from 'sequelize';

import { Client } from '../models/Client.js';
import { Vehicle } from '../models/Vehicle.js';

import type { InferAttributes, WhereOptions } from 'sequelize';

interface QuickSearchClient {
  id: number;
  rut: string | null;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  telefono: string | null;
  email: string | null;
  vehiclesCount: number;
}

interface QuickSearchVehicleClient {
  id: number;
  nombre: string;
  rut: string | null;
}

interface QuickSearchVehicle {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  client: QuickSearchVehicleClient | null;
}

export interface QuickSearchResult {
  clients: QuickSearchClient[];
  vehicles: QuickSearchVehicle[];
}

interface PlateLookupVehicle {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  color: string | null;
  vinChasis: string | null;
  kilometraje: number | null;
  clientId: number | null;
}

interface PlateLookupClient {
  id: number;
  rut: string | null;
  nombre: string;
  tipo: 'cliente' | 'empresa';
  telefono: string | null;
  email: string | null;
}

export interface PlateLookupResult {
  exists: boolean;
  vehicle: PlateLookupVehicle | null;
  client: PlateLookupClient | null;
}

type ClientWhere = WhereOptions<InferAttributes<Client>> & {
  [Op.or]?: WhereOptions<InferAttributes<Client>>[];
};

type VehicleWhere = WhereOptions<InferAttributes<Vehicle>> & {
  [Op.or]?: WhereOptions<InferAttributes<Vehicle>>[];
};

const normalizePatente = (patente: string): string => {
  return patente.replace(/[\s-]/g, '').trim().toUpperCase();
};

const clientVehicleCountInclude = {
  model: Vehicle,
  attributes: ['id'],
};

const vehicleClientInclude = {
  model: Client,
  attributes: ['id', 'rut', 'nombre'],
};

const plateLookupClientInclude = {
  model: Client,
  attributes: ['id', 'rut', 'nombre', 'tipo', 'telefono', 'email'],
};

const toQuickSearchClient = (client: Client): QuickSearchClient => ({
  id: client.id,
  rut: client.rut,
  nombre: client.nombre,
  tipo: client.tipo,
  telefono: client.telefono,
  email: client.email,
  vehiclesCount: client.vehicles?.length ?? 0,
});

const toQuickSearchVehicle = (vehicle: Vehicle): QuickSearchVehicle => ({
  id: vehicle.id,
  patente: vehicle.patente,
  marca: vehicle.marca,
  modelo: vehicle.modelo,
  ano: vehicle.ano,
  client: vehicle.client
    ? {
        id: vehicle.client.id,
        nombre: vehicle.client.nombre,
        rut: vehicle.client.rut,
      }
    : null,
});

const toPlateLookupVehicle = (vehicle: Vehicle): PlateLookupVehicle => ({
  id: vehicle.id,
  patente: vehicle.patente,
  marca: vehicle.marca,
  modelo: vehicle.modelo,
  ano: vehicle.ano,
  color: vehicle.color,
  vinChasis: vehicle.vinChasis,
  kilometraje: vehicle.kilometraje,
  clientId: vehicle.clientId,
});

const toPlateLookupClient = (client: Client | undefined): PlateLookupClient | null => {
  if (!client) {
    return null;
  }

  return {
    id: client.id,
    rut: client.rut,
    nombre: client.nombre,
    tipo: client.tipo,
    telefono: client.telefono,
    email: client.email,
  };
};

export const quickSearch = async (term: string, limit = 10): Promise<QuickSearchResult> => {
  const trimmedTerm = term.trim();
  const normalizedPlateTerm = normalizePatente(trimmedTerm);
  const termLike = `%${trimmedTerm}%`;
  const normalizedPlateLike = `%${normalizedPlateTerm}%`;

  const clientWhere: ClientWhere = {
    [Op.or]: [
      { nombre: { [Op.like]: termLike } },
      { rut: { [Op.like]: termLike } },
      { telefono: { [Op.like]: termLike } },
    ],
  };

  const vehicleWhere: VehicleWhere = {
    [Op.or]: [
      { patente: { [Op.like]: termLike } },
      { patente: { [Op.like]: normalizedPlateLike } },
      { marca: { [Op.like]: termLike } },
      { modelo: { [Op.like]: termLike } },
      { vinChasis: { [Op.like]: termLike } },
    ],
  };

  const [clients, vehicles] = await Promise.all([
    Client.findAll({
      where: clientWhere,
      attributes: ['id', 'rut', 'nombre', 'tipo', 'telefono', 'email'],
      include: [clientVehicleCountInclude],
      limit,
      order: [['nombre', 'ASC']],
    }),
    Vehicle.findAll({
      where: vehicleWhere,
      attributes: ['id', 'patente', 'marca', 'modelo', 'ano', 'clientId'],
      include: [vehicleClientInclude],
      limit,
      order: [['patente', 'ASC']],
    }),
  ]);

  return {
    clients: clients.map(toQuickSearchClient),
    vehicles: vehicles.map(toQuickSearchVehicle),
  };
};

export const lookupByPlateWithClient = async (patente: string): Promise<PlateLookupResult> => {
  const vehicle = await Vehicle.findOne({
    where: { patente: { [Op.eq]: normalizePatente(patente) } },
    attributes: [
      'id',
      'patente',
      'marca',
      'modelo',
      'ano',
      'color',
      'vinChasis',
      'kilometraje',
      'clientId',
    ],
    include: [plateLookupClientInclude],
  });

  if (!vehicle) {
    return {
      exists: false,
      vehicle: null,
      client: null,
    };
  }

  return {
    exists: true,
    vehicle: toPlateLookupVehicle(vehicle),
    client: toPlateLookupClient(vehicle.client),
  };
};
