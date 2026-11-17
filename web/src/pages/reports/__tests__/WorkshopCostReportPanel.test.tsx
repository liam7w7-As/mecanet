import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import {
  commercialReviewFixture,
  workshopPerformanceFixture,
} from '../../../test/fixtures/workshop-performance';
import ReportsPage from '../ReportsPage';
import WorkshopCostReportPanel from '../WorkshopCostReportPanel';

import type { UserPublic } from '../../../stores/auth.store';
import type { ReportPanelProps } from '../ReportPanels';
import type { Role } from '@unithor/shared';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
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
  vi.mocked(api.get).mockResolvedValue({ data: workshopPerformanceFixture });
  vi.mocked(api.post).mockResolvedValue({ data: { review: commercialReviewFixture } });
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
  it('uses the existing Reports insertion and all selected filters for analysis', async () => {
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[
            '/reports?section=workshop-cost&from=2026-11-01&to=2026-11-02&costWorker=8&costSpecialty=4&costOrder=40&costStatus=en_progreso&costVehicle=5&costService=41&costCatalog=3&costGroup=week&q=motor',
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
      '/reports/workshop-costs/analysis',
      expect.objectContaining({
        params: {
          fechaDesde: '2026-11-01',
          fechaHasta: '2026-11-02',
          userId: 8,
          specialtyId: 4,
          workOrderId: 40,
          estado: 'en_progreso',
          search: 'motor',
          vehicleId: 5,
          workOrderItemId: 41,
          catalogItemId: 3,
          groupBy: 'week',
        },
      }),
    );
    fireEvent.change(screen.getByLabelText('Estado OT de costos'), {
      target: { value: 'cancelada' },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith(
        '/reports/workshop-costs/analysis',
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
  it('renders server indicators and distinguishes null from known zero without dividing', async () => {
    const report = structuredClone(workshopPerformanceFixture);
    report.analysis.utilization = {
      workers: 0,
      registeredHours: 0,
      regularHours: 0,
      extraHours: 0,
      scheduledHours: 0,
      unregisteredHours: null,
      registeredPercent: null,
    };
    report.analysis.efficiency = {
      estimatedHours: null,
      actualHours: 0,
      percent: null,
      deviationHours: null,
    };
    report.analysis.quality.firstPassPercent = null;
    report.analysis.commercial.totals.referenceHourlyRate = null;
    report.analysis.commercial.totals.equivalentQuotedHours = null;
    vi.mocked(api.get).mockResolvedValue({ data: report });
    const rendered = renderPanel();
    const productivity = await screen.findByRole('region', { name: 'Productividad' });
    expect(within(productivity).getAllByText('Sin base').length).toBeGreaterThan(1);
    expect(within(productivity).getAllByText('0 h').length).toBeGreaterThan(1);
    expect(within(productivity).queryByText('0 %')).not.toBeInTheDocument();
    expect(rendered.container.textContent).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole('table', { name: 'Períodos agrupados' })).toHaveTextContent('12,5 %');
    expect(
      screen.getByRole('table', { name: 'Comparación comercial por servicio' }),
    ).toHaveTextContent('10 h');
    expect(screen.getByText(/no representa beneficio contable/)).toBeInTheDocument();
  });
  it.each([
    { costGroup: 'year' },
    { costVehicle: '0' },
    { costCatalog: '-3' },
    { costService: '1.5' },
  ])('blocks invalid performance filters %o', (params) => {
    renderPanel({
      ...props(),
      params: new URLSearchParams(Object.entries(params) as [string, string][]),
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abrir PDF de costos' })).toBeDisabled();
  });
  it('rejects ranges longer than 366 days', () => {
    renderPanel({ ...props(), from: '2025-01-01', to: '2026-11-02' });
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('366 días');
  });
  it('changes service, vehicle, catalog and grouping through existing filter controls', async () => {
    const value = props();
    renderPanel(value);
    await screen.findByRole('table', { name: 'Comparación comercial por servicio' });
    fireEvent.change(screen.getByLabelText('Servicio de costos'), { target: { value: '41' } });
    fireEvent.change(screen.getByLabelText('Vehículo de costos'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Servicio de catálogo (ID)'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('Agrupar períodos'), { target: { value: 'month' } });
    expect(value.setFilter).toHaveBeenCalledWith('costService', '41');
    expect(value.setFilter).toHaveBeenCalledWith('costVehicle', '5');
    expect(value.setFilter).toHaveBeenCalledWith('costCatalog', '3');
    expect(value.setFilter).toHaveBeenCalledWith('costGroup', 'month');
  });
  it('exports the current full analysis selection through the new endpoint', async () => {
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url.endsWith('/excel')
        ? new Blob(['xlsx'], { type: mime })
        : workshopPerformanceFixture,
      headers: {},
    }));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:analysis'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPanel({
      ...props(),
      params: new URLSearchParams(
        'costWorker=7&costSpecialty=3&costOrder=40&costVehicle=5&costService=41&costCatalog=3&costGroup=month&costStatus=en_progreso',
      ),
      search: 'motor',
    });
    await screen.findByRole('table', { name: 'Comparación comercial por servicio' });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar costos a Excel' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(api.get).toHaveBeenLastCalledWith('/reports/workshop-costs/analysis/excel', {
      params: {
        fechaDesde: '2026-11-01',
        fechaHasta: '2026-11-02',
        userId: 7,
        specialtyId: 3,
        workOrderId: 40,
        vehicleId: 5,
        workOrderItemId: 41,
        catalogItemId: 3,
        groupBy: 'month',
        estado: 'en_progreso',
        search: 'motor',
      },
      responseType: 'blob',
    });
    click.mockRestore();
  });
  it('shows immutable history once when the same review is also the latest review', async () => {
    const report = structuredClone(workshopPerformanceFixture);
    report.analysis.commercial.reviews = [commercialReviewFixture];
    report.analysis.commercial.services[0].latestReview = commercialReviewFixture;
    vi.mocked(api.get).mockResolvedValue({ data: report });
    login('finanzas');
    renderPanel();
    const history = await screen.findByLabelText('Historial de análisis comerciales');
    expect(within(history).getByText('Historial de análisis · 1')).toBeInTheDocument();
    expect(within(history).getByText('12 h')).toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Guardar análisis comercial' }),
    ).not.toBeInTheDocument();
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
  it('retains the review draft on failure and appends the server snapshot on explicit retry', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Offline'));
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Guardar análisis comercial' });
    fireEvent.change(screen.getByLabelText('Servicio a analizar'), { target: { value: '41' } });
    fireEvent.change(screen.getByLabelText('Motivo de diferencia'), {
      target: { value: 'garantia' },
    });
    fireEvent.change(screen.getByLabelText('Nota del análisis'), {
      target: { value: '  Garantía acordada  ' },
    });
    fireEvent.change(screen.getByLabelText('Tarifa de referencia por hora'), {
      target: { value: '3000' },
    });
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent('El borrador se conserva');
    expect(screen.getByLabelText('Nota del análisis')).toHaveValue('  Garantía acordada  ');
    expect(screen.getByLabelText('Tarifa de referencia por hora')).toHaveValue(3000);
    expect(api.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar guardar análisis' }));
    await screen.findByText('Análisis guardado en el historial.');
    expect(api.post).toHaveBeenLastCalledWith('/reports/workshop-costs/commercial-reviews', {
      workOrderItemId: 41,
      reason: 'garantia',
      note: 'Garantía acordada',
      referenceHourlyRate: 3000,
    });
    expect(api.post).toHaveBeenCalledTimes(2);
    const history = screen.getByLabelText('Historial de análisis comerciales');
    expect(within(history).getByText('Descuento autorizado')).toBeInTheDocument();
    expect(within(history).getByText('12 h')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota del análisis')).toHaveValue('');
  });
  it('requires a note and a positive explicit reference rate, and omits an absent rate', async () => {
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Guardar análisis comercial' });
    fireEvent.change(screen.getByLabelText('Servicio a analizar'), { target: { value: '41' } });
    fireEvent.change(screen.getByLabelText('Nota del análisis'), { target: { value: '  ' } });
    fireEvent.submit(form);
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nota del análisis'), {
      target: { value: 'Revisión interna' },
    });
    fireEvent.change(screen.getByLabelText('Tarifa de referencia por hora'), {
      target: { value: '0' },
    });
    fireEvent.submit(form);
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Tarifa de referencia por hora'), {
      target: { value: '' },
    });
    fireEvent.submit(form);
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledWith('/reports/workshop-costs/commercial-reviews', {
      workOrderItemId: 41,
      reason: 'descuento',
      note: 'Revisión interna',
    });
  });
  it('keeps finance read-only despite forced taller update and hides drafts when update is revoked', async () => {
    login('jefe');
    renderPanel();
    await screen.findByRole('form', { name: 'Guardar análisis comercial' });
    act(() => login('jefe', [{ modulo: 'taller', accion: 'read' }]));
    expect(
      screen.queryByRole('form', { name: 'Guardar análisis comercial' }),
    ).not.toBeInTheDocument();
    act(() =>
      login('finanzas', [
        { modulo: 'finanzas', accion: 'read' },
        { modulo: 'taller', accion: 'update' },
      ]),
    );
    await screen.findByRole('table', { name: 'Comparación comercial por servicio' });
    expect(screen.queryByRole('button', { name: 'Guardar análisis' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('shows an API error with retry and suppresses empty misleading totals', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network failed'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los costos');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Subtotal conocido')).not.toBeInTheDocument();
  });
});
