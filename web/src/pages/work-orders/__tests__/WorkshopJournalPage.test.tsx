import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { flushFormDrafts } from '../../../lib/form-recovery';
import { useAuthStore } from '../../../stores/auth.store';
import WorkshopJournalPage from '../WorkshopJournalPage';

import type { DailyTimeRequest, WorkshopDailyEntryInput } from '../../../hooks/useWorkshopDailyLog';
import type { Role, WorkshopTimeEligibleItem, WorkshopTimeJournal } from '@unithor/shared';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../../components/common/BrandLogo', () => ({ default: () => <span>UNITHOR</span> }));
vi.mock('../../../components/work-orders/WorkshopTimePanel', async () => {
  const { useEffect, useState } = await import('react');
  return {
    default: ({ onState }: { onState?: (dirty: boolean, pending: boolean) => void }) => {
      const [value, setValue] = useState('');
      useEffect(() => {
        onState?.(Boolean(value), false);
      }, [value, onState]);
      return (
        <label>
          Ajuste existente
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      );
    },
  };
});

const date = '2025-10-04';
const own: WorkshopTimeEligibleItem = {
  workOrderId: 12,
  workOrderCode: 'OT-12',
  patente: 'ABCD12',
  itemId: 20,
  description: 'Diagnóstico',
  userId: 9,
};
const request = (overrides: Partial<DailyTimeRequest> = {}): DailyTimeRequest => ({
  id: 200,
  dailyEntry: true,
  clientRequestId: '47820cd0-21c3-4d3c-9b25-620c77bd683b',
  kind: 'manual',
  overtime: false,
  activityStatus: 'completado',
  status: 'pendiente',
  workOrderId: 12,
  workOrderCode: 'OT-12',
  itemId: 20,
  description: 'Diagnóstico',
  userId: 9,
  userName: 'Mecánico Uno',
  sourceSessionId: null,
  replacementSessionId: null,
  startedAt: new Date(`${date}T09:00`).toISOString(),
  endedAt: new Date(`${date}T10:00`).toISOString(),
  durationMinutes: 60,
  minutesOnDate: 60,
  note: 'Trabajo del día',
  createdBy: 9,
  createdAt: '2025-10-04T18:00:00Z',
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  ...overrides,
});
let journal: WorkshopTimeJournal;
let items: WorkshopTimeEligibleItem[];
const login = (
  role: Role = 'mecanico',
  permissions?: { modulo: 'taller'; accion: 'read' | 'update' }[],
) =>
  useAuthStore.setState({
    user: {
      id: role === 'mecanico' ? 9 : 1,
      role,
      nombre: 'Mecánico Uno',
      email: 'test@example.invalid',
      ...(permissions ? { permissions } : {}),
    },
    isAuthenticated: true,
    isLoading: false,
  });
