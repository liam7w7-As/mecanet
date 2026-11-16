import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_WORKSHOP_TIMEZONE, workshopHistoryQuerySchema } from '@unithor/shared';

import { api } from '../lib/api';
import { hasUserPermission } from '../lib/permissions';
import { useAuthStore } from '../stores/auth.store';

import type { UpdateWorkshopAlertSettingsInput, WorkshopAlertSettingsPublic, WorkshopAlertSummary, WorkshopHistoryQuery, WorkshopServiceHistory } from '@unithor/shared';

export const workshopInsightsKeys = { all: ['work-orders', 'insights'] as const };
const supervisors = ['admin', 'desarrollador', 'jefe'];
const actorKey = () => {
  const user = useAuthStore.getState().user;
  return JSON.stringify([user?.id ?? null, user?.role ?? null, user?.permissions ?? null]);
};
const useInsightViewer = () => {
  const user = useAuthStore((state) => state.user);
  const supervisor = Boolean(user && supervisors.includes(user.role));
  const allowed = Boolean(user && (supervisor || user.role === 'mecanico') && hasUserPermission(user, 'taller', 'read'));
  return { user, allowed, supervisor, key: [...workshopInsightsKeys.all, user?.id ?? null, user?.role ?? null, JSON.stringify(user?.permissions ?? null)] as const, actor: actorKey() };
};
const assertActor = (expected: string): void => {
  if (actorKey() !== expected) throw new Error('La sesión cambió. Vuelve a consultar los datos del taller.');
};
export const validInsightDate = (value: string): boolean => {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const workshopInsightsToday = (): string => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_WORKSHOP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

export const useWorkOrderAlerts = (id: number, enabled = false) => {
  const viewer = useInsightViewer();
  const query = useQuery({
    queryKey: [...viewer.key, 'alerts', id],
    queryFn: async ({ signal }) => {
      assertActor(viewer.actor);
      const response = await api.get<{ summary: WorkshopAlertSummary }>(`/work-orders/${id}/alerts`, { signal });
      assertActor(viewer.actor);
      if (!response.data?.summary) throw new Error('La API no devolvió el resumen de alertas de esta OT.');
      return response.data.summary;
    },
    enabled: enabled && viewer.allowed && Number.isInteger(id) && id > 0,
    refetchInterval: enabled ? 30_000 : false,
  });
  return { ...query, data: viewer.allowed ? query.data : undefined, allowed: viewer.allowed };
};

export const useWorkshopAlerts = (fecha: string, enabled = false) => {
  const viewer = useInsightViewer();
  const query = useQuery({
    queryKey: [...viewer.key, 'overview', fecha],
    queryFn: async ({ signal }) => {
      assertActor(viewer.actor);
      const response = await api.get<{ summary: WorkshopAlertSummary }>('/work-orders/operations/alerts', { params: { fecha }, signal });
      assertActor(viewer.actor);
      if (!response.data?.summary) throw new Error('La API no devolvió el resumen de alertas del taller.');
      return response.data.summary;
    },
    enabled: enabled && viewer.allowed && validInsightDate(fecha),
    refetchInterval: enabled ? 30_000 : false,
  });
  return { ...query, data: viewer.allowed ? query.data : undefined, allowed: viewer.allowed };
};

export const useWorkshopAlertSettings = (enabled = false) => {
  const viewer = useInsightViewer();
  const query = useQuery({
    queryKey: [...viewer.key, 'settings'],
    queryFn: async ({ signal }) => {
      assertActor(viewer.actor);
      const response = await api.get<{ settings: WorkshopAlertSettingsPublic }>('/work-orders/operations/alert-settings', { signal });
      assertActor(viewer.actor);
      if (!response.data?.settings) throw new Error('La API no devolvió las tolerancias de alertas del taller.');
      return response.data.settings;
    },
    enabled: enabled && viewer.allowed,
  });
  return { ...query, data: viewer.allowed ? query.data : undefined, allowed: viewer.allowed };
};

export const useUpdateWorkshopAlertSettingsMutation = () => {
  const client = useQueryClient();
  const viewer = useInsightViewer();
  return useMutation({
    mutationKey: ['workshop-insights', 'settings-mutation'],
    mutationFn: async (data: UpdateWorkshopAlertSettingsInput) => {
      const user = useAuthStore.getState().user;
      assertActor(viewer.actor);
      if (!user || !['admin', 'desarrollador'].includes(user.role) || !hasUserPermission(user, 'taller', 'update')) throw new Error('Solo administración puede configurar las tolerancias del taller.');
      const response = await api.patch<{ settings: WorkshopAlertSettingsPublic }>('/work-orders/operations/alert-settings', data);
      assertActor(viewer.actor);
      if (!response.data?.settings) throw new Error('La API no devolvió las tolerancias guardadas. Conserva los valores para reintentar.');
      return response.data.settings;
    },
    onSuccess: (settings) => {
      client.setQueryData([...viewer.key, 'settings'], settings);
      void client.invalidateQueries({ queryKey: workshopInsightsKeys.all });
    },
  });
};

export const useWorkOrderHistory = (workOrderId: number, itemId: number, filters: Partial<WorkshopHistoryQuery> = {}, enabled = false) => {
  const viewer = useInsightViewer();
  const parsed = workshopHistoryQuerySchema.safeParse(filters);
  const allowed = viewer.allowed && viewer.supervisor;
  const params = parsed.success ? parsed.data : filters;
  const query = useQuery({
    queryKey: [...viewer.key, 'history', workOrderId, itemId, params],
    queryFn: async ({ signal }) => {
      assertActor(viewer.actor);
      if (!allowed || !parsed.success) throw new Error('Consulta de trabajos anteriores no autorizada o inválida.');
      const response = await api.get<{ history: WorkshopServiceHistory }>(`/work-orders/${workOrderId}/items/${itemId}/history`, { params, signal });
      assertActor(viewer.actor);
      if (!response.data?.history) throw new Error('La API no devolvió los trabajos anteriores comparables.');
      return response.data.history;
    },
    enabled: enabled && allowed && parsed.success && Number.isInteger(workOrderId) && workOrderId > 0 && Number.isInteger(itemId) && itemId > 0,
  });
  return { ...query, data: allowed ? query.data : undefined, allowed, valid: parsed.success };
};
