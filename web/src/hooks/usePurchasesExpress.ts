import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type { ExpressFleetOption } from '../lib/purchase-express-recovery';
import type { Purchase, PurchaseCreator } from '../types/entities';
import type {
  CompleteExpressExpenseInput,
  CreateExpressExpenseInput,
  CreateExpressPurchaseSubmission,
  ExpressOrderOption,
  ExpressPurchaseRequest,
  ExpressScanResult,
} from '@unithor/shared';

export const useExpressRequests = (search: string, enabled = true) => {
  const viewer = useAuthStore((state) => state.user ? `${state.user.id}:${state.user.role}` : null);
  return useQuery({
    queryKey: ['purchases', 'express-requests', search, viewer],
    queryFn: async () =>
      (
        await api.get<{ items: ExpressPurchaseRequest[]; total?: number; scannerConfigured: boolean }>(
          '/purchases/express/requests',
          { params: { search: search || undefined } },
        )
      ).data,
    enabled,
  });
};
export const useExpressOrders = (search: string, enabled: boolean, completion = false) => {
  const viewer = useAuthStore((state) => state.user ? `${state.user.id}:${state.user.role}` : null);
  return useQuery({
    queryKey: ['purchases', 'express-orders', search, completion, viewer],
    queryFn: async () =>
      (
        await api.get<{ items: ExpressOrderOption[] }>(completion ? '/purchases/express/completion-orders' : '/purchases/express/orders', {
          params: { search: search || undefined },
        })
      ).data.items,
    enabled,
  });
};
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
export const useExpressFleet = (search: string) => {
  const viewer = useAuthStore((state) => state.user ? `${state.user.id}:${state.user.role}` : null);
  return useQuery({
    queryKey: ['purchases', 'express-fleet', search, viewer],
    queryFn: async () => (await api.get<{ items: ExpressFleetOption[] }>('/purchases/express/fleet', { params: { search: search || undefined } })).data.items,
  });
};

export function usePurchaseCreators(enabled: boolean) {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: ['purchases', 'creators', userId], enabled,
    queryFn: async () => (await api.get<{ items: PurchaseCreator[] }>('/purchases/creators')).data.items,
  });
}

export const useCreateExpressPurchase = () => {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ data, file }: { data: CreateExpressPurchaseSubmission | CreateExpressExpenseInput; file: File | null }) => {
      const body = new FormData();
      body.append('payload', JSON.stringify(data));
      if (file) body.append('comprobante', file);
      const endpoint = 'monto' in data ? '/purchases/express/expense' : '/purchases/express';
      return (await api.post<{ purchase: Purchase }>(endpoint, body)).data.purchase;
    },
    onSuccess: () => {
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

export function useConfirmExpressPurchase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.patch<{ purchase: Purchase }>(`/purchases/${id}/confirm`)).data.purchase,
    onSuccess: () => client.invalidateQueries({ queryKey: ['purchases'] }),
  });
}

export function useCompleteExpressExpense() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, file }: { id: number; data: CompleteExpressExpenseInput; file: File | null }) => {
      const body = new FormData();
      body.append('payload', JSON.stringify(data));
      if (file) body.append('comprobante', file);
      return (await api.patch<{ purchase: Purchase }>(`/purchases/${id}/complete`, body)).data.purchase;
    },
    onSuccess: () => {
      for (const key of ['purchases', 'work-orders', 'quotations', 'dashboard', 'work-order-quality']) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
