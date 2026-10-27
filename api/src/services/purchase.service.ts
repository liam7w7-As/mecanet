import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  calculatePurchaseTotals,
  isSupplierDataComplete,
  type CreatePurchaseInput,
  type PaymentMethod,
  type PurchaseDocumentType,
  type PurchasePaymentType,
  type PurchaseQueryInput,
  type PurchaseReportQueryInput,
  type PurchaseStatus,
  type PurchaseVehicleOrigin,
  type RegisterPurchasePaymentInput,
} from '@unithor/shared';
import { Op, Transaction } from 'sequelize';

import { readStoredFile, removeStoredFile, storeFile } from './file-storage.service.js';
import { registerMovement } from './warehouse.service.js';
import { sequelize } from '../config/database.js';
import { CashMovement } from '../models/CashMovement.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { FleetVehicle } from '../models/FleetVehicle.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseItem } from '../models/PurchaseItem.js';
import { Supplier } from '../models/Supplier.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { Warehouse } from '../models/Warehouse.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { ApiError } from '../utils/ApiError.js';
import { generatePurchaseCode } from '../utils/generateCode.js';
import { getPagination } from '../utils/paginate.js';
import { detectReceiptFile, getReceiptMimeType } from '../utils/receipt-file.js';

import type { SupplierQueryInput, UpdateSupplierInput } from '@unithor/shared';
import type { Includeable, InferAttributes, Order, WhereOptions } from 'sequelize';

type PurchaseWhere = WhereOptions<InferAttributes<Purchase>> & {
  [Op.or]?: WhereOptions<InferAttributes<Purchase>>[];
};

