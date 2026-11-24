import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dpConfigurationRecordSchema, dpQuoteInputSchema, updateDpConfigurationSchema } from '@unithor/shared';

import { useCatalogEvents } from './useCatalogEvents';
import { api } from '../lib/api';

import type { DpQuoteInput, DpWorkQuote, UpdateDpConfigurationInput } from '@unithor/shared';

export interface DpConfigurationHistoryEntry {
  revision: number;
  createdAt: string;
  editor: { id: number; nombre: string } | null;
}

export const dpConfigurationKeys = {
  all: ['dp-configuration'] as const,
  settings: ['dp-configuration', 'settings'] as const,
  catalog: ['dp-configuration', 'catalog'] as const,
  history: ['dp-configuration', 'history'] as const,
};

export function useDpConfiguration(source: 'settings' | 'catalog', enabled = true) {
  useCatalogEvents();
  return useQuery({
    queryKey: dpConfigurationKeys[source],
    queryFn: async () => {
      const response = await api.get<unknown>(source === 'settings' ? '/settings/dp' : '/catalog/dp');
      return dpConfigurationRecordSchema.parse(response.data);
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useDpConfigurationHistory(enabled = true) {
  return useQuery({
    queryKey: dpConfigurationKeys.history,
    queryFn: async () => {
      const response = await api.get<{ items: DpConfigurationHistoryEntry[] }>('/settings/dp/history');
      return response.data.items;
    },
    enabled,
  });
}

export function useUpdateDpConfiguration() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDpConfigurationInput) => {
      const response = await api.put<unknown>('/settings/dp', updateDpConfigurationSchema.parse(input));
      return dpConfigurationRecordSchema.parse(response.data);
    },
    onSuccess: (record) => {
      client.setQueryData(dpConfigurationKeys.settings, record);
      client.setQueryData(dpConfigurationKeys.catalog, record);
      void client.invalidateQueries({ queryKey: dpConfigurationKeys.history });
    },
  });
}

/** A preview calculation only; this endpoint never creates an OT or COT. */
export function useDpQuotePreview() {
  return useMutation({
    mutationFn: async (input: DpQuoteInput) => {
      const response = await api.post<{ quote: DpWorkQuote }>('/catalog/dp/quote', dpQuoteInputSchema.parse(input));
      return response.data.quote;
    },
  });
}
