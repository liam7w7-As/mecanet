import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { flushFormDrafts, saveFormDraft } from '../../../lib/form-recovery';
import { useAuthStore } from '../../../stores/auth.store';
import WorkshopDailyEntryModal from '../WorkshopDailyEntryModal';

import type {
  DailyOrder,
  DailyTimeRequest,
  WorkshopDailyEntryInput,
} from '../../../hooks/useWorkshopDailyLog';
import type { Role, WorkshopTimeEligibleItem } from '@unithor/shared';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const date = '2025-10-04';
const own = {
  workOrderId: 12,
  workOrderCode: 'OT-12',
  patente: 'ABCD12',
  itemId: 20,
  description: 'Diagnóstico',
  userId: 9,
};
const order = (registeredMinutes = 0): DailyOrder => ({
  id: 12,
  code: 'OT-12',
  patente: 'ABCD12',
  services: [
    { ...own, eligible: true, registeredMinutes, pendingMinutes: 30, activityStatus: 'en_proceso' },
  ],
});
const requestFor = (input: WorkshopDailyEntryInput): DailyTimeRequest => ({
  ...input,
  id: 200,
  kind: 'manual',
  dailyEntry: true,
  overtime: false,
  userId: input.userId ?? 9,
  userName: 'Mecánico Uno',
  workOrderCode: 'OT-12',
  description: 'Diagnóstico',
  status: 'pendiente',
  sourceSessionId: null,
  replacementSessionId: null,
  durationMinutes: 90,
  minutesOnDate: 90,
  createdBy: 9,
  createdAt: `${date}T18:00:00.000Z`,
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  startedAt: 'startedAt' in input ? input.startedAt : `${date}T00:00:00.000Z`,
  endedAt: 'endedAt' in input ? input.endedAt : `${date}T00:00:00.000Z`,
  reportedDate: 'horasUtilizadas' in input ? input.fecha : null,
});
let items: WorkshopTimeEligibleItem[] = [own];
const login = (role: Role = 'mecanico', id = 9) =>
  useAuthStore.setState({
    user: {
      id,
      role,
      nombre: role === 'mecanico' ? 'Mecánico Uno' : 'Jefa',
      email: 'test@example.invalid',
    },
    isAuthenticated: true,
    isLoading: false,
  });
const mount = (overrides: Partial<Parameters<typeof WorkshopDailyEntryModal>[0]> = {}) => {
  const onComplete = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <WorkshopDailyEntryModal
        order={order()}
        date={date}
        workerId={9}
        workerName="Mecánico Uno"
        onComplete={onComplete}
        onClose={onClose}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...view, onComplete, onClose, client };
};
const fill = async (note = '') => {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText('Horas utilizadas'), { target: { value: '1.5' } });
  if (note)
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), {
      target: { value: note },
    });
};

beforeEach(() => {
  vi.resetAllMocks();
  login();
  items = [own];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:photo'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(api.get).mockImplementation(async () => ({ data: { items } }));
  vi.mocked(api.post).mockImplementation(async (url, input) =>
    url === '/workshop-time/daily-entries'
      ? { data: { request: requestFor(input as WorkshopDailyEntryInput) } }
      : { data: {} },
  );
  vi.mocked(api.patch).mockResolvedValue({ data: {} });
});

