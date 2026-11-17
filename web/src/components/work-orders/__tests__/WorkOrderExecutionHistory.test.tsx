import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { laborKeys } from '../../../hooks/useWorkOrderLabor';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderExecutionHistory from '../WorkOrderExecutionHistory';

import type { UserPublic } from '../../../stores/auth.store';
import type {
  WorkOrder,
  WorkOrderWorksheet,
  WorkOrderWorksheetItem,
} from '../../../types/entities';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const workOrder: WorkOrder = {
  id: 12,
  codigo: 'OT-12',
  clientId: null,
  vehicleId: null,
  estado: 'en_progreso',
  descripcion: null,
  kilometrajeIngreso: null,
  fechaIngreso: null,
  fechaEntrega: null,
  createdBy: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2099-01-01T00:00:00Z',
  progressReports: [
    {
      id: 999,
      porcentaje: 99,
      comentario: 'Reporte comercial ajeno',
      bloqueos: null,
      createdAt: '2099-01-01T00:00:00Z',
    },
  ],
};
type Session = NonNullable<WorkOrderWorksheetItem['sessions']>[number];
const session = (overrides: Partial<Session> = {}): Session => ({
  id: 1,
  userName: 'Ana Mecánica',
  startedAt: '2025-10-04T09:00:00Z',
  endedAt: '2025-10-04T10:00:00Z',
  minutes: 60,
  kind: 'cronometro',
  note: 'Sesión original',
  ...overrides,
});
const service = (sessions: Session[]): WorkOrderWorksheetItem => ({
  id: 20,
  descripcion: 'Diagnóstico',
  tipoLinea: 'estandar',
  unidadMedida: 'unidad',
  cantidad: 1,
  estadoOperativo: 'en_proceso',
  notasOperativas: null,
  horasHombreEstimadas: null,
  horasEstimadasTotales: null,
  horasHombreReales: 1,
  excedeEstimado: false,
  assignedUser: null,
  laborValidatedAt: null,
  laborValidationNote: null,
  activeSession: null,
  totalMinutes: 60,
  observationsCount: 0,
  sessions,
});
const makeWorksheet = (): WorkOrderWorksheet => {
  const item = service([session()]);
  return {
    workOrder: {
      id: 12,
      codigo: 'OT-12',
      estado: 'en_progreso',
      fechaIngreso: null,
      descripcion: null,
      vehiculo: { id: null, patente: null, marca: null, modelo: null },
    },
    items: [item],
    servicios: [item],
    repuestos: [],
    observations: [],
    progressReports: [],
    activeItemId: null,
    pausedOtherItems: 0,
    totals: {
      items: 1,
      completados: 0,
      enProceso: 1,
      pendientes: 0,
      horasEstimadas: 0,
      horasReales: 1,
      minutosReales: 60,
    },
  };
};
const user = (role: UserPublic['role'] = 'mecanico'): UserPublic => ({
  id: 9,
  role,
  nombre: 'Ana Mecánica',
  email: 'ana@example.invalid',
});
let worksheet: WorkOrderWorksheet;
const clients: QueryClient[] = [];
const mount = (active = true, cached?: WorkOrderWorksheet) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  if (cached) client.setQueryData(laborKeys.worksheet(workOrder.id), cached);
  const view = (isActive: boolean) => (
    <QueryClientProvider client={client}>
      <WorkOrderExecutionHistory workOrder={workOrder} active={isActive} />
    </QueryClientProvider>
  );
  const result = render(view(active));
  return { ...result, client, setActive: (isActive: boolean) => result.rerender(view(isActive)) };
};
const expand = (open = true): HTMLDetailsElement => {
  const summary = screen.getByText('Historial de trabajo');
  const details = summary.closest('details') as HTMLDetailsElement;
  if (details.open !== open) fireEvent.click(summary);
  return details;
};
const rows = () =>
  within(screen.getByRole('list', { name: 'Registros del historial de trabajo' })).getAllByRole(
    'listitem',
  );

