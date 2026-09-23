import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from './useDebouncedValue';
import { api } from '../lib/api';

import type { PaginatedResponse, StockBalance, StockMovement, Warehouse } from '../types/entities';
import type {
  CreateStockMovementInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  StockMovementType,
  UpdateWarehouseInput,
} from '@unithor/shared';

export const warehouseKeys = {
  all: ['warehouses'] as const,
  lists: () => [...warehouseKeys.all, 'list'] as const,
  list: (params: WarehouseQueryParams) => [...warehouseKeys.lists(), params] as const,
  balances: (id: number) => [...warehouseKeys.all, 'balances', id] as const,
  movements: (params: MovementQueryParams) => [...warehouseKeys.all, 'movements', params] as const,
};

export interface WarehouseQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  soloActivos?: boolean;
}

export interface MovementQueryParams {
  page?: number;
  pageSize?: number;
  catalogItemId?: number;
  warehouseId?: number;
  tipo?: StockMovementType;
  fechaDesde?: string;
  fechaHasta?: string;
}

export const useWarehouses = (params: WarehouseQueryParams) =>
  useQuery({
    queryKey: warehouseKeys.list(params),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Warehouse>>('/warehouses', { params });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useWarehouseBalances = (warehouseId: number | null) =>
  useQuery({
    queryKey: warehouseKeys.balances(warehouseId ?? 0),
    queryFn: async () => {
      const response = await api.get<{ balances: StockBalance[] }>(`/warehouses/${warehouseId}/balances`);
      return response.data.balances;
    },
    enabled: warehouseId !== null && warehouseId > 0,
  });

export const useStockMovements = (params: MovementQueryParams) =>
  useQuery({
    queryKey: warehouseKeys.movements(params),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<StockMovement>>('/warehouses/movements/all', {
        params,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useCreateWarehouseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateWarehouseInput) => {
      const response = await api.post<{ warehouse: Warehouse }>('/warehouses', data);
      return response.data.warehouse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: warehouseKeys.lists() });
    },
  });
};

export const useUpdateWarehouseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateWarehouseInput }) => {
      const response = await api.patch<{ warehouse: Warehouse }>(`/warehouses/${id}`, data);
      return response.data.warehouse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
    },
  });
};

export const useCreateStockMovementMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateStockMovementInput) => {
      const response = await api.post<{ movement: StockMovement }>('/warehouses/movements', data);
      return response.data.movement;
    },
    onSuccess: (movement) => {
      void queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
};

export const useCreateStockTransferMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateStockTransferInput) => {
      const response = await api.post<{
        salida: import('../types/entities').StockMovement;
        ingreso: import('../types/entities').StockMovement;
        referencia: string;
      }>('/warehouses/transfers', data);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
};

export const useCatalogParts = (term: string) => {
  const debouncedTerm = useDebouncedValue(term.trim(), 250);
  return useQuery({
    queryKey: ['catalog', 'parts-picker', debouncedTerm],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<import('../types/entities').CatalogItem>>(
        '/catalog',
        { params: { page: 1, pageSize: 12, search: debouncedTerm || undefined, tipo: 'parte' } },
      );
      return response.data;
    },
    staleTime: 60_000,
  });
};
