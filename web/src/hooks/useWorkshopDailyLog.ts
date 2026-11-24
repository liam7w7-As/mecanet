import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkshopDailyEntrySchema, DEFAULT_WORKSHOP_TIMEZONE } from '@unithor/shared';
import { useMemo } from 'react';

import { useWorkshopTime, useWorkshopTimeEligibleItems } from './useWorkshopTime';
import { api } from '../lib/api';
import { hasUserPermission } from '../lib/permissions';
import { useAuthStore } from '../stores/auth.store';

import type { UserPublic } from '../stores/auth.store';
import type {
  CreateWorkshopDailyEntryInput,
  WorkshopTimeActivityStatus,
  WorkshopTimeEligibleItem,
  WorkshopTimeEntry,
  WorkshopTimeJournal,
  WorkshopTimeRequestRecord,
} from '@unithor/shared';

export type WorkshopDailyEntryInput = CreateWorkshopDailyEntryInput;
export type DailyTimeRequest = WorkshopTimeRequestRecord & {
  dailyEntry?: boolean;
  clientRequestId?: string | null;
  teamPending?: boolean;
  patente?: string | null;
};
export interface DailyService extends WorkshopTimeEligibleItem {
  division?: 'DP' | 'ACC' | 'MEC' | null;
  eligible: boolean;
  registeredMinutes: number;
  pendingMinutes: number;
  activityStatus: WorkshopTimeActivityStatus | null;
  teamPending?: boolean;
}
/** A piece can have two stages assigned to the same armador. */
export const dailyServiceKey = (service: { itemId: number; dpStageId?: number | null }): string =>
  service.dpStageId ? `${service.itemId}:dp-${service.dpStageId}` : String(service.itemId);
export interface DailyOrder {
  id: number;
  code: string;
  patente: string | null;
  services: DailyService[];
}
export interface DailyRecord {
  key: string;
  workOrderId: number;
  workOrderCode: string;
  itemId: number;
  description: string;
  userName: string | null;
  reportedDate?: string | null;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  pending: boolean;
  rejected: boolean;
  running: boolean;
  activityStatus: WorkshopTimeActivityStatus | null;
  teamPending?: boolean;
  note: string | null;
}

type DailyTimeEntry = WorkshopTimeEntry & {
  activityStatus?: 'pendiente' | WorkshopTimeActivityStatus | 'omitido' | null;
  ownPartCompleted?: boolean;
};
const currentActivity = (entry: DailyTimeEntry) => {
  if (entry.ownPartCompleted === true)
    return {
      activityStatus: 'completado' as const,
      teamPending:
        entry.activityStatus === 'completado'
          ? false
          : entry.activityStatus === 'en_proceso' || entry.activityStatus === 'pendiente'
            ? true
            : undefined,
    };
  return {
    activityStatus:
      entry.activityStatus === 'completado' || entry.activityStatus === 'en_proceso'
        ? entry.activityStatus
        : null,
    teamPending: undefined,
  };
};

export const dailyLocalDate = (
  value = new Date(),
  timezone = DEFAULT_WORKSHOP_TIMEZONE,
): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const dailyActivityLabel = (
  status: WorkshopTimeActivityStatus | null,
  teamPending?: boolean,
): string =>
  status === 'completado'
    ? teamPending === true
      ? 'Mi parte terminada, equipo pendiente'
      : teamPending === false
        ? 'Finalizado, pendiente de calidad'
        : 'Mi parte finalizada'
    : status === 'en_proceso'
      ? 'Parcial'
      : 'Actividad registrada';

