import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderLaborBoard from '../WorkOrderLaborBoard';

import type { WorkOrderWorksheet, WorkOrderWorksheetItem } from '../../../types/entities';
import type { WorkOrderLaborBoardProps } from '../WorkOrderLaborBoard';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));

const order = workshopRoleOrders[0];
const description = 'Revisión de suspensión';
const mechanics = [{ id: 9, nombre: 'Carlos', email: 'c@example.test' }, { id: 10, nombre: 'Luis', email: 'l@example.test' }, { id: 11, nombre: 'Eva', email: 'e@example.test' }];
const config = {
  specialties: [{ id: 2, name: 'Mecánica', active: true }, { id: 3, name: 'Electricidad', active: true }, { id: 4, name: 'Pintura', active: true }],
  profiles: [{ userId: 9, principalSpecialtyId: 2, additionalSpecialtyIds: [3] }, { userId: 10, principalSpecialtyId: 2, additionalSpecialtyIds: [] }],
};
const team: NonNullable<WorkOrderWorksheetItem['assignments']> = [
  { id: 1, userId: 9, userName: 'Carlos', specialtyId: null, specialtyName: null, estimatedHours: 1.5, originalEstimatedHours: 1, completedAt: null, active: true },
  { id: 2, userId: 10, userName: 'Luis', specialtyId: 2, specialtyName: 'Mecánica', estimatedHours: 2.25, originalEstimatedHours: 2.25, completedAt: null, active: true },
];
const session = (userId: number, mine: boolean): NonNullable<WorkOrderWorksheetItem['activeSession']> => ({ id: userId, userId, userName: userId === 9 ? 'Carlos' : 'Luis', startedAt: new Date(Date.now() - 10 * 60000).toISOString(), elapsedMinutes: 10, mine });
let worksheet: WorkOrderWorksheet;
let client: QueryClient;

const setTeam = () => { worksheet.items[0] = { ...worksheet.items[0], assignedUser: { id: 10, nombre: 'Luis' }, assignments: structuredClone(team), activeSessions: [] }; };
const open = (dirty = vi.fn(), pending = vi.fn(), props: Partial<WorkOrderLaborBoardProps> = {}) => render(<QueryClientProvider client={client}><WorkOrderLaborBoard workOrder={order} onDirtyChange={dirty} onPendingChange={pending} {...props} /></QueryClientProvider>);
const task = () => screen.getByRole('article', { name: `Trabajo: ${description}` });
const expandTeam = async () => {
  const article = await screen.findByRole('article', { name: `Trabajo: ${description}` });
  fireEvent.click(within(article).getByText('Equipo de trabajo', { selector: 'summary' }));
  await waitFor(() => expect(within(article).getByRole('button', { name: 'Agregar integrante' })).toBeEnabled());
  return article;
};
const expandAdmin = async () => {
  const article = await screen.findByRole('article', { name: `Trabajo: ${description}` });
  fireEvent.click(within(article).getByText('Ver detalle', { selector: 'summary' }));
  fireEvent.click(within(article).getByText('Administrar trabajo', { selector: 'summary' }));
  await waitFor(() => expect(within(article).getByLabelText(`Estado de ${description}`)).toBeEnabled());
  return article;
};

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const items: WorkOrderWorksheetItem[] = (order.items ?? []).map((item) => ({ ...item, assignedUser: item.assignedUser ?? null, horasEstimadasTotales: item.horasHombreEstimadas, excedeEstimado: false, activeSession: null, totalMinutes: 45, observationsCount: 0, canWork: true, sessions: [{ id: item.id, userName: 'Carlos', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), minutes: 45, kind: 'cronometro', note: 'Horas conservadas' }] }));
  worksheet = { workOrder: { ...order, vehiculo: { id: 1, patente: 'KJTR84', marca: 'Toyota', modelo: 'Hilux' } }, items, servicios: items, repuestos: [], observations: [], progressReports: [], activeItemId: null, pausedOtherItems: 0, totals: { items: items.length, completados: 0, enProceso: 1, pendientes: 1, horasEstimadas: 4, horasReales: 1.5, minutosReales: 90 } };
  useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/worksheet') ? { worksheet } : url === '/workshop-personnel/config' ? config : { mechanics } }));
});
afterEach(() => client.clear());

