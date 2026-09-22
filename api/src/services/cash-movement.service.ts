import { Op, Transaction } from 'sequelize';

import { assertAccountingDateOpen, getAccountingDate } from './cash-closure.service.js';
import { sequelize } from '../config/database.js';
import { CashMovement } from '../models/CashMovement.js';
import { Payment } from '../models/Payment.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

import type {
  CashMovementCategory,
  CashMovementType,
  CreateCashMovementInput,
  PaymentMethod,
} from '@unithor/shared';
import type { Transaction as SequelizeTransaction } from 'sequelize';

export interface CashMovementPublic {
  id: number;
  tipo: CashMovementType;
  categoria: CashMovementCategory;
  monto: number;
  metodo: PaymentMethod;
  descripcion: string;
  referencia: string | null;
  fecha: Date;
  createdBy: number | null;
  voidedAt: Date | null;
  voidedBy: number | null;
  voidReason: string | null;
  createdAt: Date;
  creator: { id: number; nombre: string } | null;
  voider: { id: number; nombre: string } | null;
}

const userAttributes = ['id', 'nombre'];
const movementIncludes = [
  { model: User, as: 'creator', attributes: userAttributes },
  { model: User, as: 'voider', attributes: userAttributes },
];

const moneyValue = (value: number): number => Math.round(value * 100) / 100;

const toPublic = (movement: CashMovement): CashMovementPublic => ({
  id: movement.id,
  tipo: movement.tipo,
  categoria: movement.categoria,
  monto: moneyValue(Number(movement.monto)),
  metodo: movement.metodo,
  descripcion: movement.descripcion,
  referencia: movement.referencia,
  fecha: movement.fecha,
  createdBy: movement.createdBy,
  voidedAt: movement.voidedAt,
  voidedBy: movement.voidedBy,
  voidReason: movement.voidReason,
  createdAt: movement.createdAt,
  creator: movement.creator
    ? { id: movement.creator.id, nombre: movement.creator.nombre }
    : null,
  voider: movement.voider ? { id: movement.voider.id, nombre: movement.voider.nombre } : null,
});

const getDateRange = (fecha: string): { start: Date; end: Date } => ({
  start: new Date(`${fecha}T00:00:00.000Z`),
  end: new Date(`${fecha}T23:59:59.999Z`),
});

const getMovementById = async (
  id: number,
  transaction?: SequelizeTransaction,
): Promise<CashMovementPublic> => {
  const movement = await CashMovement.findByPk(id, {
    include: movementIncludes,
    transaction,
  });
  if (!movement) throw ApiError.notFound('Movimiento de caja no encontrado');
  return toPublic(movement);
};

const getAvailableCash = async (
  fecha: Date,
  transaction: SequelizeTransaction,
): Promise<number> => {
  const { start, end } = getDateRange(getAccountingDate(fecha));
  const [paymentCash, manualIncome, manualExpenses] = await Promise.all([
    Payment.sum('monto', {
      where: {
        estado: 'confirmado',
        metodo: 'efectivo',
        fecha: { [Op.between]: [start, end] },
      },
      transaction,
    }),
    CashMovement.sum('monto', {
      where: {
        tipo: 'ingreso',
        metodo: 'efectivo',
        voidedAt: null,
        fecha: { [Op.between]: [start, end] },
      },
      transaction,
    }),
    CashMovement.sum('monto', {
      where: {
        tipo: 'egreso',
        metodo: 'efectivo',
        voidedAt: null,
        fecha: { [Op.between]: [start, end] },
      },
      transaction,
    }),
  ]);

  return moneyValue(
    Number(paymentCash ?? 0) + Number(manualIncome ?? 0) - Number(manualExpenses ?? 0),
  );
};

export const listCashMovements = async (fecha: string): Promise<CashMovementPublic[]> => {
  const { start, end } = getDateRange(fecha);
  const movements = await CashMovement.findAll({
    where: { fecha: { [Op.between]: [start, end] } },
    include: movementIncludes,
    order: [['fecha', 'DESC'], ['id', 'DESC']],
  });

  return movements.map(toPublic);
};

export const createCashMovement = async (
  data: CreateCashMovementInput,
  userId: number,
): Promise<CashMovementPublic> => {
  const movementId = await sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
    async (transaction) => {
      const fecha = data.fecha ? new Date(data.fecha) : new Date();
      await assertAccountingDateOpen(fecha, transaction);

      const amount = moneyValue(Number(data.monto));
      if (data.tipo === 'egreso' && data.metodo === 'efectivo') {
        const availableCash = await getAvailableCash(fecha, transaction);
        if (amount > availableCash) {
          throw ApiError.badRequest(
            `Efectivo insuficiente. Disponible en caja: ${availableCash}`,
          );
        }
      }

      const movement = await CashMovement.create(
        {
          tipo: data.tipo,
          categoria: data.categoria,
          monto: amount,
          metodo: data.metodo,
          descripcion: data.descripcion,
          referencia: data.referencia || null,
          fecha,
          createdBy: userId,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
        },
        { transaction },
      );
      return movement.id;
    },
  );

  return getMovementById(movementId);
};

export const voidCashMovement = async (
  id: number,
  motivo: string,
  userId: number,
): Promise<CashMovementPublic> => {
  await sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
    async (transaction) => {
      const movement = await CashMovement.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!movement) throw ApiError.notFound('Movimiento de caja no encontrado');
      if (movement.voidedAt) throw ApiError.conflict('El movimiento ya fue anulado');

      await assertAccountingDateOpen(movement.fecha, transaction);
      await movement.update(
        { voidedAt: new Date(), voidedBy: userId, voidReason: motivo },
        { transaction },
      );
    },
  );

  return getMovementById(id);
};