export interface SupplierPublic {
  id: number;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contactoNombre: string | null;
  notas: string | null;
  datosCompletos: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListSuppliersResult {
  items: SupplierPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PurchaseCatalogPublic {
  id: number;
  codigo: string | null;
  nombre: string;
}

export interface PurchaseWarehousePublic {
  id: number;
  codigo: string;
  nombre: string;
}

export interface PurchaseItemPublic {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  afectaStock: boolean;
  warehouseId: number | null;
  catalogItem: PurchaseCatalogPublic | null;
  warehouse: PurchaseWarehousePublic | null;
}

export interface PurchaseSupplierPublic {
  id: number;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contactoNombre: string | null;
  datosCompletos: boolean;
}

export interface PurchaseVehiclePublic {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

export interface PurchaseWorkOrderPublic {
  id: number;
  codigo: string;
  estado: string;
}

export interface PurchaseCashMovementPublic {
  id: number;
  monto: number;
  metodo: PaymentMethod;
  fecha: Date;
  voidedAt: Date | null;
}

export interface PurchasePublic {
  id: number;
  codigo: string;
  supplierId: number;
  vehicleId: number | null;
  fleetVehicleId: number | null;
  workOrderId: number | null;
  origenVehiculo: PurchaseVehicleOrigin | null;
  conIva: boolean;
  neto: number;
  iva: number;
  total: number;
  formaPago: PurchasePaymentType;
  metodoPago: PaymentMethod;
  estado: PurchaseStatus;
  tipoDocumento: PurchaseDocumentType;
  folio: string;
  fechaEmision: string;
  montoComprobante: number;
  numeroOperacion: string;
  banco: string;
  comprobanteNombre: string;
  comprobanteMimeType: string;
  comprobanteSizeBytes: number;
  observaciones: string | null;
  cashMovementId: number | null;
  pagadoAt: Date | null;
  createdBy: number | null;
  voidedAt: Date | null;
  voidedBy: number | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  supplier: PurchaseSupplierPublic;
  vehicle: PurchaseVehiclePublic | null;
  fleetVehicle: PurchaseVehiclePublic | null;
  workOrder: PurchaseWorkOrderPublic | null;
  creator: { id: number; nombre: string } | null;
  voider: { id: number; nombre: string } | null;
  cashMovement: PurchaseCashMovementPublic | null;
  items: PurchaseItemPublic[];
}

export interface PurchaseSummary {
  count: number;
  neto: number;
  iva: number;
  total: number;
  pendiente: number;
}

export interface ListPurchasesResult {
  items: PurchasePublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: PurchaseSummary;
}

export interface PurchaseReceipt {
  purchase: PurchasePublic;
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

const userAttributes = ['id', 'nombre'];

const supplierInclude = {
  model: Supplier,
  as: 'supplier',
  required: false,
  attributes: [
    'id',
    'nombre',
    'rut',
    'telefono',
    'email',
    'direccion',
    'contactoNombre',
    'datosCompletos',
  ],
};

const vehicleInclude = {
  model: Vehicle,
  as: 'vehicle',
  required: false,
  attributes: ['id', 'patente', 'marca', 'modelo'],
};

const fleetVehicleInclude = {
  model: FleetVehicle,
  as: 'fleetVehicle',
  required: false,
  attributes: ['id', 'patente', 'marca', 'modelo'],
};

const workOrderInclude = {
  model: WorkOrder,
  as: 'workOrder',
  required: false,
  attributes: ['id', 'codigo', 'estado'],
};

const creatorInclude = { model: User, as: 'creator', attributes: userAttributes, required: false };
const voiderInclude = { model: User, as: 'voider', attributes: userAttributes, required: false };
const cashMovementInclude = {
  model: CashMovement,
  as: 'cashMovement',
  required: false,
  attributes: ['id', 'monto', 'metodo', 'fecha', 'voidedAt'],
};

const itemsInclude: Includeable = {
  model: PurchaseItem,
  as: 'items',
  separate: true,
  order: [['id', 'ASC']] as Order,
  include: [
    { model: CatalogItem, as: 'catalogItem', attributes: ['id', 'codigo', 'nombre'], required: false },
    { model: Warehouse, as: 'warehouse', attributes: ['id', 'codigo', 'nombre'], required: false },
  ],
};

const purchaseIncludes: Includeable[] = [
  supplierInclude,
  vehicleInclude,
  fleetVehicleInclude,
  workOrderInclude,
  creatorInclude,
  voiderInclude,
  cashMovementInclude,
  itemsInclude,
];

const numberValue = (value: number | string | null | undefined): number => Number(value ?? 0);
const moneyValue = (value: number | string | null | undefined): number =>
  Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;

const toSupplierPublic = (supplier: Supplier): SupplierPublic => ({
  id: supplier.id,
  nombre: supplier.nombre,
  rut: supplier.rut,
  telefono: supplier.telefono,
  email: supplier.email,
  direccion: supplier.direccion,
  contactoNombre: supplier.contactoNombre,
  notas: supplier.notas,
  datosCompletos: supplier.datosCompletos,
  createdAt: supplier.createdAt,
  updatedAt: supplier.updatedAt,
});

const toSupplierSummary = (supplier: Supplier): PurchaseSupplierPublic => ({
  id: supplier.id,
  nombre: supplier.nombre,
  rut: supplier.rut,
  telefono: supplier.telefono,
  email: supplier.email,
  direccion: supplier.direccion,
  contactoNombre: supplier.contactoNombre,
  datosCompletos: supplier.datosCompletos,
});

const toItemPublic = (item: PurchaseItem): PurchaseItemPublic => ({
  id: item.id,
  catalogItemId: item.catalogItemId,
  descripcion: item.descripcion,
  cantidad: numberValue(item.cantidad),
  precioUnitario: moneyValue(item.precioUnitario),
  subtotal: moneyValue(item.subtotal),
  afectaStock: item.afectaStock,
  warehouseId: item.warehouseId,
  catalogItem: item.catalogItem
    ? { id: item.catalogItem.id, codigo: item.catalogItem.codigo, nombre: item.catalogItem.nombre }
    : null,
  warehouse: item.warehouse
    ? { id: item.warehouse.id, codigo: item.warehouse.codigo, nombre: item.warehouse.nombre }
    : null,
});

const toPurchasePublic = (purchase: Purchase): PurchasePublic => {
  if (!purchase.supplier) {
    throw ApiError.internal('La compra no tiene proveedor disponible');
  }

  return {
    id: purchase.id,
    codigo: purchase.codigo,
    supplierId: purchase.supplierId,
    vehicleId: purchase.vehicleId,
    fleetVehicleId: purchase.fleetVehicleId,
    workOrderId: purchase.workOrderId,
    origenVehiculo: purchase.origenVehiculo,
    conIva: purchase.conIva,
    neto: moneyValue(purchase.neto),
    iva: moneyValue(purchase.iva),
    total: moneyValue(purchase.total),
    formaPago: purchase.formaPago,
    metodoPago: purchase.metodoPago,
    estado: purchase.estado,
    tipoDocumento: purchase.tipoDocumento,
    folio: purchase.folio,
    fechaEmision: purchase.fechaEmision,
    montoComprobante: moneyValue(purchase.montoComprobante),
    numeroOperacion: purchase.numeroOperacion,
    banco: purchase.banco,
    comprobanteNombre: purchase.comprobanteNombre,
    comprobanteMimeType: purchase.comprobanteMimeType,
    comprobanteSizeBytes: numberValue(purchase.comprobanteSizeBytes),
    observaciones: purchase.observaciones,
    cashMovementId: purchase.cashMovementId,
    pagadoAt: purchase.pagadoAt,
    createdBy: purchase.createdBy,
    voidedAt: purchase.voidedAt,
    voidedBy: purchase.voidedBy,
    voidReason: purchase.voidReason,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
    supplier: toSupplierSummary(purchase.supplier),
    vehicle: purchase.vehicle
      ? {
          id: purchase.vehicle.id,
          patente: purchase.vehicle.patente,
          marca: purchase.vehicle.marca,
          modelo: purchase.vehicle.modelo,
        }
      : null,
    fleetVehicle: purchase.fleetVehicle
      ? {
          id: purchase.fleetVehicle.id,
          patente: purchase.fleetVehicle.patente,
          marca: purchase.fleetVehicle.marca,
          modelo: purchase.fleetVehicle.modelo,
        }
      : null,
    workOrder: purchase.workOrder
      ? {
          id: purchase.workOrder.id,
          codigo: purchase.workOrder.codigo,
          estado: purchase.workOrder.estado,
        }
      : null,
    creator: purchase.creator
      ? { id: purchase.creator.id, nombre: purchase.creator.nombre }
      : null,
    voider: purchase.voider ? { id: purchase.voider.id, nombre: purchase.voider.nombre } : null,
    cashMovement: purchase.cashMovement
      ? {
          id: purchase.cashMovement.id,
          monto: moneyValue(purchase.cashMovement.monto),
          metodo: purchase.cashMovement.metodo,
          fecha: purchase.cashMovement.fecha,
          voidedAt: purchase.cashMovement.voidedAt,
        }
      : null,
    items: (purchase.items ?? []).map(toItemPublic),
  };
};

const buildPurchaseWhere = (
  query: PurchaseQueryInput | PurchaseReportQueryInput,
): PurchaseWhere => {
  const where: PurchaseWhere = {};

  if (query.estado !== undefined) where.estado = query.estado;
  if (query.formaPago !== undefined) where.formaPago = query.formaPago;
  if (query.tipoDocumento !== undefined) where.tipoDocumento = query.tipoDocumento;
  if (query.proveedorId !== undefined) where.supplierId = query.proveedorId;

  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    if (query.fechaHasta) range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    where.createdAt = range;
  }

  if (query.search) {
    const pattern = `%${query.search}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: pattern } },
      { folio: { [Op.like]: pattern } },
      { banco: { [Op.like]: pattern } },
      { numeroOperacion: { [Op.like]: pattern } },
      { '$supplier.nombre$': { [Op.like]: pattern } },
      { '$supplier.rut$': { [Op.like]: pattern } },
      { '$vehicle.patente$': { [Op.like]: pattern } },
      { '$fleetVehicle.patente$': { [Op.like]: pattern } },
      { '$workOrder.codigo$': { [Op.like]: pattern } },
    ] as WhereOptions<InferAttributes<Purchase>>[];
  }

  return where;
};

const searchIncludes: Includeable[] = [
  supplierInclude,
  vehicleInclude,
  fleetVehicleInclude,
  workOrderInclude,
];

export const listSuppliers = async (query: SupplierQueryInput): Promise<ListSuppliersResult> => {
  const pagination = getPagination(query);
  const where: WhereOptions<InferAttributes<Supplier>> = {};

  if (query.soloIncompletos === true) where.datosCompletos = false;
  if (query.search) {
    const pattern = `%${query.search}%`;
    Object.assign(where, {
      [Op.or]: [
        { nombre: { [Op.like]: pattern } },
        { rut: { [Op.like]: pattern } },
        { email: { [Op.like]: pattern } },
        { telefono: { [Op.like]: pattern } },
      ],
    });
  }

  const { rows, count } = await Supplier.findAndCountAll({
    where,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [
      ['datosCompletos', 'ASC'],
      ['nombre', 'ASC'],
    ],
  });

  return {
    items: rows.map(toSupplierPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getSupplierById = async (id: number): Promise<SupplierPublic> => {
  const supplier = await Supplier.findByPk(id);
  if (!supplier) throw ApiError.notFound('Proveedor no encontrado');
  return toSupplierPublic(supplier);
};

export const updateSupplier = async (
  id: number,
  data: UpdateSupplierInput,
): Promise<SupplierPublic> => {
  const supplier = await Supplier.findByPk(id);
  if (!supplier) throw ApiError.notFound('Proveedor no encontrado');

  if (data.rut) {
    const duplicate = await Supplier.findOne({ where: { rut: data.rut, id: { [Op.ne]: id } } });
    if (duplicate) {
      throw ApiError.conflict('Ya existe un proveedor con ese RUT');
    }
  }

  await supplier.update({ ...data });
  supplier.datosCompletos = isSupplierDataComplete({
    nombre: supplier.nombre,
    rut: supplier.rut,
    telefono: supplier.telefono,
    email: supplier.email,
  });
  await supplier.save();

  return toSupplierPublic(supplier);
};

export const listPurchases = async (query: PurchaseQueryInput): Promise<ListPurchasesResult> => {
  const pagination = getPagination(query);
  const where = buildPurchaseWhere(query);

  const { rows, count } = await Purchase.findAndCountAll({
    where,
    include: purchaseIncludes,
    distinct: true,
    subQuery: false,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  const summaryRows = await Purchase.findAll({
    where,
    include: searchIncludes,
    subQuery: false,
    attributes: ['id', 'neto', 'iva', 'total', 'estado', 'formaPago', 'pagadoAt'],
  });

  const summary = summaryRows.reduce<PurchaseSummary>(
    (accumulator, purchase) => {
      accumulator.count += 1;
      if (purchase.estado === 'registrada') {
        accumulator.neto = moneyValue(accumulator.neto + numberValue(purchase.neto));
        accumulator.iva = moneyValue(accumulator.iva + numberValue(purchase.iva));
        accumulator.total = moneyValue(accumulator.total + numberValue(purchase.total));
        if (purchase.formaPago === 'credito' && !purchase.pagadoAt) {
          accumulator.pendiente = moneyValue(accumulator.pendiente + numberValue(purchase.total));
        }
      }
      return accumulator;
    },
    { count: 0, neto: 0, iva: 0, total: 0, pendiente: 0 },
  );

  return {
    items: rows.map(toPurchasePublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
    summary,
  };
};

export const getPurchaseById = async (id: number): Promise<PurchasePublic> => {
  const purchase = await Purchase.findByPk(id, { include: purchaseIncludes });
  if (!purchase) throw ApiError.notFound('Compra no encontrada');
  return toPurchasePublic(purchase);
};

export const getPurchasesForReport = async (
  filters: PurchaseReportQueryInput,
): Promise<PurchasePublic[]> => {
  const purchases = await Purchase.findAll({
    where: buildPurchaseWhere(filters),
    include: purchaseIncludes,
    subQuery: false,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });
  return purchases.map(toPurchasePublic);
};

const resolveSupplier = async (
  data: CreatePurchaseInput,
  transaction: Transaction,
): Promise<Supplier> => {
  if (data.proveedorId != null) {
    const supplier = await Supplier.findByPk(data.proveedorId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!supplier) throw ApiError.badRequest('El proveedor seleccionado no existe');
    return supplier;
  }

  const nombre = data.proveedorNombre?.trim();
  if (!nombre) throw ApiError.badRequest('Selecciona un proveedor o escribe su nombre');

  const existing = await Supplier.findOne({
    where: { nombre },
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (existing) return existing;

  const created = await Supplier.create(
    {
      nombre,
      rut: null,
      telefono: null,
      email: null,
      direccion: null,
      contactoNombre: null,
      notas: null,
      datosCompletos: false,
    },
    { transaction },
  );
  return created;
};

interface ResolvedVehicle {
  origenVehiculo: PurchaseVehicleOrigin | null;
  vehicleId: number | null;
  fleetVehicleId: number | null;
  workOrderId: number | null;
}

const resolveVehicle = async (
  data: CreatePurchaseInput,
  transaction: Transaction,
): Promise<ResolvedVehicle> => {
  let origenVehiculo: PurchaseVehicleOrigin | null = null;

  if (data.fleetVehicleId != null) {
    const fleetVehicle = await FleetVehicle.findByPk(data.fleetVehicleId, { transaction });
    if (!fleetVehicle) throw ApiError.badRequest('El vehículo de flota seleccionado no existe');
    origenVehiculo = 'flota';
  }

  if (data.vehicleId != null) {
    const vehicle = await Vehicle.findByPk(data.vehicleId, { transaction });
    if (!vehicle) throw ApiError.badRequest('El vehículo de taller seleccionado no existe');
    origenVehiculo = 'taller';
  }

  if (data.workOrderId != null) {
    const workOrder = await WorkOrder.findByPk(data.workOrderId, { transaction });
    if (!workOrder) throw ApiError.badRequest('La orden de trabajo seleccionada no existe');
    if (data.vehicleId == null) {
      throw ApiError.badRequest('Selecciona el vehículo de taller para vincular la OT');
    }
    if (workOrder.vehicleId == null || workOrder.vehicleId !== data.vehicleId) {
      throw ApiError.badRequest('La orden de trabajo no pertenece al vehículo seleccionado');
    }
  }

  if (data.origenVehiculo && origenVehiculo && data.origenVehiculo !== origenVehiculo) {
    throw ApiError.badRequest('El tipo de vehículo no coincide con el vehículo seleccionado');
  }

  return {
    origenVehiculo,
    vehicleId: data.vehicleId ?? null,
    fleetVehicleId: data.fleetVehicleId ?? null,
    workOrderId: data.workOrderId ?? null,
  };
};

const storePurchaseReceipt = async (
  file: Express.Multer.File,
): Promise<{
  storageKey: string;
  nombre: string;
  mimeType: string;
  sizeBytes: number;
}> => {
  const detected = detectReceiptFile(file);
  const now = new Date();
  const storageKey = path.posix.join(
    'purchase-receipts',
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${randomUUID()}.${detected.extension}`,
  );
  await storeFile(storageKey, file.buffer, detected.mimeType);

  return {
    storageKey,
    nombre: file.originalname.slice(0, 255),
    mimeType: detected.mimeType,
    sizeBytes: file.size,
  };
};

const createCashMovement = async (
  args: {
    categoria: 'compra_repuesto' | 'pago_proveedor';
    monto: number;
    metodo: PaymentMethod;
    descripcion: string;
    referencia: string;
    userId: number;
    fecha?: Date;
  },
  transaction: Transaction,
): Promise<CashMovement> =>
  CashMovement.create(
    {
      tipo: 'egreso',
      categoria: args.categoria,
      monto: moneyValue(args.monto),
      metodo: args.metodo,
      descripcion: args.descripcion.slice(0, 255),
      referencia: args.referencia.slice(0, 120),
      fecha: args.fecha ?? new Date(),
      createdBy: args.userId,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    },
    { transaction },
  );

const receptionMotivo = (codigo: string): string => `Recepción de compra ${codigo}`;

export const createPurchase = async (
  data: CreatePurchaseInput,
  userId: number,
  receiptFile?: Express.Multer.File,
): Promise<PurchasePublic> => {
  if (!receiptFile) {
    throw ApiError.badRequest('Debes adjuntar el comprobante de la compra');
  }

  const receipt = await storePurchaseReceipt(receiptFile);
  let committed = false;

  try {
    const purchaseId = await sequelize.transaction(async (transaction) => {
      const supplier = await resolveSupplier(data, transaction);
      const vehicle = await resolveVehicle(data, transaction);
      const codigo = await generatePurchaseCode(transaction);
      const pricing = calculatePurchaseTotals(data.items, data.conIva);

      const purchase = await Purchase.create(
        {
          codigo,
          supplierId: supplier.id,
          vehicleId: vehicle.vehicleId,
          fleetVehicleId: vehicle.fleetVehicleId,
          workOrderId: vehicle.workOrderId,
          origenVehiculo: vehicle.origenVehiculo,
          conIva: data.conIva,
          neto: pricing.neto,
          iva: pricing.iva,
          total: pricing.total,
          formaPago: data.formaPago,
          metodoPago: data.metodoPago,
          estado: 'registrada',
          tipoDocumento: data.tipoDocumento,
          folio: data.folio,
          fechaEmision: data.fechaEmision,
          montoComprobante: data.montoComprobante,
          numeroOperacion: data.numeroOperacion,
          banco: data.banco,
          comprobanteNombre: receipt.nombre,
          comprobanteStorageKey: receipt.storageKey,
          comprobanteMimeType: receipt.mimeType,
          comprobanteSizeBytes: receipt.sizeBytes,
          observaciones: data.observaciones ?? null,
          cashMovementId: null,
          pagadoAt: data.formaPago === 'contado' ? new Date() : null,
          createdBy: userId,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
        },
        { transaction },
      );

      await PurchaseItem.bulkCreate(
        data.items.map((item, index) => ({
          purchaseId: purchase.id,
          catalogItemId: item.catalogItemId ?? null,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          subtotal: pricing.subtotales[index] ?? 0,
          afectaStock: item.afectaStock,
          warehouseId: item.afectaStock ? (item.warehouseId ?? null) : null,
        })),
        { transaction },
      );

      if (data.formaPago === 'contado') {
        const movement = await createCashMovement(
          {
            categoria: 'compra_repuesto',
            monto: pricing.total,
            metodo: data.metodoPago,
            descripcion: `Compra ${codigo} - ${supplier.nombre}`,
            referencia: codigo,
            userId,
          },
          transaction,
        );
        await purchase.update({ cashMovementId: movement.id }, { transaction });
      }

      for (const item of data.items) {
        if (!item.afectaStock) continue;
        if (item.catalogItemId == null || item.warehouseId == null) {
          throw ApiError.badRequest('Los ítems con stock requieren repuesto de catálogo y almacén');
        }
        await registerMovement(
          {
            catalogItemId: item.catalogItemId,
            warehouseId: item.warehouseId,
            tipo: 'ingreso',
            cantidad: item.cantidad,
            motivo: receptionMotivo(codigo),
          },
          userId,
          { transaction, referencia: codigo },
        );
      }

      return purchase.id;
    });

    committed = true;
    return getPurchaseById(purchaseId);
  } finally {
    if (!committed) {
      await removeStoredFile(receipt.storageKey, false);
    }
  }
};

export const registerPurchasePayment = async (
  id: number,
  data: RegisterPurchasePaymentInput,
  userId: number,
): Promise<PurchasePublic> => {
  await sequelize.transaction(async (transaction) => {
    const purchase = await Purchase.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
      include: [{ model: Supplier, as: 'supplier', required: true }],
    });
    if (!purchase) throw ApiError.notFound('Compra no encontrada');
    if (purchase.estado === 'anulada') {
      throw ApiError.conflict('No se puede pagar una compra anulada');
    }
    if (purchase.formaPago !== 'credito') {
      throw ApiError.badRequest('Esta compra es de contado y ya fue pagada al registrarse');
    }
    if (purchase.pagadoAt || purchase.cashMovementId) {
      throw ApiError.conflict('La compra a crédito ya fue pagada');
    }
    if (!purchase.supplier) throw ApiError.internal('La compra no tiene proveedor disponible');

    const movement = await createCashMovement(
      {
        categoria: 'pago_proveedor',
        monto: numberValue(purchase.total),
        metodo: data.metodo,
        descripcion: `Pago compra ${purchase.codigo} - ${purchase.supplier.nombre}`,
        referencia: data.referencia?.trim() || purchase.codigo,
        userId,
      },
      transaction,
    );

    await purchase.update(
      {
        cashMovementId: movement.id,
        pagadoAt: new Date(),
        metodoPago: data.metodo,
      },
      { transaction },
    );
  });

  return getPurchaseById(id);
};

export const voidPurchase = async (
  id: number,
  motivo: string,
  userId: number,
): Promise<PurchasePublic> => {
  await sequelize.transaction(async (transaction) => {
    const purchase = await Purchase.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
      include: [
        { model: Supplier, as: 'supplier', required: true },
        { model: PurchaseItem, as: 'items' },
        { model: CashMovement, as: 'cashMovement', required: false },
      ],
    });
    if (!purchase) throw ApiError.notFound('Compra no encontrada');
    if (purchase.estado === 'anulada') throw ApiError.conflict('La compra ya está anulada');

    for (const item of purchase.items ?? []) {
      if (!item.afectaStock || item.catalogItemId == null || item.warehouseId == null) continue;
      await registerMovement(
        {
          catalogItemId: item.catalogItemId,
          warehouseId: item.warehouseId,
          tipo: 'salida',
          cantidad: numberValue(item.cantidad),
          motivo: `Anulación de compra ${purchase.codigo}`,
        },
        userId,
        { transaction, referencia: `ANUL-${purchase.codigo}` },
      );
    }

    if (purchase.cashMovement && !purchase.cashMovement.voidedAt) {
      await purchase.cashMovement.update(
        { voidedAt: new Date(), voidedBy: userId, voidReason: motivo.slice(0, 500) },
        { transaction },
      );
    }

    await purchase.update(
      {
        estado: 'anulada',
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: motivo.slice(0, 500),
      },
      { transaction },
    );
  });

  return getPurchaseById(id);
};

export const getPurchaseReceipt = async (id: number): Promise<PurchaseReceipt> => {
  const purchase = await getPurchaseById(id);
  const stored = await Purchase.findByPk(id, {
    attributes: ['id', 'codigo', 'comprobanteStorageKey', 'comprobanteNombre'],
  });
  if (!stored) throw ApiError.notFound('Compra no encontrada');

  const bytes = await readStoredFile(
    stored.comprobanteStorageKey,
    'El comprobante de la compra no está disponible',
  );
  const mimeType = getReceiptMimeType(stored.comprobanteStorageKey, bytes);

  return {
    purchase,
    bytes,
    mimeType,
    filename: stored.comprobanteNombre,
  };
};
