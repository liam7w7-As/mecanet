import { col, Op, Transaction, where as sequelizeWhere } from 'sequelize';

import { getWorkOrderById, type WorkOrderPublic } from './work-order.service.js';
import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { ApiError } from '../utils/ApiError.js';
import { generateQuotationCode, generateWorkOrderCode } from '../utils/generateCode.js';
import { getPagination } from '../utils/paginate.js';

import type {
  ConvertQuotationInput,
  CreateQuotationInput,
  ItemOperationalStatus,
  QuotationItemInput,
  QuotationQueryInput,
  QuotationStatus,
  UpdateQuotationInput,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

interface QuotationClientPublic {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
}

interface QuotationVehiclePublic {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

interface QuotationUserPublic {
  id: number;
  nombre: string;
  email: string;
}

interface QuotationWorkOrderPublic {
  id: number;
  codigo: string;
  estado: string;
}

interface QuotationItemCatalogPublic {
  id: number;
  tipo: import('@unithor/shared').CatalogType;
  codigo: string | null;
  nombre: string;
}

interface QuotationItemPublic {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
  catalogItem?: QuotationItemCatalogPublic | null;
}

export interface QuotationPublic {
  id: number;
  codigo: string;
  workOrderId: number | null;
  clientId: number | null;
  vehicleId: number | null;
  asesorId: number | null;
  estadoPago: QuotationStatus;
  subtotal: number;
  total: number;
  pagado: number;
  notas: string | null;
  createdAt: Date;
  updatedAt: Date;
  client?: QuotationClientPublic | null;
  vehicle?: QuotationVehiclePublic | null;
  asesor?: QuotationUserPublic | null;
  workOrder?: QuotationWorkOrderPublic | null;
  items?: QuotationItemPublic[];
}

export interface ListQuotationsResult {
  items: QuotationPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConvertQuotationResult {
  quotation: QuotationPublic;
  workOrder: WorkOrderPublic;
}

type QuotationWhere = WhereOptions<InferAttributes<Quotation>> & {
  [Op.or]?: WhereOptions<InferAttributes<Quotation>>[];
};

const clientInclude = {
  model: Client,
  attributes: ['id', 'rut', 'nombre', 'telefono'],
};

const vehicleInclude = {
  model: Vehicle,
  attributes: ['id', 'patente', 'marca', 'modelo'],
};

const asesorInclude = {
  model: User,
  as: 'asesor',
  attributes: ['id', 'nombre', 'email'],
};

const workOrderInclude = {
  model: WorkOrder,
  attributes: ['id', 'codigo', 'estado'],
};

const itemsInclude = {
  model: QuotationItem,
  attributes: [
    'id',
    'catalogItemId',
    'descripcion',
    'cantidad',
    'precioUnitario',
    'subtotal',
    'estadoOperativo',
    'notasOperativas',
  ],
  include: [
    {
      model: CatalogItem,
      attributes: ['id', 'tipo', 'codigo', 'nombre'],
    },
  ],
};

const numberValue = (value: number | string): number => Number(value);

const FINANCIAL_QUOTATION_STATUSES = new Set<QuotationStatus>([
  'por_pagar',
  'parcial',
  'total',
]);

const getFinancialQuotationStatus = (pagado: number, total: number): QuotationStatus => {
  if (pagado <= 0) return 'por_pagar';
  if (pagado >= total) return 'total';
  return 'parcial';
};

const toDateOrNull = (value: string | null | undefined): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return new Date(value);
};

const toQuotationPublic = (quotation: Quotation): QuotationPublic => ({
  id: quotation.id,
  codigo: quotation.codigo,
  workOrderId: quotation.workOrderId,
  clientId: quotation.clientId,
  vehicleId: quotation.vehicleId,
  asesorId: quotation.asesorId,
  estadoPago: quotation.estadoPago,
  subtotal: numberValue(quotation.subtotal),
  total: numberValue(quotation.total),
  pagado: numberValue(quotation.pagado),
  notas: quotation.notas,
  createdAt: quotation.createdAt,
  updatedAt: quotation.updatedAt,
  client: quotation.client
    ? {
        id: quotation.client.id,
        rut: quotation.client.rut,
        nombre: quotation.client.nombre,
        telefono: quotation.client.telefono,
      }
    : quotation.clientId === null
      ? null
      : undefined,
  vehicle: quotation.vehicle
    ? {
        id: quotation.vehicle.id,
        patente: quotation.vehicle.patente,
        marca: quotation.vehicle.marca,
        modelo: quotation.vehicle.modelo,
      }
    : quotation.vehicleId === null
      ? null
      : undefined,
  asesor: quotation.asesor
    ? {
        id: quotation.asesor.id,
        nombre: quotation.asesor.nombre,
        email: quotation.asesor.email,
      }
    : quotation.asesorId === null
      ? null
      : undefined,
  workOrder: quotation.workOrder
    ? {
        id: quotation.workOrder.id,
        codigo: quotation.workOrder.codigo,
        estado: quotation.workOrder.estado,
      }
    : quotation.workOrderId === null
      ? null
      : undefined,
  items: quotation.items
    ?.slice()
    .sort((left, right) => left.id - right.id)
    .map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      descripcion: item.descripcion,
      cantidad: numberValue(item.cantidad),
      precioUnitario: numberValue(item.precioUnitario),
      subtotal: numberValue(item.subtotal),
      estadoOperativo: item.estadoOperativo,
      notasOperativas: item.notasOperativas,
      catalogItem: item.catalogItem
        ? {
            id: item.catalogItem.id,
            tipo: item.catalogItem.tipo,
            codigo: item.catalogItem.codigo,
            nombre: item.catalogItem.nombre,
          }
        : null,
    })),
});

