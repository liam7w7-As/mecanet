import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from './useDebouncedValue';
import { api } from '../lib/api';

import type { PaginatedResponse, QuickSearchResult, Vehicle } from '../types/entities';
import type { CreateVehicleInput, UpdateVehicleInput, VehicleQueryInput } from '@unithor/shared';

interface VehicleResponse {
  vehicle: Vehicle;
}

export type VehicleQueryParams = Partial<VehicleQueryInput>;

export const vehicleKeys = {
  all: ['vehicles'] as const,
  lists: () => [...vehicleKeys.all, 'list'] as const,
  list: (params: VehicleQueryParams) => [...vehicleKeys.lists(), params] as const,
  details: () => [...vehicleKeys.all, 'detail'] as const,
  detail: (id: number) => [...vehicleKeys.details(), id] as const,
  quickSearch: (term: string) => ['search', 'quick', term] as const,
};

export const useVehicles = (queryParams: VehicleQueryParams) =>
  useQuery({
    queryKey: vehicleKeys.list(queryParams),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Vehicle>>('/vehicles', {
        params: queryParams,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useVehicle = (id: number | null) =>
  useQuery({
    queryKey: vehicleKeys.detail(id ?? 0),
    queryFn: async () => {
      const response = await api.get<VehicleResponse>(`/vehicles/${id}`);
      return response.data.vehicle;
    },
    enabled: id !== null && Number.isInteger(id) && id > 0,
  });

export const useCreateVehicleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateVehicleInput) => {
      const response = await api.post<VehicleResponse>('/vehicles', data);
      return response.data.vehicle;
    },
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

export const useUpdateVehicleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateVehicleInput }) => {
      const response = await api.patch<VehicleResponse>(`/vehicles/${id}`, data);
      return response.data.vehicle;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

export const useDeleteVehicleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/vehicles/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

export const useQuickSearch = (term: string) => {
  const debouncedTerm = useDebouncedValue(term.trim(), 300);

  return useQuery({
    queryKey: vehicleKeys.quickSearch(debouncedTerm),
    queryFn: async () => {
      const response = await api.get<QuickSearchResult>('/search/quick', {
        params: { q: debouncedTerm, limit: 10 },
      });
      return response.data;
    },
    enabled: debouncedTerm.length >= 2,
  });
};
