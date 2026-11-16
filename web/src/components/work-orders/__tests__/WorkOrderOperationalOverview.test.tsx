import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderOperationalOverview from '../WorkOrderOperationalOverview';

import type { WorkOrder } from '../../../types/entities';

const focus = vi.fn(); const requests = vi.fn(); const price = vi.fn();
let order: WorkOrder;
const open = (pending = false) => render(<WorkOrderOperationalOverview workOrder={order} focus="all" pending={pending} onFocus={focus} onRequests={requests} onPrice={price} />);
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe' } });
  order = structuredClone(workshopRoleOrders[0]);
  order.assignedMechanicId = null;
  order.items = order.items!.map((item, index) => ({ ...item, assignedUserId: null, assignedUser: null,
    estadoOperativo: index === 0 ? 'pendiente' : 'completado', qualityStatus: 'pendiente', precioUnitario: index === 0 ? 0 : 10000 }));
});

describe('Operational priorities without changing workflow rules', () => {
  it('takes a chief directly to assignment, QA, requests or the first unpriced diagnosis', () => {
    open();
    expect(within(screen.getByRole('button', { name: /Asignar equipo/ })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Revisar calidad/ })).getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Asignar equipo/ })); expect(focus).toHaveBeenLastCalledWith('unassigned');
    fireEvent.click(screen.getByRole('button', { name: /Revisar calidad/ })); expect(focus).toHaveBeenLastCalledWith('quality');
    fireEvent.click(screen.getByRole('button', { name: /Resolver solicitudes/ })); expect(requests).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Por valorar/ })); expect(price).toHaveBeenCalledWith(order.items![0].id);
  });
  it('keeps zero-priced parts out of valuation and completed services out of assignment', () => {
    order.items![0] = { ...order.items![0], tipoLinea: 'parte' };
    open();
    expect(screen.getByRole('button', { name: /Por valorar/ })).toBeDisabled();
    expect(within(screen.getByRole('button', { name: /Asignar equipo/ })).getByText('0')).toBeInTheDocument();
  });
  it('respects an explicitly empty managed crew instead of a stale legacy mechanic', () => {
    order.items![0] = { ...order.items![0], assignedUserId: 9, assignments: [], ...{ teamManaged: true } };
    open();
    expect(within(screen.getByRole('button', { name: /Asignar equipo/ })).getByText('1')).toBeInTheDocument();
  });
  it('counts a legacy general assignment and already approved quality correctly', () => {
    order.assignedMechanicId = 9; order.items![1].qualityStatus = 'aprobado'; open();
    expect(within(screen.getByRole('button', { name: /Asignar equipo/ })).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Revisar calidad/ })).getByText('0')).toBeInTheDocument();
  });
  it('shows only personal progress and no prices or approval shortcuts to a mechanic', () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'qa@example.test', role: 'mecanico' } });
    order.items![0].assignedUserId = 9; order.items![1].assignedUserId = 10;
    open();
    expect(screen.getByText(/0 de 1 trabajos terminados/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Por valorar')).not.toBeInTheDocument();
  });
  it('offers no actionable shortcuts for a closed OT and keeps QA available to consult', () => {
    order.estado = 'entregada'; open();
    expect(screen.queryByRole('button', { name: /Asignar equipo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar calidad' })); expect(focus).toHaveBeenLastCalledWith('quality');
  });
  it('blocks navigation during a save and never grants mutations to a read-only chief', () => {
    useAuthStore.setState({ user: { id: 7, nombre: 'Jefa', email: 'qa@example.test', role: 'jefe', permissions: [{ modulo: 'taller', accion: 'read' }] } });
    open(true);
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });
  it('renders no operational data for a seller or a role without workshop read access', () => {
    useAuthStore.setState({ user: { id: 8, nombre: 'Ventas', email: 'qa@example.test', role: 'vendedor' } });
    open(); expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
