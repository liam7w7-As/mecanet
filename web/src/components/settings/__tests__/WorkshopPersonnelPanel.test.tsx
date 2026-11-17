import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { WorkshopPersonnelPanel } from '../WorkshopPersonnelPanel';

import type { WorkshopPersonnelPanelProps } from '../WorkshopPersonnelPanel';
import type { WorkshopPersonnelConfig } from '@unithor/shared';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

const initialConfig = (): WorkshopPersonnelConfig => ({
  specialties: [{ id: 2, name: 'Electricista', active: true }], rates: [],
  workers: [{ id: 9, nombre: 'Camila Taller', activo: true, role: 'mecanico' }],
  profiles: [{ userId: 9, principalSpecialtyId: null, additionalSpecialtyIds: [] }],
  schedule: { timezone: 'America/Santiago', weekly: [], updatedAt: null, updatedBy: null }, exceptions: [],
});
const renderPanel = (props: WorkshopPersonnelPanelProps = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <WorkshopPersonnelPanel {...props} />
  </QueryClientProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 1, nombre: 'Administrador', email: 'admin@example.test', role: 'admin' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockResolvedValue({ data: initialConfig() });
  vi.mocked(api.post).mockResolvedValue({ data: {} });
  vi.mocked(api.put).mockResolvedValue({ data: {} });
  vi.mocked(api.patch).mockResolvedValue({ data: {} });
});

