import { Op } from 'sequelize';

import { CashMovement } from '../models/CashMovement.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';

import type {
  CashMovementCategory,
  CashMovementType,
  CatalogType,
  FinancialReportFilters,
  PaymentMethod,
  QuotationStatus,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

type QuotationWhere = WhereOptions<InferAttributes<Quotation>>;
type PaymentWhere = WhereOptions<InferAttributes<Payment>>;
type MovementWhere = WhereOptions<InferAttributes<CashMovement>>;

interface FinancialDataset {
  quotations: Quotation[];
  payments: Payment[];
  movements: CashMovement[];
  items: QuotationItem[];
}

export interface FinancialKpis {
  grossSales: number;
  collected: number;
  manualIncome: number;
  expenses: number;
  netCash: number;
  receivable: number;
  averageTicket: number;
  quotationCount: number;
  paidQuotationCount: number;
  workOrderConversionCount: number;
  collectionRate: number;
  conversionRate: number;
}

interface ComparisonMetric {
  previous: number;
  variationPercent: number | null;
}

export interface FinancialAnalytics {
  period: {
    fechaDesde: string;
    fechaHasta: string;
    previousFechaDesde: string | null;
    previousFechaHasta: string | null;
    days: number;
    agruparPor: FinancialReportFilters['agruparPor'];
  };
  kpis: FinancialKpis;
  comparison: {
    grossSales: ComparisonMetric;
    collected: ComparisonMetric;
    expenses: ComparisonMetric;
    netCash: ComparisonMetric;
  } | null;
  topSellers: Array<{
    id: number | null;
    nombre: string;
    quotationCount: number;
    grossSales: number;
    collected: number;
    averageTicket: number;
  }>;
  topItems: Array<{
    catalogItemId: number | null;
    codigo: string | null;
    nombre: string;
    tipo: CatalogType | 'libre';
    quantity: number;
    revenue: number;
  }>;
  topClients: Array<{
    id: number | null;
    nombre: string;
    rut: string | null;
    quotationCount: number;
    grossSales: number;
    collected: number;
    receivable: number;
  }>;
  paymentMethods: Array<{
    metodo: PaymentMethod | 'sin_metodo';
    count: number;
    amount: number;
    share: number;
  }>;
  quotationStatuses: Array<{
    estado: QuotationStatus;
    count: number;
    amount: number;
    share: number;
  }>;
  movementCategories: Array<{
    categoria: CashMovementCategory;
    tipo: CashMovementType;
    count: number;
    amount: number;
  }>;
  trend: Array<{
    key: string;
    label: string;
    grossSales: number;
    collected: number;
    manualIncome: number;
    expenses: number;
    netCash: number;
  }>;
  filterOptions: {
    advisors: Array<{ id: number; nombre: string }>;
    clients: Array<{ id: number; nombre: string; rut: string | null }>;
  };
}

export interface FinancialReportData {
  analytics: FinancialAnalytics;
  quotations: Array<{
    codigo: string;
    fecha: Date;
    clientName: string;
    clientRut: string;
    vehicle: string;
    advisor: string;
    status: QuotationStatus;
    subtotal: number;
    total: number;
    paid: number;
    receivable: number;
    workOrderLinked: boolean;
  }>;
  payments: Array<{
    fecha: Date;
    quotationCode: string;
    clientName: string;
    advisor: string;
    method: string;
    amount: number;
    receiver: string;
  }>;
  movements: Array<{
    fecha: Date;
    type: CashMovementType;
    category: CashMovementCategory;
    method: PaymentMethod;
    description: string;
    reference: string;
    amount: number;
    creator: string;
  }>;
  items: Array<{
    quotationCode: string;
    description: string;
    catalogCode: string;
    catalogType: CatalogType | 'libre';
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

const DAY_MS = 86_400_000;
const money = (value: number | string | null | undefined): number =>
  Math.round(Number(value ?? 0) * 100) / 100;

const startOfDay = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const endOfDay = (date: string): Date => new Date(`${date}T23:59:59.999Z`);
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const dateRange = (fechaDesde: string, fechaHasta: string): { start: Date; end: Date; days: number } => {
  const start = startOfDay(fechaDesde);
  const end = endOfDay(fechaHasta);
  return {
    start,
    end,
    days: Math.floor((startOfDay(fechaHasta).getTime() - start.getTime()) / DAY_MS) + 1,
  };
};

const previousRange = (
  fechaDesde: string,
  fechaHasta: string,
): { fechaDesde: string; fechaHasta: string } => {
  const { start, days } = dateRange(fechaDesde, fechaHasta);
  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY_MS);
  return { fechaDesde: isoDate(previousStart), fechaHasta: isoDate(previousEnd) };
};

const quotationIdentityWhere = (filters: FinancialReportFilters): QuotationWhere => {
  const where: QuotationWhere = {};
  if (filters.asesorId !== undefined) where.asesorId = filters.asesorId;
  if (filters.clientId !== undefined) where.clientId = filters.clientId;
  if (filters.estadoPago !== undefined) where.estadoPago = filters.estadoPago;
  return where;
};

const loadDataset = async (
  filters: FinancialReportFilters,
  fechaDesde: string,
  fechaHasta: string,
): Promise<FinancialDataset> => {
  const { start, end } = dateRange(fechaDesde, fechaHasta);
  const identityWhere = quotationIdentityWhere(filters);
  const quotationWhere: QuotationWhere = {
    ...identityWhere,
    createdAt: { [Op.between]: [start, end] },
  };
  const paymentWhere: PaymentWhere = {
    estado: 'confirmado',
    fecha: { [Op.between]: [start, end] },
  };
  if (filters.metodo !== undefined) paymentWhere.metodo = filters.metodo;

  const movementWhere: MovementWhere = {
    voidedAt: null,
    fecha: { [Op.between]: [start, end] },
  };
  if (filters.metodo !== undefined) movementWhere.metodo = filters.metodo;
  if (filters.movimientoTipo !== undefined) movementWhere.tipo = filters.movimientoTipo;
  if (filters.movimientoCategoria !== undefined) {
    movementWhere.categoria = filters.movimientoCategoria;
  }

  const [quotations, payments, movements, items] = await Promise.all([
    Quotation.findAll({
      attributes: [
        'id',
        'codigo',
        'workOrderId',
        'clientId',
        'vehicleId',
        'asesorId',
        'estadoPago',
        'subtotal',
        'total',
        'pagado',
        'createdAt',
      ],
      where: quotationWhere,
      include: [
        {
          model: Client,
          as: 'client',
          attributes: ['id', 'nombre', 'rut'],
          required: false,
          paranoid: false,
        },
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'patente', 'marca', 'modelo'],
          required: false,
          paranoid: false,
        },
        {
          model: User,
          as: 'asesor',
          attributes: ['id', 'nombre'],
          required: false,
          paranoid: false,
        },
      ],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
    }),
    Payment.findAll({
      attributes: ['id', 'quotationId', 'monto', 'metodo', 'fecha', 'createdBy'],
      where: paymentWhere,
      include: [
        {
          model: Quotation,
          attributes: ['id', 'codigo', 'asesorId', 'clientId'],
          where: identityWhere,
          required: true,
          paranoid: false,
          include: [
            {
              model: Client,
              as: 'client',
              attributes: ['id', 'nombre', 'rut'],
              required: false,
              paranoid: false,
            },
            {
              model: User,
              as: 'asesor',
              attributes: ['id', 'nombre'],
              required: false,
              paranoid: false,
            },
          ],
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'nombre'],
          required: false,
          paranoid: false,
        },
      ],
      order: [['fecha', 'ASC'], ['id', 'ASC']],
    }),
    CashMovement.findAll({
      attributes: [
        'id',
        'tipo',
        'categoria',
        'monto',
        'metodo',
        'descripcion',
        'referencia',
        'fecha',
        'createdBy',
      ],
      where: movementWhere,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'nombre'],
          required: false,
          paranoid: false,
        },
      ],
      order: [['fecha', 'ASC'], ['id', 'ASC']],
    }),
    QuotationItem.findAll({
      attributes: [
        'id',
        'quotationId',
        'catalogItemId',
        'descripcion',
        'cantidad',
        'precioUnitario',
        'subtotal',
      ],
      include: [
        {
          model: Quotation,
          attributes: ['id', 'codigo'],
          where: quotationWhere,
          required: true,
          paranoid: false,
        },
        {
          model: CatalogItem,
          attributes: ['id', 'codigo', 'nombre', 'tipo'],
          where: filters.catalogType ? { tipo: filters.catalogType } : undefined,
          required: filters.catalogType !== undefined,
          paranoid: false,
        },
      ],
      order: [['id', 'ASC']],
    }),
  ]);

  return { quotations, payments, movements, items };
};

