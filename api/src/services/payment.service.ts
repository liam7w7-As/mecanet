import { Op, Transaction } from 'sequelize';

import { sequelize } from '../config/database.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination } from '../utils/paginate.js';

import type {
  CreatePaymentInput,
  PaymentMethod,
  PaymentQueryInput,
  QuotationStatus,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

interface PaymentCreatorPublic {
  id: number;
  nombre: string;
}

interface PaymentQuotationPublic {
  id: number;
  codigo: string;
  total: number;
}

export interface PaymentPublic {
  id: number;
  quotationId: number;
  monto: number;
  metodo: string | null;
  fecha: Date;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  creator?: PaymentCreatorPublic | null;
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

const quotationInclude = {
  model: Quotation,
  attributes: ['id', 'codigo', 'total'],
};

const numberValue = (value: number | string): number => Number(value);

const moneyValue = (value: number): number => Math.round(value * 100) / 100;

const toDateOrNow = (value: string | undefined): Date => {
  if (value === undefined) {
    return new Date();
  }

  return new Date(value);
};

const toPaymentPublic = (payment: Payment): PaymentPublic => ({
  id: payment.id,
  quotationId: payment.quotationId,
  monto: numberValue(payment.monto),
  metodo: payment.metodo,
  fecha: payment.fecha,
  createdBy: payment.createdBy,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
  creator: payment.creator
    ? {
        id: payment.creator.id,
        nombre: payment.creator.nombre,
      }
    : payment.createdBy === null
      ? null
      : undefined,
  quotation: payment.quotation
    ? {
        id: payment.quotation.id,
        codigo: payment.quotation.codigo,
        total: numberValue(payment.quotation.total),
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
  const payment = await Payment.findByPk(id, {
    include: [creatorInclude, quotationInclude],
    transaction,
  });

  if (!payment) {
    throw ApiError.notFound('Pago no encontrado');
  }

  return toPaymentPublic(payment);
};

export const listPayments = async (
  query: PaymentQueryInput,
): Promise<ListPaymentsResult> => {
  const pagination = getPagination(query);
  const where: PaymentWhere = {};

  if (query.quotationId !== undefined) {
    where.quotationId = query.quotationId;
  }

  if (query.metodo !== undefined) {
    where.metodo = query.metodo;
  }

  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) {
      range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    }
    if (query.fechaHasta) {
      range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    }
    where.fecha = range;
  }

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [creatorInclude, quotationInclude],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
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
  if (!quotation) {
    throw ApiError.notFound('Cotización no encontrada');
  }

  const payments = await Payment.findAll({
    where: { quotationId },
    include: [creatorInclude],
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
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

    if (!quotation) {
      throw ApiError.notFound('Cotización no encontrada');
    }

    const total = numberValue(quotation.total);
    const pagado = numberValue(quotation.pagado);

    if (quotation.estadoPago === 'total' || pagado >= total) {
      throw ApiError.badRequest('La cotización ya se encuentra pagada en su totalidad');
    }

    const saldoRestante = moneyValue(total - pagado);
    const monto = moneyValue(Number(data.monto));

    if (monto > saldoRestante) {
      throw ApiError.badRequest(
        `El abono supera el saldo pendiente. Saldo restante: ${saldoRestante}`,
      );
    }

    const payment = await Payment.create(
      {
        quotationId: data.quotationId,
        monto,
        metodo: data.metodo satisfies PaymentMethod,
        fecha: toDateOrNow(data.fecha),
        createdBy: userId,
      },
      { transaction },
    );

    const nuevoPagado = moneyValue(pagado + monto);
    await quotation.update(
      {
        pagado: nuevoPagado,
        estadoPago: nuevoPagado >= total ? 'total' : 'parcial',
      },
      { transaction },
    );

    return {
      paymentId: payment.id,
      quotationId: quotation.id,
    };
  });

  const [payment, quotation] = await Promise.all([
    getPaymentById(result.paymentId),
    Quotation.findByPk(result.quotationId),
  ]);

  if (!quotation) {
    throw ApiError.notFound('Cotización no encontrada');
  }

  return {
    payment,
    quotation: toQuotationSummary(quotation),
  };
};

export const deletePayment = async (paymentId: number): Promise<DeletePaymentResult> => {
  const summary = await sequelize.transaction(async (transaction) => {
    const payment = await Payment.findByPk(paymentId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!payment) {
      throw ApiError.notFound('Pago no encontrado');
    }

    const quotation = await Quotation.findByPk(payment.quotationId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!quotation) {
      throw ApiError.notFound('Cotización no encontrada');
    }

    const nuevoPagado = moneyValue(
      Math.max(0, numberValue(quotation.pagado) - numberValue(payment.monto)),
    );

    await quotation.update(
      {
        pagado: nuevoPagado,
        estadoPago: nuevoPagado === 0 ? 'por_pagar' : 'parcial',
      },
      { transaction },
    );

    await payment.destroy({ transaction });

    return toQuotationSummary(quotation);
  });

  return {
    message: 'Pago anulado correctamente',
    quotation: summary,
  };
};
