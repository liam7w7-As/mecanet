import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

import type {
  CompanyLogoPublic,
  PublicBranding,
  UpdateCompanySettingsInput,
} from '@unithor/shared';

export interface CompanySettings extends PublicBranding {
  giro: string | null;
  logo: CompanyLogoPublic;
  updatedAt: string;
  lastEditor: { id: number; nombre: string } | null;
}

export const settingsKeys = {
  all: ['settings'] as const,
  branding: () => [...settingsKeys.all, 'branding'] as const,
  company: () => [...settingsKeys.all, 'company'] as const,
};

/**
 * Identidad visible sin sesión. Se consulta en el login, así que no exige
 * autenticación y casi nunca cambia: caché larga, sin revalidar al foco.
 */
export const useBranding = () =>
  useQuery({
    queryKey: settingsKeys.branding(),
    queryFn: async () => {
      const response = await api.get<PublicBranding>('/settings/branding');
      return response.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

export const useCompanySettings = (enabled = true) =>
  useQuery({
    queryKey: settingsKeys.company(),
    queryFn: async () => {
      const response = await api.get<CompanySettings>('/settings/company');
      return response.data;
    },
    enabled,
    staleTime: 60_000,
  });

const invalidateSettings = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
};

export const useUpdateCompanySettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateCompanySettingsInput) => {
      const response = await api.patch<CompanySettings>('/settings/company', data);
      return response.data;
    },
    onSuccess: () => invalidateSettings(queryClient),
  });
};

export const useUploadCompanyLogo = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await api.post<CompanySettings>('/settings/company/logo', formData);
      return response.data;
    },
    onSuccess: () => invalidateSettings(queryClient),
  });
};

export const useDeleteCompanyLogo = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.delete<CompanySettings>('/settings/company/logo');
      return response.data;
    },
    onSuccess: () => invalidateSettings(queryClient),
  });
};

/** URL del logo con cache-buster, para que el navegador no sirva el viejo. */
export const buildLogoUrl = (branding: PublicBranding | undefined): string => {
  if (!branding?.tieneLogo) {
    return '/marca.webp';
  }
  return `/api/settings/company/logo?v=${encodeURIComponent(branding.logoUpdatedAt ?? '1')}`;
};