describe('Multi-worker labor board', () => {
  it('saves a team with individual estimates, worker specialties and a mandatory reason, retaining failed drafts', async () => {
    setTeam();
    const dirty = vi.fn(); const pending = vi.fn();
    open(dirty, pending);
    const article = await expandTeam();
    const hours = within(article).getByLabelText(`Horas estimadas del integrante 1 de ${description}`);
    fireEvent.change(hours, { target: { value: '2.5' } });
    const specialty = await within(article).findByLabelText(`Especialidad del integrante 1 de ${description}`);
    expect(specialty).toHaveValue('');
    expect(within(specialty).getByRole('option', { name: 'Electricidad' })).toBeInTheDocument();
    expect(within(specialty).queryByRole('option', { name: 'Pintura' })).not.toBeInTheDocument();
    fireEvent.click(within(article).getByRole('button', { name: 'Agregar integrante' }));
    fireEvent.change(within(article).getByLabelText(`Mecánico 3 de ${description}`), { target: { value: '11' } });
    fireEvent.change(within(article).getByLabelText(`Horas estimadas del integrante 3 de ${description}`), { target: { value: '0' } });
    expect(within(within(article).getByLabelText(`Mecánico 3 de ${description}`)).getByRole('option', { name: 'Carlos' })).toBeDisabled();
    expect(within(article).getByRole('button', { name: 'Guardar equipo' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(within(article).getByLabelText('Motivo del cambio de equipo'), { target: { value: '  Distribución de trabajo  ' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar equipo' }));
    await within(article).findByRole('alert');
    expect(hours).toHaveValue(2.5);
    expect(within(article).getByLabelText('Motivo del cambio de equipo')).toHaveValue('  Distribución de trabajo  ');
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(pending).toHaveBeenCalledWith(true);
    fireEvent.click(within(article).getByText('Equipo de trabajo', { selector: 'summary' }));
    fireEvent.click(within(article).getByText('Equipo de trabajo', { selector: 'summary' }));
    expect(hours).toHaveValue(2.5);
    expect(within(article).getByLabelText('Motivo del cambio de equipo')).toHaveValue('  Distribución de trabajo  ');
    vi.mocked(api.post).mockImplementationOnce(async () => {
      worksheet = { ...worksheet, items: worksheet.items.map((item) => item.id === 10 ? { ...item, assignments: [{ ...team[0], estimatedHours: 2.5 }, team[1], { ...team[0], id: 3, userId: 11, userName: 'Eva', estimatedHours: 0 }] } : item) };
      return { data: { worksheet } };
    });
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar equipo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/team`, { members: [{ userId: 9, specialtyId: null, estimatedHours: 2.5 }, { userId: 10, specialtyId: 2, estimatedHours: 2.25 }, { userId: 11, estimatedHours: 0 }], motivo: 'Distribución de trabajo' });
    await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false));
  });

  it('selects an additional specialty while preserving existing nulls and defaulting new workers to principal', async () => {
    open();
    const article = await expandTeam();
    const specialty = await within(article).findByLabelText(`Especialidad del integrante 1 de ${description}`);
    expect(specialty).toHaveValue('principal');
    fireEvent.change(specialty, { target: { value: '3' } });
    fireEvent.change(within(article).getByLabelText('Motivo del cambio de equipo'), { target: { value: 'Trabajo eléctrico' } });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar equipo' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/team`, { members: [{ userId: 9, specialtyId: 3, estimatedHours: 2 }], motivo: 'Trabajo eléctrico' }));
  });

  it('allows starting the worker’s own part while a teammate is running', async () => {
    setTeam();
    worksheet.items[0].activeSession = session(10, false);
    worksheet.items[0].activeSessions = [session(10, false)];
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    open();
    const article = await screen.findByRole('article', { name: `Trabajo: ${description}` });
    await within(article).findByText('Tus horas estimadas: 1 h 30 min');
    expect(within(article).getByText('En curso por Luis.')).toBeInTheDocument();
    expect(within(article).queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(within(article).getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/start`));
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/workshop-personnel/config')).toBe(false);
  });

  it('applies the current principal when switching an existing additional specialty', async () => {
    setTeam();
    worksheet.items[0].assignments![0] = { ...team[0], specialtyId: 3, specialtyName: 'Electricidad' };
    open();
    const article = await expandTeam();
    const specialty = await within(article).findByLabelText(`Especialidad del integrante 1 de ${description}`);
    fireEvent.change(specialty, { target: { value: 'principal' } });
    fireEvent.change(within(article).getByLabelText('Motivo del cambio de equipo'), { target: { value: 'Reasignación a mecánica' } });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar equipo' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/team`, { members: [{ userId: 9, specialtyId: 2, estimatedHours: 1.5 }, { userId: 10, specialtyId: 2, estimatedHours: 2.25 }], motivo: 'Reasignación a mecánica' }));
  });

  it('controls only the mine session even when a foreign session is first', async () => {
    setTeam();
    worksheet.items[0].activeSession = session(10, false);
    worksheet.items[0].activeSessions = [session(10, false), session(9, true)];
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    open();
    const pause = await screen.findByRole('button', { name: 'Pausar' });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(pause);
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motivo de la pausa'), { target: { value: 'Falta herramienta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pausa' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/pause`, { note: 'Falta herramienta' }));
    expect(within(task()).getByText('En curso por Luis.')).toBeInTheDocument();
  });
  it('retains a failed pause reason and submits trimmed text on retry', async () => {
    setTeam();
    worksheet.items[0].activeSession = session(9, true);
    worksheet.items[0].activeSessions = [session(9, true)];
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    open();
    const pause = await screen.findByRole('button', { name: 'Pausar' });
    fireEvent.click(pause);
    expect(screen.getByRole('dialog', { name: 'Pausar trabajo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar pausa' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Motivo de la pausa'), { target: { value: '  Espera de repuesto  ' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pausa' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Motivo de la pausa')).toHaveValue('  Espera de repuesto  ');
    vi.mocked(api.post).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pausa' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pausar trabajo' })).not.toBeInTheDocument());
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/pause`, { note: 'Espera de repuesto' });
  });

  it('finishes only the worker’s assignment, retains notes after failure and prevents restarting the finished part', async () => {
    setTeam();
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    open();
    const finish = await screen.findByRole('button', { name: 'Terminar mi parte' });
    const article = task();
    fireEvent.click(within(article).getByText('Ver detalle', { selector: 'summary' }));
    fireEvent.change(within(article).getByLabelText(`Nota técnica de ${description}`), { target: { value: 'Mi revisión terminada' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(finish);
    await within(article).findByRole('alert');
    expect(within(article).getByLabelText(`Nota técnica de ${description}`)).toHaveValue('Mi revisión terminada');
    vi.mocked(api.post).mockImplementationOnce(async () => {
      worksheet = { ...worksheet, items: worksheet.items.map((item) => item.id === 10 ? { ...item, canWork: false, notasOperativas: 'Mi revisión terminada', assignments: [{ ...team[0], completedAt: new Date().toISOString() }, team[1]] } : item) };
      return { data: { worksheet } };
    });
    fireEvent.click(within(article).getByRole('button', { name: 'Reintentar' }));
    await within(article).findByText('Parte terminada / equipo pendiente');
    expect(article).toHaveAttribute('data-status', 'en_proceso');
    expect(within(article).queryByRole('button', { name: /^(Completar|Terminar mi parte|Iniciar|Continuar|Pausar)$/ })).not.toBeInTheDocument();
    expect(within(article).getByRole('region', { name: `Historial de horas de ${description}` })).toHaveTextContent('0 h 45 min');
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/complete`, { notasOperativas: 'Mi revisión terminada' });
  });

  it('keeps other teams read-only despite a stale legacy assignee and canWork flag', async () => {
    setTeam();
    worksheet.items[0].assignedUser = { id: 9, nombre: 'Carlos' };
    worksheet.items[0].assignments = [team[1]];
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    open();
    await screen.findByRole('button', { name: 'Mis trabajos' });
    await waitFor(() => expect(screen.queryByRole('article', { name: `Trabajo: ${description}` })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Mis trabajos' }));
    expect(within(task()).queryByRole('button', { name: /^(Terminar mi parte|Completar|Iniciar|Continuar|Pausar)$/ })).not.toBeInTheDocument();
  });

  it('shows only team estimates for explicit teams and retains history and hour validation without signed adjustments', async () => {
    setTeam();
    open();
    const article = await expandAdmin();
    expect(within(article).queryByLabelText(`Horas estimadas de ${description}`)).not.toBeInTheDocument();
    expect(within(article).queryByRole('button', { name: 'Guardar estimación' })).not.toBeInTheDocument();
    expect(within(article).queryByRole('button', { name: 'Registrar ajuste' })).not.toBeInTheDocument();
    expect(within(article).queryByLabelText(`Ajuste de minutos de ${description}`)).not.toBeInTheDocument();
    expect(within(article).getByRole('button', { name: 'Validar horas' })).toBeEnabled();
    expect(within(article).getByText('Horas conservadas')).toBeInTheDocument();
    expect(within(article).queryByRole('button', { name: 'Terminar mi parte' })).not.toBeInTheDocument();
  });

  it('requires a reason for changing or clearing an existing legacy estimate and keeps both drafts for retry', async () => {
    open();
    const article = await expandAdmin();
    const hours = within(article).getByLabelText(`Horas estimadas de ${description}`);
    fireEvent.change(hours, { target: { value: '3' } });
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar estimación' }));
    expect(screen.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motivo del cambio'), { target: { value: 'Mayor complejidad' } });
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    await within(screen.getByRole('dialog')).findByRole('alert');
    expect(hours).toHaveValue(3);
    expect(screen.getByLabelText('Motivo del cambio')).toHaveValue('Mayor complejidad');
    fireEvent.keyDown(screen.getByLabelText('Motivo del cambio'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar estimación' }));
    expect(screen.getByLabelText('Motivo del cambio')).toHaveValue('Mayor complejidad');
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.patch).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/estimate`, { horasHombreEstimadas: 3, motivo: 'Mayor complejidad' });
    fireEvent.change(hours, { target: { value: '' } });
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar estimación' }));
    expect(screen.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();
  });

  it('keeps initial legacy estimates and legacy completion working without assignments', async () => {
    worksheet.items[0].horasHombreEstimadas = null;
    open();
    const article = await expandAdmin();
    fireEvent.change(within(article).getByLabelText(`Horas estimadas de ${description}`), { target: { value: '1.5' } });
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(within(article).getByRole('button', { name: 'Guardar estimación' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/estimate`, { horasHombreEstimadas: 1.5 }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(within(article).getByRole('button', { name: 'Completar' })).toBeEnabled());
    vi.mocked(api.post).mockResolvedValueOnce({ data: { worksheet } });
    fireEvent.click(within(article).getByRole('button', { name: 'Completar' }));
    await within(article).findByText('Trabajo completado. Sus horas y notas quedaron guardadas.');
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/complete`, {});
  });

  it('retains team drafts if update permission is removed while the editor is open', async () => {
    setTeam();
    const dirty = vi.fn();
    open(dirty);
    const article = await expandTeam();
    const hours = within(article).getByLabelText(`Horas estimadas del integrante 1 de ${description}`);
    fireEvent.change(hours, { target: { value: '3' } });
    act(() => useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa', email: 'qa@example.test', role: 'jefe', permissions: [{ modulo: 'taller', accion: 'read' }] } }));
    expect(hours).toHaveValue(3);
    expect(hours).toBeDisabled();
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not treat a service price approval as a warehouse delivery blocker', async () => {
    worksheet.items[0] = { ...worksheet.items[0], tipoLinea: 'especifico', awaitingWarehouseDelivery: true, totalMinutes: 89 / 60 };
    open();
    const article = await screen.findByRole('article', { name: `Trabajo: ${description}` });
    await waitFor(() => expect(within(article).getByRole('button', { name: 'Completar' })).toBeEnabled());
    expect(within(article).queryByText(/Pendiente de entrega por bodega/)).not.toBeInTheDocument();
    expect(within(article).getByText('0 h 01 min 29 s')).toBeInTheDocument();
  });

  it('keeps pending warehouse deliveries blocked for actual parts', async () => {
    worksheet.items[0] = { ...worksheet.items[0], tipoLinea: 'parte', awaitingWarehouseDelivery: true };
    open();
    const article = await screen.findByRole('article', { name: `Trabajo: ${description}` });
    await waitFor(() => expect(within(article).getByRole('button', { name: 'Marcar usado' })).toBeDisabled());
    expect(within(article).getByText(/Pendiente de entrega por bodega/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('highlights a single contextual timer action and keeps finishing the own part accessible', async () => {
    setTeam();
    worksheet.items[0].activeSession = session(10, false);
    worksheet.items[0].activeSessions = [session(10, false), session(9, true)];
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    open();
    const article = await screen.findByRole('article', { name: `Trabajo: ${description}` });
    await waitFor(() => expect(within(article).getByRole('button', { name: 'Pausar' })).toBeEnabled());
    expect(article.querySelectorAll('button.workshop-labor-primary')).toHaveLength(1);
    expect(within(article).getByRole('button', { name: 'Pausar' })).toHaveClass('workshop-labor-primary');
    expect(within(article).getByRole('button', { name: 'Terminar mi parte' })).toBeVisible();
    expect(within(article).getByText(/^Tu sesión actual:/)).toHaveTextContent('0 h 10 min');
    expect(within(article).getByText(/^Equipo:/)).toHaveTextContent('0 h 45 min');
    expect(within(article).getByText('Tus horas estimadas: 1 h 30 min')).toBeInTheDocument();
  });

  it('keeps price suggestions discoverable in task details without exposing prices to mechanics', async () => {
    setTeam();
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    const suggest = vi.fn();
    open(vi.fn(), vi.fn(), { onSuggestPrice: suggest });
    const article = await screen.findByRole('article', { name: `Trabajo: ${description}` });
    await waitFor(() => expect(within(article).getByRole('button', { name: 'Continuar' })).toBeEnabled());
    const suggestion = within(article).getByRole('button', { name: 'Sugerir precio' });
    expect(suggestion.closest('details')).not.toHaveAttribute('open');
    expect(article.querySelector('.workshop-labor-task-controls')).not.toContainElement(suggestion);
    fireEvent.click(within(article).getByText('Ver detalle', { selector: 'summary' }));
    fireEvent.click(within(article).getByRole('button', { name: 'Sugerir precio' }));
    expect(suggest).toHaveBeenCalledWith(10);
    expect(within(article).queryByText('Por valorar')).not.toBeInTheDocument();
    expect(within(article).queryByText(/Precio actual|Costo|CLP|10\.000/)).not.toBeInTheDocument();
  });

  it('validates team hours, duplicates and the inline audit reason before the single save', async () => {
    setTeam();
    open();
    const article = await expandTeam();
    const reason = within(article).getByLabelText('Motivo del cambio de equipo');
    const hours = within(article).getByLabelText(`Horas estimadas del integrante 1 de ${description}`);
    const save = within(article).getByRole('button', { name: 'Guardar equipo' });
    fireEvent.change(hours, { target: { value: '-1' } });
    fireEvent.change(reason, { target: { value: 'Nueva distribución' } });
    expect(save).toBeDisabled();
    expect(within(article).getByRole('alert')).toHaveTextContent('entre 0 y 9999');
    fireEvent.change(hours, { target: { value: '3' } });
    fireEvent.change(reason, { target: { value: ' ' } });
    expect(save).toBeDisabled();
    fireEvent.change(reason, { target: { value: 'x'.repeat(501) } });
    expect(save).toBeDisabled();
    fireEvent.change(reason, { target: { value: 'Nueva distribución' } });
    expect(save).toBeEnabled();
    fireEvent.change(within(article).getByLabelText(`Mecánico 2 de ${description}`), { target: { value: '9' } });
    expect(save).toBeDisabled();
    expect(within(article).getByRole('alert')).toHaveTextContent('solo puede aparecer una vez');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('synchronizes supervisor unassigned focus without remounting team drafts or losing dirty state', async () => {
    setTeam();
    worksheet.items[1] = { ...worksheet.items[1], assignedUser: null, assignments: [] };
    const scopedOrder = { ...order, assignedMechanicId: null };
    const dirty = vi.fn();
    const pending = vi.fn();
    const view = open(dirty, pending, { workOrder: scopedOrder });
    const article = await expandTeam();
    const hours = within(article).getByLabelText(`Horas estimadas del integrante 1 de ${description}`);
    const reason = within(article).getByLabelText('Motivo del cambio de equipo');
    fireEvent.change(hours, { target: { value: '3.25' } });
    fireEvent.change(reason, { target: { value: 'Redistribución pendiente' } });
    view.rerender(<QueryClientProvider client={client}><WorkOrderLaborBoard workOrder={scopedOrder} onDirtyChange={dirty} onPendingChange={pending} focus="unassigned" /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: 'Sin asignar 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('article', { name: `Trabajo: ${description}` })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Trabajo: Alineación delantera' })).toBeVisible();
    expect(dirty).toHaveBeenLastCalledWith(true);
    view.rerender(<QueryClientProvider client={client}><WorkOrderLaborBoard workOrder={scopedOrder} onDirtyChange={dirty} onPendingChange={pending} focus="all" /></QueryClientProvider>);
    expect(within(task()).getByLabelText(`Horas estimadas del integrante 1 de ${description}`)).toBe(hours);
    expect(hours).toHaveValue(3.25);
    expect(reason).toHaveValue('Redistribución pendiente');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not apply supervisor unassigned focus to mechanics', async () => {
    setTeam();
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos', email: 'qa@example.test', role: 'mecanico' } });
    open(vi.fn(), vi.fn(), { focus: 'unassigned' });
    expect(await screen.findByRole('article', { name: `Trabajo: ${description}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Sin asignar/ })).not.toBeInTheDocument();
  });

  it('counts only unfinished unassigned services and opens their team editor without another click', async () => {
    worksheet.items[1].assignedUser = null;
    const base = worksheet.items[1];
    worksheet.items.push(
      { ...base, id: 20, descripcion: 'Repuesto sin asignar', tipoLinea: 'parte' },
      { ...base, id: 21, descripcion: 'Servicio terminado', estadoOperativo: 'completado' },
      { ...base, id: 22, descripcion: 'Servicio omitido', estadoOperativo: 'omitido' },
    );
    open(vi.fn(), vi.fn(), { workOrder: { ...order, assignedMechanicId: null }, focus: 'unassigned' });
    expect(await screen.findByRole('button', { name: 'Sin asignar 1' })).toHaveAttribute('aria-pressed', 'true');
    const article = await screen.findByRole('article', { name: 'Trabajo: Alineación delantera' });
    await waitFor(() => expect(within(article).getByText('Equipo de trabajo', { selector: 'summary' }).closest('details')).toHaveAttribute('open'));
    expect(within(article).getByRole('button', { name: 'Agregar integrante' })).toBeVisible();
    expect(screen.queryByRole('article', { name: 'Trabajo: Repuesto sin asignar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Trabajo: Servicio terminado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Trabajo: Servicio omitido' })).not.toBeInTheDocument();
  });

  it('respects explicitly empty teams in the source order despite a general responsible', async () => {
    const sourceOrder = { ...order, items: order.items?.map((entry) => ({ ...entry })) };
    Object.assign(sourceOrder.items![1], { teamManaged: true, assignments: [], assignedUser: null, assignedUserId: null });
    worksheet.items[1] = { ...worksheet.items[1], assignments: [], assignedUser: null };
    open(vi.fn(), vi.fn(), { workOrder: sourceOrder, focus: 'unassigned' });
    expect(await screen.findByRole('button', { name: 'Sin asignar 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('article', { name: 'Trabajo: Alineación delantera' })).toBeVisible();
    expect(screen.queryByRole('article', { name: `Trabajo: ${description}` })).not.toBeInTheDocument();
  });
});
