import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderLaborBoard from '../WorkOrderLaborBoard';

import type { WorkOrderWorksheet, WorkOrderWorksheetItem } from '../../../types/entities';
import type { Role } from '@unithor/shared';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));
const order = workshopRoleOrders[0];
let worksheet: WorkOrderWorksheet;
const login = (role: Role = 'jefe', id = 7, readOnly = false) => useAuthStore.setState({
  user: { id, nombre: 'Prueba', email: 'prueba@test.cl', role,
    ...(readOnly ? { permissions: [{ modulo: 'taller' as const, accion: 'read' as const }] } : {}) },
  isAuthenticated: true, isLoading: false,
});
const item = (patch: Partial<WorkOrderWorksheetItem> = {}): WorkOrderWorksheetItem => ({
  id: 10, descripcion: 'Diagnóstico del arranque', division: 'MEC', subtipo: 'especifico', tipoLinea: 'especifico',
  unidadMedida: 'servicio', cantidad: 1, precioUnitario: 1, estadoOperativo: 'pendiente', notasOperativas: null,
  assignedUser: { id: 9, nombre: 'Carlos' }, canWork: true, horasHombreEstimadas: 2, horasEstimadasTotales: 2,
  horasHombreReales: 0.75, totalMinutes: 45, excedeEstimado: false, activeSession: null, observationsCount: 0,
  laborValidatedAt: null, laborValidationNote: null,
  sessions: [{ id: 10, userName: 'Carlos', startedAt: '2026-11-24T12:00:00Z', endedAt: '2026-11-24T12:45:00Z', minutes: 45, kind: 'cronometro', note: 'Horas conservadas' }],
  ...patch,
});
const dpItem = () => item({
  id: 20, descripcion: 'Puerta delantera izquierda', division: 'DP', subtipo: 'servicio_dp', tipoLinea: 'estandar', precioUnitario: 90000,
  dpStages: ['Desarme', 'Preparación', 'Pintura', 'Montaje', 'Detailer'].map((label, index) => ({
    id: 100 + index, stageKey: String(index), stageLabel: label, stageIndex: index + 1,
    assignedUserId: 9, startedAt: null, completedAt: null, status: 'pendiente',
  })), ccfStatus: 'pendiente',
});
const accItem = () => item({
  id: 30, descripcion: 'Snorkel', division: 'ACC', tipoLinea: 'parte', subtipo: 'a_pedido', esAPedido: true,
  precioUnitario: 135000, horasHombreEstimadas: null, horasEstimadasTotales: null,
});
function mount({ closed = false, onDirty = vi.fn(), onSuggest = vi.fn() } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><WorkOrderLaborBoard compact
    workOrder={closed ? { ...order, estado: 'entregada' } : order}
    onDirtyChange={onDirty} onPendingChange={vi.fn()} onSuggestPrice={onSuggest} /></QueryClientProvider>);
  return { client, onDirty, onSuggest };
}
const task = () => screen.getByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
const expand = (article = task()) => fireEvent.click(within(article).getByRole('button', { name: /^Ver ejecución de / }));

beforeEach(() => {
  vi.resetAllMocks();
  login();
  worksheet = {
    workOrder: { ...order, vehiculo: { id: 1, patente: 'KJTR84', marca: 'Toyota', modelo: 'Hilux' } },
    items: [item(), dpItem(), accItem()], servicios: [], repuestos: [], observations: [], progressReports: [],
    activeItemId: null, pausedOtherItems: 0,
    totals: { items: 3, completados: 0, enProceso: 0, pendientes: 3, horasEstimadas: 4, horasReales: 0.75, minutosReales: 45 },
  };
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/worksheet') ? { worksheet }
    : url === '/workshop-personnel/config' ? { specialties: [], profiles: [] }
      : { mechanics: [{ id: 9, nombre: 'Carlos' }, { id: 11, nombre: 'Luis' }], items: [] } }));
  vi.mocked(api.post).mockImplementation(async () => ({ data: { worksheet } }));
  vi.mocked(api.patch).mockImplementation(async () => ({ data: { worksheet } }));
});

