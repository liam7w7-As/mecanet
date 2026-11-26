import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

import type { Purchase } from '../types/entities';
import type {
  CreateExpressPurchaseSubmission,
  ExpressOrderOption,
  ExpressPurchaseRequest,
  ExpressScanResult,
} from '@unithor/shared';

export const useExpressRequests = (search: string, enabled = true) =>
  useQuery({
    queryKey: ['purchases', 'express-requests', search],
    queryFn: async () =>
      (
        await api.get<{ items: ExpressPurchaseRequest[]; scannerConfigured: boolean }>(
          '/purchases/express/requests',
          { params: { search: search || undefined } },
        )
      ).data,
    enabled,
  });
export const useExpressOrders = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: ['purchases', 'express-orders', search],
    queryFn: async () =>
      (
        await api.get<{ items: ExpressOrderOption[] }>('/purchases/express/orders', {
          params: { search: search || undefined },
        })
      ).data.items,
    enabled,
  });
export const useScanPurchase = () =>
  useMutation({
    retry: false,
    mutationFn: async ({ file, signal }: { file: File; signal: AbortSignal }) => {
      const body = new FormData();
      body.append('comprobante', file);
      return (
        await api.post<ExpressScanResult>('/purchases/express/scan', body, {
          signal,
          timeout: 55_000,
        })
      ).data;
    },
  });
export const useCreateExpressPurchase = () => {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ data, file }: { data: CreateExpressPurchaseSubmission; file: File | null }) => {
      const body = new FormData();
      body.append('payload', JSON.stringify(data));
      if (file) body.append('comprobante', file);
      return (await api.post<{ purchase: Purchase }>('/purchases/express', body)).data.purchase;
    },
    onSuccess: (purchase) => {
      client.setQueryData(['purchases', 'detail', purchase.id], purchase);
      for (const key of [
        'purchases',
        'suppliers',
        'finance',
        'dashboard',
        'work-orders',
        'work-order-labor',
        'warehouses',
        'quotations',
        'quotation-payments',
        'work-order-quality',
      ]) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
};
