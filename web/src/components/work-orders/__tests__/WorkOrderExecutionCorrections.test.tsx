import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderCard from '../WorkOrderCard';
import WorkOrderQuickDetailModal from '../WorkOrderQuickDetailModal';

import type { WorkOrder, WorkOrderWorksheet } from '../../../types/entities';
import type { ReactNode } from 'react';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));

const item = (id: number, assignedUserId: number, nombre: string) => ({
  id, assignedUserId, assignedUser: { id: assignedUserId, nombre }, catalogItemId: null,
  descripcion: `Servicio ${id}`, tipoLinea: 'especifico' as const, unidadMedida: 'servicio' as const,
  cantidad: 1, precioUnitario: 25000, subtotal: 25000, estadoOperativo: 'pendiente' as const,
  notasOperativas: null, horasHombreEstimadas: 1, horasHombreReales: null,
  laborValidatedBy: null, laborValidatedAt: null, laborValidationNote: null,
  stockConsumido: false, stockConsumidoCantidad: 0, stockConsumidoAt: null,
});
const order: WorkOrder = {
  id: 12, codigo: 'OT-26-12', clientId: null, vehicleId: 4, estado: 'en_progreso',
  descripcion: null, kilometrajeIngreso: null, fechaIngreso: '2026-11-12T10:00:00Z',
  fechaEntrega: null, createdBy: 1, createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z',
  assignedMechanicId: null, assignedMechanic: null, vehicle: { id: 4, patente: 'BCDF71', marca: 'Toyota', modelo: 'Hilux' },
  items: [item(20, 9, 'Mecánico Uno'), item(21, 10, 'Mecánico Dos')],
};
const worksheet: WorkOrderWorksheet = {
  workOrder: { id: 12, codigo: order.codigo, estado: order.estado, descripcion: null, fechaIngreso: order.fechaIngreso, assignedMechanicId: null, vehiculo: { id: 4, patente: 'BCDF71', marca: 'Toyota', modelo: 'Hilux' } },
  items: order.items!.map((entry) => ({ ...entry, assignedUser: entry.assignedUser ?? null, canWork: entry.assignedUserId === 9, horasEstimadasTotales: 1, excedeEstimado: false, activeSession: null, totalMinutes: 0, observationsCount: 0, sessions: [] })),
  servicios: [], repuestos: [], observations: [], progressReports: [], requests: [], activeItemId: null, pausedOtherItems: 0,
  totals: { items: 2, completados: 0, enProceso: 0, pendientes: 2, horasEstimadas: 2, horasReales: 0, minutosReales: 0 },
};
const mount = (view: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter>{view}</MemoryRouter></QueryClientProvider>);

describe('Correcciones de gestión de trabajo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico Uno', email: 'mecanico@example.invalid', role: 'mecanico' }, isLoading: false, isAuthenticated: true });
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/work-orders/12/worksheet' ? { worksheet } : { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } }));
    vi.mocked(api.post).mockResolvedValue({ data: { worksheet } });
  });

  it('permite sugerir solo para el servicio propio y conserva la propuesta si falla el envío', async () => {
    mount(<WorkOrderQuickDetailModal workOrderId={12} initialView="execution" onClose={vi.fn()} onPreviewPdf={vi.fn()} />);
    const own = await screen.findByRole('article', { name: 'Trabajo: Servicio 20' });
    fireEvent.click(within(own).getByRole('button', { name: 'Sugerir precio' }));
    expect(await screen.findByRole('heading', { name: 'Sugerir precio de un servicio' })).toBeInTheDocument();
    expect(screen.getByLabelText('Servicio para sugerencia de precio')).toHaveValue('20');
    expect(screen.queryByRole('option', { name: 'Servicio 21' })).not.toBeInTheDocument();
    expect(screen.queryByText('Precio actual por unidad')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Precio sugerido'), { target: { value: '35000' } });
    fireEvent.change(screen.getByLabelText('Motivo de la propuesta'), { target: { value: 'Complejidad adicional' } });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar al jefe de taller' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu propuesta se conserva para reintentar');
    expect(screen.getByLabelText('Motivo de la propuesta')).toHaveValue('Complejidad adicional');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar al jefe de taller' }));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/work-orders/12/requests', { tipo: 'aumento_precio', workOrderItemId: 20, precioSugerido: 35000, motivo: 'Complejidad adicional' }));
    expect(await screen.findByText(/Sugerencia enviada al jefe/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar propuesta' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/work-orders/12');
  });

  it('no ofrece sugerencias para el servicio ajeno ni con permiso de edición revocado', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico Uno', email: 'mecanico@example.invalid', role: 'mecanico', permissions: [{ modulo: 'taller', accion: 'read' }] } });
    mount(<WorkOrderQuickDetailModal workOrderId={12} initialView="execution" onClose={vi.fn()} onPreviewPdf={vi.fn()} />);
    await screen.findByRole('article', { name: 'Trabajo: Servicio 20' });
    expect(screen.queryByRole('button', { name: 'Sugerir precio' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Precios$/ }));
    expect(screen.queryByRole('button', { name: 'Enviar al jefe de taller' })).not.toBeInTheDocument();
  });

  it('muestra ambos responsables por servicio aunque no haya mecánico general', () => {
    mount(<WorkOrderCard workOrder={order} now={Date.parse(order.createdAt)} canManage={false} showFinancials={false} statusPending={false} expansion={{ id: 12, panel: 'information', mode: 'manual' }} onExpand={vi.fn()} onChangeStatus={vi.fn()} onDeliver={vi.fn()} onOpenDetail={vi.fn()} onPreviewPdf={vi.fn()} />);
    expect(screen.getByText('Mecánico Uno · Mecánico Dos')).toBeInTheDocument();
    expect(screen.queryByText('Sin mecánico')).not.toBeInTheDocument();
  });
});
