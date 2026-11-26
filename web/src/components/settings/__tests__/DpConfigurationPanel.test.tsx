import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createDefaultDpConfiguration } from '@unithor/shared';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import DpConfigurationPanel from '../DpConfigurationPanel';

import type { DpConfigurationRecord, UpdateDpConfigurationInput } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
  getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

const response = <T,>(data: T): AxiosResponse<T> => ({ data }) as AxiosResponse<T>;
const record = (): DpConfigurationRecord => ({
  revision: 1, configuration: createDefaultDpConfiguration(), updatedAt: '2026-11-24T10:00:00.000Z',
  lastEditor: { id: 1, nombre: 'Administrador' },
});
function renderPanel(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><DpConfigurationPanel onClose={onClose} /></QueryClientProvider>);
  return { onClose, client };
}

describe('Configuración D&P', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 1, nombre: 'Administrador', email: 'admin@unithor.cl', role: 'admin' }, isLoading: false, isAuthenticated: true });
    vi.mocked(api.get).mockImplementation(async (url) => response(url === '/settings/dp/history'
      ? { items: [{ revision: 1, createdAt: record().updatedAt, editor: record().lastEditor }] }
      : record()));
    vi.mocked(api.put).mockImplementation(async (_url, raw) => {
      const input = raw as UpdateDpConfigurationInput;
      return response({ ...record(), revision: input.expectedRevision + 1, configuration: input.configuration });
    });
  });

  it('muestra las tarifas conocidas y conserva los precios pendientes sin convertirlos a cero', async () => {
    renderPanel();
    expect(await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' })).toHaveValue(90000);
    expect(screen.getByRole('spinbutton', { name: 'Precio base de Reparación por pieza' })).toHaveValue(20000);
    expect(screen.getByRole('spinbutton', { name: 'Precio base de Pulido por pieza' })).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('guarda con revisión, conserva null y las demás secciones del catálogo', async () => {
    renderPanel();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' }), { target: { value: '95000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [, input] = vi.mocked(api.put).mock.calls[0];
    expect(input).toMatchObject({ expectedRevision: 1, configuration: { stages: record().configuration.stages } });
    expect((input as UpdateDpConfigurationInput).configuration.tables.find((table) => table.id === 'painting')?.basePrice).toBe(95000);
    expect((input as UpdateDpConfigurationInput).configuration.tables.find((table) => table.id === 'polishing')?.basePrice).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled());
  });

  it('rechaza valores inválidos antes de llamar al servidor', async () => {
    renderPanel();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' }), { target: { value: '-1' } });
    // Native number validation also blocks this click; submit directly to verify the Zod guard.
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar configuración' }).closest('form')!);
    expect(await screen.findByText('Revisa estos campos antes de guardar:')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('conserva el borrador al cambiar de pestaña y confirma antes de cerrarlo', async () => {
    const { onClose } = renderPanel();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' }), { target: { value: '96000' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Niveles de daño' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Tarifas y servicios' }));
    expect(screen.getByRole('spinbutton', { name: 'Precio base de Pintura por pieza' })).toHaveValue(96000);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('spinbutton', { name: 'Precio base de Pintura por pieza' })).toHaveValue(96000);
  });

  it('no sobrescribe en un 409 y exige confirmar la recarga', async () => {
    // Set the HTTP status without relying on a real API/DB.
    const conflict = new AxiosError('Conflict', 'ERR_BAD_REQUEST');
    conflict.response = { ...response({ error: { message: 'Versión desactualizada' } }), status: 409 };
    vi.mocked(api.put).mockReset().mockRejectedValueOnce(conflict);
    renderPanel();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' }), { target: { value: '97000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(await screen.findByText('Otra persona actualizó esta configuración.')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Precio base de Pintura por pieza' })).toHaveValue(97000);
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar versión actual' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Descartar configuración D&P' });
    expect(api.get).toHaveBeenCalledTimes(1);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Descartar y cargar' }));
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Precio base de Pintura por pieza' })).toHaveValue(90000));
  });

  it('cancela la edición desde las carrocerías y restaura los datos sin cerrar el modal', async () => {
    const { onClose } = renderPanel();
    await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' });
    fireEvent.click(screen.getByRole('tab', { name: 'Carrocerías y tamaños' }));
    const factor = record().configuration.bodyTypes[0];
    const factorLabel = `Factor ${factor.label} ${factor.sizes[0].label}`;
    fireEvent.change(screen.getByRole('spinbutton', { name: factorLabel }), { target: { value: '1.25' } });
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Cancelar' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Descartar configuración D&P' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: factorLabel })).toHaveValue(1.25);
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Descartar y cargar' }));
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: factorLabel })).toHaveValue(factor.sizes[0].factor));
    expect(screen.getByRole('dialog', { name: 'Configuración D&P' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Carrocerías y tamaños' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('conserva los cinco pasos e identidades al reordenarlos y consulta el historial a demanda', async () => {
    renderPanel();
    await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' });
    fireEvent.click(screen.getByRole('tab', { name: 'Pasos D&P' }));
    const first = record().configuration.stages[0];
    fireEvent.click(screen.getByRole('button', { name: `Bajar ${first.label}` }));
    expect(screen.getByRole('textbox', { name: 'Nombre del paso 2' })).toHaveValue(first.label);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const input = vi.mocked(api.put).mock.calls[0][1] as UpdateDpConfigurationInput;
    expect(input.configuration.stages).toHaveLength(5);
    expect(new Set(input.configuration.stages.map((stage) => stage.key))).toEqual(new Set(record().configuration.stages.map((stage) => stage.key)));
    expect(api.get).not.toHaveBeenCalledWith('/settings/dp/history');
    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(await screen.findByText('Versión 1')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/settings/dp/history');
  });

  it('permite crear y desactivar piezas sin eliminar su historial', async () => {
    renderPanel();
    await screen.findByRole('spinbutton', { name: 'Precio base de Pintura por pieza' });
    fireEvent.click(screen.getByRole('tab', { name: 'Piezas y ubicaciones' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activar pieza Parachoque' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nueva pieza' }));
    const inputs = screen.getAllByRole('textbox', { name: 'Nombre de pieza' });
    fireEvent.change(inputs[inputs.length - 1], { target: { value: 'Nueva pieza de prueba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const input = vi.mocked(api.put).mock.calls[0][1] as UpdateDpConfigurationInput;
    expect(input.configuration.pieces.find((piece) => piece.id === 'parachoque')?.active).toBe(false);
    expect(input.configuration.pieces.some((piece) => piece.label === 'Nueva pieza de prueba')).toBe(true);
    expect(input.configuration.rates).toEqual(record().configuration.rates);
  });

  it('no consulta ni permite editar configuración a un jefe con permisos personalizados de administración', () => {
    useAuthStore.setState({ user: { id: 2, nombre: 'Jefe', email: 'jefe@unithor.cl', role: 'jefe', permissions: [{ modulo: 'admin', accion: 'read' }, { modulo: 'admin', accion: 'update' }] } });
    renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled();
    expect(api.get).not.toHaveBeenCalled();
  });
});