beforeEach(() => {
  vi.resetAllMocks();
  worksheet = makeWorksheet();
  useAuthStore.setState({ user: user(), isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockResolvedValue({ data: { worksheet } });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe('WorkOrderExecutionHistory', () => {
  it('starts collapsed and fetches only the technical worksheet after expansion', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(
      <QueryClientProvider client={client}>
        <WorkOrderExecutionHistory workOrder={workOrder} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Historial de trabajo').closest('details')).not.toHaveAttribute('open');
    expect(api.get).not.toHaveBeenCalled();
    expand();
    expect(await screen.findByText('Sesión original')).toBeVisible();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/work-orders/12/worksheet');
    expect(screen.queryByText('Reporte comercial ajeno')).not.toBeInTheDocument();
    expect(document.querySelector('form')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.queryByText(/precio|costo|subtotal|CLP|comercial/i)).not.toBeInTheDocument();
    const query = client.getQueryCache().find({ queryKey: laborKeys.worksheet(workOrder.id) });
    expect(query?.isActive()).toBe(true);
    expand(false);
    expect(query?.isActive()).toBe(false);
    expect(screen.getByText('Historial de trabajo').closest('details')).not.toHaveAttribute('open');
  });

  it.each(['admin', 'desarrollador', 'jefe', 'mecanico'] as const)(
    'permits worksheet reads for %s',
    async (role) => {
      useAuthStore.setState({ user: user(role) });
      mount();
      expand();
      expect(await screen.findByText('Sesión original')).toBeVisible();
    },
  );

  it.each(['vendedor', 'bodeguero', 'finanzas'] as const)(
    'hides cached history and never fetches for %s even with taller.read',
    (role) => {
      useAuthStore.setState({
        user: { ...user(role), permissions: [{ modulo: 'taller', accion: 'read' }] },
      });
      const { container } = mount(true, worksheet);
      expect(container).toBeEmptyDOMElement();
      expect(api.get).not.toHaveBeenCalled();
    },
  );

  it.each(['mecanico', 'jefe'] as const)('requires taller.read for %s', (role) => {
    useAuthStore.setState({ user: { ...user(role), permissions: [] } });
    const { container } = mount(true, worksheet);
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('hides history without a user', () => {
    useAuthStore.setState({ user: null });
    const { container } = mount(true, worksheet);
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('does not fetch while inactive even if expanded, and resumes when active', async () => {
    const result = mount(false);
    const details = expand();
    expect(details).not.toBeVisible();
    expect(api.get).not.toHaveBeenCalled();
    result.setActive(true);
    expect(await screen.findByText('Sesión original')).toBeVisible();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('orders all event types by their own dates, using endedAt then startedAt for sessions', async () => {
    worksheet.servicios[0].sessions = [
      session({
        id: 1,
        startedAt: '2025-10-04T01:00:00Z',
        endedAt: '2025-10-04T14:00:00Z',
        minutes: 89 / 60,
        note: 'Finalizada',
      }),
      session({
        id: 2,
        endedAt: null,
        startedAt: '2025-10-04T13:00:00Z',
        minutes: 44 / 60,
        note: 'Abierta',
      }),
      session({
        id: 3,
        endedAt: '2025-10-04T10:00:00Z',
        kind: 'manual',
        note: 'Manual exacta',
        minutes: 149 / 60,
      }),
      session({
        id: 4,
        endedAt: '2025-10-04T08:00:00Z',
        kind: 'ajuste',
        note: 'Corrección',
        minutes: -0.5,
      }),
    ];
    worksheet.observations = [
      {
        id: 1,
        texto: 'Nota técnica',
        createdAt: '2025-10-04T12:00:00Z',
        authorName: 'Jefe',
        itemId: 20,
        itemDescripcion: 'Diagnóstico',
        progressReportId: null,
        files: [
          {
            id: 1,
            nombreOriginal: 'diagnostico.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 100,
            url: '/uploads/diagnostico.pdf',
          },
        ],
      },
    ];
    worksheet.progressReports = [
      {
        id: 1,
        porcentaje: 50,
        comentario: 'Avance técnico',
        bloqueos: 'Esperando herramienta',
        horasCerradas: 1,
        createdAt: '2025-10-04T11:00:00Z',
        mechanic: { id: 9, nombre: 'Ana Mecánica' },
      },
    ];
    // Parts and commercial data must not create service-session history.
    worksheet.repuestos = [
      { ...service([session({ id: 99, note: 'Sesión de repuesto' })]), tipoLinea: 'parte' },
    ];
    mount();
    expand();
    await screen.findByText('Finalizada');
    expect(rows().map((row) => row.querySelector('time')?.dateTime)).toEqual([
      '2025-10-04T14:00:00Z',
      '2025-10-04T13:00:00Z',
      '2025-10-04T12:00:00Z',
      '2025-10-04T11:00:00Z',
      '2025-10-04T10:00:00Z',
      '2025-10-04T08:00:00Z',
    ]);
    expect(rows()[0]).toHaveTextContent('Diagnóstico');
    expect(rows()[0]).toHaveTextContent('Ana Mecánica');
    expect(screen.getByText('0 h 01 min 29 s')).toBeInTheDocument();
    expect(screen.getByText('0 h 00 min 44 s')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('Cronómetro en curso')).toBeInTheDocument();
    expect(screen.getByText('0 h 02 min 29 s')).toBeInTheDocument();
    expect(screen.getByText('-0 h 00 min 30 s')).toBeInTheDocument();
    expect(screen.getByText('Registro manual')).toBeInTheDocument();
    expect(screen.getByText('Ajuste')).toBeInTheDocument();
    expect(screen.getByText('Reporte de avance · 50%')).toBeInTheDocument();
    expect(screen.getByText('Bloqueos: Esperando herramienta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'diagnostico.pdf' })).toHaveAttribute(
      'href',
      '/uploads/diagnostico.pdf',
    );
    expect(screen.getByRole('link', { name: 'diagnostico.pdf' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.queryByText('Sesión de repuesto')).not.toBeInTheDocument();
  });

  it('shows ten recent entries, expands by ten and preserves filters, pagination and cache when hidden', async () => {
    worksheet.servicios[0].sessions = Array.from({ length: 23 }, (_, i) =>
      session({
        id: i + 1,
        note: `Sesión ${i + 1}`,
        endedAt: `2025-10-04T10:${String(i).padStart(2, '0')}:00Z`,
      }),
    );
    const result = mount();
    expand();
    await screen.findByText('Sesión 23');
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toHaveTextContent('Sesión 23');
    expect(screen.queryByText('Sesión 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sesiones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver más (13)' }));
    expect(rows()).toHaveLength(20);
    const cached = result.client.getQueryData(laborKeys.worksheet(12));
    expand(false);
    result.setActive(false);
    expect(result.client.getQueryData(laborKeys.worksheet(12))).toBe(cached);
    expect(api.get).toHaveBeenCalledTimes(1);
    result.setActive(true);
    expect(api.get).toHaveBeenCalledTimes(1);
    expand();
    expect(screen.getByRole('button', { name: 'Sesiones' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(rows()).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Ver más (3)' }));
    expect(rows()).toHaveLength(23);
    expect(screen.queryByRole('button', { name: /Ver más/ })).not.toBeInTheDocument();
  });

  it('keeps cached records and exact hours on a failed refresh, and retries the worksheet read', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Offline'));
    const result = mount(true, worksheet);
    expand();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Los registros disponibles se conservan',
    );
    expect(screen.getByText('Sesión original')).toBeVisible();
    expect(screen.getByText('1 h 00 min')).toBeVisible();
    expect(result.client.getQueryData(laborKeys.worksheet(12))).toBe(worksheet);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Sesión original')).toBeVisible();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('supports retry after an initial failure and shows empty and filtered-empty states', async () => {
    worksheet.servicios[0].sessions = [];
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Offline'));
    mount();
    expand();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin registros de trabajo.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Observaciones' }));
    expect(screen.getByText('Sin registros en este filtro.')).toBeVisible();
  });

  it('keeps attachments-only observations and never replaces an invalid event date with an order date', async () => {
    worksheet.servicios[0].sessions = [session({ startedAt: '', endedAt: null, userName: null })];
    worksheet.observations = [
      {
        id: 2,
        texto: null,
        createdAt: '2025-10-04T12:00:00Z',
        authorName: null,
        itemId: null,
        itemDescripcion: null,
        progressReportId: null,
        files: [
          {
            id: 2,
            nombreOriginal: 'foto.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 100,
            url: '/uploads/foto.jpg',
          },
        ],
      },
    ];
    mount();
    expand();
    expect(await screen.findByRole('link', { name: 'foto.jpg' })).toBeVisible();
    expect(screen.getByText('Sin fecha')).toBeVisible();
    expect(rows()[0]).toHaveTextContent('Observación');
    expect(rows()[1].querySelector('time')).toBeNull();
  });
});
