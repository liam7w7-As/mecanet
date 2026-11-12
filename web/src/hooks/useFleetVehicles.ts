import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type { UserPublic } from '../stores/auth.store';
import type {
  FleetDocument,
  FleetDocumentVersion,
  FleetVehicleDetail,
  FleetVehicle,
  PaginatedResponse,
} from '../types/entities';
import type {
  CreateFleetDocumentInput,
  CreateFleetVehicleInput,
  FleetDocumentVersionInput,
  FleetVehicleQueryInput,
  UpdateFleetDocumentInput,
  UpdateFleetVehicleInput,
} from '@unithor/shared';

interface FleetVehicleResponse {
  fleetVehicle: FleetVehicleDetail;
}

interface FleetDocumentResponse {
  document: FleetDocument;
}

export interface FleetDocumentVersionsResponse {
  current: FleetDocument;
  versions: FleetDocumentVersion[];
}

export type FleetVehicleQueryParams = Partial<FleetVehicleQueryInput>;

type FleetViewer = Pick<UserPublic, 'id' | 'role'> | null;

const viewerScope = (user: FleetViewer): string =>
  `${user?.id ?? 'anonymous'}:${user?.role ?? 'none'}`;

export const fleetVehicleKeys = {
  all: ['fleet-vehicles'] as const,
  lists: () => [...fleetVehicleKeys.all, 'list'] as const,
  list: (params: FleetVehicleQueryParams, user: FleetViewer) =>
    [...fleetVehicleKeys.lists(), viewerScope(user), params] as const,
  details: () => [...fleetVehicleKeys.all, 'detail'] as const,
  detail: (id: number, user: FleetViewer) =>
    [...fleetVehicleKeys.details(), viewerScope(user), id] as const,
  versions: (vehicleId: number, documentId: number) =>
    [...fleetVehicleKeys.all, 'document-versions', vehicleId, documentId] as const,
};

const invalidateFleetData = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: fleetVehicleKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
};

export const useFleetVehicles = (queryParams: FleetVehicleQueryParams) => {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: fleetVehicleKeys.list(queryParams, user),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<FleetVehicle>>('/fleet-vehicles', {
        params: queryParams,
      });
      return response.data;
    },
    // Conservar la página previa solo dentro de la misma identidad.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === viewerScope(user)
        ? keepPreviousData(previousData)
        : undefined,
    enabled: user !== null,
  });
};

export const useFleetVehicle = (id: number | null) => {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: fleetVehicleKeys.detail(id ?? 0, user),
    queryFn: async () => {
      const response = await api.get<FleetVehicleResponse>(`/fleet-vehicles/${id}`);
      return response.data.fleetVehicle;
    },
    enabled: user !== null && id !== null && Number.isInteger(id) && id > 0,
  });
};

const vehiclePayload = (data: CreateFleetVehicleInput | UpdateFleetVehicleInput) => {
  const { propietario, ...publicData } = data;
  const role = useAuthStore.getState().user?.role;
  return {
    ...publicData,
    ...((role === 'admin' || role === 'desarrollador') && propietario !== undefined
      ? { propietario: propietario?.trim() || null }
      : {}),
  };
};

const mutationViewer = (): FleetViewer => {
  const user = useAuthStore.getState().user;
  return user ? { id: user.id, role: user.role } : null;
};

export const useCreateFleetVehicleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: mutationViewer,
    mutationFn: async (data: CreateFleetVehicleInput) => {
      const response = await api.post<FleetVehicleResponse>('/fleet-vehicles', vehiclePayload(data));
      return response.data.fleetVehicle;
    },
    onSuccess: (vehicle, _data, viewer) => {
      queryClient.setQueryData(fleetVehicleKeys.detail(vehicle.id, viewer ?? null), vehicle);
      invalidateFleetData(queryClient);
    },
  });
};

export const useUpdateFleetVehicleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: mutationViewer,
    mutationFn: async ({ id, data }: { id: number; data: UpdateFleetVehicleInput }) => {
      const response = await api.patch<FleetVehicleResponse>(`/fleet-vehicles/${id}`, vehiclePayload(data));
      return response.data.fleetVehicle;
    },
    onSuccess: (vehicle, _data, viewer) => {
      queryClient.setQueryData(fleetVehicleKeys.detail(vehicle.id, viewer ?? null), vehicle);
      invalidateFleetData(queryClient);
    },
  });
};

