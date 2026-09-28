import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from './useDebouncedValue';
import { api } from '../lib/api';

import type {
  PaginatedResponse,
  StockBalance,
  StockMovement,
  Warehouse,
  WarehouseWorkOrderRequest,
} from '../types/entities';
import type {
  CreateStockMovementInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  StockMovementType,
  UpdateWarehouseInput,
  WorkOrderRequestStatus,
} from '@unithor/shared';

export const warehouseKeys = {
  all: ['warehouses'] as const,
  lists: () => [...warehouseKeys.all, 'list'] as const,
  list: (params: WarehouseQueryParams) => [...warehouseKeys.lists(), params] as const,
  balances: (id: number) => [...warehouseKeys.all, 'balances', id] as const,
  catalogInventory: (catalogItemId: number) =>
    [...warehouseKeys.all, 'catalog-inventory', catalogItemId] as const,
  movements: (params: MovementQueryParams) => [...warehouseKeys.all, 'movements', params] as const,
  requests: (params: WarehouseRequestQueryParams) =>
    [...warehouseKeys.all, 'requests', params] as const,
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

export interface WarehouseRequestQueryParams {
  page?: number;
  pageSize?: number;
  estado?: WorkOrderRequestStatus;
  search?: string;
}

export interface CatalogWarehouseInventory {
  warehouse: Warehouse;
  balance: StockBalance | null;
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
      const response = await api.get<{ balances: StockBalance[] }>(
        `/warehouses/${warehouseId}/balances`,
      );
      return response.data.balances;
    },
    enabled: warehouseId !== null && warehouseId > 0,
  });

export const useCatalogItemInventory = (catalogItemId: number | null, enabled = true) =>
  useQuery({
    queryKey: warehouseKeys.catalogInventory(catalogItemId ?? 0),
    queryFn: async (): Promise<CatalogWarehouseInventory[]> => {
      const warehousesResponse = await api.get<PaginatedResponse<Warehouse>>('/warehouses', {
        params: { page: 1, pageSize: 100 },
      });
      const warehouses = warehousesResponse.data.items;
      const balanceResponses = await Promise.all(
        warehouses.map((warehouse) =>
          api.get<{ balances: StockBalance[] }>(`/warehouses/${warehouse.id}/balances`),
        ),
      );

      return warehouses.map((warehouse, index) => ({
        warehouse,
        balance:
          balanceResponses[index]?.data.balances.find(
            (balance) => balance.catalogItemId === catalogItemId,
          ) ?? null,
      }));
    },
    enabled: enabled && catalogItemId !== null && catalogItemId > 0,
    staleTime: 30_000,
  });

export const useStockMovements = (params: MovementQueryParams, enabled = true) =>
  useQuery({
    queryKey: warehouseKeys.movements(params),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<StockMovement>>(
        '/warehouses/movements/all',
        {
          params,
        },
      );
      return response.data;
    },
    placeholderData: keepPreviousData,
    enabled,
  });

export const useWarehouseRequests = (params: WarehouseRequestQueryParams) =>
  useQuery({
    queryKey: warehouseKeys.requests(params),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<WarehouseWorkOrderRequest>>(
        '/warehouses/requests',
        { params },
      );
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useDeliverWarehouseRequestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      warehouseId,
      comentario,
    }: {
      requestId: number;
      warehouseId: number;
      comentario?: string;
    }) => {
      const response = await api.post<{ request: WarehouseWorkOrderRequest }>(
        `/warehouses/requests/${requestId}/deliver`,
        { warehouseId, comentario },
      );
      return response.data.request;
    },
    onSuccess: (request) => {
      void queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
      void queryClient.invalidateQueries({
        queryKey: warehouseKeys.catalogInventory(request.catalogItemId),
      });
    },
  });
};

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
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
