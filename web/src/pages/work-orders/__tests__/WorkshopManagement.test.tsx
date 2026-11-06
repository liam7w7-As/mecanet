import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkOrderQuickDetailModal from '../../../components/work-orders/WorkOrderQuickDetailModal';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';

import type { WorkOrderPriceSuggestion, WorkOrderWorksheet } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
const order = workshopRoleOrders[0];
const makeWorksheet = (): WorkOrderWorksheet => {
  const items = (order.items ?? []).map((item) => ({ ...item, assignedUser: item.assignedUser ?? null, horasEstimadasTotales: item.horasHombreEstimadas, excedeEstimado: false, activeSession: null, totalMinutes: 45, observationsCount: 0, canWork: true, sessions: [{ id: item.id, userName: 'Carlos Mecánico', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), minutes: 45, kind: 'cronometro', note: null }] }));
  return { workOrder: { ...order, vehiculo: { id: 1, patente: 'KJTR84', marca: 'Toyota', modelo: 'Hilux' } }, items, servicios: items, repuestos: [], observations: [], progressReports: [], activeItemId: null, pausedOtherItems: 0, totals: { items: items.length, completados: 0, enProceso: 1, pendientes: 1, horasEstimadas: 2, horasReales: 1.5, minutosReales: 90 } };
};
const proposal: WorkOrderPriceSuggestion = { id: 5, workOrderId: order.id, workOrderItemId: 10, itemDescripcion: 'Revisión de suspensión', horasEstimadas: 1, horasReales: 1.5, precioActualOt: 10000, precioActualCatalogo: null, precioSugerido: 18000, alcance: 'ot', motivo: 'Complejidad adicional', estado: 'pendiente', createdByName: 'Ana Jefa', reviewNote: null, reviewedAt: null, createdAt: new Date().toISOString() };
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter><WorkOrderQuickDetailModal workOrderId={order.id} initialView="execution" onClose={vi.fn()} onPreviewPdf={vi.fn()} /></MemoryRouter></QueryClientProvider>);
let worksheet: WorkOrderWorksheet;
let suggestions: WorkOrderPriceSuggestion[];

beforeEach(() => {
  vi.resetAllMocks();
  worksheet = makeWorksheet(); suggestions = [];
  useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/worksheet') ? { worksheet } : url.endsWith('/price-suggestions') ? { suggestions } : url === `/work-orders/${order.id}` ? { workOrder: order } : { items: [], mechanics: [] } }));
});

