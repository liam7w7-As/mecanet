import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { paymentKeys } from './usePayments';
import { quotationKeys } from './useQuotations';
import { api } from '../lib/api';

import type { Payment, PaymentQuotationSummary } from '../types/entities';
import type {
  CloseCashDayInput,
  PaymentMethod,
  QuotationStatus,
  VerifyPaymentInput,
} from '@unithor/shared';

export interface FinanceSummary {
  metrics: {
    revenueToday: number;
    revenueMonth: number;
    receivableTotal: number;
    receivableCount: number;
    pendingTransferCount: number;
    pendingTransferAmount: number;
  };
  pendingTransfers: Payment[];
  recentPayments: Payment[];
  pendingQuotations: Array<{
    id: number;
    codigo: string;
    total: number;
    pagado: number;
    saldoPendiente: number;
    estadoPago: QuotationStatus;
    client: { id: number; nombre: string } | null;
  }>;
}

export interface CashClosure {
  id: number;
  fecha: string;
  totalesPorMetodo: Record<PaymentMethod, number>;
  totalConfirmado: number;
  efectivoEsperado: number;
  efectivoDeclarado: number;
  diferenciaEfectivo: number;
  observaciones: string | null;
  closedBy: number | null;
  closedAt: string;
  closer: { id: number; nombre: string } | null;
}

export interface DailyCashSummary {
  fecha: string;
  isClosed: boolean;
  totals: {
    confirmedTotal: number;
    pendingTransferCount: number;
    pendingTransferAmount: number;
    byMethod: Record<PaymentMethod, number>;
  };
  closure: CashClosure | null;
}

interface VerifyPaymentResponse {
  payment: Payment;
  quotation: PaymentQuotationSummary;
}

export const financeKeys = {
  all: ['finance'] as const,
  summary: () => [...financeKeys.all, 'summary'] as const,
  day: (fecha: string) => [...financeKeys.all, 'day', fecha] as const,
};

export const useFinanceSummary = () =>
  useQuery({
    queryKey: financeKeys.summary(),
    queryFn: async () => {
      const response = await api.get<FinanceSummary>('/finance/summary');
      return response.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

export const useDailyCashSummary = (fecha: string) =>
  useQuery({
    queryKey: financeKeys.day(fecha),
    queryFn: async () => {
      const response = await api.get<DailyCashSummary>('/finance/day', {
        params: { fecha },
      });
      return response.data;
    },
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    staleTime: 15_000,
  });

export const useCloseCashDayMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CloseCashDayInput) => {
      const response = await api.post<DailyCashSummary>('/finance/cash-closures', data);
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(financeKeys.day(result.fecha), result);
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
};

export const useVerifyPaymentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      data,
    }: {
      paymentId: number;
      data: VerifyPaymentInput;
    }) => {
      const response = await api.patch<VerifyPaymentResponse>(
        `/payments/${paymentId}/verify`,
        data,
      );
      return response.data;
    },
    onSuccess: ({ quotation }) => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      void queryClient.invalidateQueries({ queryKey: paymentKeys.quotation(quotation.id) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
