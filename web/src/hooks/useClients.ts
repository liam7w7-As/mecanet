import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

import type { Client, PaginatedResponse } from '../types/entities';
import type { ClientQueryInput, CreateClientInput, UpdateClientInput } from '@unithor/shared';

interface ClientResponse {
  client: Client;
}

export type ClientQueryParams = Partial<ClientQueryInput>;

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (params: ClientQueryParams) => [...clientKeys.lists(), params] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: number, includeVehicles: boolean) =>
    [...clientKeys.details(), id, { includeVehicles }] as const,
};

export const useClients = (queryParams: ClientQueryParams) =>
  useQuery({
    queryKey: clientKeys.list(queryParams),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Client>>('/clients', {
        params: queryParams,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useClient = (id: number | null, includeVehicles = false) =>
  useQuery({
    queryKey: clientKeys.detail(id ?? 0, includeVehicles),
    queryFn: async () => {
      const response = await api.get<ClientResponse>(`/clients/${id}`, {
        params: { includeVehicles },
      });
      return response.data.client;
    },
    enabled: id !== null && id > 0,
  });

export const useCreateClientMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateClientInput) => {
      const response = await api.post<ClientResponse>('/clients', data);
      return response.data.client;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
};

export const useUpdateClientMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateClientInput }) => {
      const response = await api.patch<ClientResponse>(`/clients/${id}`, data);
      return response.data.client;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
};

export const useDeleteClientMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/clients/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
};
