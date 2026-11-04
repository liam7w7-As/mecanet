import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WarehousesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

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

  it('entrega una solicitud aprobada desde la bodega seleccionada', async () => {
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
          deliveredWarehouse: warehouse,
          deliveredAt: '2026-09-23T11:00:00.000Z',
        } as WarehouseWorkOrderRequest,
      },
    } as AxiosResponse<{ request: WarehouseWorkOrderRequest }>);

    renderPage();
    fireEvent.click(screen.getByText('Despacho a órdenes de trabajo', { exact: true }));
    expect(await screen.findByText('OT-2026-0041')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entregar' }));
    expect(
      await screen.findByRole('dialog', { name: 'Confirmar entrega de repuesto' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/warehouses/requests/41/deliver', {
        warehouseId: 1,
        comentario: undefined,
      });
    });
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

  it('previsualiza y registra un ajuste como saldo final, sin sumarlo al stock', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { movement: { ...movement, tipo: 'ajuste', saldoResultante: 4 } },
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
    fireEvent.change(dialog.getByLabelText('Nuevo saldo'), { target: { value: '4' } });
    fireEvent.change(dialog.getByLabelText('Motivo'), { target: { value: 'Conteo físico' } });
    expect(dialog.getByText('4')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar movimiento' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/warehouses/movements', {
        catalogItemId: 7,
        warehouseId: 1,
        tipo: 'ajuste',
        cantidad: 4,
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
