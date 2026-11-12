import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ListExportButtons from '../../../components/common/ListExportButtons';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WarehousesPage from '../WarehousesPage';

import type {
  PaginatedResponse,
  StockBalance,
  StockMovement,
  Warehouse,
  WarehouseWorkOrderRequest,
} from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../components/common/ListExportButtons', () => ({
  default: vi.fn(({ target, disabled }: { target: string; disabled?: boolean }) => (
    <button type="button" data-testid={`export-${target}`} disabled={disabled}>Exportar {target}</button>
  )),
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

const warehouse: Warehouse = {
  id: 1,
  codigo: 'CENTRAL',
  nombre: 'Bodega Central',
  direccion: null,
  activo: true,
  totalItems: 1,
  totalUnidades: 10,
};

const balance: StockBalance = {
  warehouseId: 1,
  catalogItemId: 7,
  cantidad: 10,
  codigo: 'UNT101',
  nombre: 'Kit Hilux GR',
  precio: 0,
  stockMinimo: 2,
  bajoMinimo: false,
};

const movement: StockMovement = {
  id: 3,
  catalogItemId: 7,
  warehouseId: 1,
  tipo: 'ingreso',
  cantidad: 10,
  saldoResultante: 10,
  motivo: 'Saldo inicial',
  referencia: 'MIGRACION-030',
  createdBy: 1,
  fecha: '2026-09-23T10:00:00.000Z',
  codigo: 'UNT101',
  nombre: 'Kit Hilux GR',
  warehouseCodigo: 'CENTRAL',
  warehouseNombre: 'Bodega Central',
};

const emptyRequests: PaginatedResponse<WarehouseWorkOrderRequest> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
};

const approvedRequest: WarehouseWorkOrderRequest = {
  id: 41,
  workOrderId: 9,
  workOrderItemId: 71,
  catalogItemId: 7,
  estado: 'aprobada',
  motivo: 'Se detectó desgaste durante el desmontaje',
  cantidad: 2,
  precioAprobado: 15000,
  createdAt: '2026-09-23T09:00:00.000Z',
  reviewedAt: '2026-09-23T10:00:00.000Z',
  deliveredAt: null,
  deliveryNote: null,
  workOrder: {
    id: 9,
    codigo: 'OT-2026-0041',
    estado: 'en_progreso',
    client: { id: 3, nombre: 'Cliente Taller' },
    vehicle: { id: 5, patente: 'ABCD12', marca: 'Toyota', modelo: 'Hilux' },
    mechanic: { id: 8, nombre: 'Mecánico Uno' },
  },
  catalogItem: { id: 7, codigo: 'UNT101', nombre: 'Kit Hilux GR', stock: 10 },
  requester: { id: 8, nombre: 'Mecánico Uno' },
  reviewer: { id: 1, nombre: 'Jefe Taller' },
  deliveredWarehouse: null,
  deliverer: null,
};

const renderPage = (route = '/warehouses') => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <WarehousesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const exportProps = (target: string) => vi.mocked(ListExportButtons).mock.calls
  .filter(([props]) => props.target === target).at(-1)![0];