describe('Work management without losing context', () => {
  it('opens a service price proposal directly and preserves drafts across services and tabs', async () => {
    open();
    const task = await screen.findByRole('article', { name: 'Trabajo: Revisión de suspensión' });
    await waitFor(() => expect(within(task).getByRole('button', { name: 'Sugerir precio' })).toBeEnabled());
    fireEvent.click(within(task).getByRole('button', { name: 'Sugerir precio' }));
    expect(screen.getByLabelText('Servicio para sugerencia de precio')).toHaveValue('10');
    fireEvent.change(screen.getByLabelText('Precio sugerido'), { target: { value: '18000' } });
    fireEvent.change(screen.getByLabelText('Motivo de la propuesta'), { target: { value: 'Trabajo adicional en suspensión' } });
    expect(screen.getByText(/8.000 por unidad/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Solo catálogo' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Servicio para sugerencia de precio'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Precio sugerido'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('Servicio para sugerencia de precio'), { target: { value: '10' } });
    expect(screen.getByLabelText('Precio sugerido')).toHaveValue('18.000');
    fireEvent.click(screen.getByRole('button', { name: 'Trabajos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Precios' }));
    expect(screen.getByLabelText('Motivo de la propuesta')).toHaveValue('Trabajo adicional en suspensión');
    vi.mocked(api.post).mockImplementationOnce(async () => { suggestions = [proposal]; return { data: { suggestion: proposal } }; });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a administración' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/price-suggestions`, { workOrderItemId: 10, precioSugerido: 18000, alcance: 'ot', motivo: 'Trabajo adicional en suspensión' }));
    expect(await screen.findByText(/Propuesta enviada a administración/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar propuesta' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('retains a failed proposal and lets administration review with a comment', async () => {
    suggestions = [proposal];
    useAuthStore.setState({ user: { id: 1, nombre: 'Admin', email: 'qa@example.test', role: 'admin' } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Precios' }));
    fireEvent.change(screen.getByLabelText('Servicio para sugerencia de precio'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Precio sugerido'), { target: { value: '19000' } });
    fireEvent.change(screen.getByLabelText('Motivo de la propuesta'), { target: { value: 'Complejidad revisada' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a administración' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Motivo de la propuesta')).toHaveValue('Complejidad revisada');
    fireEvent.change(screen.getByLabelText('Comentario para Revisión de suspensión'), { target: { value: 'Autorizado por complejidad' } });
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { suggestion: { ...proposal, estado: 'aprobada' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar propuesta' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/work-orders/${order.id}/price-suggestions/5`, { decision: 'aprobar', comentario: 'Autorizado por complejidad' }));
  });

  it('mechanics retry completion in the same modal, keeping notes and recorded hours', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos Mecánico', email: 'qa@example.test', role: 'mecanico' } });
    open();
    const task = await screen.findByRole('article', { name: 'Trabajo: Revisión de suspensión' });
    await waitFor(() => expect(within(task).getByRole('button', { name: 'Completar' })).toBeEnabled());
    fireEvent.click(within(task).getByText('Ver detalle', { selector: 'summary' }));
    fireEvent.change(within(task).getByLabelText('Nota técnica de Revisión de suspensión'), { target: { value: 'Revisión terminada sin fugas' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(within(task).getByRole('button', { name: 'Completar' }));
    await within(task).findByRole('alert');
    expect(within(task).getByLabelText('Nota técnica de Revisión de suspensión')).toHaveValue('Revisión terminada sin fugas');
    expect(within(task).getByRole('region', { name: 'Historial de horas de Revisión de suspensión' })).toHaveTextContent('0 h 45 min');
    vi.mocked(api.post).mockImplementationOnce(async () => {
      worksheet = { ...worksheet, items: worksheet.items.map((item) => item.id === 10 ? { ...item, estadoOperativo: 'completado', notasOperativas: 'Revisión terminada sin fugas' } : item) };
      return { data: { worksheet } };
    });
    fireEvent.click(within(task).getByRole('button', { name: 'Reintentar' }));
    expect(await within(task).findByText(/Trabajo completado. Sus horas y notas/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(task).getByRole('button', { name: 'Ir al siguiente trabajo' }));
    await waitFor(() => expect(screen.getByRole('article', { name: 'Trabajo: Alineación delantera' }).parentElement).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Precios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sugerir precio' })).not.toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url.endsWith('/price-suggestions') || url === `/work-orders/${order.id}`)).toBe(false);
    expect(api.post).toHaveBeenLastCalledWith(`/work-orders/${order.id}/items/10/complete`, { notasOperativas: 'Revisión terminada sin fugas' });
  });

  it('does not replace existing notes on an unchanged completion and waits for server confirmation', async () => {
    worksheet.items[0].notasOperativas = 'Nota anterior';
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos Mecánico', email: 'qa@example.test', role: 'mecanico' } });
    let finish: ((value: { data: { worksheet: WorkOrderWorksheet } }) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    open();
    const task = await screen.findByRole('article', { name: 'Trabajo: Revisión de suspensión' });
    fireEvent.click(within(task).getByRole('button', { name: 'Completar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/work-orders/${order.id}/items/10/complete`, {}));
    expect(within(task).queryByText(/Trabajo completado. Sus horas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    await act(async () => finish?.({ data: { worksheet } }));
    expect(await within(task).findByText(/Trabajo completado. Sus horas/)).toBeInTheDocument();
  });
  it('does not offer price changes or execution to a chief with read-only workshop permission', async () => {
    useAuthStore.setState({ user: { id: 7, nombre: 'Jefa de consulta', email: 'qa@example.test', role: 'jefe', permissions: [{ modulo: 'taller', accion: 'read' }] } });
    open();
    await screen.findByRole('article', { name: 'Trabajo: Revisión de suspensión' });
    expect(screen.queryByRole('button', { name: 'Completar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sugerir precio' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Precios' }));
    expect(screen.queryByRole('button', { name: 'Enviar a administración' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps other mechanics services read-only even when displaying the entire order', async () => {
    worksheet.items[1] = { ...worksheet.items[1], assignedUser: { id: 10, nombre: 'Otro mecánico' }, canWork: false };
    useAuthStore.setState({ user: { id: 9, nombre: 'Carlos Mecánico', email: 'qa@example.test', role: 'mecanico' } });
    open();
    const mine = await screen.findByRole('article', { name: 'Trabajo: Revisión de suspensión' });
    await waitFor(() => expect(within(mine).getByRole('button', { name: 'Completar' })).toBeEnabled());
    expect(screen.queryByRole('article', { name: 'Trabajo: Alineación delantera' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mis trabajos' }));
    const other = screen.getByRole('article', { name: 'Trabajo: Alineación delantera' });
    expect(within(other).queryByRole('button', { name: 'Completar' })).not.toBeInTheDocument();
    expect(within(other).queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
  });

});