describe('Compact work management by division', () => {
  it('shows D&P, ACC and MEC separately and keeps MEC execution collapsed initially', async () => {
    mount();
    await screen.findByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
    const dp = within(screen.getByRole('region', { name: 'D&P · Desabolladura y pintura' }));
    expect(dp.getAllByRole('combobox')).toHaveLength(5);
    expect(dp.getByRole('button', { name: /CCF de Puerta.*Pendiente/ })).toBeDisabled();
    const acc = within(screen.getByRole('region', { name: 'ACC · Accesorios y repuestos' }));
    expect(acc.getByRole('button', { name: 'Entregado' })).toBeDisabled();
    expect(acc.getByRole('button', { name: 'Recibido' })).toBeDisabled();
    expect(within(task()).getByText('Pendiente de diagnóstico y valoración')).toBeInTheDocument();
    expect(within(task()).getByRole('button', { name: /^Ver ejecución de / })).toHaveAttribute('aria-expanded', 'false');
    expect(within(task()).queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
    expect(within(task()).getByLabelText('Mecánico de Diagnóstico del arranque')).toBeInTheDocument();
    expect(within(task()).getByLabelText('Estado de Diagnóstico del arranque')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });

  it('opens notes directly and retains drafts and hours across collapse and filters', async () => {
    const { onDirty } = mount();
    const article = await screen.findByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
    fireEvent.click(within(article).getByRole('button', { name: 'Notas de Diagnóstico del arranque' }));
    const note = within(article).getByLabelText('Nota técnica de Diagnóstico del arranque');
    expect(note).toHaveFocus();
    fireEvent.change(note, { target: { value: 'Revisar motor de arranque' } });
    expect(onDirty).toHaveBeenLastCalledWith(true);
    expect(within(article).getByRole('region', { name: 'Historial de horas de Diagnóstico del arranque' })).toHaveTextContent('0 h 45 min');
    expand(article);
    expect(within(article).getByRole('button', { name: /^Ver ejecución de / })).toHaveAttribute('aria-expanded', 'false');
    expand(article);
    expect(note).toHaveValue('Revisar motor de arranque');
    const filters = within(screen.getByRole('group', { name: 'Filtrar trabajos' }));
    fireEvent.click(filters.getByRole('button', { name: /^Completado/ }));
    expect(screen.queryByRole('article', { name: 'Trabajo: Diagnóstico del arranque' })).not.toBeInTheDocument();
    fireEvent.click(filters.getByRole('button', { name: /^Todos/ }));
    expect(note).toHaveValue('Revisar motor de arranque');
    expect(within(article).getByText('Horas conservadas')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });

  it('routes price editing to the proposal flow without changing amounts inline', async () => {
    const { onSuggest } = mount();
    await screen.findByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
    await waitFor(() => expect(within(task()).getByRole('button', { name: 'Sugerir precio' })).toBeEnabled());
    fireEvent.click(within(task()).getByRole('button', { name: 'Sugerir precio' }));
    expect(onSuggest).toHaveBeenCalledWith(10);
    expect(within(task()).queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });

  it('uses existing assignment and state endpoints without changing saved hours', async () => {
    mount();
    await screen.findByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
    await waitFor(() => expect(within(task()).getByLabelText('Mecánico de Diagnóstico del arranque')).toBeEnabled());
    fireEvent.change(within(task()).getByLabelText('Mecánico de Diagnóstico del arranque'), { target: { value: '11' } });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/assignment`, { assignedUserId: 11 }));
    await waitFor(() => expect(within(task()).getByLabelText('Estado de Diagnóstico del arranque')).toBeEnabled());
    fireEvent.change(within(task()).getByLabelText('Estado de Diagnóstico del arranque'), { target: { value: 'en_proceso' } });
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/work-orders/${order.id}/execution`, { items: [{ id: 10, estadoOperativo: 'en_proceso' }] }));
    expect(worksheet.items[0].totalMinutes).toBe(45);
    expect(worksheet.items[0].sessions).toHaveLength(1);
  });

  it.each(['read-only', 'closed'] as const)('does not allow assigning, editing prices or executing for %s', async (mode) => {
    login('jefe', 7, mode === 'read-only');
    mount({ closed: mode === 'closed' });
    await screen.findByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
    expand();
    expect(within(task()).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(task()).queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
    expect(within(task()).queryByRole('button', { name: 'Sugerir precio' })).not.toBeInTheDocument();
    fireEvent.click(within(task()).getByRole('button', { name: 'Notas de Diagnóstico del arranque' }));
    expect(within(task()).getByLabelText('Nota técnica de Diagnóstico del arranque')).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });

  it('keeps financial values hidden and operates only the assigned mechanic’s work', async () => {
    login('mecanico', 9);
    worksheet.items.push(item({ id: 11, descripcion: 'Trabajo de Luis', assignedUser: { id: 11, nombre: 'Luis' }, canWork: false, precioUnitario: 55000 }));
    mount();
    await screen.findByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
    expect(within(task()).getByText('Restringido')).toBeInTheDocument();
    expect(screen.queryByText('$90.000')).not.toBeInTheDocument();
    expect(screen.queryByText('$135.000')).not.toBeInTheDocument();
    expand();
    fireEvent.click(within(task()).getByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/start`));
    fireEvent.click(screen.getByRole('button', { name: 'Mis trabajos' }));
    const other = screen.getByRole('article', { name: 'Trabajo: Trabajo de Luis' });
    expand(other);
    expect(within(other).queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
    expect(within(other).queryByRole('button', { name: 'Sugerir precio' })).not.toBeInTheDocument();
    expect(within(other).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('$55.000')).not.toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === `/work-orders/${order.id}`)).toBe(false);
  });

  it('opens D&P notes outside the scrollable dialog and saves a note without approving CCF', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'Nota de jefatura de Puerta delantera izquierda' });
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: /Nota Jefatura CCF/ });
    expect(dialog.closest('.work-order-divisions')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Nota de la etapa o revisión'), { target: { value: 'Revisar alineación' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/work-orders/${order.id}/items/20/dp-ccf`, { note: 'Revisar alineación' }));
  });

  it('shows recorded ACC signatures and dates and never reverses signed custody', async () => {
    login('mecanico', 9);
    worksheet.items[2] = { ...accItem(), entregadoBodegaAt: '2026-11-24T12:00:00Z', bodegueroUserId: 22,
      recibidoTallerAt: '2026-11-24T12:05:00Z', armadorUserId: 9 };
    mount();
    const accNode = await screen.findByRole('region', { name: 'ACC · Accesorios y repuestos' });
    const acc = within(accNode);
    expect(acc.getByText('Bodega · Usuario #22')).toBeInTheDocument();
    expect(acc.getByText(/Taller ·/)).toHaveTextContent('Técnico #9');
    expect(acc.getByRole('button', { name: 'Entregado' })).toBeDisabled();
    expect(acc.getByRole('button', { name: 'Recibido' })).toBeDisabled();
    expect(accNode.querySelector('time')).toHaveAttribute('dateTime', '2026-11-24T12:05:00Z');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('preserves pending notes when update permission is revoked while the panel is open', async () => {
    const { onDirty } = mount();
    const article = await screen.findByRole('article', { name: 'Trabajo: Diagnóstico del arranque' });
    fireEvent.click(within(article).getByRole('button', { name: 'Notas de Diagnóstico del arranque' }));
    const note = within(article).getByLabelText('Nota técnica de Diagnóstico del arranque');
    fireEvent.change(note, { target: { value: 'Borrador conservado' } });
    act(() => login('jefe', 7, true));
    expect(note).toHaveValue('Borrador conservado');
    expect(note).toBeDisabled();
    expect(onDirty).toHaveBeenLastCalledWith(true);
    expect(api.post).not.toHaveBeenCalled();
  });
});
