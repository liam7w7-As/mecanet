import { Op, Transaction } from 'sequelize';

import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { StockBalance } from '../models/StockBalance.js';
import { StockMovement } from '../models/StockMovement.js';
import { Warehouse } from '../models/Warehouse.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination } from '../utils/paginate.js';

import type {
  CreateStockMovementInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  StockMovementQueryInput,
  StockMovementType,
  UpdateWarehouseInput,
  WarehouseQueryInput,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

type WarehouseWhere = WhereOptions<InferAttributes<Warehouse>> & {
  [Op.or]?: WhereOptions<InferAttributes<Warehouse>>[];
};

export interface WarehousePublic {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
  totalItems: number;
  totalUnidades: number;
}

export interface ListWarehousesResult {
  items: WarehousePublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StockBalancePublic {
  warehouseId: number;
  catalogItemId: number;
  cantidad: number;
  codigo: string | null;
  nombre: string;
  precio: number;
  stockMinimo: number;
  bajoMinimo: boolean;
}

export interface StockMovementPublic {
  id: number;
  catalogItemId: number;
  warehouseId: number;
  tipo: StockMovementType;
  cantidad: number;
  saldoResultante: number;
  motivo: string;
  referencia: string | null;
  createdBy: number | null;
  fecha: Date;
  codigo: string | null;
  nombre: string;
  warehouseCodigo: string;
  warehouseNombre: string;
}

export interface ListStockMovementsResult {
  items: StockMovementPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const toWarehousePublic = (
  warehouse: Warehouse,
  totals?: { totalItems: number; totalUnidades: number },
): WarehousePublic => ({
  id: warehouse.id,
  codigo: warehouse.codigo,
  nombre: warehouse.nombre,
  direccion: warehouse.direccion,
  activo: warehouse.activo,
  totalItems: totals?.totalItems ?? 0,
  totalUnidades: totals?.totalUnidades ?? 0,
});

const toMovementPublic = (movement: StockMovement): StockMovementPublic => ({
  id: movement.id,
  catalogItemId: movement.catalogItemId,
  warehouseId: movement.warehouseId,
  tipo: movement.tipo,
  cantidad: Number(movement.cantidad),
  saldoResultante: Number(movement.saldoResultante),
  motivo: movement.motivo,
  referencia: movement.referencia,
  createdBy: movement.createdBy,
  fecha: movement.fecha,
  codigo: movement.catalogItem?.codigo ?? null,
  nombre: movement.catalogItem?.nombre ?? 'Ítem eliminado',
  warehouseCodigo: movement.warehouse?.codigo ?? '',
  warehouseNombre: movement.warehouse?.nombre ?? '',
});

const getOrCreateBalance = async (
  warehouseId: number,
  catalogItemId: number,
  transaction: Transaction,
): Promise<StockBalance> => {
  const [balance] = await StockBalance.findOrCreate({
    where: { warehouseId, catalogItemId },
    defaults: { warehouseId, catalogItemId, cantidad: 0 },
    transaction,
  });
  return balance;
};

/**
 * Mantiene el stock global de catalog_items como suma de los saldos
 * por almacén, para que el catálogo, el dashboard y la OT sigan viendo
 * un total coherente.
 */
export const syncGlobalStock = async (
  catalogItemId: number,
  transaction: Transaction,
): Promise<number> => {
  const total = await StockBalance.sum('cantidad', {
    where: { catalogItemId },
    transaction,
  }).catch(() => 0);
  const cantidad = Number(total ?? 0);
  await CatalogItem.update({ stock: cantidad }, { where: { id: catalogItemId }, transaction });
  return cantidad;
};

const getDefaultWarehouse = async (transaction: Transaction): Promise<Warehouse> => {
  const central = await Warehouse.findOne({
    where: { codigo: 'CENTRAL', activo: true },
    transaction,
  });
  if (central) return central;
  const first = await Warehouse.findOne({ where: { activo: true }, order: [['id', 'ASC']], transaction });
  if (!first) {
    throw ApiError.badRequest('No hay almacenes activos para descontar stock');
  }
  return first;
};

export interface WorkOrderConsumption {
  warehouseId: number;
  warehouseCodigo: string;
}

/**
 * Descuenta stock de un repuesto desde el almacén por defecto y lo
 * registra como consumo_ot con la referencia de la OT. Retorna el
 * almacén usado para poder devolverlo al mismo lugar.
 */
export const consumeForWorkOrder = async (
  args: {
    catalogItemId: number;
    cantidad: number;
    referencia: string;
    motivo: string;
    userId: number;
  },
  transaction: Transaction,
): Promise<WorkOrderConsumption> => {
  const catalogItem = await CatalogItem.findByPk(args.catalogItemId, { transaction });
  if (!catalogItem || catalogItem.tipo !== 'parte') {
    throw ApiError.badRequest('Solo los repuestos (tipo parte) manejan stock por almacén');
  }

  const warehouse = await getDefaultWarehouse(transaction);
  const balance = await getOrCreateBalance(warehouse.id, catalogItem.id, transaction);
  if (balance.cantidad < args.cantidad) {
    throw ApiError.badRequest(
      `Stock insuficiente en ${warehouse.codigo} para ${catalogItem.nombre}. Disponible: ${balance.cantidad}, requerido: ${args.cantidad}`,
    );
  }

  const nuevoSaldo = balance.cantidad - args.cantidad;
  await balance.update({ cantidad: nuevoSaldo }, { transaction });
  await StockMovement.create(
    {
      catalogItemId: catalogItem.id,
      warehouseId: warehouse.id,
      tipo: 'consumo_ot',
      cantidad: args.cantidad,
      saldoResultante: nuevoSaldo,
      motivo: args.motivo,
      referencia: args.referencia,
      createdBy: args.userId,
    },
    { transaction },
  );
  await syncGlobalStock(catalogItem.id, transaction);

  return { warehouseId: warehouse.id, warehouseCodigo: warehouse.codigo };
};

/**
 * Devuelve al almacén donde se consumió (ingreso por devolución) y
 * sincroniza el stock global.
 */
export const restoreForWorkOrder = async (
  args: {
    catalogItemId: number;
    cantidad: number;
    warehouseId: number | null;
    referencia: string;
    motivo: string;
    userId: number;
  },
  transaction: Transaction,
): Promise<void> => {
  if (args.cantidad <= 0) return;
  const warehouse =
    args.warehouseId !== null
      ? await Warehouse.findByPk(args.warehouseId, { transaction })
      : null;
  const target = warehouse ?? (await getDefaultWarehouse(transaction));

  const balance = await getOrCreateBalance(target.id, args.catalogItemId, transaction);
  const nuevoSaldo = balance.cantidad + args.cantidad;
  await balance.update({ cantidad: nuevoSaldo }, { transaction });
  await StockMovement.create(
    {
      catalogItemId: args.catalogItemId,
      warehouseId: target.id,
      tipo: 'ingreso',
      cantidad: args.cantidad,
      saldoResultante: nuevoSaldo,
      motivo: args.motivo,
      referencia: args.referencia,
      createdBy: args.userId,
    },
    { transaction },
  );
  await syncGlobalStock(args.catalogItemId, transaction);
};

export const listWarehouses = async (
  query: WarehouseQueryInput,
): Promise<ListWarehousesResult> => {
  const pagination = getPagination(query);
  const where: WarehouseWhere = {};

  if (query.soloActivos === true) {
    where.activo = true;
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    where[Op.or] = [{ nombre: { [Op.like]: pattern } }, { codigo: { [Op.like]: pattern } }];
  }

  const { rows, count } = await Warehouse.findAndCountAll({
    where,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['nombre', 'ASC']],
  });

  const balances = await StockBalance.findAll({
    where: { warehouseId: rows.map((row) => row.id) },
    attributes: ['warehouseId', 'catalogItemId', 'cantidad'],
  });
  const totalsByWarehouse = new Map<number, { totalItems: number; totalUnidades: number }>();
  for (const balance of balances) {
    const entry = totalsByWarehouse.get(balance.warehouseId) ?? { totalItems: 0, totalUnidades: 0 };
    if (balance.cantidad > 0) entry.totalItems += 1;
    entry.totalUnidades += balance.cantidad;
    totalsByWarehouse.set(balance.warehouseId, entry);
  }

  return {
    items: rows.map((row) => toWarehousePublic(row, totalsByWarehouse.get(row.id))),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const createWarehouse = async (data: CreateWarehouseInput): Promise<WarehousePublic> => {
  const existing = await Warehouse.findOne({ where: { codigo: data.codigo } });
  if (existing) {
    throw ApiError.conflict('Ya existe un almacén con ese código');
  }
  const warehouse = await Warehouse.create({ ...data });
  return toWarehousePublic(warehouse);
};

export const updateWarehouse = async (
  id: number,
  data: UpdateWarehouseInput,
): Promise<WarehousePublic> => {
  const warehouse = await Warehouse.findByPk(id);
  if (!warehouse) {
    throw ApiError.notFound('Almacén no encontrado');
  }
  await warehouse.update({ ...data });
  return toWarehousePublic(warehouse);
};

export const getWarehouseBalances = async (warehouseId: number): Promise<StockBalancePublic[]> => {
  const warehouse = await Warehouse.findByPk(warehouseId);
  if (!warehouse) {
    throw ApiError.notFound('Almacén no encontrado');
  }
  const balances = await StockBalance.findAll({
    where: { warehouseId },
    include: [{ model: CatalogItem, attributes: ['codigo', 'nombre', 'precio', 'stockMinimo'] }],
    order: [[{ model: CatalogItem, as: 'catalogItem' }, 'nombre', 'ASC']],
  });
  return balances.map((balance) => {
    const minimo = Number(balance.catalogItem?.stockMinimo ?? 0);
    return {
      warehouseId: balance.warehouseId,
      catalogItemId: balance.catalogItemId,
      cantidad: balance.cantidad,
      codigo: balance.catalogItem?.codigo ?? null,
      nombre: balance.catalogItem?.nombre ?? 'Ítem eliminado',
      precio: Number(balance.catalogItem?.precio ?? 0),
      stockMinimo: minimo,
      bajoMinimo: balance.cantidad <= minimo,
    };
  });
};

export const registerMovement = async (
  data: CreateStockMovementInput,
  userId: number,
): Promise<StockMovementPublic> => {
  const warehouse = await Warehouse.findByPk(data.warehouseId);
  if (!warehouse) {
    throw ApiError.notFound('Almacén no encontrado');
  }
  if (!warehouse.activo) {
    throw ApiError.badRequest('El almacén está inactivo');
  }
  const catalogItem = await CatalogItem.findByPk(data.catalogItemId);
  if (!catalogItem) {
    throw ApiError.notFound('Ítem de catálogo no encontrado');
  }
  if (catalogItem.tipo !== 'parte') {
    throw ApiError.badRequest('Solo los repuestos (tipo parte) manejan stock por almacén');
  }

  const cantidad = Math.trunc(data.cantidad);

  return sequelize.transaction(async (transaction) => {
    const balance = await getOrCreateBalance(data.warehouseId, data.catalogItemId, transaction);
    let nuevoSaldo: number;

    if (data.tipo === 'ingreso') {
      nuevoSaldo = balance.cantidad + cantidad;
    } else if (data.tipo === 'salida') {
      if (balance.cantidad < cantidad) {
        throw ApiError.badRequest(
          `Stock insuficiente en ${warehouse.codigo}. Disponible: ${balance.cantidad}, solicitado: ${cantidad}`,
        );
      }
      nuevoSaldo = balance.cantidad - cantidad;
    } else {
      nuevoSaldo = cantidad;
    }

    await balance.update({ cantidad: nuevoSaldo }, { transaction });
    await syncGlobalStock(data.catalogItemId, transaction);
    const movement = await StockMovement.create(
      {
        catalogItemId: data.catalogItemId,
        warehouseId: data.warehouseId,
        tipo: data.tipo === 'ajuste' ? 'ajuste' : data.tipo,
        cantidad,
        saldoResultante: nuevoSaldo,
        motivo: data.motivo,
        referencia: null,
        createdBy: userId,
      },
      { transaction },
    );

    const full = await StockMovement.findByPk(movement.id, {
      include: [
        { model: CatalogItem, attributes: ['codigo', 'nombre'] },
        { model: Warehouse, attributes: ['codigo', 'nombre'] },
      ],
      transaction,
    });
    if (!full) {
      throw ApiError.internal('No fue posible registrar el movimiento');
    }
    return toMovementPublic(full);
  });
};

export interface StockTransferResult {
  salida: StockMovementPublic;
  ingreso: StockMovementPublic;
  referencia: string;
}

/**
 * Traslado entre almacenes con doble entrada atómica: salida en origen
 * y ingreso en destino con la misma referencia de trazabilidad.
 */
export const registerTransfer = async (
  data: CreateStockTransferInput,
  userId: number,
): Promise<StockTransferResult> => {
  const [origin, destination, catalogItem] = await Promise.all([
    Warehouse.findByPk(data.originWarehouseId),
    Warehouse.findByPk(data.destinationWarehouseId),
    CatalogItem.findByPk(data.catalogItemId),
  ]);

  if (!origin) {
    throw ApiError.notFound('Almacén origen no encontrado');
  }
  if (!destination) {
    throw ApiError.notFound('Almacén destino no encontrado');
  }
  if (!origin.activo || !destination.activo) {
    throw ApiError.badRequest('Origen y destino deben estar activos');
  }
  if (!catalogItem) {
    throw ApiError.notFound('Ítem de catálogo no encontrado');
  }
  if (catalogItem.tipo !== 'parte') {
    throw ApiError.badRequest('Solo los repuestos (tipo parte) manejan stock por almacén');
  }

  const cantidad = Math.trunc(data.cantidad);
  const referencia = `TRAS-${Date.now().toString(36).toUpperCase()}`;

  const [salida, ingreso] = await sequelize.transaction(async (transaction) => {
    const originBalance = await getOrCreateBalance(origin.id, catalogItem.id, transaction);
    if (originBalance.cantidad < cantidad) {
      throw ApiError.badRequest(
        `Stock insuficiente en ${origin.codigo}. Disponible: ${originBalance.cantidad}, solicitado: ${cantidad}`,
      );
    }

    const nuevoSaldoOrigen = originBalance.cantidad - cantidad;
    await originBalance.update({ cantidad: nuevoSaldoOrigen }, { transaction });
    const salidaMovement = await StockMovement.create(
      {
        catalogItemId: catalogItem.id,
        warehouseId: origin.id,
        tipo: 'traslado_salida',
        cantidad,
        saldoResultante: nuevoSaldoOrigen,
        motivo: data.motivo,
        referencia,
        createdBy: userId,
      },
      { transaction },
    );

    const destinationBalance = await getOrCreateBalance(destination.id, catalogItem.id, transaction);
    const nuevoSaldoDestino = destinationBalance.cantidad + cantidad;
    await destinationBalance.update({ cantidad: nuevoSaldoDestino }, { transaction });
    await syncGlobalStock(catalogItem.id, transaction);
    const ingresoMovement = await StockMovement.create(
      {
        catalogItemId: catalogItem.id,
        warehouseId: destination.id,
        tipo: 'traslado_ingreso',
        cantidad,
        saldoResultante: nuevoSaldoDestino,
        motivo: data.motivo,
        referencia,
        createdBy: userId,
      },
      { transaction },
    );

    return [salidaMovement, ingresoMovement];
  });

  const [fullSalida, fullIngreso] = await Promise.all([
    StockMovement.findByPk(salida.id, {
      include: [
        { model: CatalogItem, attributes: ['codigo', 'nombre'] },
        { model: Warehouse, attributes: ['codigo', 'nombre'] },
      ],
    }),
    StockMovement.findByPk(ingreso.id, {
      include: [
        { model: CatalogItem, attributes: ['codigo', 'nombre'] },
        { model: Warehouse, attributes: ['codigo', 'nombre'] },
      ],
    }),
  ]);
  if (!fullSalida || !fullIngreso) {
    throw ApiError.internal('No fue posible registrar el traslado');
  }

  return { salida: toMovementPublic(fullSalida), ingreso: toMovementPublic(fullIngreso), referencia };
};

export const listMovements = async (
  query: StockMovementQueryInput,
): Promise<ListStockMovementsResult> => {
  const pagination = getPagination(query);
  const where: WhereOptions<InferAttributes<StockMovement>> = {};

  if (query.catalogItemId !== undefined) where.catalogItemId = query.catalogItemId;
  if (query.warehouseId !== undefined) where.warehouseId = query.warehouseId;
  if (query.tipo !== undefined) where.tipo = query.tipo;
  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    if (query.fechaHasta) range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    where.fecha = range;
  }

  const { rows, count } = await StockMovement.findAndCountAll({
    where,
    include: [
      { model: CatalogItem, attributes: ['codigo', 'nombre'] },
      { model: Warehouse, attributes: ['codigo', 'nombre'] },
    ],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['fecha', 'DESC']],
  });

  return {
    items: rows.map(toMovementPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};
