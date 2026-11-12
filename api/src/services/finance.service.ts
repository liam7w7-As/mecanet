import { getQuotationGrossTotal, QUOTATION_TAX_RATE } from '@unithor/shared';
import { Op, fn, literal } from 'sequelize';

import { listPayments } from './payment.service.js';
import { CashMovement } from '../models/CashMovement.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';

import type { PaymentPublic } from './payment.service.js';
import type { QuotationStatus } from '@unithor/shared';

interface PendingQuotationPublic {
  id: number;
  codigo: string;
  total: number;
  pagado: number;
  saldoPendiente: number;
  estadoPago: QuotationStatus;
  client: { id: number; nombre: string } | null;
}

export interface FinanceSummary {
  metrics: {
    revenueToday: number;
    revenueMonth: number;
    expensesToday: number;
    expensesMonth: number;
    netCashToday: number;
    receivableTotal: number;
    receivableCount: number;
    pendingTransferCount: number;
    pendingTransferAmount: number;
  };
  pendingTransfers: PaymentPublic[];
  recentPayments: PaymentPublic[];
  pendingQuotations: PendingQuotationPublic[];
}

const pendingQuotationStatuses: QuotationStatus[] = [
  'por_pagar',
  'parcial',
  'por_verificar',
];

const moneyValue = (value: number): number => Math.round(value * 100) / 100;

export const getFinanceSummary = async (): Promise<FinanceSummary> => {
  const now = new Date();
  // Match the UTC accounting dates used by daily cash and financial analytics.
  const todayStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1);
  const quotationWhere = { estadoPago: { [Op.in]: pendingQuotationStatuses } };

  const [
    revenueToday,
    revenueMonth,
    expensesToday,
    expensesMonth,
    manualIncomeToday,
    pendingTransferCount,
    pendingTransferAmount,
    receivableCount,
    receivableTotal,
    receivablePaid,
    pendingTransfers,
    recentPayments,
    pendingQuotations,
  ] = await Promise.all([
    Payment.sum('monto', {
      where: { estado: 'confirmado', fecha: { [Op.between]: [todayStart, todayEnd] } },
    }),
    Payment.sum('monto', {
      where: { estado: 'confirmado', fecha: { [Op.between]: [monthStart, monthEnd] } },
    }),
    CashMovement.sum('monto', {
      where: { tipo: 'egreso', voidedAt: null, fecha: { [Op.between]: [todayStart, todayEnd] } },
    }),
    CashMovement.sum('monto', {
      where: { tipo: 'egreso', voidedAt: null, fecha: { [Op.between]: [monthStart, monthEnd] } },
    }),
    CashMovement.sum('monto', {
      where: { tipo: 'ingreso', voidedAt: null, fecha: { [Op.between]: [todayStart, todayEnd] } },
    }),
    Payment.count({ where: { estado: 'por_verificar' } }),
    Payment.sum('monto', { where: { estado: 'por_verificar' } }),
    Quotation.count({ where: quotationWhere }),
    Quotation.findOne({
      // IVA is rounded per document before summing the payable totals.
      attributes: [[fn('SUM', literal(`\`Quotation\`.\`total\` + ROUND(\`Quotation\`.\`total\` * ${QUOTATION_TAX_RATE}, 0)`)), 'total']],
      where: quotationWhere,
      raw: true,
    }).then((row) => Number(row?.total ?? 0)),
    Quotation.sum('pagado', { where: quotationWhere }),
    listPayments({ page: 1, pageSize: 10, estado: 'por_verificar' }),
    listPayments({ page: 1, pageSize: 10 }),
    Quotation.findAll({
      where: quotationWhere,
      attributes: ['id', 'codigo', 'total', 'pagado', 'estadoPago'],
      include: [{ model: Client, attributes: ['id', 'nombre'] }],
      order: [['updatedAt', 'DESC']],
      limit: 8,
    }),
  ]);

  return {
    metrics: {
      revenueToday: Number(revenueToday ?? 0),
      revenueMonth: Number(revenueMonth ?? 0),
      expensesToday: Number(expensesToday ?? 0),
      expensesMonth: Number(expensesMonth ?? 0),
      netCashToday: moneyValue(
        Number(revenueToday ?? 0) +
        Number(manualIncomeToday ?? 0) -
        Number(expensesToday ?? 0),
      ),
      receivableTotal: moneyValue(Math.max(
        0,
        Number(receivableTotal ?? 0) - Number(receivablePaid ?? 0),
      )),
      receivableCount,
      pendingTransferCount,
      pendingTransferAmount: Number(pendingTransferAmount ?? 0),
    },
    pendingTransfers: pendingTransfers.items,
    recentPayments: recentPayments.items,
    pendingQuotations: pendingQuotations.map((quotation) => ({
      id: quotation.id,
      codigo: quotation.codigo,
      total: getQuotationGrossTotal(Number(quotation.total)),
      pagado: Number(quotation.pagado),
      saldoPendiente: moneyValue(Math.max(
        0,
        getQuotationGrossTotal(Number(quotation.total)) - Number(quotation.pagado),
      )),
      estadoPago: quotation.estadoPago,
      client: quotation.client
        ? { id: quotation.client.id, nombre: quotation.client.nombre }
        : null,
    })),
  };
};