export function dailyInterval(
  fecha: string,
  startTime: string,
  hours: string,
  timezone = DEFAULT_WORKSHOP_TIMEZONE,
) {
  const duration = Number(hours.replace(',', '.'));
  const target = Date.parse(`${fecha}T${startTime}:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !Number.isFinite(target) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 24
  )
    return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wall = (instant: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`;
  };
  // Resolve civil workshop time independently of the browser's timezone. Probe
  // both sides of DST and reject nonexistent hours instead of shifting them.
  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const probe = target + hours * 3_600_000;
      return Date.parse(wall(probe)) - probe;
    }),
  );
  const starts = [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => wall(instant) === `${fecha}T${startTime}:00Z`)
    .sort((a, b) => a - b);
  if (!starts.length) return null;
  const start = new Date(starts[0]);
  const milliseconds = Math.round(duration * 3_600_000);
  if (milliseconds < 60_000) return null;
  return {
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + milliseconds).toISOString(),
    duration,
  };
}

export const dailyAccess = (user: UserPublic | null) => {
  const supervisor = Boolean(user && ['jefe', 'admin', 'desarrollador'].includes(user.role));
  const allowed = Boolean(
    user && (supervisor || user.role === 'mecanico') && hasUserPermission(user, 'taller', 'read'),
  );
  return {
    supervisor,
    allowed,
    editable: Boolean(allowed && user && hasUserPermission(user, 'taller', 'update')),
  };
};

