import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

import type { CatalogItem, PaginatedResponse } from '../types/entities';
import type {
  CatalogItemQueryInput,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  UpdateStockInput,
} from '@unithor/shared';

interface CatalogItemResponse {
  item: CatalogItem;
}

export interface StockAdjustmentResponse {
  item: CatalogItem;
  stockAnterior: number;
  nuevoStock: number;
  delta: number;
  motivo: string | null;
}

export type CatalogQueryParams = Partial<CatalogItemQueryInput>;

export const catalogKeys = {
  all: ['catalog'] as const,
  lists: () => [...catalogKeys.all, 'list'] as const,
  list: (params: CatalogQueryParams) => [...catalogKeys.lists(), params] as const,
};

const replaceCatalogItem = (
  current: PaginatedResponse<CatalogItem> | undefined,
  item: CatalogItem,
): PaginatedResponse<CatalogItem> | undefined => {
  if (!current) return current;

  return {
    ...current,
    items: current.items.map((currentItem) => (currentItem.id === item.id ? item : currentItem)),
  };
};

export const useCatalogItems = (queryParams: CatalogQueryParams) =>
  useQuery({
    queryKey: catalogKeys.list(queryParams),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CatalogItem>>('/catalog', {
        params: queryParams,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useCreateCatalogItemMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCatalogItemInput) => {
      const response = await api.post<CatalogItemResponse>('/catalog', data);
      return response.data.item;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useUpdateCatalogItemMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateCatalogItemInput }) => {
      const response = await api.patch<CatalogItemResponse>(`/catalog/${id}`, data);
      return response.data.item;
    },
    onSuccess: (item) => {
      queryClient.setQueriesData<PaginatedResponse<CatalogItem>>(
        { queryKey: catalogKeys.lists() },
        (current) => replaceCatalogItem(current, item),
      );
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useAdjustStockMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateStockInput }) => {
      const response = await api.post<StockAdjustmentResponse>(`/catalog/${id}/stock`, data);
      return response.data;
    },
    onSuccess: ({ item }) => {
      queryClient.setQueriesData<PaginatedResponse<CatalogItem>>(
        { queryKey: catalogKeys.lists() },
        (current) => replaceCatalogItem(current, item),
      );
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useDeleteCatalogItemMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/catalog/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