describe('WorkshopDailyEntryModal', () => {
  it('posts the explicit DP stage ID when the armador has two stages on the same piece', async () => {
    const disassembly = { ...own, division: 'DP' as const, dpStageId: 51, dpStageLabel: 'Desarme', blocked: false };
    const assembly = { ...own, division: 'DP' as const, dpStageId: 54, dpStageLabel: 'Montaje', blocked: true };
    items = [disassembly, assembly];
    mount({ order: { ...order(), services: [
      { ...disassembly, eligible: true, registeredMinutes: 0, pendingMinutes: 0, activityStatus: null },
      { ...assembly, eligible: false, registeredMinutes: 0, pendingMinutes: 0, activityStatus: null },
    ] } });
    await fill();
    expect(screen.getByLabelText('Trabajo')).toHaveValue('20:dp-51');
    expect(screen.getByRole('option', { name: /Montaje.*Espera la etapa anterior/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/workshop-time/daily-entries', expect.objectContaining({ itemId: 20, dpStageId: 51, horasUtilizadas: 1.5 })));
  });

  it('selects montaje explicitly after it becomes available without reusing desarme', async () => {
    const assembly = { ...own, division: 'DP' as const, dpStageId: 54, dpStageLabel: 'Montaje', blocked: false };
    items = [assembly];
    mount({ order: { ...order(), services: [{ ...assembly, eligible: true, registeredMinutes: 0, pendingMinutes: 0, activityStatus: null }] } });
    await fill();
    fireEvent.change(screen.getByLabelText('Horas utilizadas'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/workshop-time/daily-entries', expect.objectContaining({ itemId: 20, dpStageId: 54, horasUtilizadas: 30 })));
  });

  it('blocks a future DP stage even if its value is selected programmatically', async () => {
    const disassembly = { ...own, division: 'DP' as const, dpStageId: 51, dpStageLabel: 'Desarme', blocked: false };
    const assembly = { ...own, division: 'DP' as const, dpStageId: 54, dpStageLabel: 'Montaje', blocked: true };
    items = [disassembly, assembly];
    mount({ order: { ...order(), services: [{ ...disassembly, eligible: true, registeredMinutes: 0, pendingMinutes: 0, activityStatus: null }] } });
    await fill();
    fireEvent.change(screen.getByLabelText('Trabajo'), { target: { value: '20:dp-54' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('La etapa anterior aún no está terminada');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('prefills a readonly OT, allows only own services and posts real hours/status without userId', async () => {
    items = [
      own,
      { ...own, itemId: 21, userId: 4, description: 'Trabajo ajeno' },
      { ...own, workOrderId: 99, itemId: 25, description: 'Otra OT' },
    ];
    const { onComplete } = mount();
    await fill('Diagnóstico realizado');
    expect(screen.getByLabelText('OT')).toHaveValue('OT-12 · ABCD12');
    expect(screen.getByLabelText('OT')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Trabajo')).toHaveValue('20');
    expect(screen.queryByLabelText('Fecha del registro')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hora de inicio')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Trabajo ajeno' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Otra OT' })).not.toBeInTheDocument();
    expect(screen.queryByText('Fin calculado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Finalizado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('pendiente'));
    const [url, body] = vi.mocked(api.post).mock.calls[0];
    expect(url).toBe('/workshop-time/daily-entries');
    expect(body).toMatchObject({
      fecha: date,
      workOrderId: 12,
      itemId: 20,
      activityStatus: 'completado',
      note: 'Diagnóstico realizado',
      horasUtilizadas: 1.5,
      clientRequestId: expect.stringMatching(/^[\da-f-]{36}$/),
    });
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('estimatedHours');
    expect(body).not.toHaveProperty('startedAt');
    expect(body).not.toHaveProperty('endedAt');
  });

  it('accepts empty optional notes, uses a descriptive API fallback and skips observations', async () => {
    const { onComplete } = mount();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      '/workshop-time/daily-entries',
      expect.objectContaining({ note: 'Registro diario: Diagnóstico · Parcial' }),
    );
  });

  it.each(['', '0', '-1', '0.001'])(
    'blocks invalid duration %s without a request',
    async (hours) => {
      mount();
      await fill();
      fireEvent.change(screen.getByLabelText('Horas utilizadas'), { target: { value: hours } });
      fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!);
      expect(await screen.findByRole('alert')).toHaveTextContent('como mínimo, un minuto');
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it('accepts one minute as actual hours without generating start/end timestamps', async () => {
    const { onComplete } = mount();
    await fill();
    fireEvent.change(screen.getByLabelText('Horas utilizadas'), {
      target: { value: String(1 / 60) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('pendiente'));
    const payload = vi.mocked(api.post).mock.calls[0][1];
    expect(payload).toMatchObject({ horasUtilizadas: 1 / 60 });
    expect(payload).not.toHaveProperty('startedAt');
    expect(payload).not.toHaveProperty('endedAt');
  });

  it.each([3, 5, 30])('lets the assigned mechanic declare %s hours without a maximum or work interval', async (hours) => {
    const { onComplete } = mount();
    await fill();
    const input = screen.getByLabelText('Horas utilizadas');
    expect(input).not.toHaveAttribute('max');
    fireEvent.change(input, { target: { value: String(hours) } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('pendiente'));
    expect(api.post).toHaveBeenCalledWith('/workshop-time/daily-entries', expect.objectContaining({ horasUtilizadas: hours }));
  });

  it('keeps the UUID and draft after a connection error and does not upload anything', async () => {
    const { onComplete } = mount();
    await fill('Conservar nota');
    const firstPost = vi.mocked(api.post).getMockImplementation()!;
    vi.mocked(api.post)
      .mockRejectedValueOnce(new AxiosError('Network Error'))
      .mockImplementation(firstPost);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
    expect(screen.getByRole('alert')).toHaveTextContent('Tus datos y fotos se mantienen');
    expect(screen.getByLabelText('Horas utilizadas')).toHaveValue(1.5);
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('Conservar nota');
    expect(api.post).toHaveBeenCalledTimes(1);
    const first = vi.mocked(api.post).mock.calls[0][1] as WorkshopDailyEntryInput;
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect((vi.mocked(api.post).mock.calls[1][1] as WorkshopDailyEntryInput).clientRequestId).toBe(
      first.clientRequestId,
    );
  });

  it('previews/removes photos and retries observations without submitting the core twice', async () => {
    const { onComplete } = mount();
    await fill('Nota principal');
    fireEvent.click(screen.getByRole('button', { name: 'Añadir nota o fotos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Otra nota' }));
    fireEvent.change(screen.getByLabelText('Nota adicional 1'), {
      target: { value: 'Detalle adicional' },
    });
    const image = new File(['photo'], 'motor.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Fotos del trabajo'), { target: { files: [image] } });
    expect(await screen.findByAltText('Vista previa de motor.jpg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto motor.jpg' }));
    expect(screen.queryByAltText('Vista previa de motor.jpg')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fotos del trabajo'), { target: { files: [image] } });
    const firstPost = vi.mocked(api.post).getMockImplementation()!;
    let attempts = 0;
    vi.mocked(api.post).mockImplementation(async (url, input, config) => {
      if (url.endsWith('/observations') && ++attempts === 1)
        throw new Error('Sin conexión al subir foto');
      return firstPost(url, input, config);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya están guardados');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar notas y fotos' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(
      vi.mocked(api.post).mock.calls.filter(([url]) => url === '/workshop-time/daily-entries'),
    ).toHaveLength(1);
    const uploads = vi.mocked(api.post).mock.calls.filter(([url]) => url.endsWith('/observations'));
    expect(uploads).toHaveLength(2);
    const payload = uploads[1][1] as FormData;
    expect(payload.get('texto')).toBe('Nota principal\n\nDetalle adicional');
    expect(payload.get('workOrderItemId')).toBe('20');
    expect(payload.getAll('files')).toHaveLength(1);
  });

  it('recovers a saved core after completion removes eligibility and retries only the photos', async () => {
    const view = mount();
    await fill();
    fireEvent.click(screen.getByRole('radio', { name: 'Finalizado' }));
    fireEvent.change(screen.getByLabelText('Fotos del trabajo'), {
      target: { files: [new File(['p'], 'avance.png', { type: 'image/png' })] },
    });
    const firstPost = vi.mocked(api.post).getMockImplementation()!;
    vi.mocked(api.post).mockImplementation(async (url, input, config) => {
      if (url.endsWith('/observations')) throw new Error('Subida pendiente');
      return firstPost(url, input, config);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('alert');
    await act(async () => {
      await flushFormDrafts();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conservar borrador y cerrar' }));
    await waitFor(() => expect(view.onClose).toHaveBeenCalled());
    view.unmount();
    items = [];
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const second = mount({
      order: { ...order(), services: [{ ...order().services[0], eligible: false }] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(await screen.findByAltText('Vista previa de avance.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar notas y fotos' }));
    await waitFor(() => expect(second.onComplete).toHaveBeenCalled());
    expect(
      vi.mocked(api.post).mock.calls.filter(([url]) => url === '/workshop-time/daily-entries'),
    ).toHaveLength(1);
  });

  it('requires actual additional hours even if the service has clock hours', async () => {
    const { onComplete, client } = mount({ order: order(60) });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await fill();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Registradas hoy en este servicio/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Finalizado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('pendiente'));
    expect(api.post).toHaveBeenCalledWith('/workshop-time/daily-entries',
      expect.objectContaining({ horasUtilizadas: 1.5, activityStatus: 'completado' }));
    expect(api.patch).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['quotations'] });
  });

  it('requires confirmation on close and retains inputs when continuing', async () => {
    const { onClose } = mount();
    await fill('No perder');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('No perder');
    expect(onClose).not.toHaveBeenCalled();
    const unload = new Event('beforeunload', { cancelable: true });
    await act(async () => {
      window.dispatchEvent(unload);
      await flushFormDrafts();
    });
    expect(unload.defaultPrevented).toBe(true);
  });

  it('uses supervisor target and reports accepted hours honestly', async () => {
    login('jefe', 1);
    const { onComplete } = mount();
    await fill();
    vi.mocked(api.post).mockImplementation(async (_url, input) => ({
      data: { request: { ...requestFor(input as WorkshopDailyEntryInput), status: 'aprobada' } },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('aprobada'));
    expect(api.post).toHaveBeenCalledWith(
      '/workshop-time/daily-entries',
      expect.objectContaining({ userId: 9 }),
    );
  });

  it('blocks another worker and missing update permission, including direct modal mounting', async () => {
    const { unmount } = mount({ workerId: 10 });
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(api.get).not.toHaveBeenCalled();
    unmount();
    login();
    useAuthStore.setState({
      user: {
        ...useAuthStore.getState().user!,
        permissions: [{ modulo: 'taller', accion: 'read' }],
      },
    });
    mount();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('recovers an older saved progress-only draft and uploads without another hours request', async () => {
    await saveFormDraft(9, 'workshop-daily:9:'+date+':12', {
      clientRequestId: crypto.randomUUID(), itemId: '20', startTime: '09:00',
      hours: '', activityStatus: 'completado', note: 'Parte terminada', extraNotes: [],
      files: [{ name: 'pieza.jpg', lastModified: 1, blob: new Blob(['p'], { type: 'image/jpeg' }) }],
      savedRequestId: null, observationsSaved: false, hoursStatus: 'aprobada',
      useRecordedHours: true, progressSaved: true,
    }, crypto.randomUUID());
    items = [];
    const { onComplete } = mount({ order: order(60) });
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(await screen.findByAltText('Vista previa de pieza.jpg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar notas y fotos' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('aprobada'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/work-orders/12/observations');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('scopes recovery to the user identity and retains it when that user changes role', async () => {
    const view = mount();
    await fill('Borrador personal');
    await act(async () => {
      await flushFormDrafts();
    });
    view.unmount();
    login('jefe', 9);
    const second = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('Borrador personal');
    await act(async () => {
      await flushFormDrafts();
    });
    second.unmount();
    login('jefe', 10);
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled(),
    );
    expect(screen.queryByRole('button', { name: 'Recuperar formulario' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('');
  });

  it('limits photos to the five shared slots', async () => {
    mount();
    await fill();
    fireEvent.change(screen.getByLabelText('Fotos del trabajo'), {
      target: {
        files: Array.from(
          { length: 6 },
          (_, i) => new File(['x'], `${i}.jpg`, { type: 'image/jpeg' }),
        ),
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('hasta 5 fotos');
    expect(screen.queryByLabelText('Fotos seleccionadas')).not.toBeInTheDocument();
  });

  it.each(['', '0', '-1', '0.01'])(
    'rejects invalid declared duration %s without calling the API',
    async (hours) => {
      mount();
      await fill();
      fireEvent.change(screen.getByLabelText('Horas utilizadas'), { target: { value: hours } });
      fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!);
      expect(await screen.findByRole('alert')).toHaveTextContent('como mínimo, un minuto');
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it('hides routine recovery and attachment panels until needed', async () => {
    mount();
    await fill();
    await act(async () => { await flushFormDrafts(); });
    expect(screen.queryByText('Recuperación guardada en este navegador')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin cambios pendientes')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Notas y fotos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Otra nota' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir nota o fotos' }));
    expect(screen.getByRole('button', { name: 'Otra nota' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar fotos' })).toBeInTheDocument();
  });
});