describe('WarehousesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      if (url === '/warehouses') {
        return Promise.resolve({
          data: {
            items: [warehouse],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance] } } as AxiosResponse<{
          balances: StockBalance[];
        }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: {
            items: [movement],
            total: 1,
            page: 1,
            pageSize: 15,
            totalPages: 1,
          } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      if (url === '/warehouses/requests') {
        return Promise.resolve({ data: emptyRequests } as AxiosResponse<
          PaginatedResponse<WarehouseWorkOrderRequest>
        >);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
  });

  it('muestra almacenes, saldos y kardex', async () => {
    renderPage();

    expect(await screen.findByText('Bodega Central')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Historial de movimientos', { exact: true }));
    expect(await screen.findByText('CENTRAL')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Stock de CENTRAL')).getByText('Kit Hilux GR'),
    ).toBeInTheDocument();
    expect(screen.getByText('Saldo inicial')).toBeInTheDocument();
    expect(screen.getByText('Ingreso')).toBeInTheDocument();
  });

  it('conserva el movimiento pendiente y bloquea guardar si se retira almacen:create', async () => {
    useAuthStore.setState({ user: { id: 8, nombre: 'Bodega', email: 'bodega@test.local', role: 'bodeguero' } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar movimiento de Kit Hilux GR' }, { timeout: 5000 }));
    const dialog = within(screen.getByRole('dialog', { name: 'Movimiento de inventario' }));
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'Ingreso pendiente de proveedor' } });
    act(() => useAuthStore.setState({ user: { ...useAuthStore.getState().user!, permissions: [{ modulo: 'almacen', accion: 'read' }] } }));
    expect(dialog.getByLabelText('Motivo')).toHaveValue('Ingreso pendiente de proveedor');
    expect(dialog.getByRole('button', { name: 'Guardar movimiento' })).toBeDisabled();
    fireEvent.submit(dialog.getByRole('button', { name: 'Guardar movimiento' }).closest('form')!);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('ubica cada exportación junto a su listado sin depender de la creación', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Consulta', email: 'consulta@demo.cl', role: 'bodeguero',
      permissions: [{ modulo: 'almacen', accion: 'read' }, { modulo: 'almacen', accion: 'export' }] } });
    renderPage('/warehouses?tab=requests');
    await within(await screen.findByRole('region', { name: 'Stock de CENTRAL' })).findByText('Kit Hilux GR');
    expect(screen.queryByRole('button', { name: 'Nuevo almacén' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Almacenes' })).toContainElement(screen.getByTestId('export-warehouses'));
    expect(exportProps('warehouses').filters).toEqual(vi.mocked(api.get).mock.calls
      .find(([url]) => url === '/warehouses')![1]!.params);
    expect(screen.getByRole('region', { name: 'Stock de CENTRAL' })).toContainElement(screen.getByTestId('export-stock-balances'));
    expect(screen.getByTestId('export-stock-balances')).toBeEnabled();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar en stock' }), { target: { value: '  KIT Hilux  ' } });
    expect(exportProps('stock-balances').filters).toEqual({ warehouseId: 1, search: 'kit hilux' });
    expect(within(screen.getByRole('region', { name: 'Stock de CENTRAL' })).getByText('Kit Hilux GR')).toBeInTheDocument();
    expect(exportProps('warehouses').filters).toEqual({ page: 1, pageSize: 100 });
    const requests = screen.getByLabelText('Solicitudes de repuestos para órdenes de trabajo');
    expect(requests).toContainElement(screen.getByTestId('export-warehouse-requests'));
    fireEvent.click(within(requests).getByRole('button', { name: 'Entregados' }));
    fireEvent.change(within(requests).getByLabelText('Buscar solicitud de repuesto'), { target: { value: 'OT-0041' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/warehouses/requests', { params: {
      page: 1, pageSize: 20, estado: 'entregada', search: 'OT-0041',
    } }));
    expect(exportProps('warehouse-requests').filters).toEqual(vi.mocked(api.get).mock.calls
      .filter(([url]) => url === '/warehouses/requests').at(-1)![1]!.params);
  });

  it('reutiliza el filtro del kardex y deshabilita exportar rangos inválidos', async () => {
    renderPage();
    await within(await screen.findByRole('region', { name: 'Stock de CENTRAL' })).findByText('Kit Hilux GR');
    const history = screen.getByLabelText('Kardex de movimientos');
    fireEvent.click(within(history).getByText('Historial de movimientos', { exact: true }));
    expect(history).toContainElement(screen.getByTestId('export-stock-movements'));
    fireEvent.change(within(history).getByLabelText('Fecha desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(within(history).getByLabelText('Fecha hasta'), { target: { value: '2026-09-30' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/warehouses/movements/all', { params: {
      page: 1, pageSize: 15, warehouseId: 1, fechaDesde: '2026-09-01', fechaHasta: '2026-09-30',
    } }));
    expect(exportProps('stock-movements').filters).toEqual(vi.mocked(api.get).mock.calls
      .filter(([url]) => url === '/warehouses/movements/all').at(-1)![1]!.params);
    expect(screen.getByTestId('export-stock-movements')).toBeEnabled();
    fireEvent.change(within(history).getByLabelText('Fecha hasta'), { target: { value: '2026-08-31' } });
    expect(screen.getByTestId('export-stock-movements')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha desde no puede ser posterior');
  });

  it('marca los saldos bajo el mínimo configurado', async () => {
    const lowBalance: StockBalance = {
      ...balance,
      catalogItemId: 8,
      cantidad: 1,
      codigo: 'UNT102',
      nombre: 'Filtro aceite',
      stockMinimo: 5,
      bajoMinimo: true,
    };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: {
            items: [warehouse],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance, lowBalance] } } as AxiosResponse<{
          balances: StockBalance[];
        }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 15,
            totalPages: 0,
          } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      if (url === '/warehouses/requests') {
        return Promise.resolve({ data: emptyRequests } as AxiosResponse<
          PaginatedResponse<WarehouseWorkOrderRequest>
        >);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    renderPage();
    await screen.findByText('Filtro aceite');

    expect(screen.getAllByText('Bajo mínimo').length).toBeGreaterThanOrEqual(1);
  });

  it('abre y enfoca el despacho desde tab=requests y permite volver a plegarlo', async () => {
    renderPage('/warehouses?tab=requests');
    const dispatch = screen.getByLabelText('Solicitudes de repuestos para órdenes de trabajo');
    const summary = screen.getByText('Despacho a órdenes de trabajo', { exact: true }).closest('summary');
    expect(dispatch).toHaveAttribute('open');
    expect(summary).toHaveFocus();
    fireEvent.click(summary!);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar en stock' }), {
      target: { value: 'Filtro' },
    });
    await screen.findByText('Bodega Central');
    expect(dispatch).not.toHaveAttribute('open');
  });

  it.each(['/warehouses', '/warehouses?tab=stock'])(
    'mantiene el despacho plegado al entrar por %s',
    async (route) => {
      renderPage(route);
      await screen.findByText('Bodega Central');
      expect(screen.getByLabelText('Solicitudes de repuestos para órdenes de trabajo'))
        .not.toHaveAttribute('open');
    },
  );

  it('entrega una solicitud aprobada desde la segunda bodega seleccionada', async () => {
    const second: Warehouse = { ...warehouse, id: 2, codigo: 'NORTE', nombre: 'Bodega Norte' };
    useAuthStore.setState({
      user: { id: 9, nombre: 'Bodega', email: 'bodega@demo.cl', role: 'bodeguero' },
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: {
            items: [warehouse, second],
            total: 2,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance] } } as AxiosResponse<{
          balances: StockBalance[];
        }>);
      }
      if (url === '/warehouses/2/balances') {
        return Promise.resolve({
          data: { balances: [{ ...balance, warehouseId: 2, cantidad: 6 }] },
        } as AxiosResponse<{ balances: StockBalance[] }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 15,
            totalPages: 0,
          } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      if (url === '/warehouses/requests') {
        return Promise.resolve({
          data: { items: [approvedRequest], total: 1, page: 1, pageSize: 20, totalPages: 1 },
        } as AxiosResponse<PaginatedResponse<WarehouseWorkOrderRequest>>);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({
      data: {
        request: {
          ...approvedRequest,
          estado: 'entregada',
          deliveredWarehouse: second,
          deliveredAt: '2026-09-23T11:00:00.000Z',
        } as WarehouseWorkOrderRequest,
      },
    } as AxiosResponse<{ request: WarehouseWorkOrderRequest }>);

    renderPage();
    await screen.findByText('Bodega Norte');
    fireEvent.change(screen.getByRole('combobox', { name: 'Seleccionar almacén' }), {
      target: { value: '2' },
    });
    expect(exportProps('stock-balances').filters).toEqual({ warehouseId: 2, search: undefined });
    expect(exportProps('stock-movements').filters).toEqual(expect.objectContaining({ warehouseId: 2 }));
    fireEvent.click(screen.getByText('Despacho a órdenes de trabajo', { exact: true }));
    expect(await screen.findByText('OT-2026-0041')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entregar' }));
    expect(
      await screen.findByRole('dialog', { name: 'Confirmar entrega de repuesto' }),
    ).toBeInTheDocument();
    const dialog = within(screen.getByRole('dialog', { name: 'Confirmar entrega de repuesto' }));
    expect(dialog.getByRole('combobox', { name: 'Almacén de salida' })).toHaveValue('2');
    expect(await dialog.findByText('4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/warehouses/requests/41/deliver', {
        warehouseId: 2,
        comentario: undefined,
      });
    });
  });

  it('pide elegir un almacén si el seleccionado está inactivo y conserva la validación de stock', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation();
    const second: Warehouse = { ...warehouse, id: 2, codigo: 'NORTE', nombre: 'Bodega Norte' };
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: { items: [{ ...warehouse, activo: false }, second], total: 2, page: 1, pageSize: 100, totalPages: 1 },
        } as AxiosResponse);
      }
      if (url === '/warehouses/requests') {
        return Promise.resolve({
          data: { ...emptyRequests, items: [approvedRequest], total: 1, totalPages: 1 },
        } as AxiosResponse);
      }
      if (url === '/warehouses/2/balances') {
        return Promise.resolve({
          data: { balances: [{ ...balance, warehouseId: 2, cantidad: 1 }] },
        } as AxiosResponse);
      }
      return baseGet?.(url, config) ?? Promise.reject(new Error('GET inesperado'));
    });

    renderPage('/warehouses?tab=requests');
    await screen.findByText('Bodega Norte');
    fireEvent.click(await screen.findByRole('button', { name: 'Entregar' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Confirmar entrega de repuesto' }));
    const source = dialog.getByRole('combobox', { name: 'Almacén de salida' });
    expect(source).toHaveValue('');
    expect(dialog.queryByRole('option', { name: /CENTRAL/ })).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Confirmar entrega' })).toBeDisabled();
    fireEvent.change(source, { target: { value: '2' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/warehouses/2/balances'));
    expect(await dialog.findByText('-1')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Confirmar entrega' })).toBeDisabled();
    fireEvent.click(dialog.getByRole('button', { name: 'Confirmar entrega' }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('abrir tab=requests no concede entrega a un vendedor de solo lectura', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation();
    useAuthStore.setState({
      user: { id: 9, nombre: 'Ventas', email: 'ventas@demo.cl', role: 'vendedor' },
    });
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/warehouses/requests') {
        return Promise.resolve({
          data: { ...emptyRequests, items: [approvedRequest], total: 1, totalPages: 1 },
        } as AxiosResponse);
      }
      return baseGet?.(url, config) ?? Promise.reject(new Error('GET inesperado'));
    });
    renderPage('/warehouses?tab=requests');
    const dispatch = screen.getByLabelText('Solicitudes de repuestos para órdenes de trabajo');
    await within(dispatch).findByText(approvedRequest.workOrder.codigo);
    expect(dispatch).toHaveAttribute('open');
    expect(within(dispatch).queryByRole('button', { name: 'Entregar' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('abre el modal de traslado cuando hay más de un almacén', async () => {
    const second: Warehouse = {
      ...warehouse,
      id: 2,
      codigo: 'NORTE',
      nombre: 'Bodega Norte',
      totalItems: 0,
      totalUnidades: 0,
    };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: {
            items: [warehouse, second],
            total: 2,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/2/balances')
        return Promise.resolve({ data: { balances: [] as StockBalance[] } } as AxiosResponse<{
          balances: StockBalance[];
        }>);
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance] } } as AxiosResponse<{
          balances: StockBalance[];
        }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: {
            items: [movement],
            total: 1,
            page: 1,
            pageSize: 15,
            totalPages: 1,
          } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      if (url === '/warehouses/requests') {
        return Promise.resolve({ data: emptyRequests } as AxiosResponse<
          PaginatedResponse<WarehouseWorkOrderRequest>
        >);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    renderPage();
    await screen.findByText('Bodega Central');

    fireEvent.change(screen.getByRole('combobox', { name: 'Seleccionar almacén' }), {
      target: { value: '2' },
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/warehouses/2/balances'));
    expect(screen.getByRole('button', { name: 'Editar NORTE' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trasladar stock' }));
    expect(await screen.findByRole('dialog', { name: 'Trasladar stock' })).toBeInTheDocument();
  });

  it('registra un movimiento de ingreso', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { movement },
    } as AxiosResponse<{ movement: StockMovement }>);
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({
          data: {
            items: [warehouse],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          } as PaginatedResponse<Warehouse>,
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({ data: { balances: [balance] } } as AxiosResponse<{
          balances: StockBalance[];
        }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: {
            items: [movement],
            total: 1,
            page: 1,
            pageSize: 15,
            totalPages: 1,
          } as PaginatedResponse<StockMovement>,
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      if (url === '/catalog') {
        return Promise.resolve({
          data: { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 },
        } as AxiosResponse);
      }
      if (url === '/warehouses/requests') {
        return Promise.resolve({ data: emptyRequests } as AxiosResponse<
          PaginatedResponse<WarehouseWorkOrderRequest>
        >);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
    renderPage();
    await screen.findByText('Bodega Central');

    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    expect(
      await screen.findByRole('dialog', { name: 'Movimiento de inventario' }),
    ).toBeInTheDocument();
  });

  it('precarga el repuesto de la fila y bloquea una salida que supera su saldo', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Registrar movimiento de Kit Hilux GR' }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Movimiento de inventario' }));
    expect(dialog.getByRole('combobox', { name: 'Buscar repuesto' })).toHaveValue(
      'UNT101 · Kit Hilux GR',
    );
    await waitFor(() => expect(dialog.getByText('10')).toBeInTheDocument());
    fireEvent.change(dialog.getByRole('combobox', { name: 'Movimiento' }), {
      target: { value: 'salida' },
    });
    fireEvent.change(dialog.getByLabelText('Cantidad'), { target: { value: '11' } });
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'Entrega a taller' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar movimiento' }));
    expect(
      await dialog.findByText(
        'La salida no puede superar las 10 unidades disponibles en esta bodega.',
      ),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva el formulario después de un error y permite reintentar la creación', async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce({
        data: { warehouse: { ...warehouse, id: 2, codigo: 'NORTE', nombre: 'Bodega Norte' } },
      });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo almacén' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Nuevo almacén' }));
    fireEvent.change(dialog.getByLabelText('Código'), { target: { value: 'NORTE' } });
    fireEvent.change(dialog.getByLabelText('Nombre'), { target: { value: 'Bodega Norte' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Crear almacén' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'No fue posible completar la operación',
    );
    expect(dialog.getByLabelText('Nombre')).toHaveValue('Bodega Norte');
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(dialog.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Seguir editando' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Crear almacén' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post).toHaveBeenLastCalledWith('/warehouses', {
      codigo: 'NORTE',
      nombre: 'Bodega Norte',
      direccion: null,
      activo: true,
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nuevo almacén' })).not.toBeInTheDocument(),
    );
  });

  it.each([0, 4])('previsualiza y registra un ajuste a %i como saldo final, sin sumarlo al stock', async (finalStock) => {
    vi.mocked(api.post).mockResolvedValue({
      data: { movement: { ...movement, tipo: 'ajuste', saldoResultante: finalStock } },
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Registrar movimiento de Kit Hilux GR' }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Movimiento de inventario' }));
    await dialog.findByText('10');
    fireEvent.change(dialog.getByRole('combobox', { name: 'Movimiento' }), {
      target: { value: 'ajuste' },
    });
    expect(dialog.getByLabelText('Nuevo saldo')).toHaveAttribute('min', '0');
    expect(dialog.getByLabelText('Nuevo saldo')).toHaveAttribute('step', '1');
    fireEvent.change(dialog.getByLabelText('Nuevo saldo'), { target: { value: String(finalStock) } });
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'Conteo físico' } });
    expect(dialog.getByText(String(finalStock))).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar movimiento' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/warehouses/movements', {
        catalogItemId: 7,
        warehouseId: 1,
        tipo: 'ajuste',
        cantidad: finalStock,
        motivo: 'Conteo físico',
      }),
    );
  });

  it('avisa de fechas invertidas sin consultar un kardex con un rango inválido', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Registrar movimiento de Kit Hilux GR' });
    fireEvent.click(screen.getByText('Historial de movimientos', { exact: true }));
    await screen.findByText('Saldo inicial');
    const callsBefore = vi
      .mocked(api.get)
      .mock.calls.filter(([url]) => url === '/warehouses/movements/all').length;
    fireEvent.change(screen.getByLabelText('Fecha desde'), { target: { value: '2099-01-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha desde no puede ser posterior');
    expect(
      vi.mocked(api.get).mock.calls.filter(([url]) => url === '/warehouses/movements/all'),
    ).toHaveLength(callsBefore);
    expect(screen.queryByText('Saldo inicial')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fecha hasta'), { target: { value: '2099-01-02' } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/warehouses/movements/all', {
        params: expect.objectContaining({
          warehouseId: 1,
          fechaDesde: '2099-01-01',
          fechaHasta: '2099-01-02',
        }),
      }),
    );
  });

  it('permite consultar la segunda página de despachos pendientes', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation();
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/warehouses/requests') {
        const params = config?.params;
        const page =
          typeof params === 'object' && params !== null && 'page' in params
            ? Number(params.page)
            : 1;
        return Promise.resolve({
          data: {
            ...emptyRequests,
            page,
            total: 21,
            totalPages: 2,
            items: [
              page === 1
                ? approvedRequest
                : {
                    ...approvedRequest,
                    id: 42,
                    catalogItem: {
                      ...approvedRequest.catalogItem,
                      nombre: 'Repuesto de la segunda página',
                    },
                  },
            ],
          },
        } as AxiosResponse);
      }
      return baseGet?.(url, config) ?? Promise.reject(new Error('GET inesperado'));
    });
    renderPage();
    fireEvent.click(screen.getByText('Despacho a órdenes de trabajo', { exact: true }));
    const dispatch = within(
      screen.getByLabelText('Solicitudes de repuestos para órdenes de trabajo'),
    );
    await dispatch.findByText('Kit Hilux GR');
    fireEvent.click(dispatch.getByRole('button', { name: 'Página siguiente' }));
    expect(await dispatch.findByText('Repuesto de la segunda página')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/warehouses/requests', {
      params: { page: 2, pageSize: 20, estado: 'aprobada', search: undefined },
    });
  });

  it('consulta el stock de origen y conserva el destino al validar un traslado', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation();
    const second: Warehouse = { ...warehouse, id: 2, codigo: 'NORTE', nombre: 'Bodega Norte' };
    const part = {
      id: 7,
      nombre: balance.nombre,
      codigo: balance.codigo,
      tipo: 'parte',
      stock: 10,
      precio: 0,
      unidadMedida: 'unidad',
      stockMinimo: 2,
      descripcion: null,
      horasHombreEstandar: null,
      createdAt: '',
      updatedAt: '',
    };
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/warehouses')
        return Promise.resolve({
          data: { items: [warehouse, second], total: 2, page: 1, pageSize: 100, totalPages: 1 },
        } as AxiosResponse);
      if (url === '/catalog')
        return Promise.resolve({
          data: { items: [part], total: 1, page: 1, pageSize: 12, totalPages: 1 },
        } as AxiosResponse);
      return baseGet?.(url, config) ?? Promise.reject(new Error('GET inesperado'));
    });
    vi.mocked(api.post).mockResolvedValue({
      data: { salida: movement, ingreso: movement, referencia: 'TR-01' },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Trasladar stock' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Trasladar stock' }));
    expect(dialog.getByRole('combobox', { name: 'Almacén origen' })).toHaveValue('1');
    expect(dialog.getByRole('combobox', { name: 'Almacén destino' })).toHaveValue('2');
    fireEvent.focus(dialog.getByRole('combobox', { name: 'Buscar repuesto' }));
    fireEvent.click(await dialog.findByRole('option', { name: /Kit Hilux GR/ }));
    fireEvent.change(dialog.getByLabelText('Cantidad'), { target: { value: '11' } });
    fireEvent.change(dialog.getByLabelText('Motivo'), {
      target: { value: 'Reposición de sucursal' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Confirmar traslado' }));
    expect(
      await dialog.findByText('El traslado supera las 10 unidades disponibles en origen.'),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Confirmar traslado' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/warehouses/transfers', {
        catalogItemId: 7,
        originWarehouseId: 1,
        destinationWarehouseId: 2,
        cantidad: 2,
        motivo: 'Reposición de sucursal',
      }),
    );
  });
});
