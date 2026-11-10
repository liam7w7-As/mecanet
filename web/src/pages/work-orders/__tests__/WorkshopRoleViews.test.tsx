import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { toLocalDateInput } from '../../../lib/formatters';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleMine, workshopRoleOrders, workshopRoleReport, workshopRoleSummary } from '../../../test/fixtures/workshop-roles';
import DashboardPage from '../../dashboard/DashboardPage';
import MyWorkOrdersPage from '../MyWorkOrdersPage';
import WorkshopDailyReportPage from '../WorkshopDailyReportPage';

const { listExportSpy } = vi.hoisted(() => ({ listExportSpy: vi.fn() }));

vi.mock('../../../components/common/ListExportButtons', () => ({
  default: (props: { target: string; filters: Record<string, unknown>; disabled?: boolean }) => {
    listExportSpy(props);
    return <div data-testid={`list-export-${props.target}`} />;
  },
}));

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));

const renderPage = (page: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>);

describe('Updated workshop role workspaces', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa de Taller', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/dashboard/summary' ? workshopRoleSummary : url === '/work-orders/reports/daily' ? { report: workshopRoleReport } : url === '/work-orders/mine' ? { items: workshopRoleMine } : url === '/work-orders' ? { items: workshopRoleOrders, page: 1, pageSize: 12, total: workshopRoleOrders.length, totalPages: 1 } : { items: [], total: 0 } }));
  });

  it('shows workshop priorities and current team activity to the chief', async () => {
    renderPage(<DashboardPage />);
    expect(await screen.findByTestId('workshop-approvals')).toHaveTextContent('1');
    expect(await screen.findByTestId('workshop-today-hours')).toHaveTextContent('3,5 h');
    expect(screen.getByTestId('workshop-running-team')).toHaveTextContent('1');
    expect(screen.queryByTestId('monthly-revenue')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Actividad del equipo' })).toHaveTextContent('Carlos Mecánico');
    expect(screen.getByRole('link', { name: /Reporte diario/ })).toHaveAttribute('href', '/work-orders/daily-report');
  });

  it('does not request a supervisor report when workshop read permission is absent', async () => {
    useAuthStore.setState({ user: { id: 7, nombre: 'Jefa de consulta', email: 'qa@example.test', role: 'jefe', permissions: [{ modulo: 'comercial', accion: 'read' }] } });
    renderPage(<DashboardPage />);
    await screen.findByTestId('active-work-orders');
    expect(api.get).not.toHaveBeenCalledWith('/work-orders/reports/daily', expect.anything());
    expect(screen.queryByRole('region', { name: 'Actividad del equipo' })).not.toBeInTheDocument();
  });

  it('refreshes the dashboard data when the user identity changes in the same query client', async () => {
    renderPage(<DashboardPage />);
    await screen.findByTestId('workshop-approvals');
    const before = vi.mocked(api.get).mock.calls.filter(([url]) => url === '/dashboard/summary').length;
    await act(async () => useAuthStore.setState({ user: { id: 8, nombre: 'Otra Jefa', email: 'other@example.test', role: 'jefe' } }));
    await waitFor(() => expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === '/dashboard/summary').length).toBe(before + 1));
  });

  it('uses the same workshop cards and filters for the mechanic without financial controls', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos Mecánico', email: 'qa@example.test', role: 'mecanico' } });
    renderPage(<MyWorkOrdersPage />);
    await waitFor(() => expect(screen.getByTestId('my-order-count')).toHaveTextContent('4'));
    expect(screen.getByTestId('my-running-count')).toHaveTextContent('1');
    const card = await screen.findByRole('article', { name: 'Orden OT-26-41' });
    expect(card).toHaveClass('workshop-card');
    expect(card).toHaveAttribute('data-colour', 'active');
    expect(screen.getByRole('article', { name: 'Orden OT-26-42' })).toHaveAttribute('data-colour', 'waiting');
    expect(screen.queryByRole('link', { name: /Nueva Orden de Trabajo/ })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Ver información de OT-26-41' }));
    const popover = screen.getByRole('region', { name: 'Información de OT-26-41' });
    expect(within(popover).getByRole('button', { name: 'Gestionar trabajo' })).toBeInTheDocument();
    expect(within(popover).queryByText('Saldo pendiente')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Esperando repuesto' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/work-orders', { params: expect.objectContaining({ estado: 'esperando_repuesto' }) }));
  });

  it('keeps daily report details collapsed and opens work management from the report', async () => {
    renderPage(<WorkshopDailyReportPage />);
    await waitFor(() => expect(screen.getByTestId('daily-hours')).toHaveTextContent('3,5 h'));
    const details = screen.getAllByText('Ver trabajos (1)', { selector: 'summary' })[0].closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Gestionar OT-26-41' })).toHaveAttribute('href', '/work-orders?manage=41');
    expect(screen.getByRole('button', { name: /Fecha del reporte/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('list-export-workshop-daily')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
    expect(listExportSpy.mock.lastCall?.[0]).toMatchObject({
      target: 'workshop-daily', filters: { fecha: toLocalDateInput(new Date()) }, disabled: false,
    });
    expect(screen.getByTestId('daily-completed')).toHaveTextContent('2');
    expect(screen.getByText('4 sesiones de trabajo')).toBeInTheDocument();
  });

  it('delegates export permissions to shared controls while keeping the report available for a read-only chief', async () => {
    useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe', permissions: [{ modulo: 'taller', accion: 'read' }] } });
    renderPage(<WorkshopDailyReportPage />);
    await waitFor(() => expect(screen.getByTestId('daily-hours')).toHaveTextContent('3,5 h'));
    expect(screen.getByTestId('list-export-workshop-daily')).toBeInTheDocument();
    expect(listExportSpy.mock.lastCall?.[0]).toMatchObject({ target: 'workshop-daily', disabled: false });
    expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
  });

  it('passes the selected report date to shared export controls and to the daily report query', async () => {
    renderPage(<WorkshopDailyReportPage />);
    await waitFor(() => expect(screen.getByTestId('daily-hours')).toHaveTextContent('3,5 h'));
    const initialDate = toLocalDateInput(new Date());
    expect(api.get).toHaveBeenCalledWith('/work-orders/reports/daily', { params: { fecha: initialDate } });
    const selectedDate = initialDate.slice(0, 8) + (initialDate.endsWith('15') ? '16' : '15');
    fireEvent.click(screen.getByRole('button', { name: 'Fecha del reporte' }));
    const calendar = screen.getByRole('dialog', { name: 'Calendario: fecha del reporte' });
    const day = calendar.querySelector<HTMLButtonElement>(`[data-day="${selectedDate}"] button`);
    expect(day).not.toBeNull();
    fireEvent.click(day!);
    await waitFor(() => {
      expect(listExportSpy.mock.lastCall?.[0]).toMatchObject({
        target: 'workshop-daily', filters: { fecha: selectedDate }, disabled: false,
      });
      expect(api.get).toHaveBeenLastCalledWith('/work-orders/reports/daily', { params: { fecha: selectedDate } });
    });
    expect(screen.queryByRole('dialog', { name: 'Calendario: fecha del reporte' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gestionar OT-26-41' })).toHaveAttribute('href', '/work-orders?manage=41');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/work-orders/reports/daily/pdf')).toBe(false);
  });

  it('offers a retry without showing zero hours when the daily report fails', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Sin conexión'));
    renderPage(<WorkshopDailyReportPage />);
    expect(listExportSpy.mock.lastCall?.[0]).toMatchObject({ target: 'workshop-daily', disabled: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el reporte diario.');
    expect(screen.getByTestId('daily-hours')).toHaveTextContent('—');
    expect(listExportSpy.mock.lastCall?.[0].disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByTestId('daily-hours')).toHaveTextContent('3,5 h'));
    expect(listExportSpy.mock.lastCall?.[0].disabled).toBe(false);
  });
  it('prioritizes finance work and avoids workshop links without workshop permission', async () => {
    useAuthStore.setState({ user: { id: 13, nombre: 'Finanzas', email: 'qa@example.test', role: 'finanzas' } });
    renderPage(<DashboardPage />);
    await screen.findByTestId('finance-verifications');
    expect(screen.getByRole('link', { name: /Revisar abonos/ })).toHaveAttribute('href', '/finance?tab=payments');
    expect(screen.getByRole('link', { name: 'Caja del día' })).toHaveAttribute('href', '/finance?tab=cash');
    expect(screen.queryByRole('link', { name: 'Ver todas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver OT-26-41' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('low-stock-count')).not.toBeInTheDocument();
  });

  it('prioritizes approved dispatches and stock for warehouse operators', async () => {
    useAuthStore.setState({ user: { id: 12, nombre: 'Bodega', email: 'qa@example.test', role: 'bodeguero' } });
    renderPage(<DashboardPage />);
    await screen.findByTestId('warehouse-deliveries');
    expect(screen.getByRole('link', { name: /Despachos pendientes/ })).toHaveAttribute('href', '/warehouses?tab=requests');
    expect(screen.queryByTestId('monthly-revenue')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva cotización' })).not.toBeInTheDocument();
    expect(screen.getByTestId('low-stock-count')).toBeInTheDocument();
  });

  it('identifies seller indicators as their own without giving access to finance', async () => {
    useAuthStore.setState({ user: { id: 11, nombre: 'Ventas', email: 'qa@example.test', role: 'vendedor' } });
    renderPage(<DashboardPage />);
    expect(await screen.findByText('Mi recaudación del mes')).toBeInTheDocument();
    expect(screen.getByText('Mis OTs en taller')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nueva cotización' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Revisar abonos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajustar' })).not.toBeInTheDocument();
  });

});
