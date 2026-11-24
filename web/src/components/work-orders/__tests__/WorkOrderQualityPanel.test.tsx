import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderQualityPanel from '../WorkOrderQualityPanel';

import type { WorkOrderQuality, WorkOrderQualityItem, WorkOrderQualityResponse } from '../../../hooks/useWorkOrderQuality';
import type { WorkOrder } from '../../../types/entities';
import type { Role } from '@unithor/shared';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
const description = 'Revisión de suspensión';
const mechanics = [{ id: 9, nombre: 'Carlos', email: 'c@example.test' }, { id: 10, nombre: 'Luis', email: 'l@example.test' }];
let order: WorkOrder;
let quality: WorkOrderQuality;
let client: QueryClient;
const onState = vi.fn();

const renderPanel = (props: { active?: boolean; focused?: boolean } = {}) => render(<QueryClientProvider client={client}><WorkOrderQualityPanel workOrder={order} onState={onState} {...props} /></QueryClientProvider>);
const openPanel = async () => {
  const summary = await screen.findByText('Control de calidad');
  fireEvent.click(summary.closest('summary')!);
  await screen.findByRole('region', { name: `Calidad de ${description}` });
};
const openItem = (name = description) => {
  const item = screen.getByRole('region', { name: `Calidad de ${name}` });
  fireEvent.click(within(item).getByText('Notas y detalle').closest('summary')!);
  return item;
};
const approveAll = () => {
  quality = { ...quality, canConfirm: true, items: quality.items.map((item) => ({ ...item, qualityStatus: 'aprobado', estadoOperativo: 'completado' })) };
};
const role = (role: Role, id = 7) => useAuthStore.setState({ user: { id, nombre: role, email: 'qa@example.test', role } });
const saveReview = (decision: 'aprobado' | 'rechazado', note: string | null, itemId = 10) => {
  quality = { ...quality, items: quality.items.map((item) => item.id === itemId ? { ...item, qualityStatus: decision, estadoOperativo: decision === 'rechazado' ? 'pendiente' : item.estadoOperativo, qualityNote: note, qualityReviewedAt: new Date().toISOString(), qualityReviewedBy: 7 } : item), history: [{ id: 2, workOrderItemId: itemId, decision, note, createdAt: new Date().toISOString(), reviewedBy: 7, reviewerName: 'Ana Jefa' }, ...quality.history] };
  return { data: { quality } };
};

