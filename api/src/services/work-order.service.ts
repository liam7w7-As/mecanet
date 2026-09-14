import { Op } from 'sequelize';

import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { ApiError } from '../utils/ApiError.js';
import { generateWorkOrderCode } from '../utils/generateCode.js';
import { getPagination } from '../utils/paginate.js';

import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderItemInput,
  WorkOrderQueryInput,
  WorkOrderStatus,
} from '@unithor/shared';
import type { InferAttributes, Transaction, WhereOptions } from 'sequelize';

interface WorkOrderClientPublic {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
}

interface WorkOrderVehiclePublic {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

interface WorkOrderCreatorPublic {
  id: number;
  nombre: string;
  email: string;
}

interface WorkOrderItemPublic {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface WorkOrderPublic {
  id: number;
  codigo: string;
  clientId: number | null;
  vehicleId: number | null;
  estado: WorkOrderStatus;
  descripcion: string | null;
  kilometrajeIngreso: number | null;
  fechaIngreso: Date | null;
  fechaEntrega: Date | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  client?: WorkOrderClientPublic | null;
  vehicle?: WorkOrderVehiclePublic | null;
  creator?: WorkOrderCreatorPublic | null;
  items?: WorkOrderItemPublic[];
}

export interface ListWorkOrdersResult {
  items: WorkOrderPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type WorkOrderWhere = WhereOptions<InferAttributes<WorkOrder>> & {
  [Op.or]?: WhereOptions<InferAttributes<WorkOrder>>[];
};

const clientInclude = {
  model: Client,
  attributes: ['id', 'rut', 'nombre', 'telefono'],
};

const vehicleInclude = {
  model: Vehicle,
  attributes: ['id', 'patente', 'marca', 'modelo'],
};

const creatorInclude = {
  model: User,
  as: 'creator',
  attributes: ['id', 'nombre', 'email'],
};

const itemsInclude = {
  model: WorkOrderItem,
  attributes: ['id', 'catalogItemId', 'descripcion', 'cantidad', 'precioUnitario', 'subtotal'],
};

const toNumber = (value: number | string): number => Number(value);

const toDateOrNull = (value: string | null | undefined): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return new Date(value);
};

const toWorkOrderPublic = (workOrder: WorkOrder): WorkOrderPublic => ({
  id: workOrder.id,
  codigo: workOrder.codigo,
  clientId: workOrder.clientId,
  vehicleId: workOrder.vehicleId,
  estado: workOrder.estado,
  descripcion: workOrder.descripcion,
  kilometrajeIngreso: workOrder.kilometrajeIngreso,
  fechaIngreso: workOrder.fechaIngreso,
  fechaEntrega: workOrder.fechaEntrega,
  createdBy: workOrder.createdBy,
  createdAt: workOrder.createdAt,
  updatedAt: workOrder.updatedAt,
  client: workOrder.client
    ? {
        id: workOrder.client.id,
        rut: workOrder.client.rut,
        nombre: workOrder.client.nombre,
        telefono: workOrder.client.telefono,
      }
    : workOrder.clientId === null
      ? null
      : undefined,
  vehicle: workOrder.vehicle
    ? {
        id: workOrder.vehicle.id,
        patente: workOrder.vehicle.patente,
        marca: workOrder.vehicle.marca,
        modelo: workOrder.vehicle.modelo,
      }
    : workOrder.vehicleId === null
      ? null
      : undefined,
  creator: workOrder.creator
    ? {
        id: workOrder.creator.id,
        nombre: workOrder.creator.nombre,
        email: workOrder.creator.email,
      }
    : workOrder.createdBy === null
      ? null
      : undefined,
  items: workOrder.items
    ?.slice()
    .sort((left, right) => left.id - right.id)
    .map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      descripcion: item.descripcion,
      cantidad: toNumber(item.cantidad),
      precioUnitario: toNumber(item.precioUnitario),
      subtotal: toNumber(item.subtotal),
    })),
});