const mount = (search = `?fecha=${date}`) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/work-orders/journal${search}`]}>
          <WorkshopJournalPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
};
beforeEach(() => {
  vi.resetAllMocks();
  login();
  items = [
    own,
    {
      ...own,
      workOrderId: 15,
      itemId: 24,
      patente: 'EFGH34',
      workOrderCode: 'OT-15',
      description: 'Frenos',
    },
  ];
  journal = {
    date,
    workers: [
      { id: 9, nombre: 'Mecánico Uno' },
      { id: 10, nombre: 'Mecánico Dos' },
    ],
    entries: [],
    requests: [],
    totals: {
      registeredMinutes: 0,
      pendingMinutes: 0,
      scheduledMinutes: null,
      unregisteredMinutes: null,
    },
  };
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url === '/workshop-time' ? journal : { items },
  }));
  vi.mocked(api.post).mockImplementation(async (url, body) => {
    if (url !== '/workshop-time/daily-entries') return { data: {} };
    const payload = body as WorkshopDailyEntryInput;
    const next = request({
      ...payload,
      reportedDate: 'horasUtilizadas' in payload ? payload.fecha : null,
      userId: payload.userId ?? 9,
    });
    journal = { ...journal, requests: [...journal.requests, next] };
    if (payload.activityStatus === 'completado')
      items = items.filter((item) => item.itemId !== payload.itemId);
    return { data: { request: next } };
  });
});

describe('WorkshopJournalPage', () => {
  it('groups own assigned OT as compact cards and never sends a mechanic userId', async () => {
    items.push({
      ...own,
      userId: 10,
      itemId: 999,
      description: 'Servicio ajeno',
      workOrderId: 99,
      workOrderCode: 'OT-AJENA',
    });
    journal.requests = [
      request({
        workOrderId: 99,
        workOrderCode: 'OT-AJENA',
        userId: 10,
        description: 'Registro ajeno',
      }),
    ];
    mount('?fecha=2025-10-04&trabajador=10');
    expect(await screen.findByRole('article', { name: 'Orden OT-12' })).toHaveTextContent('ABCD12');
    expect(screen.getByRole('article', { name: 'Orden OT-12' })).toHaveTextContent(
      'Sin registro hoy',
    );
    expect(screen.getByRole('article', { name: 'Orden OT-15' })).toHaveTextContent('Frenos');
    expect(screen.queryByText('OT-AJENA')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Trabajador del registro diario')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/workshop-time', { params: { fecha: date } });
    expect(api.get).toHaveBeenCalledWith('/workshop-time/eligible-items', {
      params: { fecha: date },
    });
    expect(screen.queryByText('Ajuste existente')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprobar|calidad/i })).not.toBeInTheDocument();
  });

  it.each(['jefe', 'admin', 'desarrollador'] as const)(
    'requires %s to choose a worker before registering',
    async (role) => {
      login(role);
      journal.requests = [request()];
      mount();
      expect(
        await screen.findByRole('button', { name: 'Agregar registro a OT-12' }),
      ).toBeDisabled();
      expect(
        vi.mocked(api.get).mock.calls.some(([url]) => url === '/workshop-time/eligible-items'),
      ).toBe(false);
      fireEvent.change(screen.getByLabelText('Trabajador del registro diario'), {
        target: { value: '9' },
      });
      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith('/workshop-time/eligible-items', {
          params: { fecha: date, userId: 9 },
        }),
      );
      expect(await screen.findByRole('button', { name: 'Agregar registro a OT-12' })).toBeEnabled();
      expect(screen.getByRole('heading', { name: 'OT de Mecánico Uno' })).toBeInTheDocument();
      expect(vi.mocked(api.get).mock.calls.some(([url]) => url.includes('personnel'))).toBe(false);
    },
  );

  it('keeps completed and time-rejected daily activity visible without eligibility', async () => {
    items = [];
    journal.requests = [request({ status: 'rechazada', teamPending: true })];
    mount();
    const card = await screen.findByRole('article', { name: 'Orden OT-12' });
    expect(card).toHaveTextContent('Mi parte terminada, equipo pendiente');
    expect(within(card).getByRole('button', { name: 'Agregar registro a OT-12' })).toBeEnabled();
    expect(screen.getByText('Horas rechazadas')).toBeInTheDocument();
    expect(screen.queryByText('Sin patente')).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Agregar registro a OT-12' }));
    expect(await screen.findByRole('dialog', { name: 'Registro diario' })).toBeInTheDocument();
  });

  it.each(['en_proceso', 'completado'] as const)(
    'reads current %s activity and the own-part flag from timer entries',
    async (activityStatus) => {
      journal.entries = [
        Object.assign(
          {
            id: 30,
            ...own,
            userName: 'Mecánico Uno',
            kind: 'cronometro' as const,
            overtime: false,
            status: 'cerrada' as const,
            startedAt: new Date(`${date}T09:00`).toISOString(),
            endedAt: new Date(`${date}T10:00`).toISOString(),
            durationMinutes: 60,
            minutesOnDate: 60,
            note: null,
            supersededAt: null,
            scheduledEndAt: null,
          },
          { activityStatus, ownPartCompleted: true },
        ),
      ];
      mount();
      const card = await screen.findByRole('article', { name: 'Orden OT-12' });
      expect(card).toHaveTextContent(
        activityStatus === 'completado'
          ? 'Finalizado, pendiente de calidad'
          : 'Mi parte terminada, equipo pendiente',
      );
      expect(screen.queryByRole('button', { name: /aprobar.*calidad/i })).not.toBeInTheDocument();
    },
  );

  it('does not apply a rejected legacy correction as daily activity', async () => {
    items = [];
    journal.requests = [request({ dailyEntry: false, status: 'rechazada' })];
    mount();
    expect(await screen.findByRole('article', { name: 'Orden OT-12' })).toHaveTextContent(
      'Sin registro hoy',
    );
    expect(screen.queryByText('Mi parte finalizada')).not.toBeInTheDocument();
  });

  it('refreshes both queries for the selected date and preserves it in the form', async () => {
    mount();
    await screen.findByRole('article', { name: 'Orden OT-12' });
    fireEvent.change(screen.getByLabelText('Fecha del registro diario'), {
      target: { value: '2025-10-03' },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/workshop-time', { params: { fecha: '2025-10-03' } }),
    );
    expect(api.get).toHaveBeenCalledWith('/workshop-time/eligible-items', {
      params: { fecha: '2025-10-03' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar registro a OT-12' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registro diario' });
    expect(dialog).toHaveTextContent('03-10-2025');
    expect(within(dialog).queryByLabelText('Fecha del registro')).not.toBeInTheDocument();
    expect(await within(dialog).findByLabelText('OT')).toHaveValue('OT-12 · ABCD12');
  });

  it('saves one vehicle and continues with another on the same screen, invalidating COT', async () => {
    const { client } = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar registro a OT-12' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Horas utilizadas'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Finalizado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText(/Registro guardado: avance aplicado y horas pendientes/),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Orden OT-12' })).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quotations'] });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar registro a OT-15' }));
    expect(await screen.findByLabelText('OT')).toHaveValue('OT-15 · EFGH34');
    expect(screen.getByLabelText('Horas utilizadas')).toHaveValue(null);
  });

  it('asks before changing context, keeps the draft and can recover it on the original day', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar registro a OT-12' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), {
      target: { value: 'Captura por conservar' },
    });
    fireEvent.change(screen.getByLabelText('Fecha del registro diario'), {
      target: { value: '2025-10-03' },
    });
    expect(screen.getByRole('alertdialog', { name: '¿Cambiar de contexto?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Fecha del registro diario')).toHaveValue(date);
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue(
      'Captura por conservar',
    );
    await act(async () => {
      await flushFormDrafts();
    });
    fireEvent.change(screen.getByLabelText('Fecha del registro diario'), {
      target: { value: '2025-10-03' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Conservar borrador y cambiar' }));
    expect(screen.queryByRole('dialog', { name: 'Registro diario' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fecha del registro diario'), {
      target: { value: date },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar registro a OT-12' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue(
      'Captura por conservar',
    );
  });

  it.each(['pendiente', 'aprobada'] as const)(
    'shows the declared date for %s hours without displaying a fictitious interval',
    async (status) => {
      const declaration = request({
        status,
        reportedDate: date,
        replacementSessionId: status === 'aprobada' ? 30 : null,
        startedAt: `${date}T00:00:00Z`,
        endedAt: `${date}T00:00:00Z`,
      });
      journal.requests = [declaration];
      if (status === 'aprobada') {
        journal.entries = [{
          id: 30,
          ...own,
          userName: 'Mecánico Uno',
          kind: 'manual',
          overtime: false,
          status: 'cerrada',
          startedAt: declaration.startedAt,
          endedAt: declaration.endedAt,
          durationMinutes: 60,
          minutesOnDate: 60,
          note: 'Trabajo del día',
          supersededAt: null,
          scheduledEndAt: null,
        }];
      }
      mount();
      const records = await screen.findByRole('region', { name: 'Registros del día' });
      await waitFor(() => expect(records).toHaveTextContent('Horas declaradas · 04-10-2025'));
      expect(records).not.toHaveTextContent(/\d{2}:\d{2}/);
      expect(records).not.toHaveTextContent('Cronómetro abierto');
      expect(within(records).getAllByRole('listitem')).toHaveLength(1);
      expect(records).toHaveTextContent('1 h 00 min');
    },
  );

  it('keeps real clock intervals visible for legacy timer records', async () => {
    journal.requests = [request({
      dailyEntry: false,
      reportedDate: null,
      startedAt: `${date}T12:00:00Z`,
      endedAt: `${date}T13:00:00Z`,
    })];
    journal.timezone = 'America/Santiago';
    mount();
    const records = await screen.findByRole('region', { name: 'Registros del día' });
    await waitFor(() => expect(records).toHaveTextContent('09:00 – 10:00'));
    expect(records).not.toHaveTextContent('Horas declaradas');
  });

  it('lazy mounts history and preserves its correction draft while hidden', async () => {
    mount();
    await screen.findByRole('article', { name: 'Orden OT-12' });
    const button = screen.getByRole('button', { name: 'Historial, ajustes y revisión de horas' });
    fireEvent.click(button);
    fireEvent.change(await screen.findByLabelText('Ajuste existente'), {
      target: { value: 'Motivo en curso' },
    });
    fireEvent.click(button);
    expect(screen.getByLabelText('Ajuste existente')).toHaveValue('Motivo en curso');
    fireEvent.click(button);
    expect(screen.getByLabelText('Ajuste existente')).toHaveValue('Motivo en curso');
  });

  it('enforces read/update and role authorization without unauthorized requests', async () => {
    login('mecanico', [{ modulo: 'taller', accion: 'read' }]);
    const first = mount();
    expect(await screen.findByRole('button', { name: 'Agregar registro a OT-12' })).toBeDisabled();
    first.unmount();
    login('mecanico', [{ modulo: 'taller', accion: 'update' }]);
    const next = mount();
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso');
    next.unmount();
    vi.mocked(api.get).mockClear();
    login('vendedor');
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(api.get).not.toHaveBeenCalled();
  });
});
