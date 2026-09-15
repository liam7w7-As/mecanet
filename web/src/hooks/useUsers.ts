import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type {
  Action,
  CreateUserInput,
  Module,
  Role,
  UpdateRolePermissionsInput,
  UpdateUserInput,
  UserQueryInput,
} from '@unithor/shared';

export interface AdminUser {
  id: number;
  nombre: string;
  email: string;
  roleId: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  role: { id: number; nombre: Role };
}

export interface RoleOption {
  id: number;
  nombre: Role;
  descripcion: string | null;
}

export interface PermissionOption {
  id: number;
  modulo: Module;
  accion: Action;
}

interface UserListResponse {
  data: AdminUser[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface UserResponse {
  user: AdminUser;
}

interface RolesResponse {
  roles: RoleOption[];
}

interface PermissionsResponse {
  permissions: PermissionOption[];
}

export type UserQueryParams = Partial<UserQueryInput>;

export const userKeys = {
  all: ['users'] as const,
  list: (params: UserQueryParams) => [...userKeys.all, 'list', params] as const,
  roles: ['roles'] as const,
  permissions: ['permissions'] as const,
  rolePermissions: (roleId: number) => ['roles', roleId, 'permissions'] as const,
};

export const useUsers = (params: UserQueryParams) => useQuery({
  queryKey: userKeys.list(params),
  queryFn: async () => (await api.get<UserListResponse>('/users', { params })).data,
  placeholderData: keepPreviousData,
});

export const useRoles = () => useQuery({
  queryKey: userKeys.roles,
  queryFn: async () => (await api.get<RolesResponse>('/roles')).data.roles,
  staleTime: 5 * 60_000,
});

export const usePermissions = () => useQuery({
  queryKey: userKeys.permissions,
  queryFn: async () => (await api.get<PermissionsResponse>('/permissions')).data.permissions,
  staleTime: 5 * 60_000,
});

export const useRolePermissions = (roleId: number | null) => useQuery({
  queryKey: userKeys.rolePermissions(roleId ?? 0),
  queryFn: async () => {
    if (roleId === null) return [];
    return (await api.get<PermissionsResponse>(`/roles/${roleId}/permissions`)).data.permissions;
  },
  enabled: roleId !== null,
});

export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateUserInput) => (
      await api.post<UserResponse>('/users', data)
    ).data.user,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
};

export const useUpdateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateUserInput }) => (
      await api.patch<UserResponse>(`/users/${id}`, data)
    ).data.user,
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      if (user.id === useAuthStore.getState().user?.id) {
        void useAuthStore.getState().checkAuth();
      }
    },
  });
};

export const useToggleUserStatusMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activo }: { id: number; activo: boolean }) => (
      await api.patch<UserResponse>(`/users/${id}/status`, { activo })
    ).data.user,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
};

export const useDeleteUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/users/${id}`);
      return id;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
};

export const useUpdateRolePermissionsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateRolePermissionsInput) => (
      await api.put<PermissionsResponse>(`/roles/${data.roleId}/permissions`, data)
    ).data.permissions,
    onSuccess: (permissions, data) => {
      queryClient.setQueryData(userKeys.rolePermissions(data.roleId), permissions);
      void useAuthStore.getState().checkAuth();
    },
  });
};