const buildItemsPayload = (
  workOrderId: number,
  items: WorkOrderItemInput[],
): Array<{
  workOrderId: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}> => {
  return items.map((item) => {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precioUnitario);

    return {
      workOrderId,
      catalogItemId: item.catalogItemId ?? null,
      descripcion: item.descripcion,
      cantidad,
      precioUnitario,
      subtotal: cantidad * precioUnitario,
    };
  });
};

const assertClientExists = async (
  clientId: number,
  transaction: Transaction,
): Promise<void> => {
  const client = await Client.findByPk(clientId, { transaction });
  if (!client) {
    throw ApiError.badRequest('El cliente especificado no existe');
  }
};

const assertVehicleExists = async (
  vehicleId: number,
  transaction: Transaction,
): Promise<Vehicle> => {
  const vehicle = await Vehicle.findByPk(vehicleId, { transaction });
  if (!vehicle) {
    throw ApiError.badRequest('El vehículo especificado no existe');
  }

  return vehicle;
};

const assertCatalogItemsExist = async (
  items: WorkOrderItemInput[],
  transaction: Transaction,
): Promise<void> => {
  const catalogItemIds = [
    ...new Set(
      items
        .map((item) => item.catalogItemId)
        .filter((catalogItemId): catalogItemId is number => catalogItemId !== undefined && catalogItemId !== null),
    ),
  ];

  if (catalogItemIds.length === 0) {
    return;
  }

  const count = await CatalogItem.count({
    where: { id: catalogItemIds },
    transaction,
  });

  if (count !== catalogItemIds.length) {
    throw ApiError.badRequest('Uno o más ítems de catálogo no existen');
  }
};

const getCompleteWorkOrder = async (
  id: number,
  transaction?: Transaction,
): Promise<WorkOrder> => {
  const workOrder = await WorkOrder.findByPk(id, {
    include: [clientInclude, vehicleInclude, creatorInclude, itemsInclude],
    transaction,
  });

  if (!workOrder) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }

  return workOrder;
};