export function useWorkshopDailyLog(date: string, selectedWorker?: number) {
  const user = useAuthStore((state) => state.user);
  const access = dailyAccess(user);
  const workerId = access.supervisor ? selectedWorker : user?.id;
  const filter = access.supervisor ? selectedWorker : undefined;
  const journal = useWorkshopTime(date, filter, access.allowed);
  const eligible = useWorkshopTimeEligibleItems(filter, access.allowed && Boolean(workerId), date);
  // Retain plate metadata when completing an item makes it disappear from the
  // eligibility response. Scope it to the viewer, worker and calendar day.
  const plates = useMemo(
    () => new Map<number, string | null>(),
    [user?.id, user?.role, workerId, date],
  );
  const own = (record: { userId: number }) => workerId === undefined || record.userId === workerId;
  const entries: DailyTimeEntry[] = access.allowed ? (journal.data?.entries ?? []).filter(own) : [];
  const requests = access.allowed
    ? ((journal.data?.requests ?? []).filter(own) as DailyTimeRequest[])
    : [];
  const items =
    access.allowed && workerId
      ? (eligible.data ?? []).filter((item) => item.userId === workerId)
      : [];
  const orders = new Map<number, DailyOrder>();
  const services = new Map<string, DailyService>();
  const serviceFor = (
    source: WorkshopTimeEligibleItem | WorkshopTimeEntry | DailyTimeRequest,
  ): DailyService => {
    const key = `${source.workOrderId}:${dailyServiceKey(source)}:${source.userId}`;
    let service = services.get(key);
    const plate =
      'patente' in source ? (source.patente ?? null) : (plates.get(source.workOrderId) ?? null);
    if (plate) plates.set(source.workOrderId, plate);
    if (!service) {
      const createdService: DailyService = {
        workOrderId: source.workOrderId,
        workOrderCode: source.workOrderCode,
        patente: plate,
        itemId: source.itemId,
        description: source.description,
        userId: source.userId,
        division: 'division' in source ? source.division ?? null : source.dpStageId ? 'DP' : null,
        ...(source.dpStageId ? { dpStageId: source.dpStageId } : {}),
        ...('dpStageLabel' in source ? { dpStageLabel: source.dpStageLabel } : {}),
        ...('blocked' in source ? { blocked: source.blocked } : {}),
        eligible: false,
        registeredMinutes: 0,
        pendingMinutes: 0,
        activityStatus: null,
      };
      service = createdService;
      services.set(key, createdService);
      let order = orders.get(source.workOrderId);
      if (!order) {
        order = {
          id: source.workOrderId,
          code: source.workOrderCode,
          patente: plate,
          services: [],
        };
        orders.set(order.id, order);
      }
      if (plate) order.patente = plate;
      order.services.push(createdService);
    }
    return service;
  };
  items.forEach((item) => {
    const s = serviceFor(item);
    s.eligible = !item.blocked;
    if (item.division) s.division = item.division;
  });
  entries
    .filter((entry) => !entry.supersededAt)
    .forEach((entry) => {
      serviceFor(entry).registeredMinutes += entry.minutesOnDate;
    });
  [...requests]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
    .forEach((request) => {
      const service = serviceFor(request);
      if (request.status === 'pendiente') service.pendingMinutes += request.minutesOnDate;
      if (
        (request.status !== 'rechazada' || request.dailyEntry === true) &&
        request.activityStatus
      ) {
        service.activityStatus = request.activityStatus;
        service.teamPending = request.teamPending;
      }
    });
  // Current item/own-part metadata includes progress changes without a new time
  // request, and takes precedence over a historical request's activity status.
  entries
    .filter(
      (entry) =>
        !entry.supersededAt &&
        (entry.activityStatus !== undefined || entry.ownPartCompleted !== undefined),
    )
    .forEach((entry) => Object.assign(serviceFor(entry), currentActivity(entry)));
  const entryIds = new Set(entries.map((entry) => entry.id));
  const records: DailyRecord[] = [
    ...entries
      .filter((entry) => !entry.supersededAt)
      .map((entry): DailyRecord => {
        const request = requests.find((item) => item.replacementSessionId === entry.id);
        return {
          key: `entry-${entry.id}`,
          workOrderId: entry.workOrderId,
          workOrderCode: entry.workOrderCode,
          itemId: entry.itemId,
          description: entry.description,
          userName: entry.userName,
          reportedDate: entry.reportedDate ?? request?.reportedDate ?? null,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
          minutes: entry.minutesOnDate,
          pending: false,
          rejected: false,
          running: entry.status === 'abierta',
          activityStatus:
            entry.activityStatus !== undefined || entry.ownPartCompleted !== undefined
              ? currentActivity(entry).activityStatus
              : (request?.activityStatus ?? null),
          teamPending:
            entry.activityStatus !== undefined || entry.ownPartCompleted !== undefined
              ? currentActivity(entry).teamPending
              : request?.teamPending,
          note: entry.note,
        };
      }),
    ...requests
      .filter(
        (request) =>
          request.status !== 'aprobada' || !entryIds.has(request.replacementSessionId ?? -1),
      )
      .map((request): DailyRecord => ({
        key: `request-${request.id}`,
        workOrderId: request.workOrderId,
        workOrderCode: request.workOrderCode,
        itemId: request.itemId,
        description: request.description,
        userName: request.userName,
        reportedDate: request.reportedDate ?? null,
        startedAt: request.startedAt,
        endedAt: request.endedAt,
        minutes: request.minutesOnDate,
        pending: request.status === 'pendiente',
        rejected: request.status === 'rechazada',
        running: false,
        activityStatus:
          request.status === 'rechazada' && !request.dailyEntry ? null : request.activityStatus,
        teamPending: request.teamPending,
        note: request.note,
      })),
  ].sort(
    (a, b) =>
      (b.reportedDate ?? b.startedAt).localeCompare(a.reportedDate ?? a.startedAt) ||
      b.key.localeCompare(a.key),
  );
  return {
    ...access,
    user,
    workerId,
    journal,
    eligible,
    orders: [...orders.values()],
    records,
    canRegister: access.editable && Boolean(workerId),
  };
}

function requireDailyWrite(viewerId: number | undefined, target?: number): UserPublic {
  const user = useAuthStore.getState().user;
  const access = dailyAccess(user);
  if (!user || user.id !== viewerId || !access.editable)
    throw new Error('No tienes permiso para registrar esta jornada.');
  if (access.supervisor && (!target || !Number.isInteger(target) || target <= 0))
    throw new Error('Selecciona un trabajador antes de registrar.');
  if (!access.supervisor && target !== undefined && target !== user.id)
    throw new Error('Solo puedes registrar tu propia jornada.');
  return user;
}