const calculateKpis = (dataset: FinancialDataset): FinancialKpis => {
  const grossSales = money(dataset.quotations.reduce((sum, item) => sum + money(item.total), 0));
  const paidOnQuotations = money(
    dataset.quotations.reduce((sum, item) => sum + money(item.pagado), 0),
  );
  const collected = money(dataset.payments.reduce((sum, item) => sum + money(item.monto), 0));
  const manualIncome = money(
    dataset.movements
      .filter((item) => item.tipo === 'ingreso')
      .reduce((sum, item) => sum + money(item.monto), 0),
  );
  const expenses = money(
    dataset.movements
      .filter((item) => item.tipo === 'egreso')
      .reduce((sum, item) => sum + money(item.monto), 0),
  );
  const receivable = money(
    dataset.quotations.reduce(
      (sum, item) => sum + Math.max(0, money(item.total) - money(item.pagado)),
      0,
    ),
  );
  const quotationCount = dataset.quotations.length;
  const paidQuotationCount = dataset.quotations.filter(
    (quotation) => quotation.estadoPago === 'total',
  ).length;
  const workOrderConversionCount = dataset.quotations.filter(
    (quotation) => quotation.workOrderId !== null,
  ).length;

  return {
    grossSales,
    collected,
    manualIncome,
    expenses,
    netCash: money(collected + manualIncome - expenses),
    receivable,
    averageTicket: quotationCount > 0 ? money(grossSales / quotationCount) : 0,
    quotationCount,
    paidQuotationCount,
    workOrderConversionCount,
    collectionRate:
      grossSales > 0 ? Math.round(Math.min(100, (paidOnQuotations / grossSales) * 10000)) / 100 : 0,
    conversionRate:
      quotationCount > 0
        ? Math.round((workOrderConversionCount / quotationCount) * 10000) / 100
        : 0,
  };
};

