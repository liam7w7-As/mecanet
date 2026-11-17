import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WorkshopTimePanel from '../WorkshopTimePanel';

import type { WorkshopTimeJournal, WorkshopTimeRequestRecord } from '@unithor/shared';
import type { ComponentProps } from 'react';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const makeRequest = (): WorkshopTimeRequestRecord => ({
  id: 200,
  kind: 'manual',
  overtime: false,
  status: 'pendiente',
  workOrderId: 12,
  workOrderCode: 'OT-12',
  itemId: 20,
  description: 'Diagnóstico',
  userId: 9,
  userName: 'Mecánico Uno',
  sourceSessionId: null,
  replacementSessionId: null,
  startedAt: '2025-10-04T12:00:00Z',
  endedAt: '2025-10-04T13:00:00Z',
  durationMinutes: 60,
  minutesOnDate: 60,
  note: 'Trabajo registrado',
  createdBy: 9,
  createdAt: '2025-10-04T14:00:00Z',
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
});
const makeJournal = (): WorkshopTimeJournal => ({
  date: '2025-10-04',
  workers: [{ id: 9, nombre: 'Mecánico Uno' }],
  requests: [],
  entries: [
    {
      id: 30,
      workOrderId: 12,
      workOrderCode: 'OT-12',
      itemId: 20,
      description: 'Servicio anterior reasignado',
      userId: 9,
      userName: 'Mecánico Uno',
      kind: 'cronometro',
      overtime: false,
      status: 'cerrada',
      startedAt: '2025-10-04T12:00:00Z',
      endedAt: '2025-10-04T13:00:00Z',
      durationMinutes: 60,
      minutesOnDate: 60,
      note: null,
      supersededAt: null,
      scheduledEndAt: null,
    },
  ],
  totals: {
    registeredMinutes: 60,
    pendingMinutes: 0,
    scheduledMinutes: null,
    unregisteredMinutes: null,
  },
});
let journal: WorkshopTimeJournal;
const mount = (props: ComponentProps<typeof WorkshopTimePanel> = {}) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <WorkshopTimePanel initialDate="2025-10-04" {...props} />
    </QueryClientProvider>,
  );
const fillInterval = (): void => {
  fireEvent.change(screen.getByLabelText('Inicio del intervalo'), {
    target: { value: '2025-10-04T09:00' },
  });
  fireEvent.change(screen.getByLabelText('Fin del intervalo'), {
    target: { value: '2025-10-04T10:00' },
  });
  fireEvent.change(screen.getByLabelText('Motivo del registro'), {
    target: { value: 'Diagnóstico realizado antes de registrar' },
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  journal = makeJournal();
  useAuthStore.setState({
    user: { id: 9, role: 'mecanico', nombre: 'Mecánico Uno', email: 'mecanico@example.invalid' },
    isAuthenticated: true,
    isLoading: false,
  });
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data:
      url === '/workshop-time'
        ? journal
        : {
            items: [
              {
                workOrderId: 12,
                workOrderCode: 'OT-12',
                itemId: 20,
                description: 'Diagnóstico',
                userId: 9,
              },
            ],
          },
  }));
  vi.mocked(api.post).mockResolvedValue({ data: { request: makeRequest() } });
  vi.mocked(api.patch).mockResolvedValue({
    data: { request: { ...makeRequest(), status: 'aprobada' } },
  });
});

