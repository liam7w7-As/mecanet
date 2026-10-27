import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderCreatePage from '../WorkOrderCreatePage';
import WorkOrderDetailPage from '../WorkOrderDetailPage';
import WorkOrdersPage from '../WorkOrdersPage';

import type { EditableWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import type { CatalogItem, Client, PaginatedResponse, QuickSearchResult, WorkOrder } from '../../../types/entities';
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

const workOrder: WorkOrder = {
  id: 12,
  codigo: 'OT-2026-0012',
  clientId: 7,
  contactClientId: 7,
  billingClientId: 7,
  vehicleId: 4,
  estado: 'en_progreso',
  descripcion: 'Revisión de frenos',
  kilometrajeIngreso: 84500,
  fechaIngreso: '2026-09-15T10:00:00.000Z',
  fechaEntrega: null,
  createdBy: 1,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
  client: { id: 7, rut: '123456785', nombre: 'Cliente Demo', telefono: '+56912345678' },
  vehicle: { id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Corolla' },
  creator: { id: 1, nombre: 'Desarrollador UNITHOR', email: 'dev@unithor.local' },
  contact: {
    clientId: 7,
    nombre: 'Juan Recepción',
    rut: '111111111',
    telefono: '+56911111111',
    email: 'recepcion@demo.cl',
  },
  billing: {
    clientId: 7,
    nombre: 'Empresa Factura SpA',
    rut: '761111111',
    tipo: 'empresa',
    telefono: '+56222222222',
    email: 'factura@demo.cl',
    direccion: 'Avenida Factura 123',
    region: 'Metropolitana',
    comuna: 'Santiago',
  },
  items: [
    {
      id: 20,
      catalogItemId: null,
      descripcion: 'Cambio de pastillas',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 2,
      precioUnitario: 25000,
      subtotal: 50000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
      horasHombreEstimadas: null,
      horasHombreReales: null,
      assignedUserId: null,
      laborValidatedBy: null,
      laborValidatedAt: null,
      laborValidationNote: null,
      stockConsumido: false,
      stockConsumidoCantidad: 0,
      stockConsumidoAt: null,
    },
  ],
  quotation: {
    id: 44,
    codigo: 'COT-2026-0044',
    estadoPago: 'por_pagar',
    total: 50000,
    pagado: 0,
    saldoPendiente: 50000,
  },
  inspection: {
    id: 9,
    nivelCombustible: 'medio',
    llantaDelanteraIzquierda: 'bueno',
    llantaDelanteraDerecha: 'regular',
    llantaTraseraIzquierda: 'baja_presion',
    llantaTraseraDerecha: 'bueno',
    inventario: ['botiquin', 'rueda_repuesto'],
    objetosValor: 'Lentes en guantera',
    observaciones: 'Rayón lateral derecho',
    inspectedBy: 1,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
    photos: [
      {
        id: 1,
        slot: 'frontal',
        mimeType: 'image/png',
        sizeBytes: 5,
        uploadedBy: 1,
        createdAt: '2026-09-15T10:00:00.000Z',
        updatedAt: '2026-09-15T10:00:00.000Z',
        url: '/api/work-orders/12/inspection/photos/frontal',
      },
    ],
  },
  events: [
    {
      id: 101,
      tipo: 'creacion',
      descripcion: 'Orden de trabajo creada',
      metadata: { itemsCount: 1 },
      createdAt: '2026-09-15T10:00:00.000Z',
      actor: { id: 1, nombre: 'Desarrollador UNITHOR' },
    },
  ],
};

const listResponse: PaginatedResponse<WorkOrder> = {
  items: [workOrder],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const emptyCatalog: PaginatedResponse<CatalogItem> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 0,
};

const client: Client = {
  id: 7,
  rut: '123456785',
  nombre: 'Cliente Demo',
  tipo: 'cliente',
  email: 'cliente@demo.cl',
  telefono: '+56912345678',
  direccion: 'Avenida Demo 123',
  region: null,
  comuna: null,
  notas: null,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

const clientsResponse: PaginatedResponse<Client> = {
  items: [client],
  total: 1,
  page: 1,
  pageSize: 8,
  totalPages: 1,
};

const quickSearchResponse: QuickSearchResult = {
  clients: [],
  vehicles: [
    {
      id: 4,
      patente: 'ABCD12',
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2020,
      client: { id: 7, nombre: 'Cliente Demo', rut: '123456785' },
    },
  ],
};

const createWrapper = (children: React.ReactNode, route = '/work-orders') => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('WorkOrdersPage', () => {
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
      if (url === '/catalog') {
        return Promise.resolve({ data: emptyCatalog } as AxiosResponse<PaginatedResponse<CatalogItem>>);
      }
      if (url === '/clients') {
        return Promise.resolve({ data: clientsResponse } as AxiosResponse<PaginatedResponse<Client>>);
      }
      if (url === `/work-orders/${workOrder.id}`) {
        return Promise.resolve({ data: { workOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
  });

  it('renderiza las cards de órdenes de trabajo con datos', async () => {
    createWrapper(<WorkOrdersPage />);

    expect(await screen.findByText('OT-2026-0012')).toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    expect(screen.getByText('Cliente Demo')).toBeInTheDocument();
    expect(screen.getAllByText('Iniciada')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: 'Borrador' })).not.toBeInTheDocument();
  });

  it('muestra el reloj de taller y el avance por tareas en la card', async () => {
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    // 1 tarea pendiente -> 0% -> Sin iniciar + reloj corriendo
    expect(screen.getByText(/Sin iniciar/)).toBeInTheDocument();
    expect(screen.getByText('En taller')).toBeInTheDocument();
    expect(screen.getByText('Avance')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Tareas 0/1')).toBeInTheDocument();
  });

  it('abre el detalle en un modal con los trabajos agrupados por tipo', async () => {
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByRole('dialog', { name: /OT-2026-0012/ })).toBeInTheDocument();
    expect(screen.getByText('Cambio de pastillas')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText(/Trabajos y repuestos \(1\)/)).toBeInTheDocument();
    expect(screen.getAllByText('Repuestos').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /Abrir detalle completo/ })).toBeInTheDocument();
  });

  it('muestra el mecánico asignado y la cotización en la card', async () => {
    const orderWithMechanic: WorkOrder = {
      ...workOrder,
      assignedMechanicId: 9,
      assignedMechanic: { id: 9, nombre: 'Mecánico Turno', email: 'mecanico@unithor.local' },
    };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === `/work-orders/${workOrder.id}`) {
        return Promise.resolve({ data: { workOrder: orderWithMechanic } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({ data: { ...listResponse, items: [orderWithMechanic] } } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    expect(screen.getByText('Mecánico Turno')).toBeInTheDocument();
    expect(screen.getByText('Total est.')).toBeInTheDocument();
    expect(screen.getByText(/Pagado/)).toBeInTheDocument();
    expect(screen.getAllByText(/50\.000/).length).toBeGreaterThanOrEqual(1);
  });

  it.each([false, true])('precarga el cliente desde su ficha conservando el propietario real (vehículo: %s)', async (includeVehicle) => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/clients/7') return Promise.resolve({ data: {client: clientsResponse.items[0]} } as AxiosResponse);
      if (url === '/vehicles/4') return Promise.resolve({data: {vehicle: {
        id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Corolla', ano: 2020,
        kilometraje: 42000, clientId: 99, client: {id: 99, nombre: 'Propietario original', rut: null},
      }}} as AxiosResponse);
      if (url === '/clients') return Promise.resolve({data: clientsResponse} as AxiosResponse);
      if (url === '/work-orders/mechanics') return Promise.resolve({data: {mechanics: []}} as AxiosResponse);
      if (url === '/catalog') return Promise.resolve({data: emptyCatalog} as AxiosResponse);
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
    createWrapper(<WorkOrderCreatePage />, `/work-orders/new?clientId=7${includeVehicle ? '&vehicleId=4' : ''}`);
    expect(await screen.findByRole('button', {name: 'Quitar responsable del ingreso'})).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/clients/7', {params: {includeVehicles: false}});
    fireEvent.click(screen.getByRole('button', {name: /siguiente/i}));
    expect(await screen.findByRole('button', {name: 'Quitar facturación'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Quitar contacto en taller'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /siguiente/i}));
    if (includeVehicle) {
      expect(await screen.findByText('ABCD12')).toBeInTheDocument();
      expect(screen.getByText('Propietario registrado: Propietario original')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', {name: /siguiente/i}));
      expect(await screen.findByLabelText('Kilometraje de entrada')).toHaveValue(42000);
    } else {
      expect(await screen.findByText('Seleccione o registre el vehículo que ingresa.')).toBeInTheDocument();
    }
  });

  it('pinta la card en verde cuando las tareas están completadas', async () => {
    const doneOrder: WorkOrder = {
      ...workOrder,
      items: workOrder.items?.map((item) => ({ ...item, estadoOperativo: 'completado' as const })),
    };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === `/work-orders/${workOrder.id}`) {
        return Promise.resolve({ data: { workOrder: doneOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({ data: { ...listResponse, items: [doneOrder] } } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    expect(screen.getByText(/Finalizado/)).toBeInTheDocument();
  });

  it('muestra la bitácora de actividad con actor y fecha', async () => {
    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    expect(await screen.findByRole('heading', { name: 'Bitácora de actividad' })).toBeInTheDocument();
    expect(screen.getByText('Orden de trabajo creada')).toBeInTheDocument();
    expect(screen.getByText('Por Desarrollador UNITHOR')).toBeInTheDocument();
  });

  it('actualiza la consulta al filtrar por estado', async () => {
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');

    fireEvent.click(screen.getByRole('tab', { name: 'Iniciada' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders', {
        params: expect.objectContaining({ estado: 'en_progreso' }),
      });
    });
  });

  it.each([
    ['3 días', '2025-12-31'],
    ['15 días', '2025-12-19'],
  ])('combina el periodo %s con el estado e incluye el día actual', async (period, from) => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-02T12:00:00.000Z'));
    try {
      createWrapper(<WorkOrdersPage />);
      await screen.findByText('OT-2026-0012');
      fireEvent.click(screen.getByRole('tab', { name: 'Iniciada' }));
      fireEvent.click(screen.getByRole('button', { name: period }));
      expect(screen.getByRole('button', { name: period })).toHaveAttribute('aria-pressed', 'true');
      await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
        params: expect.objectContaining({
          page: 1,
          estado: 'en_progreso',
          fechaDesde: from,
          fechaHasta: '2026-01-02',
        }),
      }));
    } finally {
      now.mockRestore();
    }
  });

  it('filtra un mes completo, contempla febrero bisiesto y reinicia la paginación', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { ...listResponse, total: 30, totalPages: 3 },
    } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');
    fireEvent.change(screen.getByLabelText('Seleccionar página'), { target: { value: '2' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ page: 2 }),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Por mes' }));
    fireEvent.change(screen.getByLabelText('Mes de ingreso'), { target: { value: '2024-02' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ page: 1, fechaDesde: '2024-02-01', fechaHasta: '2024-02-29' }),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Todas las fechas' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ fechaDesde: undefined, fechaHasta: undefined }),
    }));
    expect(screen.queryByLabelText('Mes de ingreso')).not.toBeInTheDocument();
  });

  it('filtra una fecha específica con el calendario y permite limpiar o cambiar el periodo', async () => {
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');
    expect(screen.queryByRole('combobox', { name: 'Periodo de ingreso' })).not.toBeInTheDocument();
    const datePicker = screen.getByRole('button', { name: 'Fecha específica' });
    expect(datePicker).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'Iniciada' }));
    fireEvent.click(datePicker);
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ page: 1, estado: 'en_progreso', fechaDesde: date, fechaHasta: date }),
    }));
    expect(screen.getByRole('button', { name: 'Todas las fechas' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar fecha específica' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ estado: 'en_progreso', fechaDesde: undefined, fechaHasta: undefined }),
    }));
    expect(screen.getByRole('button', { name: 'Todas las fechas' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(datePicker);
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    fireEvent.click(screen.getByRole('button', { name: '15 días' }));
    expect(datePicker).toHaveTextContent('Elegir fecha');
    expect(screen.getByRole('button', { name: '15 días' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('recalcula subtotales y total al cambiar cantidad y precio', async () => {
    const EditorHarness = () => {
      const [items, setItems] = useState<EditableWorkOrderItem[]>([createEmptyWorkOrderItem()]);
      return <WorkOrderItemsEditor items={items} onChange={setItems} />;
    };

    createWrapper(<EditorHarness />);

    fireEvent.change(screen.getByLabelText('Descripción 1'), { target: { value: 'Cambio de aceite' } });
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario 1'), { target: { value: '15000' } });

    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('30.000');
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('30.000');
  });

  it('agrega, quita y restaura un servicio conservando cantidad y precio', async () => {
    const service: CatalogItem = {
      id: 80, tipo: 'estandar', codigo: 'SRV-80', nombre: 'Cambio de aceite',
      descripcion: null, unidadMedida: 'unidad', precio: 15000, horasHombreEstandar: 0.5, stock: 0, stockMinimo: 0,
      createdAt: workOrder.createdAt, updatedAt: workOrder.updatedAt,
    };
    vi.mocked(api.get).mockResolvedValue({ data: { ...emptyCatalog, items: [service], total: 1, totalPages: 1 } });
    const Harness = () => {
      const [items, setItems] = useState<EditableWorkOrderItem[]>([]);
      return <WorkOrderItemsEditor items={items} onChange={setItems} showExecution={false} />;
    };
    createWrapper(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Cambio de aceite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad 1' }));
    fireEvent.change(screen.getByLabelText('Precio unitario 1'), { target: { value: '18000' } });
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('36.000');
    expect(screen.queryByLabelText('Avance 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Cambio de aceite' }));
    // La fila sale con animación (0.18 s): se espera a que se desmonte.
    await waitFor(() => expect(screen.queryByLabelText('Descripción 1')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(2);
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('36.000');
    expect(screen.getByRole('button', { name: 'Quitar Cambio de aceite' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Repuestos' }));
    expect(screen.getByLabelText('Descripción 1')).toHaveValue('Cambio de aceite');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar ítem 1' }));
    expect(await screen.findByRole('button', { name: 'Agregar Cambio de aceite' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('conserva un borrador libre al seleccionar un ítem del catálogo', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...emptyCatalog, items: [{
      id: 80, tipo: 'estandar', codigo: null, nombre: 'Servicio del catálogo', unidadMedida: 'unidad', precio: 9000, stock: 0,
    }] } });
    const Harness = () => {
      const [items, setItems] = useState<EditableWorkOrderItem[]>([{ ...createEmptyWorkOrderItem(), cantidad: '3', precioUnitario: '100' }]);
      return <WorkOrderItemsEditor items={items} onChange={setItems} />;
    };
    createWrapper(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Servicio del catálogo' }));
    // El ítem nuevo entra al inicio; el borrador se conserva en la posición 2.
    expect(screen.getByLabelText('Descripción 1')).toHaveValue('Servicio del catálogo');
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(1);
    expect(screen.getByLabelText('Descripción 2')).toHaveValue('');
    expect(screen.getByLabelText('Cantidad 2')).toHaveValue(3);
  });

  it('permite recorrer el catálogo sin perder los ítems seleccionados', async () => {
    vi.mocked(api.get).mockImplementation((_url, config) => {
      const page = (config?.params as { page: number } | undefined)?.page ?? 1;
      return Promise.resolve({ data: { ...emptyCatalog, page, totalPages: 2, total: 13, items: [{
        id: page, tipo: 'estandar', nombre: `Servicio página ${page}`, unidadMedida: 'unidad', precio: 9000, stock: 0,
      }] } });
    });
    const Harness = () => {
      const [items, setItems] = useState<EditableWorkOrderItem[]>([]);
      return <WorkOrderItemsEditor items={items} onChange={setItems} />;
    };
    createWrapper(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Servicio página 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente del catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Servicio página 2' }));
    // El más reciente va primero.
    expect(screen.getByLabelText('Descripción 1')).toHaveValue('Servicio página 2');
    expect(screen.getByLabelText('Descripción 2')).toHaveValue('Servicio página 1');
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior del catálogo' }));
    expect(await screen.findByRole('button', { name: 'Quitar Servicio página 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('registra un avance desde la tarjeta y conserva el tablero al cerrar', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { workOrder } });
    createWrapper(<WorkOrdersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gestionar trabajo' }));
    await screen.findByRole('heading', { name: 'Reportar avance' });
    fireEvent.change(screen.getByLabelText('Avance %'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Comentario'), { target: { value: 'Diagnóstico completado' } });
    expect(screen.getByRole('button', { name: 'Registrar avance' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Avance %'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar avance' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/work-orders/12/execution', {
      reporte: { porcentaje: 0, comentario: 'Diagnóstico completado', bloqueos: null },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Taller - Órdenes de Trabajo' })).toBeInTheDocument();
  });

  it('el mecánico asignado solicita un repuesto sin acceder al detalle completo ni aprobarlo', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'mecanico@demo.cl', role: 'mecanico' } });
    const assigned = { ...workOrder, assignedMechanicId: 9 };
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data:
      url === '/catalog' ? { ...emptyCatalog, items: [{ id: 80, nombre: 'Filtro', tipo: 'parte', stock: 5 }] }
        : url === '/work-orders/12' ? { workOrder: assigned }
          : { ...listResponse, items: [assigned] },
    }));
    vi.mocked(api.post).mockResolvedValue({ data: { workOrder: assigned } });
    createWrapper(<WorkOrdersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gestionar trabajo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitudes' }));
    await screen.findByRole('option', { name: 'Filtro (5)' });
    fireEvent.change(screen.getByLabelText('Repuesto', { exact: true }), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Cantidad', { exact: true }), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Justificación'), { target: { value: 'Filtro dañado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/work-orders/12/requests', {
      tipo: 'repuesto', catalogItemId: 80, cantidad: 2, motivo: 'Filtro dañado',
    }));
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('no ofrece gestión de una OT a un mecánico no asignado', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'mecanico@demo.cl', role: 'mecanico' } });
    createWrapper(<WorkOrdersPage />);
    await screen.findByText(workOrder.codigo);
    expect(screen.queryByRole('button', { name: 'Gestionar trabajo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Solicitudes' })).not.toBeInTheDocument();
  });

  it('mantiene las órdenes cerradas en consulta sin permitir nuevas solicitudes', async () => {
    const closed = { ...workOrder, estado: 'entregada' as const };
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data:
      url === '/work-orders/12' ? { workOrder: closed }
        : url === '/catalog' ? emptyCatalog : { ...listResponse, items: [closed] },
    }));
    createWrapper(<WorkOrdersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gestionar trabajo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitudes' }));
    expect(screen.getByText(/Orden cerrada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).not.toBeInTheDocument();
  });

  it('no muestra transiciones para una orden entregada', async () => {
    const deliveredOrder: WorkOrder = { ...workOrder, estado: 'entregada' };
    vi.mocked(api.get).mockResolvedValue({ data: { workOrder: deliveredOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    expect(await screen.findByText('Esta orden está en un estado terminal.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciada' })).not.toBeInTheDocument();
  });

  it('usa el formulario de cierre para entregar una orden finalizada', async () => {
    const finalOrder: WorkOrder = {
      ...workOrder,
      estado: 'finalizada',
      items: workOrder.items?.map((item) => ({ ...item, estadoOperativo: 'completado' })),
    };
    vi.mocked(api.get).mockResolvedValue({ data: { workOrder: finalOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);
    vi.mocked(api.post).mockResolvedValue({
      data: { workOrder: { ...finalOrder, estado: 'entregada' } },
    } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Entregada' }));
    expect(screen.getByRole('heading', { name: 'Cierre y entrega del vehículo' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kilometraje de salida'), { target: { value: '84520' } });
    fireEvent.change(screen.getByLabelText('Firma nominativa del receptor'), { target: { value: 'Juan Recepción' } });
    const deliveryCheckboxes = screen.getAllByRole('checkbox');
    deliveryCheckboxes.forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/work-orders/12/deliver',
        expect.objectContaining({
          kilometrajeSalida: 84520,
          receptorNombre: 'Juan Recepción',
          conformidad: true,
          firmaRecepcion: 'Juan Recepción',
          checklist: expect.arrayContaining([
            'trabajos_explicados',
            'vehiculo_revisado',
            'pertenencias_entregadas',
            'documentos_entregados',
          ]),
        }),
      );
    });
  });

  it('crea una garantía desde una orden entregada y conserva el vínculo de origen', async () => {
    const deliveredOrder: WorkOrder = {
      ...workOrder,
      estado: 'entregada',
      delivery: {
        id: 5,
        kilometrajeSalida: 84600,
        receptorNombre: 'Juan Recepción',
        receptorRut: '111111111',
        receptorTelefono: '+56911111111',
        checklist: ['trabajos_explicados', 'vehiculo_revisado'],
        observaciones: 'Entrega conforme',
        conformidad: true,
        firmaRecepcion: 'Juan Recepción',
        deliveredBy: 1,
        deliveredAt: '2026-09-20T15:00:00.000Z',
        deliverer: { id: 1, nombre: 'Desarrollador UNITHOR' },
      },
    };
    const reentryOrder: WorkOrder = {
      ...workOrder,
      id: 88,
      codigo: 'OT-2026-0088',
      tipoIngreso: 'garantia',
      sourceWorkOrderId: workOrder.id,
      coberturaGarantia: true,
    };
    vi.mocked(api.get).mockResolvedValue({
      data: { workOrder: deliveredOrder },
    } as AxiosResponse<{ workOrder: WorkOrder }>);
    vi.mocked(api.post).mockResolvedValue({
      data: { workOrder: reentryOrder },
    } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes>
        <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
      </Routes>,
      `/work-orders/${workOrder.id}`,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Garantía \/ reingreso/i }));
    expect(screen.getByRole('heading', { name: /Crear garantía o reingreso/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Motivo y falla reportada/i), {
      target: { value: 'Persiste el ruido luego de la reparación' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear nueva OT' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/work-orders/12/reentry', expect.objectContaining({
        tipoIngreso: 'garantia',
        motivo: 'Persiste el ruido luego de la reparación',
        kilometrajeIngreso: 84600,
        copiarItems: true,
        coberturaGarantia: true,
      }));
    });
  });

  it('muestra el acta de entrega imprimible para una orden entregada', async () => {
    const deliveredOrder: WorkOrder = {
      ...workOrder,
      estado: 'entregada',
      delivery: {
        id: 5,
        kilometrajeSalida: 84600,
        receptorNombre: 'Juan Recepción',
        receptorRut: '111111111',
        receptorTelefono: '+56911111111',
        checklist: ['trabajos_explicados'],
        observaciones: 'Entrega conforme',
        conformidad: true,
        firmaRecepcion: 'Juan Recepción',
        deliveredBy: 1,
        deliveredAt: '2026-09-20T15:00:00.000Z',
        deliverer: { id: 1, nombre: 'Desarrollador UNITHOR' },
      },
    };
    vi.mocked(api.get).mockResolvedValue({
      data: { workOrder: deliveredOrder },
    } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Imprimir acta/i }));
    expect(screen.getByRole('heading', { name: /Comprobante de entrega/i })).toBeInTheDocument();
    expect(screen.getAllByText(/ACTA DE ENTREGA DE VEHÍCULO/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Juan Recepción').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('84.600 km').length).toBeGreaterThanOrEqual(1);
  });

  it('abre la vista previa PDF con el mismo diseño desde el modal de detalle', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === `/work-orders/${workOrder.id}`) {
        return Promise.resolve({ data: { workOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vista previa PDF' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders/12');
    });

    // Mismo diseño de la vista previa (anverso OT con inspección)
    expect((await screen.findAllByText(/INSPECCIÓN DE INGRESO/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('OT-2026-0012').length).toBeGreaterThanOrEqual(1);
  });

  it('separa la OT oficial del comprobante de recepción y comparte por WhatsApp', async () => {
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:reception-pdf'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === `/work-orders/${workOrder.id}`) {
        return Promise.resolve({ data: { workOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      if (url === `/work-orders/${workOrder.id}/reception-pdf`) {
        return Promise.resolve({ data: new Blob(['%PDF-']) } as AxiosResponse<Blob>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    expect(await screen.findByRole('button', { name: 'OT oficial / Imprimir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WhatsApp nota' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WhatsApp OT' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comprobante de recepción' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders/12/reception-pdf', {
        responseType: 'blob',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'WhatsApp nota' }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        'https://wa.me/56912345678?text=Hola%20Cliente%20Demo%2C%20le%20compartimos%20el%20comprobante%20de%20recepci%C3%B3n%20OT-2026-0012%20del%20veh%C3%ADculo%20ABCD12.',
        '_blank',
        'noopener,noreferrer',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'OT oficial / Imprimir' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    anchorClick.mockRestore();
    open.mockRestore();
  });

  it('muestra recepción, facturación e inspección y permite reemplazar o eliminar fotos', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        photo: {
          id: 2,
          slot: 'trasera',
          mimeType: 'image/png',
          sizeBytes: 5,
          uploadedBy: 1,
          createdAt: '2026-09-15T10:00:00.000Z',
          updatedAt: '2026-09-15T10:00:00.000Z',
          url: '/api/work-orders/12/inspection/photos/trasera',
        },
      },
    } as AxiosResponse);
    vi.mocked(api.delete).mockResolvedValue({ data: undefined } as AxiosResponse<void>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    expect(await screen.findByText('Recepción y facturación')).toBeInTheDocument();
    expect(screen.getByText('Juan Recepción')).toBeInTheDocument();
    expect(screen.getByText('Empresa Factura SpA')).toBeInTheDocument();
    expect(screen.getByText('Inspección de ingreso')).toBeInTheDocument();
    expect(screen.getByText('Rayón lateral derecho')).toBeInTheDocument();
    expect(screen.getByText('Rueda de repuesto')).toBeInTheDocument();

    const newPhoto = new File(['photo'], 'trasera.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir foto Trasera'), { target: { files: [newPhoto] } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar foto Frontal' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/work-orders/12/inspection/photos/trasera',
        expect.any(FormData),
        expect.objectContaining({ onUploadProgress: expect.any(Function) }),
      );
      expect(api.delete).toHaveBeenCalledWith('/work-orders/12/inspection/photos/frontal');
    });
  });

  it.each([true, false])('permite al vendedor sin edicion subir fotos desde el detalle (inspeccion: %s)', async (hasInspection) => {
    useAuthStore.setState({ user: {
      id: 2, nombre: 'Vendedor', email: 'vendedor@unithor.local', role: 'vendedor',
      permissions: [{ modulo: 'taller', accion: 'read' }],
    } });
    vi.mocked(api.get).mockResolvedValue({ data: { workOrder: { ...workOrder, inspection: hasInspection ? workOrder.inspection : null } } } as AxiosResponse);
    vi.mocked(api.post).mockResolvedValue({ data: { photo: { ...workOrder.inspection?.photos[0], id: 2, slot: 'trasera' } } } as AxiosResponse);
    createWrapper(<Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>, `/work-orders/${workOrder.id}`);
    expect(await screen.findByText('Registro fotográfico')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar ficha/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar foto Frontal' })).not.toBeInTheDocument();
    expect(screen.queryByText('Inspección bloqueada por estado')).not.toBeInTheDocument();
    if (hasInspection) expect(screen.getByLabelText('Reemplazar foto Frontal')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Subir foto Trasera'), { target: { files: [new File(['photo'], 'foto.png', { type: 'image/png' })] } });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/work-orders/12/inspection/photos/trasera', expect.any(FormData), expect.objectContaining({ onUploadProgress: expect.any(Function) })));
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it.each(['entregada', 'cancelada'] as const)('no muestra subida de fotos al vendedor en una OT %s', async (estado) => {
    useAuthStore.setState({ user: {
      id: 2, nombre: 'Vendedor', email: 'vendedor@unithor.local', role: 'vendedor',
      permissions: [{ modulo: 'taller', accion: 'read' }],
    } });
    vi.mocked(api.get).mockResolvedValue({ data: { workOrder: { ...workOrder, estado } } } as AxiosResponse);
    createWrapper(<Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>, `/work-orders/${workOrder.id}`);
    expect(await screen.findByText('Inspección bloqueada por estado')).toBeInTheDocument();
    expect(screen.queryByLabelText('Subir foto Trasera')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reemplazar foto Frontal')).not.toBeInTheDocument();
  });

  it('edita la ficha de recepción e inspección desde el detalle', async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        workOrder: {
          ...workOrder,
          inspection: {
            ...workOrder.inspection,
            observaciones: 'Observación corregida en recepción',
          },
        },
      },
    } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Editar ficha/i }));
    await screen.findByRole('dialog', { name: /Editar recepción e inspección/i });
    fireEvent.change(screen.getByLabelText('Observaciones de inspección'), {
      target: { value: 'Observación corregida en recepción' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/work-orders/12', expect.objectContaining({
        contactClientId: 7,
        billingClientId: 7,
        inspection: expect.objectContaining({
          observaciones: 'Observación corregida en recepción',
        }),
      }));
    });
  });

  it('edita el checklist de trabajos y repuestos desde el detalle', async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        workOrder: {
          ...workOrder,
          items: workOrder.items?.map((item) => ({
            ...item,
            estadoOperativo: 'completado',
            notasOperativas: 'Pastillas instaladas',
          })),
        },
      },
    } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    expect(await screen.findByText('0/1 completados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Editar trabajos/i }));
    await screen.findByRole('dialog', { name: /Editar trabajos y repuestos/i });
    fireEvent.change(screen.getByLabelText('Avance 1'), { target: { value: 'completado' } });
    fireEvent.change(screen.getByLabelText('Nota operativa 1'), { target: { value: 'Pastillas instaladas' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar trabajos/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/work-orders/12', expect.objectContaining({
        items: [
          expect.objectContaining({
            descripcion: 'Cambio de pastillas',
            estadoOperativo: 'completado',
            notasOperativas: 'Pastillas instaladas',
          }),
        ],
      }));
    });
  });

  it.each([false, true])('abre una COT en vehículo sin crear OT hasta confirmar (cancelar: %s)', async (cancel) => {
    const quotation = { id: 44, codigo: 'COT-26-44', clientId: 7, vehicleId: null, workOrderId: null, total: 50000, pagado: 10000, notas: 'Presupuesto aprobado', items: workOrder.items };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/quotations/44') return Promise.resolve({ data: { quotation } } as AxiosResponse);
      if (url === '/clients/7') return Promise.resolve({ data: { client } } as AxiosResponse);
      if (url === '/clients') return Promise.resolve({ data: clientsResponse } as AxiosResponse);
      if (url === '/search/quick') return Promise.resolve({ data: quickSearchResponse } as AxiosResponse);
      if (url === '/work-orders/mechanics') return Promise.resolve({ data: { mechanics: [] } } as AxiosResponse);
      return Promise.reject(new Error(`Ruta no simulada: ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({ data: { quotation: { ...quotation, workOrderId: 77 }, workOrder: { ...workOrder, id: 77 } } });
    createWrapper(<Routes>
      <Route path="/quotations/:quotationId/convert-to-ot" element={<WorkOrderCreatePage />} />
      <Route path="/quotations/:id" element={<p>Cotización original</p>} />
      <Route path="/work-orders/:id" element={<p>OT convertida</p>} />
    </Routes>, '/quotations/44/convert-to-ot');
    expect(await screen.findByText('Buscar vehículo')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByText('Seleccione o cree el vehículo que ingresa al taller.')).toBeInTheDocument();
    if (cancel) {
      fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }));
      expect(await screen.findByText('Cotización original')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
      return;
    }
    const search = screen.getByRole('combobox', { name: 'Búsqueda rápida de vehículos y clientes' });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'AB' } });
    fireEvent.click(await screen.findByText('ABCD12'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByLabelText('Subir foto Frontal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(screen.getByText('Cambio de pastillas')).toBeInTheDocument();
    expect(screen.getByText('Total cotizado: $50.000')).toBeInTheDocument();
    expect(screen.queryByLabelText('Precio unitario 1')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y crear orden' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quotations/44/convert-to-ot', expect.objectContaining({ vehicleId: 4, clientId: 7, billingClientId: 7, contactClientId: 7, inspection: expect.any(Object) })));
    expect(vi.mocked(api.post).mock.calls[0][1]).not.toHaveProperty('items');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('OT convertida')).toBeInTheDocument();
  });

  it('impide saltar desde responsable a servicios sin seleccionar vehículo', async () => {
    createWrapper(<WorkOrderCreatePage />, '/work-orders/new');
    fireEvent.click(await screen.findByText('Cliente Demo'));
    fireEvent.click(screen.getAllByRole('button', { name: /Servicios/ })[0]);
    expect(screen.getByText('Seleccione o cree el vehículo que ingresa al taller.')).toBeInTheDocument();
    expect(screen.getByText('Buscar vehículo')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(['desarrollador', 'vendedor'] as const)('crea una OT desde el wizard y sube fotos de inspección (%s)', async (role) => {
    if (role === 'vendedor') useAuthStore.setState({ user: {
      id: 2, nombre: 'Vendedor', email: 'vendedor@unithor.local', role,
      permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'taller', accion: 'create' }],
    } });
    const createObjectUrl = vi.fn(() => 'blob:inspection-photo');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/clients') {
        return Promise.resolve({ data: clientsResponse } as AxiosResponse<PaginatedResponse<Client>>);
      }
      if (url === '/search/quick') {
        return Promise.resolve({ data: quickSearchResponse } as AxiosResponse<QuickSearchResult>);
      }
      if (url === '/catalog') {
        return Promise.resolve({ data: emptyCatalog } as AxiosResponse<PaginatedResponse<CatalogItem>>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/work-orders') {
        return Promise.resolve({ data: { workOrder: { ...workOrder, id: 77 } } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({
        data: {
          photo: {
            id: 1,
            slot: 'frontal',
            mimeType: 'image/png',
            sizeBytes: 5,
            uploadedBy: 1,
            createdAt: '2026-09-15T10:00:00.000Z',
            updatedAt: '2026-09-15T10:00:00.000Z',
            url: '/api/work-orders/77/inspection/photos/frontal',
          },
        },
      } as AxiosResponse);
    });

    createWrapper(
      <Routes>
        <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
        <Route path="/work-orders/:id" element={<p>Detalle generado</p>} />
      </Routes>,
      '/work-orders/new',
    );

    fireEvent.click(await screen.findByText('Cliente Demo'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    const vehicleSearch = screen.getByRole('combobox', { name: 'Búsqueda rápida de vehículos y clientes' });
    fireEvent.focus(vehicleSearch);
    fireEvent.change(vehicleSearch, {
      target: { value: 'AB' },
    });

    fireEvent.click(await screen.findByText('ABCD12'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    const photo = new File(['photo'], 'frontal.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    // Paso 4 Servicios -> abre modal de confirmación con resumen
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    expect(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear orden' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
        clientId: 7,
        contactClientId: 7,
        billingClientId: 7,
        vehicleId: 4,
        inspection: expect.objectContaining({ llantaDelanteraIzquierda: 'no_revisado' }),
        emailPhotoSlots: ['frontal'],
      }));
      expect(api.post).toHaveBeenCalledWith(
        '/work-orders/77/inspection/photos/frontal',
        expect.any(FormData),
        expect.objectContaining({ onUploadProgress: expect.any(Function) }),
      );
    });
  });
});
