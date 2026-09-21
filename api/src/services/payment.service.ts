import { Op, Transaction } from 'sequelize';

import { sequelize } from '../config/database.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination } from '../utils/paginate.js';

import type {
  CreatePaymentInput,
  PaymentMethod,
  PaymentQueryInput,
  PaymentStatus,
  QuotationStatus,
  VerifyPaymentInput,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

interface PaymentUserPublic {
  id: number;
  nombre: string;
}

interface PaymentQuotationPublic {
  id: number;
  codigo: string;
  total: number;
  client?: { id: number; nombre: string } | null;
}

export interface PaymentPublic {
  id: number;
  quotationId: number;
  monto: number;
  metodo: string | null;
  estado: PaymentStatus;
  referencia: string | null;
  fecha: Date;
  createdBy: number | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  creator?: PaymentUserPublic | null;
  reviewer?: PaymentUserPublic | null;
  quotation?: PaymentQuotationPublic;
}

export interface QuotationPaymentSummary {
  id: number;
  codigo: string;
  total: number;
  pagado: number;
  saldoPendiente: number;
  estadoPago: QuotationStatus;
}

export interface ListPaymentsResult {
  items: PaymentPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QuotationPaymentsResult {
  quotationId: number;
  total: number;
  pagado: number;
  saldoPendiente: number;
  estadoPago: QuotationStatus;
  payments: PaymentPublic[];
}

export interface CreatePaymentResult {
  payment: PaymentPublic;
  quotation: QuotationPaymentSummary;
}

export interface DeletePaymentResult {
  message: string;
  quotation: QuotationPaymentSummary;
}

type PaymentWhere = WhereOptions<InferAttributes<Payment>>;

const creatorInclude = {
  model: User,
  as: 'creator',
  attributes: ['id', 'nombre'],
};

const reviewerInclude = {
  model: User,
  as: 'reviewer',
  attributes: ['id', 'nombre'],
};

const quotationInclude = {
  model: Quotation,
  attributes: ['id', 'codigo', 'total'],
  include: [{ model: Client, attributes: ['id', 'nombre'] }],
};

const paymentIncludes = [creatorInclude, reviewerInclude, quotationInclude];

const numberValue = (value: number | string | null): number => Number(value ?? 0);
const moneyValue = (value: number): number => Math.round(value * 100) / 100;
const toDateOrNow = (value: string | undefined): Date =>
  value === undefined ? new Date() : new Date(value);

const getPendingAmount = async (
  quotationId: number,
  transaction?: Transaction,
  excludePaymentId?: number,
): Promise<number> => {
  const where: PaymentWhere = { quotationId, estado: 'por_verificar' };
  if (excludePaymentId !== undefined) where.id = { [Op.ne]: excludePaymentId };
  return moneyValue(numberValue(await Payment.sum('monto', { where, transaction })));
};

const getQuotationStatus = (
  pagado: number,
  total: number,
  pendingAmount: number,
): QuotationStatus => {
  if (pendingAmount > 0) return 'por_verificar';
  if (pagado <= 0) return 'por_pagar';
  if (pagado >= total) return 'total';
  return 'parcial';
};

export const toPaymentPublic = (payment: Payment): PaymentPublic => ({
  id: payment.id,
  quotationId: payment.quotationId,
  monto: numberValue(payment.monto),
  metodo: payment.metodo,
  estado: payment.estado,
  referencia: payment.referencia,
  fecha: payment.fecha,
  createdBy: payment.createdBy,
  reviewedBy: payment.reviewedBy,
  reviewedAt: payment.reviewedAt,
  reviewNote: payment.reviewNote,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
  creator: payment.creator
    ? { id: payment.creator.id, nombre: payment.creator.nombre }
    : payment.createdBy === null
      ? null
      : undefined,
  reviewer: payment.reviewer
    ? { id: payment.reviewer.id, nombre: payment.reviewer.nombre }
    : payment.reviewedBy === null
      ? null
      : undefined,
  quotation: payment.quotation
    ? {
        id: payment.quotation.id,
        codigo: payment.quotation.codigo,
        total: numberValue(payment.quotation.total),
        client: payment.quotation.client
          ? { id: payment.quotation.client.id, nombre: payment.quotation.client.nombre }
          : payment.quotation.clientId === null
            ? null
            : undefined,
      }
    : undefined,
});

const toQuotationSummary = (quotation: Quotation): QuotationPaymentSummary => {
  const total = numberValue(quotation.total);
  const pagado = numberValue(quotation.pagado);
  return {
    id: quotation.id,
    codigo: quotation.codigo,
    total,
    pagado,
    saldoPendiente: moneyValue(Math.max(0, total - pagado)),
    estadoPago: quotation.estadoPago,
  };
};

const getPaymentById = async (
  id: number,
  transaction?: Transaction,
): Promise<PaymentPublic> => {
  const payment = await Payment.findByPk(id, { include: paymentIncludes, transaction });
  if (!payment) throw ApiError.notFound('Pago no encontrado');
  return toPaymentPublic(payment);
};

export const listPayments = async (
  query: PaymentQueryInput,
): Promise<ListPaymentsResult> => {
  const pagination = getPagination(query);
  const where: PaymentWhere = {};

  if (query.quotationId !== undefined) where.quotationId = query.quotationId;
  if (query.metodo !== undefined) where.metodo = query.metodo;
  if (query.estado !== undefined) where.estado = query.estado;
  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    if (query.fechaHasta) range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    where.fecha = range;
  }

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: paymentIncludes,
    distinct: true,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['fecha', 'DESC'], ['id', 'DESC']],
  });

  return {
    items: rows.map(toPaymentPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getPaymentsByQuotationId = async (
  quotationId: number,
): Promise<QuotationPaymentsResult> => {
  const quotation = await Quotation.findByPk(quotationId);
  if (!quotation) throw ApiError.notFound('Cotización no encontrada');

  const payments = await Payment.findAll({
    where: { quotationId },
    include: [creatorInclude, reviewerInclude],
    order: [['fecha', 'DESC'], ['id', 'DESC']],
  });
  const summary = toQuotationSummary(quotation);

  return {
    quotationId: quotation.id,
    total: summary.total,
    pagado: summary.pagado,
    saldoPendiente: summary.saldoPendiente,
    estadoPago: summary.estadoPago,
    payments: payments.map(toPaymentPublic),
  };
};

export const createPayment = async (
  data: CreatePaymentInput,
  userId: number,
): Promise<CreatePaymentResult> => {
  const result = await sequelize.transaction(async (transaction) => {
    const quotation = await Quotation.findByPk(data.quotationId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!quotation) throw ApiError.notFound('Cotización no encontrada');

    const total = numberValue(quotation.total);
    const pagado = numberValue(quotation.pagado);
    const pendingAmount = await getPendingAmount(quotation.id, transaction);
    const saldoDisponible = moneyValue(total - pagado - pendingAmount);
    const monto = moneyValue(Number(data.monto));

    if (pagado >= total) {
      throw ApiError.badRequest('La cotización ya se encuentra pagada en su totalidad');
    }
    if (monto > saldoDisponible) {
      throw ApiError.badRequest(
        `El abono supera el saldo pendiente disponible. Saldo restante: ${saldoDisponible}`,
      );
    }

    const estado: PaymentStatus = data.metodo === 'transferencia'
      ? 'por_verificar'
      : 'confirmado';
    const payment = await Payment.create(
      {
        quotationId: data.quotationId,
        monto,
        metodo: data.metodo satisfies PaymentMethod,
        estado,
        referencia: data.referencia || null,
        fecha: toDateOrNow(data.fecha),
        createdBy: userId,
      },
      { transaction },
    );

    const nuevoPagado = estado === 'confirmado' ? moneyValue(pagado + monto) : pagado;
    const nuevoPendiente = estado === 'por_verificar'
      ? moneyValue(pendingAmount + monto)
      : pendingAmount;
    await quotation.update(
      {
        pagado: nuevoPagado,
        estadoPago: getQuotationStatus(nuevoPagado, total, nuevoPendiente),
      },
      { transaction },
    );

    return { paymentId: payment.id, quotationId: quotation.id };
  });

  const [payment, quotation] = await Promise.all([
    getPaymentById(result.paymentId),
    Quotation.findByPk(result.quotationId),
  ]);
  if (!quotation) throw ApiError.notFound('Cotización no encontrada');
  return { payment, quotation: toQuotationSummary(quotation) };
};

export const verifyPayment = async (
  paymentId: number,
  data: VerifyPaymentInput,
  userId: number,
): Promise<CreatePaymentResult> => {
  const result = await sequelize.transaction(async (transaction) => {
    const initialPayment = await Payment.findByPk(paymentId, { transaction });
    if (!initialPayment) throw ApiError.notFound('Pago no encontrado');

    const quotation = await Quotation.findByPk(initialPayment.quotationId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!quotation) throw ApiError.notFound('Cotización no encontrada');

    const payment = await Payment.findByPk(paymentId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!payment) throw ApiError.notFound('Pago no encontrado');
    if (payment.estado !== 'por_verificar') {
      throw ApiError.badRequest('Este pago ya fue revisado y no puede verificarse nuevamente');
    }

    const total = numberValue(quotation.total);
    const pagado = numberValue(quotation.pagado);
    const otherPending = await getPendingAmount(quotation.id, transaction, payment.id);
    const approved = data.decision === 'aprobar';
    const paymentAmount = numberValue(payment.monto);

    if (approved && paymentAmount > moneyValue(total - pagado - otherPending)) {
      throw ApiError.badRequest('La transferencia supera el saldo disponible de la cotización');
    }

    const nuevoPagado = approved ? moneyValue(pagado + paymentAmount) : pagado;
    await payment.update(
      {
        estado: approved ? 'confirmado' : 'rechazado',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: data.comentario || null,
      },
      { transaction },
    );
    await quotation.update(
      {
        pagado: nuevoPagado,
        estadoPago: getQuotationStatus(nuevoPagado, total, otherPending),
      },
      { transaction },
    );

    return { paymentId: payment.id, quotationId: quotation.id };
  });

  const [payment, quotation] = await Promise.all([
    getPaymentById(result.paymentId),
    Quotation.findByPk(result.quotationId),
  ]);
  if (!quotation) throw ApiError.notFound('Cotización no encontrada');
  return { payment, quotation: toQuotationSummary(quotation) };
};

export const deletePayment = async (paymentId: number): Promise<DeletePaymentResult> => {
  const summary = await sequelize.transaction(async (transaction) => {
    const initialPayment = await Payment.findByPk(paymentId, { transaction });
    if (!initialPayment) throw ApiError.notFound('Pago no encontrado');

    const quotation = await Quotation.findByPk(initialPayment.quotationId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!quotation) throw ApiError.notFound('Cotización no encontrada');

    const payment = await Payment.findByPk(paymentId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!payment) throw ApiError.notFound('Pago no encontrado');

    const pagado = numberValue(quotation.pagado);
    const nuevoPagado = payment.estado === 'confirmado'
      ? moneyValue(Math.max(0, pagado - numberValue(payment.monto)))
      : pagado;

    await payment.destroy({ transaction });
    const pendingAmount = await getPendingAmount(quotation.id, transaction);
    await quotation.update(
      {
        pagado: nuevoPagado,
        estadoPago: getQuotationStatus(nuevoPagado, numberValue(quotation.total), pendingAmount),
      },
      { transaction },
    );

    return toQuotationSummary(quotation);
  });

  return { message: 'Pago anulado correctamente', quotation: summary };
};