const compareMetric = (current: number, previous: number): ComparisonMetric => ({
  previous,
  variationPercent:
    previous === 0
      ? current === 0
        ? 0
        : null
      : Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100,
});

const buildTopSellers = (
  dataset: FinancialDataset,
): FinancialAnalytics['topSellers'] => {
  const sellers = new Map<number, FinancialAnalytics['topSellers'][number]>();
  const ensure = (id: number | null, nombre: string): FinancialAnalytics['topSellers'][number] => {
    const key = id ?? 0;
    const current = sellers.get(key);
    if (current) return current;
    const created = {
      id,
      nombre,
      quotationCount: 0,
      grossSales: 0,
      collected: 0,
      averageTicket: 0,
    };
    sellers.set(key, created);
    return created;
  };

  dataset.quotations.forEach((quotation) => {
    const row = ensure(quotation.asesor?.id ?? null, quotation.asesor?.nombre ?? 'Sin asesor');
    row.quotationCount += 1;
    row.grossSales = money(row.grossSales + money(quotation.total));
  });
  dataset.payments.forEach((payment) => {
    const row = ensure(
      payment.quotation?.asesor?.id ?? null,
      payment.quotation?.asesor?.nombre ?? 'Sin asesor',
    );
    row.collected = money(row.collected + money(payment.monto));
  });

  return [...sellers.values()]
    .map((row) => ({
      ...row,
      averageTicket: row.quotationCount > 0 ? money(row.grossSales / row.quotationCount) : 0,
    }))
    .sort((left, right) => right.grossSales - left.grossSales)
    .slice(0, 10);
};