describe('WorkshopPersonnelPanel', () => {
  it('prepares the confirmed work week including lunch without saving until confirmed', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar horario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar jornada de lunes a viernes y sábado' }));
    expect(screen.getByLabelText('Entrada Lunes')).toHaveValue('09:00');
    expect(screen.getByLabelText('Salida Lunes')).toHaveValue('18:00');
    expect(screen.getByLabelText('Inicio almuerzo Lunes')).toHaveValue('13:00');
    expect(screen.getByLabelText('Fin almuerzo Lunes')).toHaveValue('14:00');
    expect(screen.getByLabelText('Salida Sábado')).toHaveValue('13:00');
    expect(screen.getByLabelText('Almuerzo Sábado')).not.toBeChecked();
    expect(screen.getByLabelText('Domingo')).not.toBeChecked();
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/workshop-personnel/schedule', expect.objectContaining({
      weekly: expect.arrayContaining([{ weekday: 1, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' }, { weekday: 6, start: '09:00', end: '13:00' }]),
    })));
  });
  it('rejects lunch extending past the shift and retains editable times', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar horario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar jornada de lunes a viernes y sábado' }));
    fireEvent.change(screen.getByLabelText('Fin almuerzo Lunes'), { target: { value: '19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('almuerzo');
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Fin almuerzo Lunes')).toHaveValue('19:00');
  });
  it('shows an unconfigured weekly schedule and missing rates without populating hours or prices', async () => {
    renderPanel();
    expect(await screen.findByText(/Horario sin configurar/)).toBeInTheDocument();
    expect(screen.getByText('Sin tarifa configurada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar horario' }));
    expect(screen.getByLabelText('Lunes')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Lunes'));
    expect(screen.getByLabelText('Entrada Lunes')).toHaveValue('');
    expect(screen.getByLabelText('Salida Lunes')).toHaveValue('');
    expect(api.put).not.toHaveBeenCalled();
  });
  it('never fetches or renders configuration for a mechanic, even with custom admin permissions', () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'm@example.test', role: 'mecanico', permissions: [{ modulo: 'admin', accion: 'update' }, { modulo: 'taller', accion: 'read' }] } });
    renderPanel();
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByText('Electricista')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva especialidad' })).not.toBeInTheDocument();
  });
  it('allows a chief to record reasoned exceptions from the operations modal', async () => {
    useAuthStore.setState({ user: { id: 3, nombre: 'Jefe', email: 'j@example.test', role: 'jefe', permissions: [
      { modulo: 'taller', accion: 'read' }, { modulo: 'taller', accion: 'update' }, { modulo: 'admin', accion: 'update' },
    ] } });
    renderPanel({ mode: 'chief' });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar excepción' }));
    expect(screen.queryByRole('button', { name: 'Configurar horario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva especialidad' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trabajador'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Fecha de jornada'), { target: { value: '2026-11-16' } });
    fireEvent.click(screen.getByLabelText('Día libre'));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar nueva versión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('motivo');
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motivo obligatorio'), { target: { value: '  Permiso médico  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar nueva versión' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/workshop-personnel/workers/9/exceptions', { date: '2026-11-16', dayOff: true, start: null, end: null, reason: 'Permiso médico' }));
  });
  it('lets a chief create specialties and assign profiles without admin permissions', async () => {
    useAuthStore.setState({ user: { id: 3, nombre: 'Jefe', email: 'j@example.test', role: 'jefe', permissions: [
      { modulo: 'taller', accion: 'read' }, { modulo: 'taller', accion: 'create' }, { modulo: 'taller', accion: 'update' },
    ] } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva especialidad' }));
    fireEvent.change(screen.getByLabelText('Nombre de especialidad'), { target: { value: 'Soldador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/workshop-personnel/specialties', { name: 'Soldador' }));
    // Prices remain administration data even though the chief manages the catalog and profiles.
    expect(screen.queryByRole('button', { name: 'Nueva tarifa de Electricista' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil de Camila Taller' }));
    fireEvent.click(screen.getByLabelText('Asignar Electricista'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/workshop-personnel/workers/9/profile', {
      principalSpecialtyId: 2, additionalSpecialtyIds: [],
    }));
  });
  it('requires explicit numeric rates and accepts a deliberate zero', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva tarifa de Electricista' }));
    fireEvent.change(screen.getByLabelText('Vigente desde'), { target: { value: '2026-11-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar nueva versión' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Costo por hora (CLP)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Venta por hora (CLP)'), { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar nueva versión' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/workshop-personnel/specialties/2/rates', { validityFrom: '2026-11-16', costHourly: 0, saleHourly: 25000 }));
  });
  it('reports dirty/pending state and blocks duplicate submissions while saving', async () => {
    const state = vi.fn();
    let resolve!: (value: { data: unknown }) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((finish) => { resolve = finish; }));
    renderPanel({ onState: state });
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva especialidad' }));
    fireEvent.change(screen.getByLabelText('Nombre de especialidad'), { target: { value: 'Soldador' } });
    await waitFor(() => expect(state).toHaveBeenLastCalledWith(true, false));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(state).toHaveBeenLastCalledWith(true, true));
    expect(screen.getByLabelText('Nombre de especialidad')).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar cambios' }).closest('form')!);
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ data: { id: 3, name: 'Soldador', active: true } }));
    await waitFor(() => expect(state).toHaveBeenLastCalledWith(false, false));
  });
  it('retains the draft after a failed save and disables saving if the actor loses permission', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva especialidad' }));
    fireEvent.change(screen.getByLabelText('Nombre de especialidad'), { target: { value: 'Soldador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Nombre de especialidad')).toHaveValue('Soldador');
    await act(async () => useAuthStore.setState({ user: { id: 3, nombre: 'Jefe', email: 'j@example.test', role: 'jefe', permissions: [{ modulo: 'taller', accion: 'read' }] } }));
    // A new scoped query prevents the prior admin response being reused during a role change.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled());
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar cambios' }).closest('form')!);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('auto-assigns the first specialty as principal when the profile is empty', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar perfil de Camila Taller' }));
    expect(screen.getByLabelText('Principal Electricista')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Asignar Electricista'));
    expect(screen.getByLabelText('Principal Electricista')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/workshop-personnel/workers/9/profile', {
      principalSpecialtyId: 2, additionalSpecialtyIds: [],
    }));
  });
  it('promotes another assigned specialty when the principal is unchecked', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {
      ...initialConfig(),
      specialties: [{ id: 2, name: 'Electricista', active: true }, { id: 3, name: 'Pintor', active: true }],
      profiles: [{ userId: 9, principalSpecialtyId: 2, additionalSpecialtyIds: [3] }],
    } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar perfil de Camila Taller' }));
    expect(screen.getByLabelText('Principal Electricista')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Asignar Electricista'));
    expect(screen.getByLabelText('Principal Electricista')).not.toBeChecked();
    expect(screen.getByLabelText('Principal Electricista')).toBeDisabled();
    expect(screen.getByLabelText('Principal Pintor')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/workshop-personnel/workers/9/profile', {
      principalSpecialtyId: 3, additionalSpecialtyIds: [],
    }));
  });
  it('hides inactive specialties unless the worker already has them assigned', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {
      ...initialConfig(),
      specialties: [{ id: 2, name: 'Electricista', active: true }, { id: 4, name: 'Soldador', active: false }],
    } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar perfil de Camila Taller' }));
    expect(screen.queryByLabelText('Asignar Soldador')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar especialidad'), { target: { value: 'elec' } });
    expect(screen.getByLabelText('Asignar Electricista')).toBeInTheDocument();
    expect(screen.queryByLabelText('Asignar Soldador')).not.toBeInTheDocument();
  });
});
