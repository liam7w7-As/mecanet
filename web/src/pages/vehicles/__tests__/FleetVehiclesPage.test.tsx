import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import VehiclesPage from '../VehiclesPage';

import type {
  FleetDocument,
  FleetVehicle,
  FleetVehicleDetail,
  PaginatedResponse,
} from '../../../types/entities';
import type { CreateFleetVehicleInput, Role, UpdateFleetVehicleInput } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

const { listExportSpy } = vi.hoisted(() => ({ listExportSpy: vi.fn() }));

vi.mock('../../../components/common/ListExportButtons', () => ({
  default: (props: {
    target: string; filters: Record<string, unknown>; disabled?: boolean; includeOwner?: boolean;
  }) => {
    listExportSpy(props);
    return <div data-testid={`list-export-${props.target}`} />;
  },
}));

vi.mock('../../../lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const fleetVehicle: FleetVehicle = {
  id: 3,
  patente: 'FLAB12',
  codigoInterno: 'FLT-003',
  marca: 'Toyota',
  modelo: 'Hilux',
  ano: 2024,
  color: 'Blanco',
  vinChasis: 'VINFLOTA123',
  motor: null,
  kilometraje: 18400,
  combustible: 'diesel',
  transmision: 'manual',
  estadoOperativo: 'disponible',
  sucursal: 'Casa matriz',
  responsable: 'María Soto',
  propietario: 'Sociedad Propietaria Privada',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  documentSummary: {
    total: 1,
    expired: 0,
    expiringSoon: 1,
    nextExpiry: {
      documentId: 11,
      nombre: 'Revisión técnica',
      fechaVencimiento: '2026-11-02',
      state: 'critico',
      daysRemaining: 5,
    },
  },
};

const document: FleetDocument = {
  id: 11,
  fleetVehicleId: 3,
  nombre: 'Revisión técnica',
  referencia: 'RT-2026-011',
  notas: 'Renovar antes del viaje a regiones',
  fechaEmision: '2026-10-02',
  fechaVencimiento: '2026-11-02',
  archivoNombre: null,
  mimeType: null,
  sizeBytes: null,
  version: 0,
  tieneArchivo: false,
  subidoPor: null,
  expiry: { state: 'critico', daysRemaining: 5 },
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};

const fleetVehicleDetail: FleetVehicleDetail = {
  ...fleetVehicle,
  documents: [document],
};

const paginated = <T,>(items: T[]): PaginatedResponse<T> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  totalPages: items.length > 0 ? 1 : 0,
});

