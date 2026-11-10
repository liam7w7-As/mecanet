import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { catalogKeys } from './useCatalog';
import { fleetVehicleKeys } from './useFleetVehicles';
import { vehicleKeys } from './useVehicles';
import { warehouseKeys } from './useWarehouses';
import { api } from '../lib/api';
import { hasUserPermission } from '../lib/permissions';
import { useAuthStore } from '../stores/auth.store';

import type { PaginatedResponse, Warehouse } from '../types/entities';
import type { ImportPreview, ImportResult } from '@unithor/shared';

export type ImportTarget = 'catalog' | 'vehicles' | 'fleet-vehicles';

export interface ImportOptions {
  warehouseId?: number;
}

export interface ConfirmImportOptions extends ImportOptions {
  previewToken?: string;
}

export interface ImportMutationInput extends ConfirmImportOptions {
  file: File;
}

const BASE_PATH: Record<ImportTarget, string> = {
  catalog: '/catalog',
  vehicles: '/vehicles',
  'fleet-vehicles': '/fleet-vehicles',
};

const TEMPLATE_FILE_NAME: Record<ImportTarget, string> = {
  catalog: 'plantilla-catalogo.xlsx',
  vehicles: 'plantilla-vehiculos-taller.xlsx',
  'fleet-vehicles': 'plantilla-vehiculos-flota.xlsx',
};

export const downloadImportTemplate = async (target: ImportTarget): Promise<void> => {
  const response = await api.get<Blob>(`${BASE_PATH[target]}/import/template`, {
    responseType: 'blob',
  });

  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = TEMPLATE_FILE_NAME[target];
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
};

const buildFormData = (file: File): FormData => {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
};

export const previewImport = async (
  target: ImportTarget,
  file: File,
  options: ImportOptions = {},
): Promise<ImportPreview> => {
  const query = new URLSearchParams({ dryRun: 'true' });
  if (options.warehouseId !== undefined) query.set('warehouseId', String(options.warehouseId));
  const response = await api.post<{ preview: ImportPreview }>(
    `${BASE_PATH[target]}/import?${query}`,
    buildFormData(file),
  );
  return response.data.preview;
};

export const confirmImport = async (
  target: ImportTarget,
  file: File,
  options: ConfirmImportOptions = {},
): Promise<ImportResult> => {
  const query = new URLSearchParams();
  if (options.warehouseId !== undefined) query.set('warehouseId', String(options.warehouseId));
  const response = await api.post<{ result: ImportResult }>(
    `${BASE_PATH[target]}/import${query.size ? `?${query}` : ''}`,
    buildFormData(file),
    { headers: options.previewToken ? { 'X-Import-Preview': options.previewToken } : {} },
  );
  return response.data.result;
};

export const usePreviewImportMutation = (target: ImportTarget) =>
  useMutation({
    mutationFn: ({ file, warehouseId }: ImportMutationInput) => previewImport(target, file, { warehouseId }),
  });

export const useImportWarehouses = (enabled: boolean) => {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: [...warehouseKeys.all, 'import', user?.id, user?.role, user?.permissions],
    enabled: enabled && Boolean(user && hasUserPermission(user, 'almacen', 'read')),
    queryFn: async () => {
      const items: Warehouse[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await api.get<PaginatedResponse<Warehouse>>('/warehouses', {
          params: { page, pageSize: 100, soloActivos: true },
        });
        items.push(...response.data.items);
        totalPages = response.data.totalPages;
        page += 1;
      } while (page <= totalPages);
      return items;
    },
  });
};

export const useConfirmImportMutation = (target: ImportTarget) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, warehouseId, previewToken }: ImportMutationInput) =>
      confirmImport(target, file, { warehouseId, previewToken }),
    onSuccess: () => {
      if (target === 'catalog') {
        void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
        void queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        return;
      }

      if (target === 'vehicles') {
        void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        return;
      }

      void queryClient.invalidateQueries({ queryKey: fleetVehicleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