const buildItemsPayload = (
  quotationId: number,
  items: QuotationItemInput[],
): Array<{
  quotationId: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
}> => {
  return items.map((item) => {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precioUnitario);

    return {
      quotationId,
      catalogItemId: item.catalogItemId ?? null,
      descripcion: item.descripcion,
      cantidad,
      precioUnitario,
      subtotal: cantidad * precioUnitario,
      estadoOperativo: item.estadoOperativo ?? 'pendiente',
      notasOperativas: item.notasOperativas ?? null,
    };
  });
};

const calculateTotal = (items: QuotationItemInput[]): number => {
  return items.reduce((total, item) => total + Number(item.cantidad) * Number(item.precioUnitario), 0);
};

const assertClientExists = async (clientId: number, transaction: Transaction): Promise<void> => {
  const client = await Client.findByPk(clientId, { transaction });
  if (!client) {
    throw ApiError.badRequest('El cliente especificado no existe');
  }
};

const assertVehicleExists = async (vehicleId: number, transaction: Transaction): Promise<Vehicle> => {
  const vehicle = await Vehicle.findByPk(vehicleId, { transaction });
  if (!vehicle) {
    throw ApiError.badRequest('El vehículo especificado no existe');
  }

  return vehicle;
};

const assertCatalogItemsExist = async (
  items: QuotationItemInput[],
  transaction: Transaction,
): Promise<void> => {
  const catalogItemIds = [
    ...new Set(
      items
        .map((item) => item.catalogItemId)
        .filter(
          (catalogItemId): catalogItemId is number =>
            catalogItemId !== undefined && catalogItemId !== null,
        ),
    ),
  ];

  if (catalogItemIds.length === 0) {
    return;
  }

  const count = await CatalogItem.count({ where: { id: catalogItemIds }, transaction });
  if (count !== catalogItemIds.length) {
    throw ApiError.badRequest('Uno o más ítems de catálogo no existen');
  }
};

const getCompleteQuotation = async (
  id: number,
  transaction?: Transaction,
): Promise<Quotation> => {
  const quotation = await Quotation.findByPk(id, {
    include: [clientInclude, vehicleInclude, asesorInclude, workOrderInclude, itemsInclude],
    transaction,
  });

  if (!quotation) {
    throw ApiError.notFound('Cotización no encontrada');
  }

  return quotation;
};

const copyWorkOrderItems = (items: WorkOrderItem[]): QuotationItemInput[] => {
  return items.map((item) => ({
    catalogItemId: item.catalogItemId,
    descripcion: item.descripcion,
    cantidad: numberValue(item.cantidad),
    precioUnitario: numberValue(item.precioUnitario),
    estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas,
  }));
};

