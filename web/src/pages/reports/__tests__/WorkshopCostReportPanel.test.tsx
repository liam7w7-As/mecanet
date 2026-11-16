import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopCostReportFixture } from '../../../test/fixtures/workshop-cost-report';
import ReportsPage from '../ReportsPage';
import WorkshopCostReportPanel from '../WorkshopCostReportPanel';

import type { UserPublic } from '../../../stores/auth.store';
import type { ReportPanelProps } from '../ReportPanels';
import type { Role } from '@unithor/shared';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));
const props = (): ReportPanelProps => ({
  from: '2026-11-01',
  to: '2026-11-02',
  search: '',
  searchValue: '',
  params: new URLSearchParams(),
  setSearch: vi.fn(),
  setFilter: vi.fn(),
});
const login = (role: Role, permissions?: UserPublic['permissions']) =>
  useAuthStore
    .getState()
    .setUser({ id: 1, nombre: role, email: 'test@example.invalid', role, permissions });
let client: QueryClient;
const renderPanel = (value = props()) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkshopCostReportPanel {...value} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  login('admin');
  vi.mocked(api.get).mockResolvedValue({ data: workshopCostReportFixture });
});
afterEach(() => client.clear());

describe('Internal workshop costs panel', () => {
  it.each(['mecanico', 'vendedor', 'bodeguero'] as const)(
    'hides all costs from %s even with forced grants',
    (role) => {
      login(role, [
        { modulo: 'taller', accion: 'read' },
        { modulo: 'taller', accion: 'export' },
        { modulo: 'finanzas', accion: 'read' },
        { modulo: 'finanzas', accion: 'export' },
      ]);
      const rendered = renderPanel();
      expect(rendered.container).toBeEmptyDOMElement();
      expect(api.get).not.toHaveBeenCalled();
    },
  );
  it.each(['admin', 'desarrollador', 'jefe', 'finanzas'] as const)(
    'shows the report to permitted role %s',
    async (role) => {
      login(role);
      renderPanel();
      await screen.findByText('Detalle por asignación · 2 filas');
      expect(screen.getByRole('button', { name: 'Exportar costos a Excel' })).toBeEnabled();
      expect(screen.getByText('Incompleto')).toBeInTheDocument();
      expect(screen.getAllByRole('cell', { name: 'Sin tarifa' })).toHaveLength(2);
      expect(screen.getByText('Histórico')).toBeInTheDocument();
    },
  );
  it('lets finance-only readers inspect history without export buttons or OT links', async () => {
    login('finanzas', [{ modulo: 'finanzas', accion: 'read' }]);
    renderPanel();
    await screen.findByText('Detalle por asignación · 2 filas');
    expect(screen.queryByRole('button', { name: 'Abrir PDF de costos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir OT' })).not.toBeInTheDocument();
  });
  it('requires read and export in the same module', async () => {
    login('jefe', [
      { modulo: 'taller', accion: 'read' },
      { modulo: 'finanzas', accion: 'export' },
    ]);
    renderPanel();
    await screen.findByText('Detalle por asignación · 2 filas');
    expect(
      screen.queryByRole('button', { name: 'Exportar costos a Excel' }),
    ).not.toBeInTheDocument();
  });
  it('uses the existing Reports insertion and all selected filters for preview', async () => {
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[
            '/reports?section=workshop-cost&from=2026-11-01&to=2026-11-02&costWorker=8&costSpecialty=4&costOrder=40&costStatus=en_progreso&q=motor',
          ]}
        >
          <ReportsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('Detalle por asignación · 2 filas');
    expect(screen.getByRole('button', { name: 'Costos de mano de obra' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(api.get).toHaveBeenCalledWith(
      '/reports/workshop-costs/preview',
      expect.objectContaining({
        params: {
          fechaDesde: '2026-11-01',
          fechaHasta: '2026-11-02',
          userId: 8,
          specialtyId: 4,
          workOrderId: 40,
          estado: 'en_progreso',
          search: 'motor',
        },
      }),
    );
    fireEvent.change(screen.getByLabelText('Estado OT de costos'), {
      target: { value: 'cancelada' },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith(
        '/reports/workshop-costs/preview',
        expect.objectContaining({ params: expect.objectContaining({ estado: 'cancelada' }) }),
      ),
    );
  });
  it('blocks invalid periods without sending a request', () => {
    renderPanel({ ...props(), from: '2026-11-03', to: '2026-11-01' });
    expect(screen.getByRole('alert')).toHaveTextContent('período válido');
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abrir PDF de costos' })).toBeDisabled();
  });
  it('removes rendered confidential data immediately after permission revocation', async () => {
    login('jefe');
    renderPanel();
    await screen.findByText('Detalle por asignación · 2 filas');
    act(() => login('jefe', []));
    expect(screen.queryByText('Diagnóstico de motor')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Exportar costos a Excel' }),
    ).not.toBeInTheDocument();
  });
  it('shows an API error with retry and suppresses empty misleading totals', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network failed'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los costos');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Subtotal conocido')).not.toBeInTheDocument();
  });
});
