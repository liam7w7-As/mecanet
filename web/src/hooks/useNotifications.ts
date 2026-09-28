import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type { Notification, NotificationLevel, NotificationType } from '@unithor/shared';

/** Frecuencia del sondeo. El usuario pidió polling, sin WebSocket. */
const POLL_INTERVAL_MS = 30_000;

const MAX_UNREAD_BADGE = 99;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (soloNoLeidas: boolean) => [...notificationKeys.all, 'list', { soloNoLeidas }] as const,
};

export interface NotificationListResponse {
  items: Notification[];
  noLeidas: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Solo consulta notificaciones si hay sesión. Evita el 401 inicial al cargar
 * la app antes de que el store de auth se hydrate.
 */
export const useNotifications = (soloNoLeidas = false) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const query = useQuery({
    queryKey: notificationKeys.list(soloNoLeidas),
    queryFn: async () => {
      const response = await api.get<NotificationListResponse>('/notifications', {
        params: { pageSize: 20, soloNoLeidas: soloNoLeidas ? 'true' : undefined },
      });
      return response.data;
    },
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return { ...query, noLeidas: query.data?.noLeidas ?? 0 };
};

/**
 * Campanita del navbar: trae solo el conteo con un sondeo ligero y avisa al
 * usuario (toast) cuando llega algo nuevo durante la sesión.
 */
export const useNotificationCount = (onNew?: (count: number) => void) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const previousRef = useRef<number | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const query = useQuery({
    queryKey: [...notificationKeys.all, 'count'],
    queryFn: async () => {
      const response = await api.get<{ noLeidas: number }>('/notifications/unread-count');
      return response.data.noLeidas;
    },
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const current = query.data;
    if (current === undefined) {
      return;
    }
    // La primera respuesta solo sirve de línea base: no es una "novedad".
    if (previousRef.current === null) {
      previousRef.current = current;
      return;
    }
    if (current > previousRef.current) {
      onNewRef.current?.(current - previousRef.current);
    }
    previousRef.current = current;
  }, [query.data]);

  const count = query.data ?? 0;
  return { count, badge: count > MAX_UNREAD_BADGE ? `${MAX_UNREAD_BADGE}+` : String(count), isLoading: query.isPending };
};

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { ids?: number[]; todas?: boolean }) => {
      const response = await api.patch<{ affected: number; noLeidas: number }>('/notifications/read', {
        ids: input.ids ?? [],
        todas: input.todas ?? false,
      });
      return response.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void data;
    },
  });
};

export const useClearNotifications = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.delete<{ affected: number }>('/notifications');
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
};

const NOTIFICATION_PRESENTATION: Record<
  NotificationType,
  { label: string; dot: string; icon: 'bell' | 'wrench' | 'cash' | 'truck' | 'file' }
> = {
  solicitud_creada: { label: 'Solicitud de taller', dot: 'bg-amber-500', icon: 'wrench' },
  solicitud_aprobada: { label: 'Solicitud aprobada', dot: 'bg-emerald-500', icon: 'wrench' },
  solicitud_rechazada: { label: 'Solicitud rechazada', dot: 'bg-red-500', icon: 'wrench' },
  repuesto_por_entregar: { label: 'Repuesto por entregar', dot: 'bg-amber-500', icon: 'truck' },
  pago_por_verificar: { label: 'Pago por verificar', dot: 'bg-amber-500', icon: 'cash' },
  pago_verificado: { label: 'Pago verificado', dot: 'bg-emerald-500', icon: 'cash' },
  pago_rechazado: { label: 'Pago rechazado', dot: 'bg-red-500', icon: 'cash' },
  ot_estado_cambiado: { label: 'Cambio de estado', dot: 'bg-blue-500', icon: 'bell' },
  ot_entregada: { label: 'Orden entregada', dot: 'bg-emerald-500', icon: 'truck' },
  mecanico_asignado: { label: 'Asignación', dot: 'bg-blue-500', icon: 'wrench' },
  reingreso_creado: { label: 'Reingreso creado', dot: 'bg-blue-500', icon: 'truck' },
  fecha_entrega_vencida: { label: 'Entrega vencida', dot: 'bg-red-600', icon: 'bell' },
  cotizacion_creada: { label: 'Cotización creada', dot: 'bg-blue-500', icon: 'file' },
  cotizacion_convertida: { label: 'Cotización convertida', dot: 'bg-emerald-500', icon: 'file' },
};

export const getNotificationPresentation = (
  tipo: NotificationType,
): { label: string; dot: string; icon: 'bell' | 'wrench' | 'cash' | 'truck' | 'file' } =>
  NOTIFICATION_PRESENTATION[tipo] ?? { label: 'Notificación', dot: 'bg-slate-400', icon: 'bell' };

export const NOTIFICATION_LEVEL_STYLES: Record<NotificationLevel, string> = {
  info: 'border-l-blue-400',
  warning: 'border-l-amber-400',
  critical: 'border-l-red-500',
};

export const useNotificationPanel = (onClose: () => void) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((current) => !current), []);
  const close = useCallback(() => {
    setOpen(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return { containerRef, open, toggle, close };
};
