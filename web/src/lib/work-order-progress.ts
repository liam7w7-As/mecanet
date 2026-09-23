import { useEffect, useState } from 'react';

import type { WorkOrder, WorkOrderItem } from '../types/entities';
import type { WorkOrderStatus } from '@unithor/shared';

export type ProgressTier = 'done' | 'good' | 'mid' | 'low' | 'none' | 'neutral';

export interface WorkOrderProgress {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  omitted: number;
  percent: number;
  tier: ProgressTier;
}

const isTerminalStatus = (estado: WorkOrderStatus): boolean =>
  estado === 'finalizada' || estado === 'entregada' || estado === 'cancelada';

/**
 * Progreso por tareas: los omitidos no penalizan (se excluyen del total).
 * Sin tareas medibles -> tier neutral (diagnóstico, sin color de avance).
 */
export const getWorkOrderProgress = (workOrder: Pick<WorkOrder, 'estado' | 'items'>): WorkOrderProgress => {
  const items: WorkOrderItem[] = workOrder.items ?? [];
  const omitted = items.filter((item) => item.estadoOperativo === 'omitido').length;
  const measurable = items.filter((item) => item.estadoOperativo !== 'omitido');
  const completed = measurable.filter((item) => item.estadoOperativo === 'completado').length;
  const inProgress = measurable.filter((item) => item.estadoOperativo === 'en_proceso').length;
  const pending = measurable.filter((item) => item.estadoOperativo === 'pendiente').length;
  const total = measurable.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  let tier: ProgressTier;
  if (workOrder.estado === 'cancelada') {
    tier = 'neutral';
  } else if (total === 0) {
    tier = 'neutral';
  } else if (percent >= 100) {
    tier = 'done';
  } else if (percent >= 70) {
    tier = 'good';
  } else if (percent >= 30) {
    tier = 'mid';
  } else if (percent > 0) {
    tier = 'low';
  } else {
    tier = 'none';
  }

  return { total, completed, inProgress, pending, omitted, percent, tier };
};

export const PROGRESS_TIER_STYLES: Record<ProgressTier, { bar: string; ring: string; chip: string; label: string }> = {
  done: { bar: 'bg-emerald-500', ring: 'ring-emerald-300 border-emerald-200', chip: 'bg-emerald-100 text-emerald-800', label: 'Finalizado' },
  good: { bar: 'bg-lime-500', ring: 'ring-lime-200 border-lime-200', chip: 'bg-lime-100 text-lime-800', label: 'Buen avance' },
  mid: { bar: 'bg-amber-500', ring: 'ring-amber-200 border-amber-200', chip: 'bg-amber-100 text-amber-800', label: 'Avance medio' },
  low: { bar: 'bg-red-400', ring: 'ring-red-200 border-red-200', chip: 'bg-red-100 text-red-700', label: 'Poco avance' },
  none: { bar: 'bg-red-600', ring: 'ring-red-300 border-red-300', chip: 'bg-red-600 text-white', label: 'Sin iniciar' },
  neutral: { bar: 'bg-slate-300', ring: 'ring-slate-200 border-slate-200', chip: 'bg-slate-100 text-slate-600', label: 'Diagnóstico' },
};

export const TASK_DOT_STYLES: Record<string, string> = {
  pendiente: 'bg-red-500',
  en_proceso: 'bg-amber-500',
  completado: 'bg-emerald-500',
  omitido: 'bg-slate-300',
};

const TERMINAL_FALLBACK_LABEL = 'Duración total';

interface ElapsedInfo {
  text: string;
  overdue: boolean;
  running: boolean;
}

/**
 * Reloj de taller: desde fechaIngreso hasta ahora (corriendo) o hasta
 * updatedAt cuando la OT está terminal (congelado). Si hay fechaEntrega
 * prometida y sigue activa vencida -> overdue para el chip de aviso.
 */
export const getElapsedInfo = (
  workOrder: Pick<WorkOrder, 'estado' | 'fechaIngreso' | 'fechaEntrega' | 'updatedAt'>,
  now: number,
): ElapsedInfo => {
  const start = workOrder.fechaIngreso ? new Date(workOrder.fechaIngreso).getTime() : null;
  if (!start || Number.isNaN(start)) {
    return { text: 'Sin hora de ingreso', overdue: false, running: false };
  }

  const terminal = isTerminalStatus(workOrder.estado);
  const end = terminal ? new Date(workOrder.updatedAt).getTime() : now;
  const safeEnd = Number.isNaN(end) ? now : Math.max(end, start);
  const diffMs = safeEnd - start;

  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (days > 0) {
    text = `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes % 60}m`;
  } else {
    text = `${Math.max(minutes, 0)}m`;
  }
  text = terminal ? `${TERMINAL_FALLBACK_LABEL}: ${text}` : `En taller ${text}`;

  let overdue = false;
  if (!terminal && workOrder.fechaEntrega) {
    const promised = new Date(workOrder.fechaEntrega).getTime();
    overdue = !Number.isNaN(promised) && now > promised;
  }

  return { text, overdue, running: !terminal };
};

/** Reloj que se actualiza solo (cada minuto) para las cards. */
export const useNow = (intervalMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
};
