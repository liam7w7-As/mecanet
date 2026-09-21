import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { paymentKeys } from './usePayments';
import { quotationKeys } from './useQuotations';
import { api } from '../lib/api';

import type { Payment, PaymentQuotationSummary } from '../types/entities';
import type { QuotationStatus, VerifyPaymentInput } from '@unithor/shared';

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

interface VerifyPaymentResponse {
  payment: Payment;
  quotation: PaymentQuotationSummary;
}

export const financeKeys = {
  all: ['finance'] as const,
  summary: () => [...financeKeys.all, 'summary'] as const,
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