describe('Workshop time panel', () => {
  it('shows own reassigned hours and unconfigured shifts without financials or chief controls', async () => {
    mount();
    expect(await screen.findByText('OT-12 · Servicio anterior reasignado')).toBeInTheDocument();
    expect(screen.getByText('Jornada sin configurar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar corrección #30' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrar trabajador')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Registrar como horas extra' })).not.toBeInTheDocument();
    expect(screen.queryByText(/precio|costo|subtotal|CLP/i)).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/work-orders/12');
  });
  it('keeps the manual draft on API error and retries without adding a mechanic userId', async () => {
    const state = vi.fn();
    mount({ onState: state });
    await screen.findByRole('option', { name: 'OT-12 · Diagnóstico' });
    fireEvent.change(screen.getByLabelText('Servicio asignado'), { target: { value: '20' } });
    fillInterval();
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar horas al jefe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tus datos se conservan');
    expect(screen.getByLabelText('Motivo del registro')).toHaveValue(
      'Diagnóstico realizado antes de registrar',
    );
    expect(screen.getByLabelText('Inicio del intervalo')).toHaveValue('2025-10-04T09:00');
    expect(state).toHaveBeenCalledWith(true, true);
    expect(state).toHaveBeenLastCalledWith(true, false);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar horas al jefe' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    const body = vi.mocked(api.post).mock.calls[1]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({ workOrderId: 12, itemId: 20 });
    expect(body).not.toHaveProperty('userId');
    expect(body.startedAt).toBe(new Date('2025-10-04T09:00').toISOString());
    expect(await screen.findByText(/Solicitud guardada.*aún no suma horas/)).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo del registro')).toHaveValue('');
  });
  it('requests a correction for an own historical entry without editing the source', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar corrección #30' }));
    expect(screen.getByText(/El original se conserva y cuenta/)).toBeInTheDocument();
    fillInterval();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar corrección al jefe' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/workshop-time/requests',
        expect.objectContaining({
          sourceSessionId: 30,
          note: 'Diagnóstico realizado antes de registrar',
        }),
      ),
    );
    expect(api.patch).not.toHaveBeenCalled();
  });
  it('supports chief worker filters and reasoned approve/reject drafts with modal state tracking', async () => {
    useAuthStore.setState({
      user: { id: 1, role: 'jefe', nombre: 'Jefe', email: 'jefe@example.invalid' },
    });
    journal.requests = [makeRequest()];
    const state = vi.fn();
    mount({ onState: state });
    expect(await screen.findByText('Pendiente de validación')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrar trabajador'), { target: { value: '9' } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/workshop-time', {
        params: { fecha: '2025-10-04', userId: 9 },
      }),
    );
    const approve = await screen.findByRole('button', { name: 'Aprobar solicitud #200' });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo de revisión #200'), {
      target: { value: 'Coincide con el parte de trabajo' },
    });
    await waitFor(() => expect(state).toHaveBeenLastCalledWith(true, false));
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(approve);
    expect(await screen.findByRole('alert')).toHaveTextContent('El motivo se conserva');
    expect(screen.getByLabelText('Motivo de revisión #200')).toHaveValue(
      'Coincide con el parte de trabajo',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud #200' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenLastCalledWith('/workshop-time/requests/200/review', {
        approve: false,
        note: 'Coincide con el parte de trabajo',
      }),
    );
  });
  it('attributes chief manual entries to the selected worker', async () => {
    useAuthStore.setState({
      user: { id: 1, role: 'jefe', nombre: 'Jefe', email: 'jefe@example.invalid' },
    });
    mount();
    await screen.findAllByRole('option', { name: 'Mecánico Uno' });
    fireEvent.change(await screen.findByLabelText('Trabajador del registro'), {
      target: { value: '9' },
    });
    await screen.findByRole('option', { name: 'OT-12 · Diagnóstico' });
    fireEvent.change(screen.getByLabelText('Servicio asignado'), { target: { value: '20' } });
    fillInterval();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas aceptadas' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/workshop-time/requests',
        expect.objectContaining({ userId: 9, itemId: 20 }),
      ),
    );
  });
  it.each(['jefe', 'admin', 'desarrollador'] as const)('submits explicit extra hours for %s and preserves the flag on API failure', async (role) => {
    useAuthStore.setState({ user: { id: 1, role, nombre: 'Supervisor', email: 'jefe@example.invalid' } });
    const state = vi.fn();
    mount({ onState: state });
    await screen.findAllByRole('option', { name: 'Mecánico Uno' });
    fireEvent.change(screen.getByLabelText('Trabajador del registro'), { target: { value: '9' } });
    await screen.findByRole('option', { name: 'OT-12 · Diagnóstico' });
    fireEvent.change(screen.getByLabelText('Servicio asignado'), { target: { value: '20' } });
    fillInterval();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Registrar como horas extra' }));
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Intervalo superpuesto'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas aceptadas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tus datos se conservan');
    expect(screen.getByRole('checkbox', { name: 'Registrar como horas extra' })).toBeChecked();
    expect(state).toHaveBeenLastCalledWith(true, false);
    expect(api.post).toHaveBeenLastCalledWith('/workshop-time/requests', expect.objectContaining({ userId: 9, overtime: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas aceptadas' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Registrar como horas extra' })).not.toBeChecked());
  });

  it('treats initial overtime as a clean default and restores it after saving another extra interval', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'jefe', nombre: 'Jefe', email: 'jefe@example.invalid' } });
    const state = vi.fn();
    mount({ initialOvertime: true, onState: state });
    await screen.findAllByRole('option', { name: 'Mecánico Uno' });
    expect(state).toHaveBeenLastCalledWith(false, false);
    expect(screen.getByRole('checkbox', { name: 'Registrar como horas extra' })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Trabajador del registro'), { target: { value: '9' } });
    await screen.findByRole('option', { name: 'OT-12 · Diagnóstico' });
    fireEvent.change(screen.getByLabelText('Servicio asignado'), { target: { value: '20' } });
    fillInterval();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas aceptadas' }));
    await waitFor(() => expect(screen.getByLabelText('Motivo del registro')).toHaveValue(''));
    expect(screen.getByRole('checkbox', { name: 'Registrar como horas extra' })).toBeChecked();
    expect(state).toHaveBeenLastCalledWith(false, false);
    expect(api.post).toHaveBeenCalledWith('/workshop-time/requests', expect.objectContaining({ overtime: true }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Registrar como horas extra' }));
    await waitFor(() => expect(state).toHaveBeenLastCalledWith(true, false));
  });

  it('shows inherited extra classification on corrections and sends no override', async () => {
    journal.entries[0].overtime = true;
    journal.requests = [{ ...makeRequest(), overtime: true }];
    mount();
    await screen.findAllByText(/Horas extra/);
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar corrección #30' }));
    expect(screen.getByText('Horas extra: la corrección conserva esta clasificación.')).toBeInTheDocument();
    fillInterval();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar corrección al jefe' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    expect(vi.mocked(api.post).mock.calls[0][1]).not.toHaveProperty('overtime');
  });
  it('shows superseded originals read-only and offers corrections only for own current closed entries', async () => {
    journal.entries[0].supersededAt = '2025-10-04T14:00:00Z';
    journal.entries.push({
      ...journal.entries[0],
      id: 31,
      supersededAt: null,
      userId: 10,
      userName: 'Otro trabajador',
    });
    mount();
    expect(await screen.findByText(/Original conservado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Solicitar corrección/ })).not.toBeInTheDocument();
  });
  it('respects read-only module permissions and treats configured days off as zero hours', async () => {
    useAuthStore.setState({
      user: {
        id: 9,
        role: 'mecanico',
        nombre: 'Mecánico Uno',
        email: 'mecanico@example.invalid',
        permissions: [{ modulo: 'taller', accion: 'read' }],
      },
    });
    journal.totals.scheduledMinutes = 0;
    journal.totals.unregisteredMinutes = 0;
    mount();
    expect(await screen.findByText('Jornada: 0 h 00 min')).toBeInTheDocument();
    expect(screen.queryByText('Jornada sin configurar')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Registro de intervalo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Solicitar corrección/ })).not.toBeInTheDocument();
  });
  it('does not fetch for non-workshop roles even if they have module permissions', () => {
    useAuthStore.setState({
      user: { id: 7, role: 'vendedor', nombre: 'Ventas', email: 'ventas@example.invalid' },
    });
    mount();
    expect(
      screen.queryByRole('region', { name: 'Diario de horas de taller' }),
    ).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
  it('drops cached supervisor rows immediately when the same account becomes a mechanic', async () => {
    useAuthStore.setState({
      user: { id: 9, role: 'jefe', nombre: 'Mecánico Uno', email: 'mecanico@example.invalid' },
    });
    journal.entries.push({
      ...journal.entries[0],
      id: 31,
      userId: 10,
      description: 'Trabajo ajeno visible al jefe',
    });
    mount();
    await screen.findByText('OT-12 · Trabajo ajeno visible al jefe');
    journal = makeJournal();
    act(() => {
      useAuthStore.setState({
        user: {
          id: 9,
          role: 'mecanico',
          nombre: 'Mecánico Uno',
          email: 'mecanico@example.invalid',
        },
      });
    });
    expect(screen.queryByText('OT-12 · Trabajo ajeno visible al jefe')).not.toBeInTheDocument();
    expect(await screen.findByText('OT-12 · Servicio anterior reasignado')).toBeInTheDocument();
  });
  it('scopes displayed rows and service options to the host order while retaining day totals', async () => {
    mount({ workOrderId: 13 });
    expect(
      await screen.findByText('Totales del día completo; historial de esta OT.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('OT-12 · Servicio anterior reasignado')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'OT-12 · Diagnóstico' })).not.toBeInTheDocument();
  });
});
