import { Op } from 'sequelize';

import { listPayments } from './payment.service.js';
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

export const getFinanceSummary = async (): Promise<FinanceSummary> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const quotationWhere = { estadoPago: { [Op.in]: pendingQuotationStatuses } };

  const [
    revenueToday,
    revenueMonth,
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
      where: { estado: 'confirmado', fecha: { [Op.gte]: todayStart } },
    }),
    Payment.sum('monto', {
      where: { estado: 'confirmado', fecha: { [Op.gte]: monthStart } },
    }),
    Payment.count({ where: { estado: 'por_verificar' } }),
    Payment.sum('monto', { where: { estado: 'por_verificar' } }),
    Quotation.count({ where: quotationWhere }),
    Quotation.sum('total', { where: quotationWhere }),
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
      receivableTotal: Math.max(
        0,
        Number(receivableTotal ?? 0) - Number(receivablePaid ?? 0),
      ),
      receivableCount,
      pendingTransferCount,
      pendingTransferAmount: Number(pendingTransferAmount ?? 0),
    },
    pendingTransfers: pendingTransfers.items,
    recentPayments: recentPayments.items,
    pendingQuotations: pendingQuotations.map((quotation) => ({
      id: quotation.id,
      codigo: quotation.codigo,
      total: Number(quotation.total),
      pagado: Number(quotation.pagado),
      saldoPendiente: Math.max(0, Number(quotation.total) - Number(quotation.pagado)),
      estadoPago: quotation.estadoPago,
      client: quotation.client
        ? { id: quotation.client.id, nombre: quotation.client.nombre }
        : null,
    })),
  };
};
