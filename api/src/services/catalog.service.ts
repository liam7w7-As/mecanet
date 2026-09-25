import { Op, Transaction } from 'sequelize';

import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination } from '../utils/paginate.js';

import type {
  CatalogItemQueryInput,
  CatalogType,
  CreateCatalogItemInput,
  UnitMeasure,
  UpdateCatalogItemInput,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

export interface CatalogItemPublic {
  id: number;
  tipo: CatalogType;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  unidadMedida: UnitMeasure;
  precio: number;
  stock: number;
  stockMinimo: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListCatalogItemsResult {
  items: CatalogItemPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StockAdjustmentResult {
  item: CatalogItemPublic;
  stockAnterior: number;
  nuevoStock: number;
  delta: number;
  motivo: string | null;
}

type CatalogItemWhere = WhereOptions<InferAttributes<CatalogItem>> & {
  [Op.or]?: WhereOptions<InferAttributes<CatalogItem>>[];
};

const toCatalogItemPublic = (item: CatalogItem): CatalogItemPublic => ({
  id: item.id,
  tipo: item.tipo,
  codigo: item.codigo,
  nombre: item.nombre,
  descripcion: item.descripcion,
  unidadMedida: item.unidadMedida,
  precio: Number(item.precio),
  stock: Number(item.stock),
  stockMinimo: Number(item.stockMinimo ?? 0),
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const normalizeCode = (code: string | null | undefined): string | null | undefined => {
  if (code === undefined || code === null) {
    return code;
  }

  const normalized = code.trim().toUpperCase();
  return normalized === '' ? null : normalized;
};

const assertCodeAvailable = async (
  code: string | null,
  excludeId?: number,
): Promise<void> => {
  if (code === null) {
    return;
  }

  const where: CatalogItemWhere = { codigo: code };
  if (excludeId !== undefined) {
    where.id = { [Op.ne]: excludeId };
  }

  const existing = await CatalogItem.findOne({ where });
  if (existing) {
    throw ApiError.conflict('Ya existe un item con ese código');
  }
};

export const listCatalogItems = async (
  query: CatalogItemQueryInput,
): Promise<ListCatalogItemsResult> => {
  const pagination = getPagination(query);
  const where: CatalogItemWhere = {};

  if (query.tipo !== undefined) {
    where.tipo = query.tipo;
  }

  if (query.search) {
    const pattern = `%${query.search}%`;
    where[Op.or] = [{ nombre: { [Op.like]: pattern } }, { codigo: { [Op.like]: pattern } }];
  }

  if (query.soloConStock === true) {
    if (query.tipo === undefined) {
      where.tipo = 'parte';
    }
    where.stock = { [Op.gt]: 0 };
  }

  const { rows, count } = await CatalogItem.findAndCountAll({
    where,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [
      ['nombre', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  return {
    items: rows.map(toCatalogItemPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getCatalogItemById = async (id: number): Promise<CatalogItemPublic> => {
  const item = await CatalogItem.findByPk(id);
  if (!item) {
    throw ApiError.notFound('Item de catálogo no encontrado');
  }

  return toCatalogItemPublic(item);
};

export const createCatalogItem = async (
  data: CreateCatalogItemInput,
): Promise<CatalogItemPublic> => {
  const codigo = normalizeCode(data.codigo) ?? null;
  await assertCodeAvailable(codigo);

  const item = await CatalogItem.create({
    tipo: data.tipo,
    codigo,
    nombre: data.nombre,
    descripcion: data.descripcion ?? null,
    unidadMedida: data.unidadMedida,
    precio: data.precio,
    stock: data.tipo === 'parte' ? data.stock : 0,
    stockMinimo: data.tipo === 'parte' ? data.stockMinimo : 0,
  });

  return toCatalogItemPublic(item);
};

export const updateCatalogItem = async (
  id: number,
  data: UpdateCatalogItemInput,
): Promise<CatalogItemPublic> => {
  const item = await CatalogItem.findByPk(id);
  if (!item) {
    throw ApiError.notFound('Item de catálogo no encontrado');
  }

  const nextType = data.tipo ?? item.tipo;
  const updatePayload: Partial<
    Pick<CatalogItem, 'tipo' | 'codigo' | 'nombre' | 'descripcion' | 'unidadMedida' | 'precio' | 'stock' | 'stockMinimo'>
  > = {};

  if (data.tipo !== undefined) {
    updatePayload.tipo = data.tipo;
  }

  if (data.codigo !== undefined) {
    const codigo = normalizeCode(data.codigo) ?? null;
    if (codigo !== item.codigo) {
      await assertCodeAvailable(codigo, item.id);
    }
    updatePayload.codigo = codigo;
  }

  if (data.nombre !== undefined) {
    updatePayload.nombre = data.nombre;
  }

  if (data.descripcion !== undefined) {
    updatePayload.descripcion = data.descripcion;
  }

  if (data.unidadMedida !== undefined) {
    updatePayload.unidadMedida = data.unidadMedida;
  }

  if (data.precio !== undefined) {
    updatePayload.precio = data.precio;
  }

  if (nextType !== 'parte') {
    updatePayload.stock = 0;
    updatePayload.stockMinimo = 0;
  } else {
    if (data.stock !== undefined) {
      updatePayload.stock = data.stock;
    }
    if (data.stockMinimo !== undefined) {
      updatePayload.stockMinimo = data.stockMinimo;
    }
  }

  await item.update(updatePayload);
  return toCatalogItemPublic(item);
};

export const adjustStock = async (
  id: number,
  delta: number,
  motivo?: string,
): Promise<StockAdjustmentResult> => {
  return sequelize.transaction(async (transaction) => {
    const item = await CatalogItem.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!item) {
      throw ApiError.notFound('Item de catálogo no encontrado');
    }

    if (item.tipo !== 'parte') {
      throw ApiError.badRequest('Solo los repuestos (tipo parte) manejan inventario de stock');
    }

    const stockAnterior = Number(item.stock);
    const nuevoStock = stockAnterior + delta;
    if (nuevoStock < 0) {
      throw ApiError.badRequest(
        `Stock insuficiente. Stock actual: ${stockAnterior}, intento de rebaja: ${Math.abs(delta)}`,
      );
    }

    await item.update({ stock: nuevoStock }, { transaction });

    return {
      item: toCatalogItemPublic(item),
      stockAnterior,
      nuevoStock,
      delta,
      motivo: motivo ?? null,
    };
  });
};

export const deleteCatalogItem = async (id: number): Promise<void> => {
  const item = await CatalogItem.findByPk(id);
  if (!item) {
    throw ApiError.notFound('Item de catálogo no encontrado');
  }

  await item.destroy();
};
