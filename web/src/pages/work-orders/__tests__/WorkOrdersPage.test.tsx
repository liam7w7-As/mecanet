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
  estado: 'borrador',
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
      cantidad: 2,
      precioUnitario: 25000,
      subtotal: 50000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
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
    expect(screen.getAllByText('Borrador')).toHaveLength(2);
  });

  it('muestra el reloj de taller y el avance por tareas en la card', async () => {
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    // 1 tarea pendiente -> 0% -> Sin iniciar + reloj corriendo
    expect(screen.getByText(/Sin iniciar/)).toBeInTheDocument();
    expect(screen.getByText(/En taller/)).toBeInTheDocument();
    expect(screen.getByText('Cambio de pastillas')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('tab', { name: 'En progreso' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders', {
        params: expect.objectContaining({ estado: 'en_progreso' }),
      });
    });
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

  it('no muestra transiciones para una orden entregada', async () => {
    const deliveredOrder: WorkOrder = { ...workOrder, estado: 'entregada' };
    vi.mocked(api.get).mockResolvedValue({ data: { workOrder: deliveredOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);

    createWrapper(
      <Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>,
      `/work-orders/${workOrder.id}`,
    );

    expect(await screen.findByText('Esta orden está en un estado terminal.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'En progreso' })).not.toBeInTheDocument();
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

  it('abre la vista previa PDF con el mismo diseño al pulsar descargar en la lista', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === `/work-orders/${workOrder.id}`) {
        return Promise.resolve({ data: { workOrder } } as AxiosResponse<{ workOrder: WorkOrder }>);
      }
      return Promise.resolve({ data: listResponse } as AxiosResponse<PaginatedResponse<WorkOrder>>);
    });
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa PDF de OT-2026-0012' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders/12');
    });

    // Mismo diseño de la vista previa (anverso OT con inspección)
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('OT-2026-0012').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/INSPECCIÓN DE INGRESO/i).length).toBeGreaterThanOrEqual(1);
  });

  it('separa la OT oficial del comprobante de recepción', async () => {
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
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
    fireEvent.click(screen.getByRole('button', { name: 'Comprobante de recepción' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/work-orders/12/reception-pdf', {
        responseType: 'blob',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'OT oficial / Imprimir' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    anchorClick.mockRestore();
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

  it('crea una OT desde el wizard y sube fotos de inspección', async () => {
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
      }));
      expect(api.post).toHaveBeenCalledWith(
        '/work-orders/77/inspection/photos/frontal',
        expect.any(FormData),
        expect.objectContaining({ onUploadProgress: expect.any(Function) }),
      );
    });
  });
});
