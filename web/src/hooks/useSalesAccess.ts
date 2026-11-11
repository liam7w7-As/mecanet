import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

import type { SalesAccessScopeType } from '@unithor/shared';

/**
 * El formulario envía la fecha como `YYYY-MM-DD`; el backend la normaliza a fin
 * de día. Se evita el tipo inferido del schema porque su salida ya es `Date`.
 */
export interface CreateSalesAccessGrantPayload {
  scopeType: SalesAccessScopeType;
  targetId: number;
  includeLinkedRecord?: boolean;
  expiresAt?: string | null;
}

export interface CreateRecordSalesAccessPayload {
  userId: number;
  includeLinkedRecord?: boolean;
  expiresAt?: string | null;
}

export interface UserSalesAccessGrant {
  id: number;
  userId: number;
  scopeType: SalesAccessScopeType;
  targetId: number;
  targetCodigo: string | null;
  grantedBy: number | null;
  grantedByName: string | null;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
}

export interface RecordSalesAccessGrant {
  id: number;
  userId: number;
  nombre: string;
  username: string;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
}

export interface SalesAdvisor {
  id: number;
  nombre: string;
  username: string;
  email: string;
  activo: boolean;
  role: { nombre: string };
}

interface GrantsResponse<T> {
  grants: T[];
}

interface RolesResponse {
  roles: Array<{ id: number; nombre: string }>;
}

interface UsersResponse {
  data: SalesAdvisor[];
}

const recordResource = (scopeType: SalesAccessScopeType): string =>
  scopeType === 'work_order' ? 'work-orders' : 'quotations';

export const salesAccessKeys = {
  all: ['sales-access'] as const,
  user: (userId: number) => [...salesAccessKeys.all, 'user', userId] as const,
  record: (scopeType: SalesAccessScopeType, targetId: number) =>
    [...salesAccessKeys.all, 'record', scopeType, targetId] as const,
  advisors: ['sales-access', 'advisors'] as const,
};

export const useUserSalesAccess = (userId: number) =>
  useQuery({
    queryKey: salesAccessKeys.user(userId),
    queryFn: async () => (
      await api.get<GrantsResponse<UserSalesAccessGrant>>(`/users/${userId}/sales-access`)
    ).data.grants,
    enabled: Number.isInteger(userId) && userId > 0,
  });

export const useRecordSalesAccess = (scopeType: SalesAccessScopeType, targetId: number) =>
  useQuery({
    queryKey: salesAccessKeys.record(scopeType, targetId),
    queryFn: async () => (
      await api.get<GrantsResponse<RecordSalesAccessGrant>>(
        `/${recordResource(scopeType)}/${targetId}/access`,
      )
    ).data.grants,
    enabled: Number.isInteger(targetId) && targetId > 0,
  });

export const useSalesAdvisors = () =>
  useQuery({
    queryKey: salesAccessKeys.advisors,
    queryFn: async () => {
      const roles = (await api.get<RolesResponse>('/roles')).data.roles;
      const vendedor = roles.find((role) => role.nombre === 'vendedor');
      if (!vendedor) return [];
      return (
        await api.get<UsersResponse>('/users', {
          params: { roleId: vendedor.id, activo: true, pageSize: 100 },
        })
      ).data.data;
    },
    staleTime: 60_000,
  });

export const useCreateUserSalesAccess = (userId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSalesAccessGrantPayload) => (
      await api.post<GrantsResponse<UserSalesAccessGrant>>(`/users/${userId}/sales-access`, data)
    ).data.grants,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salesAccessKeys.user(userId) });
      void queryClient.invalidateQueries({ queryKey: ['sales-access'] });
    },
  });
};

export const useRevokeUserSalesAccess = (userId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (grantId: number) => {
      await api.delete(`/users/${userId}/sales-access/${grantId}`);
      return grantId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salesAccessKeys.user(userId) });
      void queryClient.invalidateQueries({ queryKey: ['sales-access'] });
    },
  });
};

export const useCreateRecordSalesAccess = (
  scopeType: SalesAccessScopeType,
  targetId: number,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRecordSalesAccessPayload) => (
      await api.post<GrantsResponse<RecordSalesAccessGrant>>(
        `/${recordResource(scopeType)}/${targetId}/access`,
        data,
      )
    ).data.grants,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salesAccessKeys.record(scopeType, targetId) });
      void queryClient.invalidateQueries({ queryKey: ['sales-access'] });
    },
  });
};

export const useRevokeRecordSalesAccess = (
  scopeType: SalesAccessScopeType,
  targetId: number,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (grantId: number) => {
      await api.delete(`/${recordResource(scopeType)}/${targetId}/access/${grantId}`);
      return grantId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salesAccessKeys.record(scopeType, targetId) });
      void queryClient.invalidateQueries({ queryKey: ['sales-access'] });
    },
  });
};
