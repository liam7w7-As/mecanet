import { PAYMENT_METHODS } from '@unithor/shared';
import { fn, col, Op, Transaction } from 'sequelize';

import { sequelize } from '../config/database.js';
import { CashClosure } from '../models/CashClosure.js';
import { Payment } from '../models/Payment.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

import type { PaymentMethodTotals } from '../models/CashClosure.js';
import type { CloseCashDayInput, PaymentMethod } from '@unithor/shared';
import type { Transaction as SequelizeTransaction } from 'sequelize';

interface MethodAggregate {
  metodo: string | null;
  total: string | number | null;
}

export interface CashClosurePublic {
  id: number;
  fecha: string;
  totalesPorMetodo: PaymentMethodTotals;
  totalConfirmado: number;
  efectivoEsperado: number;
  efectivoDeclarado: number;
  diferenciaEfectivo: number;
  observaciones: string | null;
  closedBy: number | null;
  closedAt: Date;
  closer: { id: number; nombre: string } | null;
}

export interface DailyCashSummary {
  fecha: string;
  isClosed: boolean;
  totals: {
    confirmedTotal: number;
    pendingTransferCount: number;
    pendingTransferAmount: number;
    byMethod: PaymentMethodTotals;
  };
  closure: CashClosurePublic | null;
}

const closerInclude = {
  model: User,
  as: 'closer',
  attributes: ['id', 'nombre'],
};

const moneyValue = (value: number): number => Math.round(value * 100) / 100;

const emptyMethodTotals = (): PaymentMethodTotals => ({
  efectivo: 0,
  transferencia: 0,
  tarjeta_debito: 0,
  tarjeta_credito: 0,
  cheque: 0,
  otro: 0,
});

export const getAccountingDate = (date: Date): string => date.toISOString().slice(0, 10);

const getDateRange = (fecha: string): { start: Date; end: Date } => ({
  start: new Date(`${fecha}T00:00:00.000Z`),
  end: new Date(`${fecha}T23:59:59.999Z`),
});

const toClosurePublic = (closure: CashClosure): CashClosurePublic => ({
  id: closure.id,
  fecha: closure.fecha,
  totalesPorMetodo: closure.totalesPorMetodo,
  totalConfirmado: Number(closure.totalConfirmado),
  efectivoEsperado: Number(closure.efectivoEsperado),
  efectivoDeclarado: Number(closure.efectivoDeclarado),
  diferenciaEfectivo: Number(closure.diferenciaEfectivo),
  observaciones: closure.observaciones,
  closedBy: closure.closedBy,
  closedAt: closure.closedAt,
  closer: closure.closer
    ? { id: closure.closer.id, nombre: closure.closer.nombre }
    : null,
});

const getAggregates = async (
  fecha: string,
  transaction?: SequelizeTransaction,
): Promise<DailyCashSummary['totals']> => {
  const { start, end } = getDateRange(fecha);
  const [methodRows, pendingTransferCount, pendingTransferAmount] = await Promise.all([
    Payment.findAll({
      attributes: ['metodo', [fn('SUM', col('monto')), 'total']],
      where: { estado: 'confirmado', fecha: { [Op.between]: [start, end] } },
      group: ['metodo'],
      raw: true,
      transaction,
    }) as unknown as Promise<MethodAggregate[]>,
    Payment.count({
      where: {
        estado: 'por_verificar',
        metodo: 'transferencia',
        fecha: { [Op.between]: [start, end] },
      },
      transaction,
    }),
    Payment.sum('monto', {
      where: {
        estado: 'por_verificar',
        metodo: 'transferencia',
        fecha: { [Op.between]: [start, end] },
      },
      transaction,
    }),
  ]);

  const byMethod = emptyMethodTotals();
  for (const row of methodRows) {
    if (row.metodo && PAYMENT_METHODS.includes(row.metodo as PaymentMethod)) {
      byMethod[row.metodo as PaymentMethod] = moneyValue(Number(row.total ?? 0));
    }
  }

  return {
    confirmedTotal: moneyValue(
      Object.values(byMethod).reduce((total, amount) => total + amount, 0),
    ),
    pendingTransferCount,
    pendingTransferAmount: moneyValue(Number(pendingTransferAmount ?? 0)),
    byMethod,
  };
};

export const getDailyCashSummary = async (fecha: string): Promise<DailyCashSummary> => {
  const [totals, closure] = await Promise.all([
    getAggregates(fecha),
    CashClosure.findOne({ where: { fecha }, include: [closerInclude] }),
  ]);

  return {
    fecha,
    isClosed: closure !== null,
    totals,
    closure: closure ? toClosurePublic(closure) : null,
  };
};

export const assertAccountingDateOpen = async (
  date: Date,
  transaction: SequelizeTransaction,
): Promise<void> => {
  const fecha = getAccountingDate(date);
  const closure = await CashClosure.findOne({ where: { fecha }, transaction });
  if (closure) {
    throw ApiError.badRequest(`La caja del ${fecha} ya está cerrada y no admite movimientos`);
  }
};

export const closeCashDay = async (
  data: CloseCashDayInput,
  userId: number,
): Promise<DailyCashSummary> => {
  await sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
    async (transaction) => {
      const existing = await CashClosure.findOne({
        where: { fecha: data.fecha },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existing) throw ApiError.conflict('La jornada seleccionada ya fue cerrada');

      const totals = await getAggregates(data.fecha, transaction);
      if (totals.pendingTransferCount > 0) {
        throw ApiError.badRequest(
          `No se puede cerrar la jornada: existen ${totals.pendingTransferCount} transferencia(s) pendientes de verificación`,
        );
      }

      const efectivoDeclarado = moneyValue(Number(data.efectivoDeclarado));
      const efectivoEsperado = totals.byMethod.efectivo;
      await CashClosure.create(
        {
          fecha: data.fecha,
          totalesPorMetodo: totals.byMethod,
          totalConfirmado: totals.confirmedTotal,
          efectivoEsperado,
          efectivoDeclarado,
          diferenciaEfectivo: moneyValue(efectivoDeclarado - efectivoEsperado),
          observaciones: data.observaciones || null,
          closedBy: userId,
          closedAt: new Date(),
        },
        { transaction },
      );
    },
  );

  return getDailyCashSummary(data.fecha);
};