export const listQuotations = async (
  query: QuotationQueryInput,
): Promise<ListQuotationsResult> => {
  const pagination = getPagination(query);
  const where: QuotationWhere = {};

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: searchPattern } },
      { notas: { [Op.like]: searchPattern } },
      sequelizeWhere(col('client.nombre'), { [Op.like]: searchPattern }),
      sequelizeWhere(col('client.rut'), { [Op.like]: searchPattern }),
      sequelizeWhere(col('vehicle.patente'), { [Op.like]: searchPattern }),
    ];
  }

  if (query.estadoPago !== undefined) {
    where.estadoPago = query.estadoPago;
  }
  if (query.clientId !== undefined) {
    where.clientId = query.clientId;
  }
  if (query.vehicleId !== undefined) {
    where.vehicleId = query.vehicleId;
  }
  if (query.workOrderId !== undefined) {
    where.workOrderId = query.workOrderId;
  } else if (query.workOrderLinked !== undefined) {
    where.workOrderId = query.workOrderLinked ? { [Op.not]: null } : { [Op.is]: null };
  }

  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) {
      range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    }
    if (query.fechaHasta) {
      range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    }
    where.createdAt = range;
  }

  const { rows, count } = await Quotation.findAndCountAll({
    where,
    include: [clientInclude, vehicleInclude, asesorInclude, workOrderInclude],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return {
    items: rows.map(toQuotationPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getQuotationById = async (id: number): Promise<QuotationPublic> => {
  const quotation = await getCompleteQuotation(id);
  return toQuotationPublic(quotation);
};

export const createQuotation = async (
  data: CreateQuotationInput,
  asesorId: number,
): Promise<QuotationPublic> => {
  const quotationId = await sequelize.transaction(async (transaction) => {
    let clientId = data.clientId ?? null;
    let vehicleId = data.vehicleId ?? null;
    let items = data.items;

    if (data.workOrderId !== undefined && data.workOrderId !== null) {
      const workOrder = await WorkOrder.findByPk(data.workOrderId, {
        include: [{ model: WorkOrderItem }],
        transaction,
      });

      if (!workOrder) {
        throw ApiError.badRequest('La orden de trabajo especificada no existe');
      }
      if (workOrder.estado === 'cancelada') {
        throw ApiError.badRequest('No se puede cotizar una orden de trabajo cancelada');
      }

      const existingQuotation = await Quotation.findOne({
        where: { workOrderId: data.workOrderId },
        transaction,
      });
      if (existingQuotation) {
        throw ApiError.conflict('La orden de trabajo ya tiene una cotización vinculada');
      }

      clientId = clientId ?? workOrder.clientId;
      vehicleId = vehicleId ?? workOrder.vehicleId;

      if (items.length === 0 && workOrder.items) {
        items = copyWorkOrderItems(workOrder.items);
      }
    }

    if (clientId !== null) {
      await assertClientExists(clientId, transaction);
    }
    if (vehicleId !== null) {
      await assertVehicleExists(vehicleId, transaction);
    }
    await assertCatalogItemsExist(items, transaction);

    const total = calculateTotal(items);
    const codigo = await generateQuotationCode(transaction);
    const quotation = await Quotation.create(
      {
        codigo,
        workOrderId: data.workOrderId ?? null,
        clientId,
        vehicleId,
        asesorId,
        estadoPago: 'por_pagar',
        subtotal: total,
        total,
        pagado: 0,
        notas: data.notas ?? null,
      },
      { transaction },
    );

    if (items.length > 0) {
      await QuotationItem.bulkCreate(buildItemsPayload(quotation.id, items), { transaction });
    }

    return quotation.id;
  });

  return getQuotationById(quotationId);
};

export const updateQuotation = async (
  id: number,
  data: UpdateQuotationInput,
): Promise<QuotationPublic> => {
  const quotationId = await sequelize.transaction(async (transaction) => {
    const quotation = await Quotation.findByPk(id, { transaction });
    if (!quotation) {
      throw ApiError.notFound('Cotización no encontrada');
    }

    const updatePayload: Partial<Pick<Quotation, 'notas' | 'estadoPago' | 'subtotal' | 'total'>> = {};
    let nextTotal = numberValue(quotation.total);

    if (data.items !== undefined) {
      if (quotation.estadoPago === 'total') {
        throw ApiError.badRequest(
          'No se pueden modificar items de una cotización pagada en su totalidad',
        );
      }

      await assertCatalogItemsExist(data.items, transaction);
      const total = calculateTotal(data.items);
      if (total < numberValue(quotation.pagado)) {
        throw ApiError.badRequest('El nuevo total no puede ser inferior al monto ya pagado');
      }
      nextTotal = total;

      await QuotationItem.destroy({ where: { quotationId: id }, transaction });
      if (data.items.length > 0) {
        await QuotationItem.bulkCreate(buildItemsPayload(id, data.items), { transaction });
      }

      if (quotation.workOrderId !== null) {
        await WorkOrderItem.destroy({ where: { workOrderId: quotation.workOrderId }, transaction });
        if (data.items.length > 0) {
          await WorkOrderItem.bulkCreate(
            buildItemsPayload(id, data.items).map(({ quotationId: _qid, ...item }) => ({
              workOrderId: quotation.workOrderId!,
              ...item,
            })),
            { transaction },
          );
        }
      }

      updatePayload.subtotal = total;
      updatePayload.total = total;
    }

    if (data.notas !== undefined) {
      updatePayload.notas = data.notas;
    }
    const expectedFinancialStatus = getFinancialQuotationStatus(
      numberValue(quotation.pagado),
      nextTotal,
    );

    if (data.estadoPago !== undefined) {
      if (
        FINANCIAL_QUOTATION_STATUSES.has(data.estadoPago) &&
        data.estadoPago !== expectedFinancialStatus
      ) {
        throw ApiError.badRequest(
          `El estado de pago debe ser '${expectedFinancialStatus}' según los montos registrados`,
        );
      }
      updatePayload.estadoPago = data.estadoPago;
    } else if (
      data.items !== undefined &&
      FINANCIAL_QUOTATION_STATUSES.has(quotation.estadoPago)
    ) {
      updatePayload.estadoPago = expectedFinancialStatus;
    }

    await quotation.update(updatePayload, { transaction });
    return quotation.id;
  });

  return getQuotationById(quotationId);
};

export const convertQuotationToWorkOrder = async (
  quotationId: number,
  userId: number,
  data: ConvertQuotationInput = {},
): Promise<ConvertQuotationResult> => {
  const converted = await sequelize.transaction(async (transaction) => {
    const quotation = await Quotation.findByPk(quotationId, {
      include: [{ model: QuotationItem }],
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!quotation) {
      throw ApiError.notFound('Cotización no encontrada');
    }

    if (quotation.workOrderId !== null) {
      throw ApiError.badRequest(
        'Esta cotización ya está vinculada a una Orden de Trabajo existente',
      );
    }

    if (quotation.clientId === null && quotation.vehicleId === null) {
      throw ApiError.badRequest(
        'La cotización requiere un cliente o vehículo para generar una Orden de Trabajo',
      );
    }

    if (quotation.clientId !== null) {
      await assertClientExists(quotation.clientId, transaction);
    }
    const vehicle = quotation.vehicleId === null
      ? null
      : await assertVehicleExists(quotation.vehicleId, transaction);
    const vehicleOwner = vehicle?.clientId
      ? await Client.findByPk(vehicle.clientId, { transaction })
      : null;

    const codigo = await generateWorkOrderCode(transaction);
    const workOrder = await WorkOrder.create(
      {
        codigo,
        clientId: quotation.clientId,
         vehicleId: quotation.vehicleId,
         vehicleOwnerClientId: vehicle?.clientId ?? null,
         vehicleOwnerName: vehicleOwner?.nombre ?? null,
         vehicleOwnerRut: vehicleOwner?.rut ?? null,
         estado: 'borrador',
        descripcion:
          data.descripcion ??
          quotation.notas ??
          `Generada desde cotización ${quotation.codigo}`,
        kilometrajeIngreso: data.kilometrajeIngreso ?? null,
        fechaIngreso: toDateOrNull(data.fechaIngreso) ?? new Date(),
        fechaEntrega: toDateOrNull(data.fechaEntrega),
        createdBy: userId,
      },
      { transaction },
    );

    const items = quotation.items ?? [];
    if (items.length > 0) {
      await WorkOrderItem.bulkCreate(
        items.map((item) => ({
          workOrderId: workOrder.id,
          catalogItemId: item.catalogItemId,
          descripcion: item.descripcion,
          cantidad: numberValue(item.cantidad),
          precioUnitario: numberValue(item.precioUnitario),
          subtotal: numberValue(item.subtotal),
          estadoOperativo: item.estadoOperativo,
          notasOperativas: item.notasOperativas,
        })),
        { transaction, hooks: true },
      );
    }

    await quotation.update({ workOrderId: workOrder.id }, { transaction });

    return {
      quotationId: quotation.id,
      workOrderId: workOrder.id,
    };
  });

  const [quotation, workOrder] = await Promise.all([
    getQuotationById(converted.quotationId),
    getWorkOrderById(converted.workOrderId),
  ]);

  return { quotation, workOrder };
};

export const deleteQuotation = async (id: number): Promise<void> => {
  const quotation = await Quotation.findByPk(id);
  if (!quotation) {
    throw ApiError.notFound('Cotización no encontrada');
  }

  const paymentCount = await Payment.count({ where: { quotationId: id } });
  if (
    numberValue(quotation.pagado) > 0 ||
    paymentCount > 0 ||
    quotation.estadoPago !== 'por_pagar'
  ) {
    throw ApiError.badRequest('No se puede eliminar una cotización con pagos registrados');
  }

  await quotation.destroy();
};