const buildTopItems = (dataset: FinancialDataset): FinancialAnalytics['topItems'] => {
  const items = new Map<string, FinancialAnalytics['topItems'][number]>();
  dataset.items.forEach((item) => {
    const key = item.catalogItemId
      ? `catalog-${item.catalogItemId}`
      : `free-${item.descripcion.trim().toLowerCase()}`;
    const current = items.get(key) ?? {
      catalogItemId: item.catalogItemId,
      codigo: item.catalogItem?.codigo ?? null,
      nombre: item.catalogItem?.nombre ?? item.descripcion,
      tipo: item.catalogItem?.tipo ?? ('libre' as const),
      quantity: 0,
      revenue: 0,
    };
    current.quantity = money(current.quantity + money(item.cantidad));
    current.revenue = money(current.revenue + money(item.subtotal));
    items.set(key, current);
  });
  return [...items.values()]
    .sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue)
    .slice(0, 15);
};

const buildTopClients = (dataset: FinancialDataset): FinancialAnalytics['topClients'] => {
  const clients = new Map<number, FinancialAnalytics['topClients'][number]>();
  const ensure = (
    id: number | null,
    nombre: string,
    rut: string | null,
  ): FinancialAnalytics['topClients'][number] => {
    const key = id ?? 0;
    const current = clients.get(key);
    if (current) return current;
    const created = {
      id,
      nombre,
      rut,
      quotationCount: 0,
      grossSales: 0,
      collected: 0,
      receivable: 0,
    };
    clients.set(key, created);
    return created;
  };

  dataset.quotations.forEach((quotation) => {
    const row = ensure(
      quotation.client?.id ?? null,
      quotation.client?.nombre ?? 'Sin cliente',
      quotation.client?.rut ?? null,
    );
    row.quotationCount += 1;
    row.grossSales = money(row.grossSales + money(quotation.total));
    row.receivable = money(
      row.receivable + Math.max(0, money(quotation.total) - money(quotation.pagado)),
    );
  });
  dataset.payments.forEach((payment) => {
    const row = ensure(
      payment.quotation?.client?.id ?? null,
      payment.quotation?.client?.nombre ?? 'Sin cliente',
      payment.quotation?.client?.rut ?? null,
    );
    row.collected = money(row.collected + money(payment.monto));
  });

  return [...clients.values()]
    .sort((left, right) => right.grossSales - left.grossSales)
    .slice(0, 10);
};

