import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { quotationKeys } from './useQuotations';
import { api } from '../lib/api';

import type { Payment, PaymentQuotationSummary, QuotationPaymentSummary } from '../types/entities';
import type { CommercialReportFilters, CreatePaymentInput } from '@unithor/shared';

interface CreatePaymentResponse {
  payment: Payment;
  quotation: PaymentQuotationSummary;
}

interface DeletePaymentResponse {
  message: string;
  quotation: PaymentQuotationSummary;
}

export const paymentKeys = {
  all: ['quotation-payments'] as const,
  quotation: (quotationId: number) => [...paymentKeys.all, quotationId] as const,
};

export const useQuotationPayments = (quotationId: number) =>
  useQuery({
    queryKey: paymentKeys.quotation(quotationId),
    queryFn: async () => {
      const response = await api.get<QuotationPaymentSummary>(
        `/quotations/${quotationId}/payments`,
      );
      return response.data;
    },
    enabled: Number.isInteger(quotationId) && quotationId > 0,
  });

const updatePaymentSummary = (
  current: QuotationPaymentSummary | undefined,
  quotation: PaymentQuotationSummary,
  payments?: Payment[],
): QuotationPaymentSummary => ({
  quotationId: quotation.id,
  total: quotation.total,
  pagado: quotation.pagado,
  saldoPendiente: quotation.saldoPendiente,
  estadoPago: quotation.estadoPago,
  payments: payments ?? current?.payments ?? [],
});

export const useCreatePaymentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePaymentInput | FormData) => {
      const response = await api.post<CreatePaymentResponse>('/payments', data);
      return response.data;
    },
    onSuccess: ({ payment, quotation }) => {
      queryClient.setQueryData<QuotationPaymentSummary>(
        paymentKeys.quotation(quotation.id),
        (current) =>
          updatePaymentSummary(current, quotation, [payment, ...(current?.payments ?? [])]),
      );
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      void queryClient.invalidateQueries({ queryKey: paymentKeys.quotation(quotation.id) });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useDeletePaymentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentId, quotationId }: { paymentId: number; quotationId: number }) => {
      const response = await api.delete<DeletePaymentResponse>(`/payments/${paymentId}`);
      return { ...response.data, paymentId, quotationId };
    },
    onSuccess: ({ quotation, paymentId, quotationId }) => {
      queryClient.setQueryData<QuotationPaymentSummary>(
        paymentKeys.quotation(quotationId),
        (current) =>
          updatePaymentSummary(
            current,
            quotation,
            current?.payments.filter((payment) => payment.id !== paymentId),
          ),
      );
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      void queryClient.invalidateQueries({ queryKey: paymentKeys.quotation(quotationId) });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

const downloadExcel = (blob: Blob): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `Reporte_Comercial_UNITHOR_${Date.now()}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
};

export const useDownloadCommercialExcel = () =>
  useMutation({
    mutationFn: async (filters: CommercialReportFilters) => {
      const response = await api.get<Blob>('/reports/commercial/excel', {
        params: filters,
        responseType: 'blob',
      });
      return response.data;
    },
    onSuccess: downloadExcel,
  });
