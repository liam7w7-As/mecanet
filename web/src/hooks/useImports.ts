import { useMutation, useQueryClient } from '@tanstack/react-query';

import { catalogKeys } from './useCatalog';
import { fleetVehicleKeys } from './useFleetVehicles';
import { vehicleKeys } from './useVehicles';
import { api } from '../lib/api';

import type { ImportPreview, ImportResult } from '@unithor/shared';

export type ImportTarget = 'catalog' | 'vehicles' | 'fleet-vehicles';

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
): Promise<ImportPreview> => {
  const response = await api.post<{ preview: ImportPreview }>(
    `${BASE_PATH[target]}/import?dryRun=true`,
    buildFormData(file),
  );
  return response.data.preview;
};

export const confirmImport = async (
  target: ImportTarget,
  file: File,
): Promise<ImportResult> => {
  const response = await api.post<{ result: ImportResult }>(
    `${BASE_PATH[target]}/import`,
    buildFormData(file),
  );
  return response.data.result;
};

export const usePreviewImportMutation = (target: ImportTarget) =>
  useMutation({
    mutationFn: (file: File) => previewImport(target, file),
  });

export const useConfirmImportMutation = (target: ImportTarget) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => confirmImport(target, file),
    onSuccess: () => {
      if (target === 'catalog') {
        void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
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