const buildPaymentMethods = (
  dataset: FinancialDataset,
  collected: number,
): FinancialAnalytics['paymentMethods'] => {
  const methods = new Map<string, FinancialAnalytics['paymentMethods'][number]>();
  dataset.payments.forEach((payment) => {
    const metodo = (payment.metodo ?? 'sin_metodo') as PaymentMethod | 'sin_metodo';
    const row = methods.get(metodo) ?? { metodo, count: 0, amount: 0, share: 0 };
    row.count += 1;
    row.amount = money(row.amount + money(payment.monto));
    methods.set(metodo, row);
  });
  return [...methods.values()]
    .map((row) => ({
      ...row,
      share: collected > 0 ? Math.round((row.amount / collected) * 10000) / 100 : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
};

const buildQuotationStatuses = (
  dataset: FinancialDataset,
  grossSales: number,
): FinancialAnalytics['quotationStatuses'] => {
  const statuses = new Map<QuotationStatus, FinancialAnalytics['quotationStatuses'][number]>();
  dataset.quotations.forEach((quotation) => {
    const row = statuses.get(quotation.estadoPago) ?? {
      estado: quotation.estadoPago,
      count: 0,
      amount: 0,
      share: 0,
    };
    row.count += 1;
    row.amount = money(row.amount + money(quotation.total));
    statuses.set(quotation.estadoPago, row);
  });
  return [...statuses.values()]
    .map((row) => ({
      ...row,
      share: grossSales > 0 ? Math.round((row.amount / grossSales) * 10000) / 100 : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
};

const buildMovementCategories = (
  dataset: FinancialDataset,
): FinancialAnalytics['movementCategories'] => {
  const categories = new Map<string, FinancialAnalytics['movementCategories'][number]>();
  dataset.movements.forEach((movement) => {
    const key = `${movement.tipo}-${movement.categoria}`;
    const row = categories.get(key) ?? {
      categoria: movement.categoria,
      tipo: movement.tipo,
      count: 0,
      amount: 0,
    };
    row.count += 1;
    row.amount = money(row.amount + money(movement.monto));
    categories.set(key, row);
  });
  return [...categories.values()].sort((left, right) => right.amount - left.amount);
};

const bucketKey = (
  date: Date,
  grouping: FinancialReportFilters['agruparPor'],
): { key: string; label: string } => {
  const value = new Date(date);
  if (grouping === 'mes') {
    const key = value.toISOString().slice(0, 7);
    return {
      key,
      label: new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(value)
        .replace('.', ''),
    };
  }
  if (grouping === 'semana') {
    const weekday = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() - weekday + 1);
    const key = isoDate(value);
    return { key, label: `Semana ${key.slice(8, 10)}/${key.slice(5, 7)}` };
  }
  const key = isoDate(value);
  return { key, label: key.slice(8, 10) + '/' + key.slice(5, 7) };
};

const buildTrend = (
  dataset: FinancialDataset,
  filters: FinancialReportFilters,
): FinancialAnalytics['trend'] => {
  const buckets = new Map<string, FinancialAnalytics['trend'][number]>();
  const ensure = (date: Date): FinancialAnalytics['trend'][number] => {
    const { key, label } = bucketKey(date, filters.agruparPor);
    const current = buckets.get(key);
    if (current) return current;
    const created = {
      key,
      label,
      grossSales: 0,
      collected: 0,
      manualIncome: 0,
      expenses: 0,
      netCash: 0,
    };
    buckets.set(key, created);
    return created;
  };

  const range = dateRange(filters.fechaDesde, filters.fechaHasta);
  for (let cursor = range.start.getTime(); cursor <= range.end.getTime(); cursor += DAY_MS) {
    ensure(new Date(cursor));
  }
  dataset.quotations.forEach((quotation) => {
    const row = ensure(quotation.createdAt);
    row.grossSales = money(row.grossSales + money(quotation.total));
  });
  dataset.payments.forEach((payment) => {
    const row = ensure(payment.fecha);
    row.collected = money(row.collected + money(payment.monto));
  });
  dataset.movements.forEach((movement) => {
    const row = ensure(movement.fecha);
    if (movement.tipo === 'ingreso') {
      row.manualIncome = money(row.manualIncome + money(movement.monto));
    } else {
      row.expenses = money(row.expenses + money(movement.monto));
    }
  });
  return [...buckets.values()]
    .map((row) => ({
      ...row,
      netCash: money(row.collected + row.manualIncome - row.expenses),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
};

const getFilterOptions = async (): Promise<FinancialAnalytics['filterOptions']> => {
  const references = await Quotation.findAll({
    attributes: ['asesorId', 'clientId'],
    paranoid: false,
    raw: true,
  });
  const advisorIds = [...new Set(references.map((item) => item.asesorId).filter(
    (id): id is number => id !== null,
  ))];
  const clientIds = [...new Set(references.map((item) => item.clientId).filter(
    (id): id is number => id !== null,
  ))];
  const [advisors, clients] = await Promise.all([
    advisorIds.length
      ? User.findAll({
          attributes: ['id', 'nombre'],
          where: { id: { [Op.in]: advisorIds } },
          paranoid: false,
          order: [['nombre', 'ASC']],
        })
      : [],
    clientIds.length
      ? Client.findAll({
          attributes: ['id', 'nombre', 'rut'],
          where: { id: { [Op.in]: clientIds } },
          paranoid: false,
          order: [['nombre', 'ASC']],
        })
      : [],
  ]);
  return {
    advisors: advisors.map((item) => ({ id: item.id, nombre: item.nombre })),
    clients: clients.map((item) => ({ id: item.id, nombre: item.nombre, rut: item.rut })),
  };
};

const buildAnalytics = (
  filters: FinancialReportFilters,
  current: FinancialDataset,
  previous: FinancialDataset | null,
  filterOptions: FinancialAnalytics['filterOptions'],
): FinancialAnalytics => {
  const currentKpis = calculateKpis(current);
  const previousKpis = previous ? calculateKpis(previous) : null;
  const previousDates = filters.comparar
    ? previousRange(filters.fechaDesde, filters.fechaHasta)
    : null;

  return {
    period: {
      fechaDesde: filters.fechaDesde,
      fechaHasta: filters.fechaHasta,
      previousFechaDesde: previousDates?.fechaDesde ?? null,
      previousFechaHasta: previousDates?.fechaHasta ?? null,
      days: dateRange(filters.fechaDesde, filters.fechaHasta).days,
      agruparPor: filters.agruparPor,
    },
    kpis: currentKpis,
    comparison: previousKpis
      ? {
          grossSales: compareMetric(currentKpis.grossSales, previousKpis.grossSales),
          collected: compareMetric(currentKpis.collected, previousKpis.collected),
          expenses: compareMetric(currentKpis.expenses, previousKpis.expenses),
          netCash: compareMetric(currentKpis.netCash, previousKpis.netCash),
        }
      : null,
    topSellers: buildTopSellers(current),
    topItems: buildTopItems(current),
    topClients: buildTopClients(current),
    paymentMethods: buildPaymentMethods(current, currentKpis.collected),
    quotationStatuses: buildQuotationStatuses(current, currentKpis.grossSales),
    movementCategories: buildMovementCategories(current),
    trend: buildTrend(current, filters),
    filterOptions,
  };
};

const loadAnalyticsData = async (
  filters: FinancialReportFilters,
): Promise<{
  current: FinancialDataset;
  previous: FinancialDataset | null;
  filterOptions: FinancialAnalytics['filterOptions'];
}> => {
  const previousDates = filters.comparar
    ? previousRange(filters.fechaDesde, filters.fechaHasta)
    : null;
  const [current, previous, filterOptions] = await Promise.all([
    loadDataset(filters, filters.fechaDesde, filters.fechaHasta),
    previousDates
      ? loadDataset(filters, previousDates.fechaDesde, previousDates.fechaHasta)
      : Promise.resolve(null),
    getFilterOptions(),
  ]);
  return { current, previous, filterOptions };
};

export const getFinancialAnalytics = async (
  filters: FinancialReportFilters,
): Promise<FinancialAnalytics> => {
  const { current, previous, filterOptions } = await loadAnalyticsData(filters);
  return buildAnalytics(filters, current, previous, filterOptions);
};

export const getFinancialReportData = async (
  filters: FinancialReportFilters,
): Promise<FinancialReportData> => {
  const { current, previous, filterOptions } = await loadAnalyticsData(filters);
  const analytics = buildAnalytics(filters, current, previous, filterOptions);
  return {
    analytics,
    quotations: current.quotations.map((quotation) => ({
      codigo: quotation.codigo,
      fecha: quotation.createdAt,
      clientName: quotation.client?.nombre ?? 'Sin cliente',
      clientRut: quotation.client?.rut ?? '',
      vehicle: quotation.vehicle
        ? [quotation.vehicle.patente, quotation.vehicle.marca, quotation.vehicle.modelo]
            .filter(Boolean)
            .join(' ')
        : '',
      advisor: quotation.asesor?.nombre ?? 'Sin asesor',
      status: quotation.estadoPago,
      subtotal: money(quotation.subtotal),
      total: money(quotation.total),
      paid: money(quotation.pagado),
      receivable: money(Math.max(0, money(quotation.total) - money(quotation.pagado))),
      workOrderLinked: quotation.workOrderId !== null,
    })),
    payments: current.payments.map((payment) => ({
      fecha: payment.fecha,
      quotationCode: payment.quotation?.codigo ?? '',
      clientName: payment.quotation?.client?.nombre ?? 'Sin cliente',
      advisor: payment.quotation?.asesor?.nombre ?? 'Sin asesor',
      method: payment.metodo ?? 'Sin método',
      amount: money(payment.monto),
      receiver: payment.creator?.nombre ?? 'Sin receptor',
    })),
    movements: current.movements.map((movement) => ({
      fecha: movement.fecha,
      type: movement.tipo,
      category: movement.categoria,
      method: movement.metodo,
      description: movement.descripcion,
      reference: movement.referencia ?? '',
      amount: money(movement.monto),
      creator: movement.creator?.nombre ?? 'Sin responsable',
    })),
    items: current.items.map((item) => ({
      quotationCode: item.quotation?.codigo ?? '',
      description: item.catalogItem?.nombre ?? item.descripcion,
      catalogCode: item.catalogItem?.codigo ?? '',
      catalogType: item.catalogItem?.tipo ?? 'libre',
      quantity: money(item.cantidad),
      unitPrice: money(item.precioUnitario),
      subtotal: money(item.subtotal),
    })),
  };
};