export const useDeleteFleetVehicleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/fleet-vehicles/${id}`);
    },
    onSuccess: () => {
      invalidateFleetData(queryClient);
    },
  });
};

const buildDocumentFormData = (
  data: CreateFleetDocumentInput | UpdateFleetDocumentInput | FleetDocumentVersionInput,
  file?: File | null,
): FormData => {
  const formData = new FormData();

  if (data.nombre !== undefined) formData.append('nombre', data.nombre);
  if (data.referencia !== undefined) formData.append('referencia', data.referencia ?? '');
  if (data.notas !== undefined) formData.append('notas', data.notas ?? '');
  if (data.fechaEmision !== undefined) formData.append('fechaEmision', data.fechaEmision ?? '');
  if (data.fechaVencimiento !== undefined) {
    formData.append('fechaVencimiento', data.fechaVencimiento ?? '');
  }
  if (file) formData.append('file', file);

  return formData;
};

export const useCreateFleetDocumentMutation = (vehicleId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      data,
      file,
    }: {
      data: CreateFleetDocumentInput;
      file?: File | null;
    }) => {
      const response = await api.post<FleetDocumentResponse>(
        `/fleet-vehicles/${vehicleId}/documents`,
        buildDocumentFormData(data, file),
      );
      return response.data.document;
    },
    onSuccess: () => {
      invalidateFleetData(queryClient);
    },
  });
};

export const useUpdateFleetDocumentMutation = (vehicleId: number, documentId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      data,
      file,
    }: {
      data: UpdateFleetDocumentInput;
      file?: File | null;
    }) => {
      if (file) {
        const response = await api.post<FleetDocumentResponse>(
          `/fleet-vehicles/${vehicleId}/documents/${documentId}/versions`,
          buildDocumentFormData(data, file),
        );
        return response.data.document;
      }

      const response = await api.patch<FleetDocumentResponse>(
        `/fleet-vehicles/${vehicleId}/documents/${documentId}`,
        data,
      );
      return response.data.document;
    },
    onSuccess: () => {
      invalidateFleetData(queryClient);
      void queryClient.invalidateQueries({
        queryKey: fleetVehicleKeys.versions(vehicleId, documentId),
      });
    },
  });
};

export const useDeleteFleetDocumentMutation = (vehicleId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: number) => {
      await api.delete(`/fleet-vehicles/${vehicleId}/documents/${documentId}`);
    },
    onSuccess: () => {
      invalidateFleetData(queryClient);
    },
  });
};

export const useFleetDocumentVersions = (
  vehicleId: number | null,
  documentId: number | null,
) =>
  useQuery({
    queryKey: fleetVehicleKeys.versions(vehicleId ?? 0, documentId ?? 0),
    queryFn: async () => {
      const response = await api.get<FleetDocumentVersionsResponse>(
        `/fleet-vehicles/${vehicleId}/documents/${documentId}/versions`,
      );
      return response.data;
    },
    enabled:
      vehicleId !== null &&
      documentId !== null &&
      Number.isInteger(vehicleId) &&
      Number.isInteger(documentId) &&
      vehicleId > 0 &&
      documentId > 0,
  });

export const fleetDocumentFileUrl = (
  vehicleId: number,
  documentId: number,
  options: { versionId?: number; download?: boolean } = {},
): string => {
  const params = new URLSearchParams();
  if (options.versionId !== undefined) params.set('versionId', String(options.versionId));
  if (options.download) params.set('download', '1');
  const query = params.toString();
  return `/api/fleet-vehicles/${vehicleId}/documents/${documentId}/file${query ? `?${query}` : ''}`;
};

export const useUploadFleetVehiclePhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: mutationViewer,
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData();
      formData.append('foto', file);
      const response = await api.post<{ fleetVehicle: FleetVehicleDetail }>(
        `/fleet-vehicles/${id}/foto`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );
      return response.data.fleetVehicle;
    },
    onSuccess: (vehicle, _data, viewer) => {
      queryClient.setQueryData(fleetVehicleKeys.detail(vehicle.id, viewer ?? null), vehicle);
      invalidateFleetData(queryClient);
    },
  });
};

export const useDeleteFleetVehiclePhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: mutationViewer,
    mutationFn: async (id: number) => {
      const response = await api.delete<{ fleetVehicle: FleetVehicleDetail }>(
        `/fleet-vehicles/${id}/foto`,
      );
      return response.data.fleetVehicle;
    },
    onSuccess: (vehicle, _data, viewer) => {
      queryClient.setQueryData(fleetVehicleKeys.detail(vehicle.id, viewer ?? null), vehicle);
      invalidateFleetData(queryClient);
    },
  });
};
