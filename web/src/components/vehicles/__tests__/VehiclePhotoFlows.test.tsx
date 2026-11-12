import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fleetVehicleKeys } from '../../../hooks/useFleetVehicles';
import { vehicleKeys } from '../../../hooks/useVehicles';
import { api } from '../../../lib/api';
import VehicleDetailPage from '../../../pages/vehicles/VehicleDetailPage';
import { useAuthStore } from '../../../stores/auth.store';
import FleetVehicleDetail from '../../fleet/FleetVehicleDetail';
import FleetVehicleFormModal from '../../fleet/FleetVehicleFormModal';
import VehicleFormModal from '../VehicleFormModal';

import type { FleetVehicleDetail as FleetVehicle, Vehicle } from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

const admin = { id: 1, role: 'admin' as const, nombre: 'Admin', email: 'admin@example.test' };
const base: Vehicle = {
  id: 12, patente: 'ABCD12', marca: 'Toyota', modelo: 'Hilux', ano: 2024, color: null,
  vinChasis: null, motor: null, kilometraje: 1000, combustible: null, transmision: null,
  clientId: null, createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z',
};
const fleetBase: FleetVehicle = {
  ...base, codigoInterno: null, estadoOperativo: 'disponible', sucursal: null, responsable: null,
  documentSummary: { total: 0, expired: 0, expiringSoon: 0, nextExpiry: null }, documents: [],
};
const photo = () => new File(['photo'], 'vehiculo.png', { type: 'image/png' });
const failure = { isAxiosError: true, response: { status: 503, data: { error: { message: 'Almacenamiento no disponible' } } } };
const deferred = () => {
  let resolve!: (response: AxiosResponse) => void;
  const promise = new Promise<AxiosResponse>((done) => { resolve = done; });
  return { promise, resolve };
};
let client: QueryClient;
let onClose: ReturnType<typeof vi.fn>;
let onSaved: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  useAuthStore.setState({ user: admin, isAuthenticated: true, isLoading: false });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:vehicle-preview');
    static revokeObjectURL = vi.fn();
  });
  vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } });
  onClose = vi.fn(); onSaved = vi.fn();
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