beforeEach(() => {
  vi.resetAllMocks();
  order = structuredClone(workshopRoleOrders[0]);
  quality = { workOrderId: order.id, estado: 'en_progreso', approvedAt: null, approvedBy: null, approvalNote: null, canConfirm: false,
    items: (order.items ?? []).map((item): WorkOrderQualityItem => ({ id: item.id, descripcion: item.descripcion, tipoLinea: item.tipoLinea, estadoOperativo: 'completado', qualityStatus: 'pendiente', qualityReviewedAt: null, qualityReviewedBy: null, qualityNote: null })), history: [] };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/quality') ? { quality } : { mechanics } }));
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe('WorkOrderQualityPanel', () => {
  it('opens a focused panel with review actions and final requirements visible while notes and history stay folded', async () => {
    quality.items[1].estadoOperativo = 'pendiente';
    renderPanel({ focused: true });
    const item = await screen.findByRole('region', { name: `Calidad de ${description}` });
    expect(screen.getByText('Control de calidad').closest('details')).toHaveAttribute('open');
    expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeVisible();
    expect(within(item).getByRole('button', { name: 'Solicitar corrección' })).toBeVisible();
    expect(within(item).getByText('Notas y detalle').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Historial de calidad', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Notas finales (opcional)', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Confirmar calidad y finalizar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar calidad y finalizar' })).toBeDisabled();
    expect(screen.getByText('1 trabajo por terminar u omitir')).toBeVisible();
    expect(screen.getByText('1 listo para revisar · 1 por terminar')).toBeVisible();
    expect(screen.getByText('0/2 servicios aprobados')).toBeVisible();
    fireEvent.click(within(item).getByRole('button', { name: 'Solicitar corrección' }));
    expect(within(item).getByLabelText(`Motivo de corrección de ${description}`)).toBeVisible();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('approves from the compact service row without opening its notes', async () => {
    renderPanel({ focused: true });
    const item = await screen.findByRole('region', { name: `Calidad de ${description}` });
    vi.mocked(api.post).mockImplementationOnce(async () => saveReview('aprobado', null));
    fireEvent.click(within(item).getByRole('button', { name: 'Aprobar servicio' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/quality`, { decision: 'aprobar', nota: null }));
    expect(within(item).getByText('Notas y detalle').closest('details')).not.toHaveAttribute('open');
  });

  it('puts completed and omitted reviews first, unfinished services next and approved services last with matching counts', async () => {
    const base = quality.items[0];
    quality.items = [
      { ...base, id: 20, descripcion: 'Ya aprobado', qualityStatus: 'aprobado' },
      { ...base, id: 21, descripcion: 'En proceso', estadoOperativo: 'en_proceso' },
      { ...base, id: 22, descripcion: 'Por iniciar', estadoOperativo: 'pendiente' },
      { ...base, id: 23, descripcion: 'Listo para revisión' },
      { ...base, id: 24, descripcion: 'Omitido por revisar', estadoOperativo: 'omitido', qualityStatus: 'rechazado' },
      { ...base, id: 25, descripcion: 'Repuesto', tipoLinea: 'parte' },
    ];
    renderPanel({ focused: true });
    await screen.findByText('2 listos para revisar · 2 por terminar');
    expect(screen.getAllByRole('region', { name: /^Calidad de / }).map((item) => item.getAttribute('aria-label'))).toEqual([
      'Calidad de Listo para revisión', 'Calidad de Omitido por revisar', 'Calidad de En proceso', 'Calidad de Por iniciar', 'Calidad de Ya aprobado',
    ]);
    expect(screen.queryByRole('region', { name: 'Calidad de Repuesto' })).not.toBeInTheDocument();
  });

  it('keeps a mounted note draft when a service becomes ready and moves to the top', async () => {
    quality.items[0].estadoOperativo = 'en_proceso';
    renderPanel({ focused: true });
    await screen.findByText('1 listo para revisar · 1 por terminar');
    const item = openItem();
    const note = within(item).getByLabelText(`Nota de calidad de ${description}`);
    fireEvent.change(note, { target: { value: 'Revisión preparada' } });
    expect(screen.getAllByRole('region', { name: /^Calidad de / })[1]).toBe(item);
    quality = { ...quality, items: quality.items.map((entry) => ({ ...entry, estadoOperativo: 'completado' })) };
    await act(async () => { await client.invalidateQueries({ queryKey: ['work-order-quality'] }); });
    await screen.findByText('2 listos para revisar · 0 por terminar');
    expect(screen.getAllByRole('region', { name: /^Calidad de / })[0]).toBe(item);
    expect(within(item).getByLabelText(`Nota de calidad de ${description}`)).toBe(note);
    expect(note).toHaveValue('Revisión preparada');
    expect(within(item).getByText('Notas y detalle').closest('details')).toHaveAttribute('open');
    expect(onState).toHaveBeenLastCalledWith(true, false);
  });

  it('reopens when focused changes and preserves note, correction and crew drafts across inactive views', async () => {
    const mounted = renderPanel(); await openPanel(); const item = openItem();
    const note = within(item).getByLabelText(`Nota de calidad de ${description}`);
    fireEvent.change(note, { target: { value: 'Borrador de revisión' } });
    fireEvent.click(within(item).getByRole('button', { name: 'Solicitar corrección' }));
    const reason = within(item).getByLabelText(`Motivo de corrección de ${description}`);
    fireEvent.change(reason, { target: { value: 'Corregir alineación' } });
    fireEvent.click(within(item).getByRole('checkbox', { name: `Cambiar equipo de ${description}` }));
    const hours = within(item).getByLabelText(`Horas del integrante 1 para corrección de ${description}`);
    fireEvent.change(hours, { target: { value: '0.75' } });
    fireEvent.click(screen.getByText('Control de calidad').closest('summary')!);
    mounted.rerender(<QueryClientProvider client={client}><WorkOrderQualityPanel workOrder={order} onState={onState} active={false} focused={false} /></QueryClientProvider>);
    expect(screen.getByText('Control de calidad').closest('details')).not.toHaveAttribute('open');
    mounted.rerender(<QueryClientProvider client={client}><WorkOrderQualityPanel workOrder={order} onState={onState} active focused /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('Control de calidad').closest('details')).toHaveAttribute('open'));
    expect(note).toHaveValue('Borrador de revisión');
    expect(reason).toHaveValue('Corregir alineación');
    expect(hours).toHaveValue(0.75);
    expect(onState).toHaveBeenLastCalledWith(true, false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows approved notes read-only without offering an unsavable new note draft', async () => {
    quality.items[0] = { ...quality.items[0], qualityStatus: 'aprobado', qualityNote: 'Revisión aprobada en ruta' };
    renderPanel(); await openPanel(); const item = openItem();
    expect(within(item).getByText('Revisión aprobada en ruta')).toBeInTheDocument();
    expect(within(item).queryByLabelText(`Nota de calidad de ${description}`)).not.toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeDisabled();
    expect(onState).toHaveBeenLastCalledWith(false, false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('preserves a note after remote approval and discards just that note without losing correction or crew drafts', async () => {
    renderPanel(); await openPanel(); const item = openItem();
    const note = within(item).getByLabelText(`Nota de calidad de ${description}`);
    fireEvent.change(note, { target: { value: 'Nota local aún sin guardar' } });
    fireEvent.click(within(item).getByRole('button', { name: 'Solicitar corrección' }));
    const reason = within(item).getByLabelText(`Motivo de corrección de ${description}`);
    fireEvent.change(reason, { target: { value: 'Revisar alineación' } });
    fireEvent.click(within(item).getByRole('checkbox', { name: `Cambiar equipo de ${description}` }));
    const crewHours = within(item).getByLabelText(`Horas del integrante 1 para corrección de ${description}`);
    fireEvent.change(crewHours, { target: { value: '0.75' } });
    quality = { ...quality, items: quality.items.map((entry) => entry.id === 10 ? { ...entry, qualityStatus: 'aprobado', qualityNote: 'Aprobado por otra jefatura' } : entry) };
    await act(async () => { await client.invalidateQueries({ queryKey: ['work-order-quality'] }); });
    await waitFor(() => expect(note).toHaveAttribute('readonly'));
    expect(note).toHaveValue('Nota local aún sin guardar');
    expect(within(item).getByText('Aprobado por otra jefatura')).toBeInTheDocument();
    fireEvent.change(note, { target: { value: 'Cambio que no debe aceptarse' } });
    expect(note).toHaveValue('Nota local aún sin guardar');
    fireEvent.click(within(item).getByRole('button', { name: 'Descartar solo esta nota' }));
    expect(within(item).queryByLabelText(`Nota de calidad de ${description}`)).not.toBeInTheDocument();
    expect(reason).toHaveValue('Revisar alineación');
    expect(crewHours).toHaveValue(0.75);
    expect(within(item).getByRole('checkbox', { name: `Cambiar equipo de ${description}` })).toBeChecked();
    expect(onState).toHaveBeenLastCalledWith(true, false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('stays compact and approves a service with an optional note while preserving a failed draft', async () => {
    renderPanel();
    expect(screen.getByText('Control de calidad').closest('details')).not.toHaveAttribute('open');
    await openPanel();
    const item = openItem();
    const note = within(item).getByLabelText(`Nota de calidad de ${description}`);
    fireEvent.change(note, { target: { value: 'Probado en ruta' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(within(item).getByRole('button', { name: 'Aprobar servicio' }));
    await within(item).findByRole('alert');
    expect(note).toHaveValue('Probado en ruta');
    expect(onState).toHaveBeenLastCalledWith(true, false);
    vi.mocked(api.post).mockImplementationOnce(async () => saveReview('aprobado', 'Probado en ruta'));
    fireEvent.click(within(item).getByRole('button', { name: 'Aprobar servicio' }));
    await waitFor(() => expect(within(item).getByText('Aprobado')).toBeInTheDocument());
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/quality`, { decision: 'aprobar', nota: 'Probado en ruta' });
    await waitFor(() => expect(within(item).queryByLabelText(`Nota de calidad de ${description}`)).not.toBeInTheDocument());
    expect(within(item).getByText('Probado en ruta')).toBeInTheDocument();
    expect(onState).toHaveBeenLastCalledWith(false, false);
  });

  it('approves an omitted service without requiring a note or extra checklist', async () => {
    quality.items[0].estadoOperativo = 'omitido';
    renderPanel(); await openPanel(); const item = openItem();
    vi.mocked(api.post).mockImplementationOnce(async () => saveReview('aprobado', null));
    expect(within(item).queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(within(item).getByRole('button', { name: 'Aprobar servicio' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/quality`, { decision: 'aprobar', nota: null }));
  });

  it('requires a correction reason and omits members to keep the existing crew', async () => {
    renderPanel(); await openPanel(); const item = openItem();
    fireEvent.click(within(item).getByRole('button', { name: 'Solicitar corrección' }));
    const reject = within(item).getByRole('button', { name: 'Rechazar servicio' });
    expect(reject).toBeDisabled();
    const reason = within(item).getByLabelText(`Motivo de corrección de ${description}`);
    fireEvent.change(reason, { target: { value: 'x' } });
    expect(reject).toBeDisabled();
    fireEvent.change(reason, { target: { value: '  Corregir fuga  ' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(reject);
    await within(item).findByRole('alert');
    expect(reason).toHaveValue('  Corregir fuga  ');
    fireEvent.click(within(item).getByRole('button', { name: 'Volver' }));
    fireEvent.click(within(item).getByRole('button', { name: 'Solicitar corrección' }));
    expect(within(item).getByLabelText(`Motivo de corrección de ${description}`)).toHaveValue('  Corregir fuga  ');
    vi.mocked(api.post).mockImplementationOnce(async () => saveReview('rechazado', 'Corregir fuga'));
    fireEvent.click(within(item).getByRole('button', { name: 'Rechazar servicio' }));
    await within(item).findByText(/^Trabajo pendiente/);
    expect(within(item).getByText('Corrección pendiente')).toBeInTheDocument();
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/quality`, { decision: 'rechazar', nota: 'Corregir fuga' });
    expect(order.items?.[0].horasHombreReales).toBe(0.5);
    fireEvent.click(screen.getByText('Historial de calidad', { selector: 'summary' }));
    expect(screen.getByText('Ana Jefa', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('Corregir fuga').length).toBeGreaterThan(0);
  });

  it('optionally reassigns multiple workers in the rejection and preserves that draft on errors', async () => {
    renderPanel(); await openPanel(); const item = openItem();
    fireEvent.click(within(item).getByRole('button', { name: 'Solicitar corrección' }));
    fireEvent.change(within(item).getByLabelText(`Motivo de corrección de ${description}`), { target: { value: 'Rehacer alineación' } });
    fireEvent.click(within(item).getByRole('checkbox', { name: `Cambiar equipo de ${description}` }));
    const add = within(item).getByRole('button', { name: 'Agregar integrante' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    expect(within(item).getByRole('button', { name: 'Rechazar servicio' })).toBeDisabled();
    fireEvent.change(within(item).getByLabelText(`Mecánico 2 para corrección de ${description}`), { target: { value: '10' } });
    fireEvent.change(within(item).getByLabelText(`Horas del integrante 1 para corrección de ${description}`), { target: { value: '1.5' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(within(item).getByRole('button', { name: 'Rechazar servicio' }));
    await within(item).findByRole('alert');
    expect(within(item).getByLabelText(`Mecánico 2 para corrección de ${description}`)).toHaveValue('10');
    expect(within(item).getByLabelText(`Horas del integrante 1 para corrección de ${description}`)).toHaveValue(1.5);
    vi.mocked(api.post).mockImplementationOnce(async () => saveReview('rechazado', 'Rehacer alineación'));
    fireEvent.click(within(item).getByRole('button', { name: 'Rechazar servicio' }));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/quality`, { decision: 'rechazar', nota: 'Rehacer alineación', members: [{ userId: 9, estimatedHours: 1.5 }, { userId: 10, estimatedHours: null }] }));
  });

  it('initializes correction from every active normal-DTO assignment with its own specialty and estimate', async () => {
    const original = order.items![0];
    original.cantidad = 5;
    original.horasHombreEstimadas = 99;
    original.assignments = [
      { id: 1, userId: 9, userName: 'Carlos', specialtyId: 2, specialtyName: 'Mecánica', costHourly: null, saleHourly: null, estimatedHours: 1.5, originalEstimatedHours: 1, completedAt: new Date().toISOString(), active: true },
      { id: 2, userId: 10, userName: 'Luis', specialtyId: null, specialtyName: null, costHourly: null, saleHourly: null, estimatedHours: null, originalEstimatedHours: null, completedAt: new Date().toISOString(), active: true },
      { id: 3, userId: 11, userName: 'Anterior', specialtyId: 3, specialtyName: 'Electricidad', costHourly: null, saleHourly: null, estimatedHours: 8, originalEstimatedHours: 8, completedAt: null, active: false },
    ];
    renderPanel(); await openPanel(); const item = openItem();
    fireEvent.click(within(item).getByRole('button', { name: 'Solicitar corrección' }));
    fireEvent.change(within(item).getByLabelText(`Motivo de corrección de ${description}`), { target: { value: 'Corregir con el equipo actual' } });
    fireEvent.click(within(item).getByRole('checkbox', { name: `Cambiar equipo de ${description}` }));
    await waitFor(() => expect(within(item).getByRole('button', { name: 'Agregar integrante' })).toBeEnabled());
    expect(within(item).getByLabelText(`Mecánico 1 para corrección de ${description}`)).toHaveValue('9');
    expect(within(item).getByLabelText(`Mecánico 2 para corrección de ${description}`)).toHaveValue('10');
    expect(within(item).getByLabelText(`Horas del integrante 1 para corrección de ${description}`)).toHaveValue(1.5);
    expect(within(item).getByLabelText(`Horas del integrante 2 para corrección de ${description}`)).toHaveValue(null);
    expect(within(item).queryByLabelText(`Mecánico 3 para corrección de ${description}`)).not.toBeInTheDocument();
    vi.mocked(api.post).mockImplementationOnce(async () => saveReview('rechazado', 'Corregir con el equipo actual'));
    fireEvent.click(within(item).getByRole('button', { name: 'Rechazar servicio' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/quality`, { decision: 'rechazar', nota: 'Corregir con el equipo actual', members: [{ userId: 9, specialtyId: 2, estimatedHours: 1.5 }, { userId: 10, specialtyId: null, estimatedHours: null }] }));
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url.endsWith('/worksheet'))).toBe(false);
  });

  it('does not review unfinished services or present individual quality controls for parts', async () => {
    quality.items[0].estadoOperativo = 'pendiente';
    quality.items[1].tipoLinea = 'parte';
    renderPanel(); await openPanel(); const item = openItem();
    expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeDisabled();
    expect(within(item).getByRole('button', { name: 'Solicitar corrección' })).toBeDisabled();
    expect(screen.queryByText(quality.items[1].descripcion)).not.toBeInTheDocument();
  });

  it('blocks final confirmation until work is resolved and all services are individually approved', async () => {
    quality.canConfirm = true;
    renderPanel(); await openPanel();
    expect(screen.getByRole('button', { name: 'Confirmar calidad y finalizar' })).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('allows final confirmation with no notes and no checklist', async () => {
    approveAll();
    renderPanel(); await openPanel();
    vi.mocked(api.post).mockImplementationOnce(async () => {
      quality = { ...quality, estado: 'finalizada', approvedAt: new Date().toISOString(), approvedBy: 7, canConfirm: false };
      return { data: { quality } };
    });
    expect(screen.getByRole('button', { name: 'Confirmar calidad y finalizar' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar calidad y finalizar' }));
    await screen.findByText(/Calidad confirmada el/);
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/quality/confirm`, { notas: null });
    expect(screen.queryByRole('button', { name: 'Confirmar calidad y finalizar' })).not.toBeInTheDocument();
  });

  it('preserves optional final notes after a failed confirmation and retries without losing them', async () => {
    approveAll(); renderPanel(); await openPanel();
    fireEvent.click(screen.getByText('Notas finales (opcional)', { selector: 'summary' }));
    const notes = screen.getByLabelText('Notas finales de calidad');
    fireEvent.change(notes, { target: { value: 'Prueba general conforme' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar calidad y finalizar' }));
    await screen.findByRole('alert');
    expect(notes).toHaveValue('Prueba general conforme');
    expect(onState).toHaveBeenLastCalledWith(true, false);
    vi.mocked(api.post).mockImplementationOnce(async () => { quality = { ...quality, estado: 'finalizada', approvedAt: new Date().toISOString(), approvedBy: 7, approvalNote: 'Prueba general conforme', canConfirm: false }; return { data: { quality } }; });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar calidad y finalizar' }));
    await screen.findByText(/Calidad confirmada el.*Prueba general conforme/);
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/quality/confirm`, { notas: 'Prueba general conforme' });
    expect(onState).toHaveBeenLastCalledWith(false, false);
  });

  it('shows a mechanic the own-order quality summary and history without mutation controls', async () => {
    role('mecanico', 9);
    renderPanel();
    fireEvent.click(screen.getByText('Control de calidad').closest('summary')!);
    await screen.findByRole('region', { name: `Calidad de ${description}` });
    const item = openItem();
    expect(within(item).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar calidad y finalizar' })).not.toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.every(([url]) => url.endsWith('/quality'))).toBe(true);
  });

  it('does not mount quality content or request quality for sellers or an unassigned mechanic', () => {
    role('vendedor');
    const mounted = renderPanel();
    expect(screen.queryByText('Control de calidad')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    mounted.unmount();
    role('mecanico', 19);
    renderPanel();
    expect(screen.queryByText('Control de calidad')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('preserves drafts and disables review when a chief loses update permission', async () => {
    renderPanel(); await openPanel(); const item = openItem();
    const note = within(item).getByLabelText(`Nota de calidad de ${description}`);
    fireEvent.change(note, { target: { value: 'Pendiente de revisar' } });
    act(() => useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa', email: 'qa@example.test', role: 'jefe', permissions: [{ modulo: 'taller', accion: 'read' }] } }));
    expect(note).toHaveValue('Pendiente de revisar');
    expect(note).toBeDisabled();
    expect(onState).toHaveBeenLastCalledWith(true, false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('retries an unavailable quality summary without offering write controls', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Sin conexión'));
    renderPanel(); fireEvent.click(screen.getByText('Control de calidad').closest('summary')!);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Aprobar servicio' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar calidad' }));
    await screen.findByText(description);
  });

  it('holds pending state while a review is in flight', async () => {
    renderPanel(); await openPanel(); const item = openItem();
    let finish: ((response: { data: WorkOrderQualityResponse }) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(within(item).getByRole('button', { name: 'Aprobar servicio' }));
    await waitFor(() => expect(onState).toHaveBeenLastCalledWith(false, true));
    expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeDisabled();
    await act(async () => finish?.(saveReview('aprobado', null)));
    await waitFor(() => expect(onState).toHaveBeenLastCalledWith(false, false));
  });

  it('refreshes quality immediately when the labor board completes a service', async () => {
    quality.items[0].estadoOperativo = 'en_proceso';
    const mounted = renderPanel(); await openPanel(); const item = openItem();
    expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeDisabled();
    quality = { ...quality, items: quality.items.map((entry) => ({ ...entry, estadoOperativo: 'completado' })) };
    order = { ...order, items: order.items?.map((entry) => ({ ...entry, estadoOperativo: 'completado' })) };
    mounted.rerender(<QueryClientProvider client={client}><WorkOrderQualityPanel workOrder={order} onState={onState} /></QueryClientProvider>);
    await waitFor(() => expect(within(item).getByRole('button', { name: 'Aprobar servicio' })).toBeEnabled());
    expect(vi.mocked(api.get).mock.calls.filter(([url]) => url.endsWith('/quality'))).toHaveLength(2);
  });
});