const renderFlota = (route = '/vehicles?tab=flota') => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/vehicles" element={<VehiclesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('FleetVehiclesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: {
        id: 1,
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/fleet-vehicles') {
        return Promise.resolve({ data: paginated([fleetVehicle]) } as AxiosResponse<
          PaginatedResponse<FleetVehicle>
        >);
      }
      if (url === '/fleet-vehicles/3') {
        return Promise.resolve({ data: { fleetVehicle: fleetVehicleDetail } } as AxiosResponse<{
          fleetVehicle: FleetVehicleDetail;
        }>);
      }
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
  });

  it('comparte búsqueda, estado y vencimiento con exportación y envía propietario solo al activarlo', async () => {
    renderFlota();
    await screen.findByText('FLAB12');
    expect(listExportSpy.mock.lastCall?.[0].includeOwner).toBe(false);
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado operativo' }), { target: { value: 'dado_de_baja' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Documentación' }), { target: { value: 'vencido' } });
    fireEvent.change(screen.getByPlaceholderText('Patente, código, marca, modelo o responsable'), { target: { value: 'FLAB' } });
    expect(listExportSpy.mock.lastCall?.[0].filters.search).toBeUndefined();
    await waitFor(() => {
      const props = listExportSpy.mock.lastCall?.[0];
      expect(props).toMatchObject({ target: 'fleet-vehicles', disabled: false, includeOwner: false,
        filters: { page: 1, pageSize: 20, search: 'FLAB', estado: 'dado_de_baja', vencimiento: 'vencido' },
      });
      expect(props.filters).toEqual(vi.mocked(api.get).mock.lastCall?.[1]?.params);
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar propietario' }));
    expect(listExportSpy.mock.lastCall?.[0].includeOwner).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar propietario' }));
    expect(listExportSpy.mock.lastCall?.[0].includeOwner).toBe(false);
  });

  it('mantiene la exportación de flota para lectura y exportación sin importar ni crear', async () => {
    useAuthStore.setState((state) => ({ user: { ...state.user!, role: 'jefe', permissions: [
      { modulo: 'flota', accion: 'read' }, { modulo: 'flota', accion: 'export' },
    ] } }));
    renderFlota();
    await screen.findByText('FLAB12');
    expect(screen.getByTestId('list-export-fleet-vehicles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo vehículo de flota' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Mostrar propietario' })).not.toBeInTheDocument();
    expect(listExportSpy.mock.lastCall?.[0]).toMatchObject({ disabled: false, includeOwner: false });
  });

  it('comparte la búsqueda del parque de taller y mantiene exportaciones sin permisos de escritura', async () => {
    useAuthStore.setState((state) => ({ user: { ...state.user!, role: 'mecanico', permissions: [
      { modulo: 'taller', accion: 'read' }, { modulo: 'taller', accion: 'export' },
    ] } }));
    vi.mocked(api.get).mockResolvedValue({ data: paginated([]) });
    renderFlota('/vehicles?tab=taller');
    await waitFor(() => expect(listExportSpy.mock.lastCall?.[0].disabled).toBe(false));
    expect(screen.getByTestId('list-export-vehicles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo vehículo' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Patente, marca, modelo o VIN'), { target: { value: 'ABCD' } });
    expect(listExportSpy.mock.lastCall?.[0].filters.search).toBeUndefined();
    await waitFor(() => {
      const props = listExportSpy.mock.lastCall?.[0];
      expect(props).toMatchObject({ target: 'vehicles', disabled: false,
        filters: { page: 1, pageSize: 20, search: 'ABCD' },
      });
      expect(props.filters).toEqual(vi.mocked(api.get).mock.lastCall?.[1]?.params);
    });
  });

  it('lista solo la flota interna con su estado y alerta documental', async () => {
    renderFlota();

    expect(await screen.findByText('FLAB12')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Flota/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const list = within(screen.getByRole('region', { name: 'Listado de vehículos de flota' }));
    expect(list.getByText('Disponible')).toBeInTheDocument();
    expect(list.getByText('Responsable')).toBeInTheDocument();
    expect(list.getByText('María Soto')).toBeInTheDocument();
    expect(list.getByText('Código FLT-003 · Casa matriz')).toBeInTheDocument();
    expect(list.getByText('1 por vencer en 30 días')).toBeInTheDocument();
    expect(list.getByText('02-11-2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/vehicles', expect.anything());
  });

  it.each([
    ['flota', 'fleet-vehicles'], ['taller', 'vehicles'],
  ])('deshabilita exportaciones de %s durante la carga y tras un error', async (tab, target) => {
    vi.mocked(api.get).mockRejectedValue(new Error('Sin conexión'));
    renderFlota(`/vehicles?tab=${tab}`);
    expect(listExportSpy.mock.lastCall?.[0]).toMatchObject({ target, disabled: true });
    await screen.findByRole('alert');
    expect(listExportSpy.mock.lastCall?.[0]).toMatchObject({ target, disabled: true });
  });

  it('abre la ficha de flota desde la URL y muestra documentos sin archivo', async () => {
    renderFlota();

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de FLAB12' }));

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Ficha del vehículo de flota' }),
    );
    expect(await dialog.findByRole('heading', { name: 'FLAB12' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/fleet-vehicles/3');
    expect(dialog.getByText('María Soto')).toBeInTheDocument();
    expect(dialog.getByText('Diésel')).toBeInTheDocument();
    expect(dialog.getByText('Manual')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('tab', { name: /Documentos/ }));
    expect(dialog.getByText('Revisión técnica')).toBeInTheDocument();
    expect(dialog.getByText('Vence en 5 días')).toBeInTheDocument();
    expect(dialog.getByText('Sin archivo')).toBeInTheDocument();
    expect(dialog.getAllByText('02-11-2026').length).toBeGreaterThan(0);
    const addDocument = dialog.getByRole('button', { name: 'Agregar documento' });
    addDocument.focus();
    fireEvent.click(addDocument);
    const documentForm = await screen.findByRole('dialog', { name: 'Agregar documento' });
    expect(within(documentForm).getByRole('combobox', { name: 'Nombre del documento' })).toHaveFocus();
    fireEvent.keyDown(documentForm, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Agregar documento' })).not.toBeInTheDocument();
    expect(addDocument).toHaveFocus();
    expect(dialog.getByRole('tab', { name: /Documentos/ })).toHaveAttribute('aria-selected', 'true');
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(['admin', 'desarrollador'] as const)(
    'oculta por defecto al propietario y permite mostrarlo bajo la patente en lista y ficha para %s',
    async (role) => {
      useAuthStore.setState((state) => ({ user: { ...state.user!, role } }));
      renderFlota();
      await screen.findByText('FLAB12');
      const checkbox = screen.getByRole('checkbox', { name: 'Mostrar propietario' });
      expect(checkbox).not.toBeChecked();
      expect(screen.queryByText(/Sociedad Propietaria Privada/)).not.toBeInTheDocument();

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de FLAB12' }));
      let dialog = within(await screen.findByRole('dialog', { name: 'Ficha del vehículo de flota' }));
      await dialog.findByRole('heading', { name: 'FLAB12' });
      expect(dialog.queryByText(/Sociedad Propietaria Privada/)).not.toBeInTheDocument();
      fireEvent.click(dialog.getByRole('button', { name: 'Cerrar ficha' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      fireEvent.click(checkbox);
      const plate = within(screen.getByRole('region', { name: 'Listado de vehículos de flota' })).getByText('FLAB12');
      expect(plate.nextElementSibling).toHaveTextContent('Propietario: Sociedad Propietaria Privada');
      fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha de FLAB12' }));
      dialog = within(await screen.findByRole('dialog', { name: 'Ficha del vehículo de flota' }));
      expect(await dialog.findByText('Propietario: Sociedad Propietaria Privada')).toBeInTheDocument();
      fireEvent.click(dialog.getByRole('button', { name: 'Cerrar ficha' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      fireEvent.click(checkbox);
      expect(screen.queryByText(/Sociedad Propietaria Privada/)).not.toBeInTheDocument();
    },
  );

  it.each<Role>(['jefe', 'mecanico', 'vendedor', 'bodeguero', 'finanzas'])(
    'protege propietario y controles de escritura para %s con solo lectura de flota',
    async (role) => {
      useAuthStore.setState((state) => ({ user: {
        ...state.user!, role, permissions: [{ modulo: 'flota', accion: 'read' }],
      } }));
      renderFlota();
      await screen.findByText('FLAB12');
      expect(screen.queryByRole('checkbox', { name: 'Mostrar propietario' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Sociedad Propietaria Privada/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nuevo vehículo de flota' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Editar FLAB12' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Eliminar FLAB12' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha de FLAB12' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Ficha del vehículo de flota' }));
      await dialog.findByRole('heading', { name: 'FLAB12' });
      expect(dialog.queryByText(/Sociedad Propietaria Privada/)).not.toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument();
      fireEvent.click(dialog.getByRole('tab', { name: /Documentos/ }));
      expect(dialog.getByText('Revisión técnica')).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Agregar documento' })).not.toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
      expect(api.patch).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(api.delete).not.toHaveBeenCalled();
    },
  );

  it('no expone el propietario al cambiar de usuario con el checkbox activado y la respuesta pendiente', async () => {
    renderFlota();
    await screen.findByText('FLAB12');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar propietario' }));
    expect(screen.getByText(/Sociedad Propietaria Privada/)).toBeInTheDocument();
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));

    act(() => useAuthStore.setState((state) => ({ user: {
      ...state.user!, id: 9, role: 'jefe', permissions: [{ modulo: 'flota', accion: 'read' }],
    } })));
    expect(screen.queryByText(/Sociedad Propietaria Privada/)).not.toBeInTheDocument();
    expect(screen.queryByText('FLAB12')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Mostrar propietario' })).not.toBeInTheDocument();

    act(() => useAuthStore.setState((state) => ({ user: { ...state.user!, id: 10, role: 'admin' } })));
    expect(screen.getByRole('checkbox', { name: 'Mostrar propietario' })).not.toBeChecked();
    expect(listExportSpy.mock.lastCall?.[0].includeOwner).toBe(false);
    expect(screen.queryByText(/Sociedad Propietaria Privada/)).not.toBeInTheDocument();
  });

  it('envía el filtro dado_de_baja y respeta el orden recibido antes de paginar', async () => {
    const retired: FleetVehicle = { ...fleetVehicle, id: 8, patente: 'ZZZZ12', estadoOperativo: 'dado_de_baja' };
    vi.mocked(api.get).mockResolvedValue({ data: paginated([fleetVehicle, retired]) });
    renderFlota();
    await screen.findByText('ZZZZ12');
    const list = within(screen.getByRole('region', { name: 'Listado de vehículos de flota' }));
    expect(list.getByText('Dado de baja')).toBeInTheDocument();
    expect(list.getAllByRole('button', { name: /Abrir ficha/ }).map((button) => button.getAttribute('aria-label')))
      .toEqual(['Abrir ficha de FLAB12', 'Abrir ficha de ZZZZ12']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado operativo' }), { target: { value: 'dado_de_baja' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/fleet-vehicles', {
      params: expect.objectContaining({ estado: 'dado_de_baja', page: 1, pageSize: 20 }),
    }));
  });

  it('mantiene un solo resumen desplegado y lo cierra al volver a pulsarlo', async () => {
    const second: FleetVehicle = { ...fleetVehicle, id: 9, patente: 'FLCD34' };
    vi.mocked(api.get).mockResolvedValue({ data: paginated([fleetVehicle, second]) });
    renderFlota();
    await screen.findByText('FLCD34');

    const firstDetails = screen.getByText('FLAB12').closest('details');
    const secondDetails = screen.getByText('FLCD34').closest('details');
    if (!firstDetails || !secondDetails) throw new Error('No se encontraron las filas');

    fireEvent.click(within(firstDetails).getByLabelText('Desplegar resumen de FLAB12'));
    expect(firstDetails).toHaveAttribute('open');
    expect(secondDetails).not.toHaveAttribute('open');

    fireEvent.click(within(secondDetails).getByLabelText('Desplegar resumen de FLCD34'));
    await waitFor(() => expect(firstDetails).not.toHaveAttribute('open'));
    expect(secondDetails).toHaveAttribute('open');

    fireEvent.click(within(secondDetails).getByLabelText('Desplegar resumen de FLCD34'));
    await waitFor(() => expect(secondDetails).not.toHaveAttribute('open'));
  });

  it('marca la fila completa según el estado operativo', async () => {
    const outOfService: FleetVehicle = {
      ...fleetVehicle, id: 10, patente: 'OOOO11', estadoOperativo: 'fuera_de_servicio',
    };
    const retired: FleetVehicle = {
      ...fleetVehicle, id: 11, patente: 'RRRR22', estadoOperativo: 'dado_de_baja',
    };
    vi.mocked(api.get).mockResolvedValue({
      data: paginated([fleetVehicle, outOfService, retired]),
    });
    renderFlota();
    await screen.findByText('OOOO11');

    expect(screen.getByText('OOOO11').closest('article')).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByText('RRRR22').closest('article')).toHaveAttribute('data-tone', 'muted');
    expect(screen.getByText('FLAB12').closest('article')).not.toHaveAttribute('data-tone');
  });

  it('crea con propietario privado separado del responsable externo y límites del contrato', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { fleetVehicle: fleetVehicleDetail } });
    renderFlota();
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo vehículo de flota' }));
    const form = within(await screen.findByRole('dialog', { name: 'Nuevo vehículo de flota' }));
    fireEvent.change(form.getByRole('textbox', { name: 'Patente' }), { target: { value: 'XYAB12' } });
    const owner = form.getByRole('textbox', { name: /^Propietario \(privado\)/ });
    const responsible = form.getByRole('textbox', { name: /^Responsable \/ encargado del vehículo/ });
    expect(owner).toHaveAttribute('maxlength', '180');
    expect(responsible).toHaveAttribute('maxlength', '120');
    expect(responsible).toHaveAccessibleDescription(/encargado, taller o rentacar/);
    fireEvent.change(owner, { target: { value: '  Empresa Arrendadora  ' } });
    fireEvent.change(responsible, { target: { value: 'Taller externo Juan' } });
    fireEvent.click(form.getByRole('button', { name: 'Crear vehículo de flota' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/fleet-vehicles', expect.objectContaining({
      patente: 'XYAB12', propietario: 'Empresa Arrendadora', responsable: 'Taller externo Juan',
    })));
  });

  it.each(['admin', 'desarrollador'] as const)('permite a %s borrar un propietario existente enviando null', async (role) => {
    useAuthStore.setState((state) => ({ user: { ...state.user!, role } }));
    vi.mocked(api.patch).mockResolvedValue({ data: { fleetVehicle: { ...fleetVehicleDetail, propietario: null } } });
    renderFlota();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar FLAB12' }));
    const form = within(await screen.findByRole('dialog', { name: 'Editar vehículo de flota' }));
    fireEvent.change(form.getByRole('textbox', { name: /^Propietario \(privado\)/ }), { target: { value: '   ' } });
    fireEvent.click(form.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/fleet-vehicles/3', expect.objectContaining({ propietario: null })));
  });

  it.each(['create', 'update'] as const)('omite la clave propietario para un encargado con permiso de %s', async (action) => {
    useAuthStore.setState((state) => ({ user: {
      ...state.user!, role: 'jefe', permissions: [{ modulo: 'flota', accion: 'read' }, { modulo: 'flota', accion: action }],
    } }));
    vi.mocked(api.post).mockResolvedValue({ data: { fleetVehicle: fleetVehicleDetail } });
    vi.mocked(api.patch).mockResolvedValue({ data: { fleetVehicle: fleetVehicleDetail } });
    renderFlota();
    fireEvent.click(await screen.findByRole('button', { name: action === 'create' ? 'Nuevo vehículo de flota' : 'Editar FLAB12' }));
    const form = within(await screen.findByRole('dialog', { name: action === 'create' ? 'Nuevo vehículo de flota' : 'Editar vehículo de flota' }));
    expect(form.queryByRole('textbox', { name: /Propietario/ })).not.toBeInTheDocument();
    if (action === 'create') fireEvent.change(form.getByRole('textbox', { name: 'Patente' }), { target: { value: 'XYAB12' } });
    fireEvent.click(form.getByRole('button', { name: action === 'create' ? 'Crear vehículo de flota' : 'Guardar cambios' }));
    const request = action === 'create' ? vi.mocked(api.post) : vi.mocked(api.patch);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][1]).not.toHaveProperty('propietario');
  });

  it.each(['', 'Venta del vehículo'])('da de baja con flota.update, motivo opcional %j y conserva documentos, archivos y versiones', async (motivo) => {
    useAuthStore.setState((state) => ({ user: {
      ...state.user!, role: 'jefe', permissions: [{ modulo: 'flota', accion: 'read' }, { modulo: 'flota', accion: 'update' }],
    } }));
    const fileDocument: FleetDocument = {
      ...document, tieneArchivo: true, version: 2, archivoNombre: 'revision.pdf', mimeType: 'application/pdf', sizeBytes: 2048,
    };
    let detail: FleetVehicleDetail = { ...fleetVehicleDetail, documents: [fileDocument] };
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/fleet-vehicles') return { data: paginated([detail]) } as AxiosResponse;
      if (url === '/fleet-vehicles/3') return { data: { fleetVehicle: detail } } as AxiosResponse;
      if (url === '/fleet-vehicles/3/documents/11/versions') return { data: { current: fileDocument, versions: [] } } as AxiosResponse;
      throw new Error(`Ruta no simulada: ${url}`);
    });
    vi.mocked(api.patch).mockImplementation(async () => {
      detail = { ...detail, estadoOperativo: 'dado_de_baja', fechaBaja: '2026-11-10T15:30:00.000Z', motivoBaja: motivo || null };
      return { data: { fleetVehicle: detail } } as AxiosResponse;
    });
    renderFlota();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de FLAB12' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Ficha del vehículo de flota' }));
    fireEvent.click(await dialog.findByRole('button', { name: 'Editar ficha' }));
    const form = within(await screen.findByRole('dialog', { name: 'Editar vehículo de flota' }));
    fireEvent.change(form.getByRole('combobox', { name: 'Estado operativo' }), { target: { value: 'dado_de_baja' } });
    expect(form.getByText(/Su ficha, documentos y versiones se conservarán/)).toBeInTheDocument();
    const reason = form.getByRole('textbox', { name: 'Motivo de baja (opcional)' });
    expect(reason).toHaveAttribute('maxlength', '500');
    if (motivo) fireEvent.change(reason, { target: { value: `  ${motivo}  ` } });
    fireEvent.click(form.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.patch).mock.calls[0][1] as UpdateFleetVehicleInput;
    expect(payload).toMatchObject({ estadoOperativo: 'dado_de_baja', motivoBaja: motivo || null });
    expect(payload).not.toHaveProperty('propietario');
    expect(payload).not.toHaveProperty('fechaBaja');
    expect(payload).not.toHaveProperty('documents');
    expect(await dialog.findByText('Dado de baja')).toBeInTheDocument();
    expect(dialog.getByText('10-11-2026')).toBeInTheDocument();
    expect(dialog.getByText(motivo || 'Sin motivo registrado')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('tab', { name: /Documentos/ }));
    expect(dialog.getByText('Revisión técnica')).toBeInTheDocument();
    expect(dialog.getByText('revision.pdf')).toBeInTheDocument();
    expect(dialog.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/api/fleet-vehicles/3/documents/11/file');
    expect(dialog.getByRole('link', { name: 'Descargar' })).toHaveAttribute('href', '/api/fleet-vehicles/3/documents/11/file?download=1');
    fireEvent.click(dialog.getByRole('button', { name: 'Versiones' }));
    expect(await screen.findByRole('dialog', { name: 'Historial de versiones' })).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('crea un vehículo ya dado de baja sin enviar fecha y con propietario vacío como null', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { fleetVehicle: fleetVehicleDetail } });
    renderFlota();
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo vehículo de flota' }));
    const form = within(await screen.findByRole('dialog', { name: 'Nuevo vehículo de flota' }));
    fireEvent.change(form.getByRole('textbox', { name: 'Patente' }), { target: { value: 'XYAB12' } });
    fireEvent.change(form.getByRole('combobox', { name: 'Estado operativo' }), { target: { value: 'dado_de_baja' } });
    fireEvent.click(form.getByRole('button', { name: 'Crear vehículo de flota' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.post).mock.calls[0][1] as CreateFleetVehicleInput;
    expect(payload).toMatchObject({ patente: 'XYAB12', estadoOperativo: 'dado_de_baja', motivoBaja: null, propietario: null });
    expect(payload).not.toHaveProperty('fechaBaja');
  });

  it('reactiva con update sin borrar el motivo ni la fecha de la última baja', async () => {
    const retired: FleetVehicleDetail = {
      ...fleetVehicleDetail, estadoOperativo: 'dado_de_baja', fechaBaja: '2026-11-10T15:30:00.000Z', motivoBaja: 'Retiro temporal',
    };
    let detail = retired;
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/fleet-vehicles' ? paginated([detail]) : { fleetVehicle: detail } } as AxiosResponse));
    vi.mocked(api.patch).mockImplementation(async () => {
      detail = { ...retired, estadoOperativo: 'disponible' };
      return { data: { fleetVehicle: detail } } as AxiosResponse;
    });
    renderFlota();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de FLAB12' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Ficha del vehículo de flota' }));
    fireEvent.click(await dialog.findByRole('button', { name: 'Editar ficha' }));
    const form = within(await screen.findByRole('dialog', { name: 'Editar vehículo de flota' }));
    expect(form.getByRole('textbox', { name: 'Motivo de baja (opcional)' })).toHaveValue('Retiro temporal');
    fireEvent.change(form.getByRole('combobox', { name: 'Estado operativo' }), { target: { value: 'disponible' } });
    expect(form.queryByRole('textbox', { name: 'Motivo de baja (opcional)' })).not.toBeInTheDocument();
    fireEvent.click(form.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.patch).mock.calls[0][1]).toMatchObject({ estadoOperativo: 'disponible' });
    expect(vi.mocked(api.patch).mock.calls[0][1]).not.toHaveProperty('motivoBaja');
    expect(vi.mocked(api.patch).mock.calls[0][1]).not.toHaveProperty('fechaBaja');
    expect(await dialog.findByText('Disponible')).toBeInTheDocument();
    expect(dialog.getByText('10-11-2026')).toBeInTheDocument();
    expect(dialog.getByText('Retiro temporal')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('tab', { name: /Documentos/ }));
    expect(dialog.getByText('Revisión técnica')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Agregar documento' })).toBeInTheDocument();
  });
});
