import { Op, Sequelize, Transaction } from 'sequelize';

import { Quotation } from '../models/Quotation.js';
import { WorkOrder } from '../models/WorkOrder.js';

interface CodeSequenceOptions {
  model: typeof WorkOrder | typeof Quotation;
  prefix: string;
  year?: number;
  transaction?: Transaction;
}

/**
 * Genera un código secuencial correlativo en formato PREFIX-YYYY-NNNN.
 * Utiliza SELECT ... FOR UPDATE cuando se provee una transacción para asegurar concurrencia atómica.
 */
export const generateSequenceCode = async ({
  model,
  prefix,
  year = new Date().getFullYear(),
  transaction,
}: CodeSequenceOptions): Promise<string> => {
  const codePrefix = `${prefix}-${year}-`;

  const lastRecord =
    model === WorkOrder
      ? await WorkOrder.findOne({
          where: {
            codigo: {
              [Op.like]: `${codePrefix}%`,
            },
          },
          order: [
            [Sequelize.literal('LENGTH(codigo)'), 'DESC'],
            ['codigo', 'DESC'],
          ],
          paranoid: false,
          transaction,
          lock: transaction ? Transaction.LOCK.UPDATE : undefined,
        })
      : await Quotation.findOne({
          where: {
            codigo: {
              [Op.like]: `${codePrefix}%`,
            },
          },
          order: [
            [Sequelize.literal('LENGTH(codigo)'), 'DESC'],
            ['codigo', 'DESC'],
          ],
          paranoid: false,
          transaction,
          lock: transaction ? Transaction.LOCK.UPDATE : undefined,
        });

  if (!lastRecord || !lastRecord.codigo) {
    return `${codePrefix}0001`;
  }

  const parts = lastRecord.codigo.split('-');
  const lastNumberStr = parts[parts.length - 1];
  const lastNumber = parseInt(lastNumberStr, 10);
  const nextNumber = Number.isNaN(lastNumber) ? 1 : lastNumber + 1;

  const paddedNumber = String(nextNumber).padStart(4, '0');
  return `${codePrefix}${paddedNumber}`;
};

/**
 * Genera el siguiente código para Órdenes de Trabajo: OT-YYYY-NNNN
 */
export const generateWorkOrderCode = async (
  transaction?: Transaction,
  year?: number,
): Promise<string> => {
  return generateSequenceCode({
    model: WorkOrder,
    prefix: 'OT',
    year,
    transaction,
  });
};

/**
 * Genera el siguiente código para Cotizaciones: COT-YYYY-NNNN
 */
export const generateQuotationCode = async (
  transaction?: Transaction,
  year?: number,
): Promise<string> => {
  return generateSequenceCode({
    model: Quotation,
    prefix: 'COT',
    year,
    transaction,
  });
};

/**
 * Helper para reintentar operaciones de creación en caso de conflicto de código por carrera.
 */
export const withCodeRetry = async <T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries = 3,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: unknown) {
      lastError = err;
      if (attempt >= maxRetries) {
        break;
      }
    }
  }
  throw lastError;
};