export const listWorkOrders = async (
  query: WorkOrderQueryInput,
): Promise<ListWorkOrdersResult> => {
  const pagination = getPagination(query);
  const where: WorkOrderWhere = {};

  if (query.search) {
    where[Op.or] = [
      { codigo: { [Op.like]: `%${query.search}%` } },
      { descripcion: { [Op.like]: `%${query.search}%` } },
    ];
  }

  if (query.estado !== undefined) {
    where.estado = query.estado;
  }

  if (query.clientId !== undefined) {
    where.clientId = query.clientId;
  }

  if (query.vehicleId !== undefined) {
    where.vehicleId = query.vehicleId;
  }

  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) {
      range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    }
    if (query.fechaHasta) {
      range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    }
    where.fechaIngreso = range;
  }

  const { rows, count } = await WorkOrder.findAndCountAll({
    where,
    include: [clientInclude, vehicleInclude],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return {
    items: rows.map(toWorkOrderPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getWorkOrderById = async (id: number): Promise<WorkOrderPublic> => {
  const workOrder = await getCompleteWorkOrder(id);
  return toWorkOrderPublic(workOrder);
};

export const createWorkOrder = async (
  data: CreateWorkOrderInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  const workOrderId = await sequelize.transaction(async (transaction) => {
    if (data.clientId !== undefined && data.clientId !== null) {
      await assertClientExists(data.clientId, transaction);
    }

    if (data.vehicleId !== undefined && data.vehicleId !== null) {
      const vehicle = await assertVehicleExists(data.vehicleId, transaction);
      if (
        data.kilometrajeIngreso !== undefined &&
        data.kilometrajeIngreso !== null &&
        (vehicle.kilometraje === null || data.kilometrajeIngreso > vehicle.kilometraje)
      ) {
        await vehicle.update({ kilometraje: data.kilometrajeIngreso }, { transaction });
      }
    }

    await assertCatalogItemsExist(data.items, transaction);

    const codigo = await generateWorkOrderCode(transaction);
    const workOrder = await WorkOrder.create(
      {
        codigo,
        clientId: data.clientId ?? null,
        vehicleId: data.vehicleId ?? null,
        estado: 'borrador',
        descripcion: data.descripcion ?? null,
        kilometrajeIngreso: data.kilometrajeIngreso ?? null,
        fechaIngreso: toDateOrNull(data.fechaIngreso) ?? new Date(),
        fechaEntrega: toDateOrNull(data.fechaEntrega),
        createdBy: userId,
      },
      { transaction },
    );

    if (data.items.length > 0) {
      await WorkOrderItem.bulkCreate(buildItemsPayload(workOrder.id, data.items), {
        transaction,
      });
    }

    return workOrder.id;
  });

  return getWorkOrderById(workOrderId);
};

export const updateWorkOrder = async (
  id: number,
  data: UpdateWorkOrderInput,
): Promise<WorkOrderPublic> => {
  const workOrderId = await sequelize.transaction(async (transaction) => {
    const workOrder = await WorkOrder.findByPk(id, { transaction });
    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }

    if (workOrder.estado === 'entregada' || workOrder.estado === 'cancelada') {
      throw ApiError.badRequest('No se puede modificar una orden finalizada o cancelada');
    }

    if (data.clientId !== undefined && data.clientId !== null) {
      await assertClientExists(data.clientId, transaction);
    }

    if (data.vehicleId !== undefined && data.vehicleId !== null) {
      const vehicle = await assertVehicleExists(data.vehicleId, transaction);
      if (
        data.kilometrajeIngreso !== undefined &&
        data.kilometrajeIngreso !== null &&
        (vehicle.kilometraje === null || data.kilometrajeIngreso > vehicle.kilometraje)
      ) {
        await vehicle.update({ kilometraje: data.kilometrajeIngreso }, { transaction });
      }
    }

    if (data.items !== undefined) {
      await assertCatalogItemsExist(data.items, transaction);
      await WorkOrderItem.destroy({ where: { workOrderId: id }, transaction });

      if (data.items.length > 0) {
        await WorkOrderItem.bulkCreate(buildItemsPayload(id, data.items), { transaction });
      }
    }

    const updatePayload: Partial<
      Pick<
        WorkOrder,
        | 'clientId'
        | 'vehicleId'
        | 'estado'
        | 'descripcion'
        | 'kilometrajeIngreso'
        | 'fechaIngreso'
        | 'fechaEntrega'
      >
    > = {};

    if (data.clientId !== undefined) {
      updatePayload.clientId = data.clientId;
    }
    if (data.vehicleId !== undefined) {
      updatePayload.vehicleId = data.vehicleId;
    }
    if (data.estado !== undefined) {
      updatePayload.estado = data.estado;
    }
    if (data.descripcion !== undefined) {
      updatePayload.descripcion = data.descripcion;
    }
    if (data.kilometrajeIngreso !== undefined) {
      updatePayload.kilometrajeIngreso = data.kilometrajeIngreso;
    }
    if (data.fechaIngreso !== undefined) {
      updatePayload.fechaIngreso = toDateOrNull(data.fechaIngreso);
    }
    if (data.fechaEntrega !== undefined) {
      updatePayload.fechaEntrega = toDateOrNull(data.fechaEntrega);
    }

    await workOrder.update(updatePayload, { transaction });

    return workOrder.id;
  });

  return getWorkOrderById(workOrderId);
};

export const deleteWorkOrder = async (id: number): Promise<void> => {
  const workOrder = await WorkOrder.findByPk(id);
  if (!workOrder) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }

  if (workOrder.estado !== 'borrador' && workOrder.estado !== 'cancelada') {
    throw ApiError.badRequest('No se puede eliminar una orden activa');
  }

  await workOrder.destroy();
};