export function useCreateWorkshopDailyEntry() {
  const client = useQueryClient();
  const viewerId = useAuthStore((state) => state.user?.id);
  return useMutation({
    retry: false,
    mutationFn: async (input: WorkshopDailyEntryInput) => {
      const user = requireDailyWrite(viewerId, input.userId);
      const { userId: target, ...body } = input;
      const payload = dailyAccess(user).supervisor ? { ...body, userId: target } : body;
      const parsed = createWorkshopDailyEntrySchema.safeParse(payload);
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? 'Revisa los datos del registro.');
      return (
        await api.post<{ request: DailyTimeRequest }>('/workshop-time/daily-entries', parsed.data)
      ).data.request;
    },
    onSuccess: (request, input) => {
      if (useAuthStore.getState().user?.id !== viewerId) return;
      client.setQueriesData<WorkshopTimeJournal>(
        {
          predicate: (query) => {
            const key = query.queryKey;
            return (
              key[0] === 'workshop-time' &&
              key[1] === 'journal' &&
              key[2] === viewerId &&
              key[4] === input.fecha &&
              (key[5] === 'all' || key[5] === request.userId)
            );
          },
        },
        (saved) =>
          saved
            ? {
                ...saved,
                requests: [...saved.requests.filter((item) => item.id !== request.id), request],
              }
            : saved,
      );
      for (const queryKey of [
        ['workshop-time'],
        ['work-order-labor'],
        ['work-orders'],
        ['quotations'],
        ['dashboard'],
      ])
        void client.invalidateQueries({ queryKey });
    },
  });
}

export function useSaveDailyObservations() {
  const client = useQueryClient();
  const viewerId = useAuthStore((state) => state.user?.id);
  return useMutation({
    retry: false,
    mutationFn: async ({
      workOrderId,
      itemId,
      userId,
      text,
      files,
    }: {
      workOrderId: number;
      itemId: number;
      userId: number;
      text: string;
      files: File[];
    }) => {
      requireDailyWrite(viewerId, userId);
      const body = new FormData();
      if (text.trim()) body.append('texto', text.trim());
      body.append('workOrderItemId', String(itemId));
      // The existing observation endpoint uses multipart field "files".
      files.forEach((file) => body.append('files', file));
      await api.post(`/work-orders/${workOrderId}/observations`, body);
    },
    onSuccess: () => {
      if (useAuthStore.getState().user?.id === viewerId)
        void client.invalidateQueries({ queryKey: ['work-order-labor'] });
    },
  });
}

/** Change only activity when the worker already has real time on this item. */
export function useSaveDailyRecordedProgress() {
  const client = useQueryClient();
  const viewerId = useAuthStore((state) => state.user?.id);
  return useMutation({
    retry: false,
    mutationFn: async ({
      workOrderId,
      itemId,
      dpStageId,
      userId,
      activityStatus,
    }: {
      workOrderId: number;
      itemId: number;
      dpStageId?: number;
      userId: number;
      activityStatus: WorkshopTimeActivityStatus;
    }) => {
      const user = requireDailyWrite(viewerId, userId);
      // Existing completion marks the caller's part. Do not attribute a chief's
      // completion to a different selected worker.
      if (user.id !== userId)
        throw new Error('Este avance corresponde a la jornada propia del trabajador.');
      if (dpStageId)
        await api.patch(`/work-orders/${workOrderId}/dp-stages/${dpStageId}`, { status: activityStatus });
      else if (activityStatus === 'completado')
        await api.post(`/work-orders/${workOrderId}/items/${itemId}/complete`, {});
      else
        await api.patch(`/work-orders/${workOrderId}/execution`, {
          items: [{ id: itemId, estadoOperativo: 'en_proceso' }],
        });
    },
    onSuccess: () => {
      if (useAuthStore.getState().user?.id !== viewerId) return;
      for (const queryKey of [
        ['workshop-time'],
        ['work-order-labor'],
        ['work-orders'],
        ['quotations'],
        ['dashboard'],
      ])
        void client.invalidateQueries({ queryKey });
    },
  });
}