for (const fleet of [false, true]) {
  describe(fleet ? 'Fotos Flota' : 'Fotos Taller', () => {
    const route = fleet ? '/fleet-vehicles' : '/vehicles';
    const modulo = fleet ? 'flota' : 'taller';
    const record = fleet ? fleetBase : base;
    const response = (extra = {}) => ({ data: { [fleet ? 'fleetVehicle' : 'vehicle']: { ...record, ...extra } } });
    const detailKey = () => fleet ? fleetVehicleKeys.detail(12, admin) : vehicleKeys.detail(12);
    const listKey = () => fleet ? fleetVehicleKeys.list({}, admin) : vehicleKeys.list({});
    const renderForm = (editing = false) => render(
      <QueryClientProvider client={client}>
        {fleet
          ? <FleetVehicleFormModal vehicle={editing ? fleetBase : null} onClose={onClose} onSaved={onSaved} />
          : <VehicleFormModal vehicle={editing ? base : null} onClose={onClose} onSaved={onSaved} />}
      </QueryClientProvider>,
    );
    const submit = () => fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    const choosePhoto = (file = photo()) => {
      fireEvent.change(screen.getByLabelText('Seleccionar foto del vehículo'), { target: { files: [file] } });
      return file;
    };

    it.each([false, true])('conserva archivo y datos tras fallo de foto; reintenta sin repetir alta/edición (edit=%s)', async (editing) => {
      vi.mocked(api.post).mockImplementation(async (url) => {
        if (url === route) return response();
        throw failure;
      });
      vi.mocked(api.patch).mockResolvedValue(response());
      const view = renderForm(editing);
      if (!editing) fireEvent.change(screen.getByRole('textbox', { name: 'Patente' }), { target: { value: 'abcd12' } });
      const file = choosePhoto();
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent('Almacenamiento no disponible');
      expect(onClose).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
      expect(screen.getByRole('img', { name: 'Vista previa del vehículo' })).toHaveAttribute('src', 'blob:vehicle-preview');
      expect(screen.getByRole('status')).toHaveTextContent('ya están guardados');
      const next = { fotoUrl: `/api${route}/12/foto?v=new-photo` };
      vi.mocked(api.post).mockResolvedValue(response(next));
      client.setQueryData(listKey(), { items: [record] });
      submit();
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(api.patch).toHaveBeenCalledTimes(editing ? 1 : 0);
      const posts = vi.mocked(api.post).mock.calls;
      expect(posts.filter(([url]) => url === route)).toHaveLength(editing ? 0 : 1);
      const uploads = posts.filter(([url]) => url === `${route}/12/foto`);
      expect(uploads).toHaveLength(2);
      expect((uploads[1][1] as FormData).get('foto')).toBe(file);
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining(next));
      expect(client.getQueryData(detailKey())).toMatchObject(next);
      expect(client.getQueryState(listKey())?.isInvalidated).toBe(true);
      view.unmount();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vehicle-preview');
    });

    it('bloquea submit, cierre, Escape y campos durante la foto y evita doble envío', async () => {
      const pending = deferred();
      vi.mocked(api.post).mockImplementation((url) => url === route ? Promise.resolve(response()) : pending.promise);
      renderForm();
      fireEvent.change(screen.getByRole('textbox', { name: 'Patente' }), { target: { value: 'ab1234' } });
      choosePhoto(); submit();
      await waitFor(() => expect(api.post).toHaveBeenCalledWith(`${route}/12/foto`, expect.any(FormData), expect.anything()));
      expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
      expect(screen.getByLabelText('Seleccionar foto del vehículo')).toBeDisabled();
      expect(screen.getByRole('textbox', { name: 'Patente' })).toBeDisabled();
      fireEvent.keyDown(document, { key: 'Escape' }); submit();
      expect(onClose).not.toHaveBeenCalled(); expect(api.post).toHaveBeenCalledTimes(2);
      await act(async () => pending.resolve(response({ fotoUrl: `/api${route}/12/foto?v=one` }) as AxiosResponse));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('permite crear sin update, pero deshabilita fotos y no llama a su endpoint', async () => {
      useAuthStore.setState({ user: { ...admin, role: 'jefe', permissions: [{ modulo, accion: 'create' }] } });
      vi.mocked(api.post).mockResolvedValue(response());
      renderForm();
      expect(screen.getByLabelText('Seleccionar foto del vehículo')).toBeDisabled();
      fireEvent.change(screen.getByRole('textbox', { name: 'Patente' }), { target: { value: 'abcd12' } });
      submit();
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(api.post).toHaveBeenCalledTimes(1); expect(api.post).toHaveBeenCalledWith(route, expect.objectContaining({ patente: fleet ? 'ABCD-12' : 'ABCD12' }));
    });

    it('respeta permisos reales al editar aunque se abra el formulario directamente', () => {
      useAuthStore.setState({ user: { ...admin, role: 'jefe', permissions: [{ modulo, accion: 'create' }] } });
      renderForm(true); submit();
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
      expect(api.patch).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
    });

    it('reintenta quitar la foto sin repetir la actualización de datos', async () => {
      const withPhoto = { ...record, fotoUrl: `/api${route}/12/foto?v=old` };
      vi.mocked(api.patch).mockResolvedValue(response({ fotoUrl: withPhoto.fotoUrl }));
      vi.mocked(api.delete).mockRejectedValueOnce(failure).mockResolvedValueOnce(response({ fotoUrl: null }));
      render(<QueryClientProvider client={client}>{fleet
        ? <FleetVehicleFormModal vehicle={withPhoto as FleetVehicle} onClose={onClose} onSaved={onSaved} />
        : <VehicleFormModal vehicle={withPhoto as Vehicle} onClose={onClose} onSaved={onSaved} />}</QueryClientProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' })); submit();
      expect(await screen.findByRole('alert')).toHaveTextContent('Almacenamiento no disponible');
      expect(screen.queryByRole('img', { name: 'Vista previa del vehículo' })).not.toBeInTheDocument();
      submit();
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(api.patch).toHaveBeenCalledTimes(1); expect(api.delete).toHaveBeenCalledTimes(2);
      expect(client.getQueryData(detailKey())).toMatchObject({ fotoUrl: null });
    });

    it('actualiza el mismo registro si se cambian datos después de una subida fallida', async () => {
      vi.mocked(api.post).mockImplementation(async (url) => { if (url === route) return response(); throw failure; });
      vi.mocked(api.patch).mockResolvedValue(response({ marca: 'Ford' }));
      renderForm();
      fireEvent.change(screen.getByRole('textbox', { name: 'Patente' }), { target: { value: 'abcd12' } });
      choosePhoto(); submit(); await screen.findByRole('alert');
      fireEvent.change(screen.getByRole('textbox', { name: 'Marca' }), { target: { value: 'Ford' } });
      vi.mocked(api.post).mockResolvedValue(response({ marca: 'Ford', fotoUrl: `/api${route}/12/foto?v=two` }));
      submit(); await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(api.patch).toHaveBeenCalledWith(`${route}/12`, expect.objectContaining({ marca: 'Ford' }));
      expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === route)).toHaveLength(1);
    });

    it('formatea automáticamente ambas patentes chilenas y conserva la extranjera', () => {
      renderForm();
      const plate = screen.getByRole('textbox', { name: 'Patente' });
      fireEvent.change(plate, { target: { value: 'abcd12' } }); expect(plate).toHaveValue('ABCD-12');
      fireEvent.change(plate, { target: { value: 'ab1234' } }); expect(plate).toHaveValue('AB-1234');
      fireEvent.blur(plate); expect(plate).toHaveValue('AB-1234');
      fireEvent.click(screen.getByRole('checkbox', { name: /Patente extranjera/ }));
      fireEvent.change(plate, { target: { value: 'abc-123-xyz' } });
      fireEvent.blur(plate); expect(plate).toHaveValue('ABC-123-XYZ');
    });

    it('valida formato/tamaño y revoca previews al reemplazar, quitar y salir', () => {
      const view = renderForm(true);
      choosePhoto(new File(['not a photo'], 'script.svg', { type: 'image/svg+xml' }));
      expect(screen.getByRole('alert')).toHaveTextContent('hasta 8 MB');
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      choosePhoto(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' }));
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      choosePhoto(); choosePhoto(photo());
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
      choosePhoto(); view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    });

    it('la ficha conserva el archivo para reintentar, bloquea quitar/subir simultáneos y usa el src versionado', async () => {
      let current: Vehicle | FleetVehicle = { ...record, fotoUrl: `/api${route}/12/foto?v=old` };
      vi.mocked(api.get).mockImplementation(async (url) => url === `${route}/12`
        ? { data: { [fleet ? 'fleetVehicle' : 'vehicle']: current } }
        : { data: { items: [], total: 0 } });
      const pending = deferred();
      vi.mocked(api.post).mockRejectedValueOnce(failure).mockReturnValueOnce(pending.promise);
      render(<QueryClientProvider client={client}><MemoryRouter>{fleet
        ? <FleetVehicleDetail vehicleId={12} onClose={onClose} />
        : <VehicleDetailPage vehicleId={12} onClose={onClose} />}</MemoryRouter></QueryClientProvider>);
      const input = await screen.findByLabelText('Seleccionar foto del vehículo');
      expect(screen.getByRole('img', { name: 'Foto de ABCD-12' })).toHaveAttribute('src', expect.stringContaining(`/api${route}/12/foto?v=old`));
      const file = photo(); fireEvent.change(input, { target: { files: [file] } });
      expect(await screen.findByRole('alert')).toHaveTextContent('Almacenamiento no disponible');
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar foto' }));
      expect(screen.getByRole('button', { name: 'Quitar' })).toBeDisabled(); expect(input).toBeDisabled();
      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
      expect((vi.mocked(api.post).mock.calls[1][1] as FormData).get('foto')).toBe(file);
      current = { ...current, fotoUrl: `/api${route}/12/foto?v=new` };
      await act(async () => pending.resolve({ data: { [fleet ? 'fleetVehicle' : 'vehicle']: current } } as AxiosResponse));
      await waitFor(() => expect(screen.getByRole('img', { name: 'Foto de ABCD-12' })).toHaveAttribute('src', current.fotoUrl));
      expect(screen.queryByRole('button', { name: 'Reintentar foto' })).not.toBeInTheDocument();
      vi.mocked(api.delete).mockRejectedValueOnce(failure).mockImplementationOnce(async () => {
        current = { ...current, fotoUrl: null }; return response({ fotoUrl: null });
      });
      fireEvent.click(screen.getByRole('button', { name: 'Quitar' })); await screen.findByRole('alert');
      expect(screen.getByRole('img', { name: 'Foto de ABCD-12' })).toHaveAttribute('src', expect.stringContaining('v=new'));
      fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
      await waitFor(() => expect(screen.queryByRole('img', { name: 'Foto de ABCD-12' })).not.toBeInTheDocument());
    });
  });
}
