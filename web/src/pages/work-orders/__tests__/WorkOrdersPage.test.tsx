import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import { api } from '../../../lib/api';
import { flushFormDrafts, loadFormDraft, saveFormDraft } from '../../../lib/form-recovery';
import { workOrderRecoverySchema } from '../../../lib/form-recovery.schemas';
import { useAuthStore } from '../../../stores/auth.store';
import MyWorkOrdersPage from '../MyWorkOrdersPage';
import WorkOrderCreatePage from '../WorkOrderCreatePage';
import WorkOrderDetailPage from '../WorkOrderDetailPage';
import WorkOrdersPage from '../WorkOrdersPage';

import type { EditableWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import type { CatalogItem, Client, PaginatedResponse, QuickSearchResult, WorkOrder, WorkOrderWorksheet } from '../../../types/entities';
import type { AxiosResponse } from 'axios';

const { listExportSpy } = vi.hoisted(() => ({ listExportSpy: vi.fn() }));

vi.mock('../../../components/common/ListExportButtons', () => ({
  default: (props: { target: string; filters: Record<string, unknown>; disabled?: boolean }) => {
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

const worksheetFor = (order: WorkOrder): WorkOrderWorksheet => ({
  workOrder: { id: order.id, codigo: order.codigo, estado: order.estado, descripcion: order.descripcion,
    fechaIngreso: order.fechaIngreso, assignedMechanicId: order.assignedMechanicId ?? null,
    vehiculo: { id: order.vehicleId, patente: order.vehicle?.patente ?? null, marca: order.vehicle?.marca ?? null, modelo: order.vehicle?.modelo ?? null },
  },
  items: (order.items ?? []).map((item) => ({ ...item, assignedUser: item.assignedUser ?? null,
    horasEstimadasTotales: null, excedeEstimado: false, activeSession: null, totalMinutes: 30,
    observationsCount: 0, canWork: true, sessions: [],
  })),
  observations: [], progressReports: (order.progressReports ?? []).map((report) => ({ ...report, horasCerradas: report.horasCerradas ?? null, mechanic: report.mechanic ?? null })), requests: [],
  servicios: [], repuestos: [], activeItemId: null, pausedOtherItems: 0,
  totals: { items: order.items?.length ?? 0, completados: 0, enProceso: 0, pendientes: order.items?.length ?? 0, horasEstimadas: 0, horasReales: 0.5, minutosReales: 30 },
});

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

const openCard = async (codigo = workOrder.codigo) => {
  const trigger = await screen.findByRole('button', { name: `Ver información de ${codigo}` });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  return within(screen.getByRole('region', { name: `Información de ${codigo}` }));
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
      if (url === '/work-orders/12/worksheet') return Promise.resolve({ data: { worksheet: worksheetFor(workOrder) } });
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
    expect(screen.getByText('Iniciada')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Iniciadas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gestionar trabajo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Borrador' })).not.toBeInTheDocument();
  });

  it('comparte búsqueda, estado y rango mensual con la exportación de OT', async () => {
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');
    fireEvent.click(screen.getByRole('tab', { name: 'Esperando repuesto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Por mes' }));
    fireEvent.change(screen.getByLabelText('Mes de ingreso'), { target: { value: '2024-02' } });
    fireEvent.change(screen.getByLabelText('Buscar órdenes de trabajo'), { target: { value: 'ABCD' } });
    expect(listExportSpy.mock.lastCall?.[0].filters.search).toBeUndefined();
    await waitFor(() => {
      const props = listExportSpy.mock.lastCall?.[0];
      expect(props).toMatchObject({ target: 'work-orders', disabled: false, filters: {
        page: 1, pageSize: 12, search: 'ABCD', estado: 'esperando_repuesto',
        fechaDesde: '2024-02-01', fechaHasta: '2024-02-29',
      } });
      expect(props.filters).toEqual(vi.mocked(api.get).mock.lastCall?.[1]?.params);
    });
  });

  it('reutiliza la exportación para Mis órdenes sin agregar filtros de asignación del lado cliente', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'mecanico@demo.cl', role: 'mecanico', permissions: [
      { modulo: 'taller', accion: 'read' }, { modulo: 'taller', accion: 'export' },
    ] } });
    const originalGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => url === '/work-orders/mine'
      ? Promise.resolve({ data: { items: [] } }) : originalGet(url, config));
    createWrapper(<MyWorkOrdersPage />, '/my-work-orders');
    await screen.findByText('OT-2026-0012');
    expect(screen.queryByRole('link', { name: 'Nueva Orden de Trabajo' })).not.toBeInTheDocument();
    expect(screen.getByTestId('list-export-work-orders')).toBeInTheDocument();
    const props = listExportSpy.mock.lastCall?.[0];
    expect(props).toMatchObject({ target: 'work-orders', disabled: false });
    expect(props.filters).toEqual({ page: 1, pageSize: 12, search: undefined, estado: undefined,
      fechaDesde: undefined, fechaHasta: undefined,
    });
    expect(api.get).toHaveBeenCalledWith('/work-orders', { params: props.filters });
  });

  it('deshabilita la exportación de OT mientras carga y cuando falla el listado', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Sin conexión'));
    createWrapper(<WorkOrdersPage />);
    expect(listExportSpy.mock.lastCall?.[0].disabled).toBe(true);
    await screen.findByRole('alert');
    expect(listExportSpy.mock.lastCall?.[0].disabled).toBe(true);
  });

  it('muestra el reloj de taller y el avance por tareas en la card', async () => {
    createWrapper(<WorkOrdersPage />);

    await screen.findByText('OT-2026-0012');
    // 1 tarea pendiente -> 0% -> Sin iniciar + reloj corriendo
    expect(screen.getByLabelText('Avance: Sin iniciar')).toHaveTextContent('0%');
    expect(screen.getByText('En taller')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: `Avance de ${workOrder.codigo}` })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Tareas 0/1')).toBeInTheDocument();
  });

  it('abre el detalle en un modal con los trabajos agrupados por tipo', async () => {
    createWrapper(<WorkOrdersPage />);

    await openCard();
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${workOrder.codigo}` }));

    expect(await screen.findByRole('dialog', { name: /OT-2026-0012/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: `Información de ${workOrder.codigo}` })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: `Ver información de ${workOrder.codigo}` }));
    expect(screen.getByText('Mecánico Turno')).toBeInTheDocument();
    expect(screen.getByText('Total est.')).toBeInTheDocument();
    expect(screen.getByText(/Pagado/)).toBeInTheDocument();
    expect(screen.getAllByText(/50\.000/).length).toBeGreaterThanOrEqual(1);
  });

  it('despliega solo una card a la vez y permite cerrar con Escape sin nuevas peticiones', async () => {
    const other = { ...workOrder, id: 13, codigo: 'OT-26-13' };
    vi.mocked(api.get).mockResolvedValue({ data: { ...listResponse, items: [workOrder, other], total: 2 } });
    createWrapper(<WorkOrdersPage />);
    await screen.findByText(workOrder.codigo);
    const queries = vi.mocked(api.get).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: `Ver información de ${workOrder.codigo}` }));
    expect(screen.getByRole('region', { name: `Información de ${workOrder.codigo}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Ver información de ${other.codigo}` }));
    expect(screen.queryByRole('region', { name: `Información de ${workOrder.codigo}` })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: `Información de ${other.codigo}` })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: `Información de ${other.codigo}` })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(queries);
  });

  it('abre la información con hover, permite entrar al panel y la cierra al salir sin mutaciones', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query === '(hover: hover) and (pointer: fine)', media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(() => true) }));
    createWrapper(<WorkOrdersPage />);
    const card = await screen.findByRole('article', { name: 'Orden ' + workOrder.codigo });
    const pointer = (target: Element, type: string, relatedTarget: EventTarget | null = null) => {
      const event = new MouseEvent(type, { bubbles: true, relatedTarget });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      fireEvent(target, event);
    };
    pointer(card, 'pointerover');
    const panel = await screen.findByRole('region', { name: 'Información de ' + workOrder.codigo });
    pointer(card, 'pointerout', document.body);
    pointer(panel, 'pointerover', card);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)); });
    expect(panel).toBeInTheDocument();
    pointer(panel, 'pointerout', document.body);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Información de ' + workOrder.codigo })).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('en táctil la información sigue abriéndose al tocar y no se dispara por pasar el dedo', async () => {
    createWrapper(<WorkOrdersPage />);
    const card = await screen.findByRole('article', { name: 'Orden ' + workOrder.codigo });
    const event = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    fireEvent(card, event);
    expect(screen.queryByRole('region', { name: 'Información de ' + workOrder.codigo })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver información de ' + workOrder.codigo }));
    const extension = screen.getByRole('region', { name: 'Información de ' + workOrder.codigo });
    expect(within(extension).getByRole('button', { name: 'Gestionar trabajo' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Gestionar trabajo' })).not.toBeInTheDocument();
    expect(within(extension).getByRole('button', { name: `Previsualizar PDF de ${workOrder.codigo}` })).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('permite entrar al desplegable con teclado y cerrarlo devolviendo el foco a la card', async () => {
    createWrapper(<WorkOrdersPage />);
    const trigger = await screen.findByRole('button', { name: `Ver información de ${workOrder.codigo}` });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Tab' });
    expect(screen.getByText('Más datos de la orden').closest('summary')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: `Información de ${workOrder.codigo}` })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each(['entregada', 'cancelada'] as const)('mantiene la OT %s en consulta, también al desplegar sus acciones', async (estado) => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...listResponse, items: [{ ...workOrder, estado }] } });
    createWrapper(<WorkOrdersPage />);
    const extension = await openCard();
    expect(extension.getByRole('button', { name: 'Gestionar trabajo' })).toBeInTheDocument();
    expect(extension.queryByRole('button', { name: `Cambiar estado de ${workOrder.codigo}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('ofrece solo las transiciones válidas en el menú de la card', async () => {
    createWrapper(<WorkOrdersPage />);
    await openCard();
    fireEvent.click(await screen.findByRole('button', { name: `Cambiar estado de ${workOrder.codigo}` }));
    const states = within(screen.getByRole('menu', { name: `Estados permitidos para ${workOrder.codigo}` }));
    expect(states.getByRole('menuitem', { name: 'Finalizada' })).toBeInTheDocument();
    expect(states.getByRole('menuitem', { name: 'Esperando repuesto' })).toBeInTheDocument();
    expect(states.queryByRole('menuitem', { name: 'Entregada' })).not.toBeInTheDocument();
    expect(states.queryByRole('menuitem', { name: 'Iniciada' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.keyDown(states.getByRole('menuitem', { name: 'Finalizada' }), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Cambiar estado de ${workOrder.codigo}` })).toHaveFocus();
    expect(screen.getByRole('region', { name: `Información de ${workOrder.codigo}` })).toBeInTheDocument();
  });

  it('conserva notas y formularios al cambiar de vista y confirma antes de descartarlos', async () => {
    createWrapper(<WorkOrdersPage />);
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar trabajo' }));
    const noteLabel = `Nota técnica de ${workOrder.items?.[0].descripcion}`;
    fireEvent.change(await screen.findByLabelText(noteLabel), { target: { value: 'Revisar fijación antes de entregar' } });
    fireEvent.change(screen.getByLabelText('Comentario'), { target: { value: 'Diagnóstico en curso' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resumen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitudes' }));
    fireEvent.change(screen.getByLabelText('Justificación'), { target: { value: 'Se requiere una pieza adicional' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trabajos' }));
    expect(screen.getByLabelText(noteLabel)).toHaveValue('Revisar fijación antes de entregar');
    expect(screen.getByLabelText('Comentario')).toHaveValue('Diagnóstico en curso');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByRole('alertdialog', { name: 'Cambios sin guardar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitudes' }));
    expect(screen.getByLabelText('Justificación')).toHaveValue('Se requiere una pieza adicional');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva la nota si falla el guardado y permite reintentar sobre el mismo ítem', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Sin conexión'));
    createWrapper(<WorkOrdersPage />);
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar trabajo' }));
    fireEvent.click(await screen.findByText('Ver detalle', { selector: 'summary' }));
    const noteLabel = `Nota técnica de ${workOrder.items?.[0].descripcion}`;
    fireEvent.change(await screen.findByLabelText(noteLabel), { target: { value: 'Nota que debe conservarse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar nota' })).not.toBeDisabled());
    expect(screen.getByLabelText(noteLabel)).toHaveValue('Nota que debe conservarse');
    expect(api.patch).toHaveBeenCalledWith('/work-orders/12/execution', {
      items: [{ id: 20, estadoOperativo: 'pendiente', notasOperativas: 'Nota que debe conservarse' }],
    });
    expect(screen.getByRole('button', { name: 'Marcar usado' })).toBeEnabled();
    const saved = { ...workOrder, items: workOrder.items?.map((item) => ({ ...item, notasOperativas: 'Nota que debe conservarse' })) };
    const previousGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, ...args) => url === '/work-orders/12/worksheet' ? Promise.resolve({ data: { worksheet: worksheetFor(saved) } }) : previousGet(url, ...args));
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { workOrder: saved } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar nota' })).not.toBeInTheDocument());
    expect(screen.getByLabelText(noteLabel)).toHaveValue('Nota que debe conservarse');
    expect(api.patch).toHaveBeenCalledTimes(2);
  });

  it('espera la confirmación del servidor y actualiza la card sin sustituir ítems ni horas', async () => {
    let current = workOrder;
    let finish: () => void = () => { throw new Error('No hay guardado pendiente'); };
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/catalog' ? emptyCatalog : url === '/work-orders/12/worksheet' ? { worksheet: worksheetFor(current) } : url === '/work-orders/12' ? { workOrder: current } : { ...listResponse, items: [current] } }));
    vi.mocked(api.post).mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ data: { worksheet: worksheetFor(current) } }); }));
    createWrapper(<WorkOrdersPage />);
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar trabajo' }));
    const completed = await screen.findByRole('button', { name: 'Marcar usado' });
    fireEvent.click(completed);
    await waitFor(() => expect(completed).toBeDisabled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/work-orders/12/items/20/complete', {}));
    current = { ...workOrder, items: workOrder.items?.map((item) => ({ ...item, estadoOperativo: 'completado' })) };
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Marcar usado' })).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
    const card = within(screen.getByRole('article', { name: `Orden ${workOrder.codigo}` }));
    await waitFor(() => expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100'));
  });

  it('oculta importes y documentos financieros al mecánico incluso en la información desplegable', async () => {
    const assigned = { ...workOrder, assignedMechanicId: 9 };
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'mecanico@demo.cl', role: 'mecanico' } });
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/catalog' ? emptyCatalog : url === '/work-orders/12/worksheet' ? { worksheet: worksheetFor(assigned) } : url === '/work-orders/12' ? { workOrder: assigned } : { ...listResponse, items: [assigned] } }));
    createWrapper(<WorkOrdersPage />);
    fireEvent.click(await screen.findByRole('button', { name: `Ver información de ${workOrder.codigo}` }));
    expect(screen.queryByText('Total est.')).not.toBeInTheDocument();
    expect(screen.queryByText('Saldo pendiente')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar trabajo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resumen' }));
    expect(screen.queryByText('Total estimado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vista previa PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ficha y horas' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/work-orders/12');
  });

  it('abre el modal por enlace y permite al mecánico operar solo su servicio con cronómetro', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'mecanico@demo.cl', role: 'mecanico' } });
    const assigned = { ...workOrder, assignedMechanicId: 10, items: [
      { ...workOrder.items![0], tipoLinea: 'especifico' as const, assignedUserId: 9, assignedUser: { id: 9, nombre: 'Mecánico' } },
      { ...workOrder.items![0], id: 21, descripcion: 'Servicio de otro mecánico', tipoLinea: 'especifico' as const, assignedUserId: 10, assignedUser: { id: 10, nombre: 'Otro mecánico' } },
    ] };
    let sheet = worksheetFor(assigned);
    sheet.items[1].canWork = false;
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/work-orders/12/worksheet' ? { worksheet: sheet } : url === '/catalog' ? emptyCatalog : { ...listResponse, items: [assigned] } }));
    vi.mocked(api.post).mockImplementation((url) => {
      sheet = { ...sheet, items: sheet.items.map((item) => item.id !== 20 ? item : { ...item, estadoOperativo: 'en_proceso', activeSession: url.endsWith('/start') ? { id: 88, startedAt: new Date().toISOString(), userName: 'Mecánico', userId: 9, mine: true, elapsedMinutes: 0 } : null }) };
      return Promise.resolve({ data: { worksheet: sheet } });
    });
    createWrapper(<WorkOrdersPage />, '/work-orders?manage=12');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar' })).toBeEnabled());
    expect(screen.queryByRole('article', { name: 'Trabajo: Servicio de otro mecánico' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mis trabajos' }));
    const other = screen.getByRole('article', { name: 'Trabajo: Servicio de otro mecánico' });
    expect(within(other).queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/work-orders/12/items/20/start'));
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/work-orders/12/items/20/pause'));
    await screen.findByRole('button', { name: 'Continuar' });
    expect(api.get).not.toHaveBeenCalledWith('/work-orders/12');
  });

  it('permite asignar un mecánico distinto por servicio en el editor de recepción', async () => {
    const Harness = () => {
      const [items, setItems] = useState<EditableWorkOrderItem[]>([{ ...createEmptyWorkOrderItem(), descripcion: 'Servicio A', tipoLinea: 'especifico' }, { ...createEmptyWorkOrderItem(), descripcion: 'Servicio B', tipoLinea: 'especifico' }]);
      return <WorkOrderItemsEditor items={items} onChange={setItems} showExecution={false} mechanics={[{ id: 9, nombre: 'Mecánico A' }, { id: 10, nombre: 'Mecánico B' }]} />;
    };
    createWrapper(<Harness />);
    fireEvent.change(screen.getByLabelText('Mecánico del servicio 1'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Mecánico del servicio 2'), { target: { value: '10' } });
    expect(screen.getByLabelText('Mecánico del servicio 1')).toHaveValue('9');
    expect(screen.getByLabelText('Mecánico del servicio 2')).toHaveValue('10');
    expect(screen.queryByLabelText('Estado del trabajo 1')).not.toBeInTheDocument();
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
    expect(await screen.findByRole('button', {name: 'Cambiar responsable del ingreso'})).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/clients/7', {params: {includeVehicles: false}});
    fireEvent.click(screen.getByRole('button', {name: /siguiente/i}));
    expect(await screen.findByRole('button', {name: 'Cambiar datos de facturación'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Cambiar datos de contacto'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /siguiente/i}));
    if (includeVehicle) {
      expect((await screen.findAllByText('ABCD12')).length).toBeGreaterThan(0);
      expect(screen.getByText('Propietario registrado: Propietario original')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', {name: /siguiente/i}));
      expect(await screen.findByLabelText('Kilometraje de entrada')).toHaveValue(42000);
    } else {
      expect(await screen.findByRole('combobox', {name: 'Búsqueda rápida de vehículos y clientes'})).toBeInTheDocument();
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
    expect(screen.getByLabelText('Avance: Finalizado')).toHaveTextContent('100%');
    expect(screen.getByRole('article', { name: `Orden ${workOrder.codigo}` })).toHaveAttribute('data-colour', 'done');
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

    fireEvent.click(screen.getByRole('tab', { name: 'Iniciadas' }));

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
      fireEvent.click(screen.getByRole('tab', { name: 'Iniciadas' }));
      fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: period }));
      expect(screen.getByRole('button', { name: 'Periodo de ingreso' })).toHaveTextContent(period);
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
    fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Por mes' }));
    fireEvent.change(screen.getByLabelText('Mes de ingreso'), { target: { value: '2024-02' } });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ page: 1, fechaDesde: '2024-02-01', fechaHasta: '2024-02-29' }),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Todas las fechas' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ fechaDesde: undefined, fechaHasta: undefined }),
    }));
    expect(screen.queryByLabelText('Mes de ingreso')).not.toBeInTheDocument();
  });

  it('filtra una fecha específica con el calendario y permite limpiar o cambiar el periodo', async () => {
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');
    expect(screen.queryByRole('combobox', { name: 'Periodo de ingreso' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Iniciadas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fecha específica' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Calendario: fecha específica' })).toContainElement(document.activeElement as HTMLElement));
    expect(screen.getByRole('button', { name: 'Fecha específica' })).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    const today = new Date();
    const date = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ page: 1, estado: 'en_progreso', fechaDesde: date, fechaHasta: date }),
    }));
    expect(screen.getByRole('button', { name: 'Periodo de ingreso' })).toHaveTextContent('Fecha específica');
    fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fecha específica' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Calendario: fecha específica' })).toContainElement(document.activeElement as HTMLElement));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar calendario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar fecha específica' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ estado: 'en_progreso', fechaDesde: undefined, fechaHasta: undefined }),
    }));
    expect(screen.getByRole('button', { name: 'Periodo de ingreso' })).toHaveTextContent('Todas las fechas');
    expect(screen.getByRole('button', { name: 'Periodo de ingreso' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fecha específica' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Periodo de ingreso' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '15 días' }));
    expect(screen.queryByRole('button', { name: 'Fecha específica' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Periodo de ingreso' })).toHaveTextContent('15 días');
  });

  it('cierra el menú de periodos con Escape y devuelve el foco al control', async () => {
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');
    const trigger = screen.getByRole('button', { name: 'Periodo de ingreso' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Filtrar por fecha de ingreso' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document, { key: 'End' });
    expect(screen.getByRole('menuitemradio', { name: 'Fecha específica' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Filtrar por fecha de ingreso' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('permite consultar órdenes canceladas desde su filtro sin modificar estados', async () => {
    createWrapper(<WorkOrdersPage />);
    await screen.findByText('OT-2026-0012');
    fireEvent.click(screen.getByRole('tab', { name: 'Anuladas' }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/work-orders', {
      params: expect.objectContaining({ page: 1, estado: 'cancelada' }),
    }));
    expect(api.patch).not.toHaveBeenCalled();
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
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar trabajo' }));
    await screen.findByRole('heading', { name: 'Reportar avance' });
    fireEvent.change(screen.getByLabelText('Avance %'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Comentario'), { target: { value: 'Diagnóstico completado' } });
    expect(screen.getByRole('button', { name: 'Registrar avance' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Avance %'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar avance' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/work-orders/12/execution', {
      reporte: { porcentaje: 0, comentario: 'Diagnóstico completado', bloqueos: null },
    }));
    await waitFor(() => expect(screen.getByLabelText('Comentario')).toHaveValue(''));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Taller y Órdenes de trabajo' })).toBeInTheDocument();
  });

  it('el mecánico asignado solicita un repuesto sin acceder al detalle completo ni aprobarlo', async () => {
    useAuthStore.setState({ user: { id: 9, nombre: 'Mecánico', email: 'mecanico@demo.cl', role: 'mecanico' } });
    const assigned = { ...workOrder, assignedMechanicId: 9 };
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data:
      url === '/catalog' ? { ...emptyCatalog, items: [{ id: 80, nombre: 'Filtro', tipo: 'parte', stock: 5 }] }
        : url === '/work-orders/12' ? { workOrder: assigned }
          : url === '/work-orders/12/worksheet' ? { worksheet: worksheetFor(assigned) }
          : { ...listResponse, items: [assigned] },
    }));
    vi.mocked(api.post).mockResolvedValue({ data: { workOrder: assigned } });
    createWrapper(<WorkOrdersPage />);
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar trabajo' }));
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
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${workOrder.codigo}` }));
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
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar trabajo' }));
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
    fireEvent.click(screen.getByRole('button', { name: `Ver detalle de ${workOrder.codigo}` }));
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
    expect(within(screen.getByRole('region', { name: 'Recepción y facturación' })).getByText('Empresa Factura SpA')).toBeInTheDocument();
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


  it('la navegación de recepción impide saltarse responsable y vehículo', async () => {
    createWrapper(<WorkOrderCreatePage />, '/work-orders/new');
    const steps = within(screen.getByRole('navigation', { name: 'Línea de tiempo de orden de trabajo' }));
    await waitFor(() => expect(steps.getByRole('button', { name: '5. Servicios' })).not.toBeDisabled());
    fireEvent.click(steps.getByRole('button', { name: '5. Servicios' }));
    expect(steps.getByRole('button', { name: '1. Responsable' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Seleccione o cree el responsable que entrega el vehículo.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Cliente Demo.*12.345.678-5/ }));
    fireEvent.click(steps.getByRole('button', { name: '5. Servicios' }));
    expect(steps.getByRole('button', { name: '3. Vehículo' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Seleccione o cree el vehículo que ingresa al taller.')).toBeInTheDocument();
    fireEvent.click(steps.getByRole('button', { name: '2. Facturación' }));
    expect(screen.getAllByText('Cliente Demo')).toHaveLength(3);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('protege la edición de recepción al salir y conserva los campos al continuar', async () => {
    createWrapper(<Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>, '/work-orders/12');
    fireEvent.click(await screen.findByRole('button', { name: /Editar ficha/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar recepción e inspección' });
    fireEvent.change(within(dialog).getByLabelText('Observaciones de inspección'), { target: { value: 'Nota sin guardar' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(dialog).getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
    expect(within(dialog).getByLabelText('Observaciones de inspección')).toHaveValue('Nota sin guardar');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog', { name: 'Editar recepción e inspección' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('reintenta la edición de trabajos sin perder IDs, notas ni estimaciones de horas', async () => {
    const existing = { ...workOrder, items: workOrder.items?.map((item) => ({ ...item, horasHombreEstimadas: 2, horasHombreReales: 7 })) };
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/work-orders/12' ? { workOrder: existing } : url === '/catalog' ? emptyCatalog : clientsResponse } as AxiosResponse));
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ data: { workOrder: existing } });
    createWrapper(<Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>, '/work-orders/12');
    fireEvent.click(await screen.findByRole('button', { name: /Editar trabajos/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar trabajos y repuestos' });
    fireEvent.change(within(dialog).getByLabelText('Nota operativa 1'), { target: { value: 'Mantener esta nota' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar trabajos' }));
    await within(dialog).findByRole('alert');
    expect(within(dialog).getByLabelText('Nota operativa 1')).toHaveValue('Mantener esta nota');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar trabajos' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
    const [url, payload] = vi.mocked(api.patch).mock.calls[1];
    expect(url).toBe('/work-orders/12');
    expect(payload).toEqual(expect.objectContaining({ items: [expect.objectContaining({ id: 20, horasHombreEstimadas: 2, notasOperativas: 'Mantener esta nota' })] }));
    expect(JSON.stringify(payload)).not.toContain('horasHombreReales');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar trabajos y repuestos' })).not.toBeInTheDocument());
  });

  it('bloquea cierre y cambios durante el guardado de la ficha de recepción', async () => {
    let finish: () => void = () => { throw new Error('Guardado no iniciado'); };
    vi.mocked(api.patch).mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ data: { workOrder } } as AxiosResponse); }));
    createWrapper(<Routes><Route path="/work-orders/:id" element={<WorkOrderDetailPage />} /></Routes>, '/work-orders/12');
    fireEvent.click(await screen.findByRole('button', { name: /Editar ficha/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar recepción e inspección' });
    fireEvent.change(within(dialog).getByLabelText('Observaciones de inspección'), { target: { value: 'Guardado pendiente' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByLabelText('Observaciones de inspección')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar recepción e inspección' })).not.toBeInTheDocument());
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

  it('cambia el contacto sin alterar responsable ni facturación y permite conservar la selección', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation();
    const contact = { ...client, id: 8, nombre: 'Contacto diferente' };
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/clients') return Promise.resolve({ data: { ...clientsResponse, items: [client, contact], total: 2 } });
      return baseGet?.(url, config) ?? Promise.reject(new Error('Ruta no simulada'));
    });
    createWrapper(<WorkOrderCreatePage />, '/work-orders/new');
    fireEvent.click(await screen.findByText('Cliente Demo'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar datos de contacto' }));
    const picker = within(screen.getByRole('region', { name: 'Datos de contacto' }));
    fireEvent.click(await picker.findByRole('button', { name: /Contacto diferente/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar datos de contacto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conservar selección' }));
    expect(screen.getByText('Contacto diferente')).toBeInTheDocument();
    expect(screen.getAllByText('Cliente Demo')).toHaveLength(2);
    await act(async () => { await flushFormDrafts(); });
    const saved = await loadFormDraft(1, 'work-order:new', workOrderRecoverySchema);
    expect(saved?.payload.client?.id).toBe(7);
    expect(saved?.payload.contactClient?.id).toBe(8);
    expect(saved?.payload.billingClient?.id).toBe(7);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva inspección, reemplazo de foto y horas estimadas al revisar y volver entre pasos', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation();
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/search/quick') return Promise.resolve({ data: quickSearchResponse });
      if (url === '/vehicles') return Promise.resolve({ data: { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 } });
      return baseGet?.(url, config) ?? Promise.reject(new Error('Ruta no simulada'));
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:reception-review') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    createWrapper(<WorkOrderCreatePage />, '/work-orders/new');
    fireEvent.click(await screen.findByText('Cliente Demo'));
    fireEvent.click(screen.getByRole('button', { name: '3. Vehículo' }));
    const search = screen.getByRole('combobox', { name: 'Búsqueda rápida de vehículos y clientes' });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'AB' } });
    fireEvent.click(await screen.findByText('ABCD12'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByText('Observaciones adicionales', { exact: true }));
    fireEvent.change(screen.getByLabelText('Observaciones de inspección'), { target: { value: 'Rayón registrado en recepción' } });
    fireEvent.click(screen.getByText('Fotos del vehículo', { exact: true }));
    const gallery = screen.getByRole('region', { name: 'Registro fotográfico' });
    expect([...gallery.querySelectorAll('input[type=file]:not([capture])')].map((input) => input.getAttribute('aria-label'))).toEqual([
      'Subir foto Frontal izq.', 'Subir foto Frontal', 'Subir foto Frontal der.',
      'Subir foto Lateral izquierdo', 'Subir foto Interior', 'Subir foto Lateral derecho',
      'Subir foto Trasero izq.', 'Subir foto Trasera', 'Subir foto Trasero der.',
    ]);
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [new File(['first'], 'primera.png', { type: 'image/png' })] } });
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [new File(['replacement'], 'reemplazo.png', { type: 'image/png' })] } });
    expect(within(gallery).getByRole('img', { name: 'Frontal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ítem libre' }));
    fireEvent.change(screen.getByLabelText('Descripción 1'), { target: { value: 'Diagnóstico de suspensión' } });
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario 1'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Horas hombre por unidad del ítem 1'), { target: { value: '1.5' } });
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('$30.000');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    const review = within(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' }));
    expect(review.getByText('1/9 fotos')).toBeInTheDocument();
    expect(review.getByText(/1.5 h \/ unidad/)).toBeInTheDocument();
    fireEvent.click(review.getByRole('button', { name: 'Volver a editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByLabelText('Observaciones de inspección')).toHaveValue('Rayón registrado en recepción');
    expect(screen.getByRole('img', { name: 'Frontal' })).toBeInTheDocument();
    await act(async () => { await flushFormDrafts(); });
    const saved = await loadFormDraft(1, 'work-order:new', workOrderRecoverySchema);
    expect(saved?.payload.photos).toHaveLength(1);
    expect(saved?.payload.photos[0]).toMatchObject({ slot: 'frontal', name: 'reemplazo.png' });
    expect(saved?.payload.items[0]).toMatchObject({ cantidad: '2', precioUnitario: '15000', horasHombreEstimadas: '1.5' });
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
  it('recupera el paso, la inspección y las fotos sin crear una OT anticipadamente', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:recovery') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/clients') return Promise.resolve({ data: clientsResponse });
      if (url === '/search/quick') return Promise.resolve({ data: quickSearchResponse });
      if (url === '/catalog') return Promise.resolve({ data: emptyCatalog });
      return Promise.resolve({ data: { mechanics: [] } });
    });
    const first = createWrapper(<WorkOrderCreatePage />, '/work-orders/new');
    fireEvent.click(await screen.findByText('Cliente Demo'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    const search = screen.getByRole('combobox', { name: 'Búsqueda rápida de vehículos y clientes' });
    fireEvent.focus(search); fireEvent.change(search, { target: { value: 'AB' } });
    fireEvent.click(await screen.findByText('ABCD12'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.change(screen.getByLabelText('Kilometraje de entrada'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Observaciones de inspección'), { target: { value: 'Rayón lateral' } });
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [new File(['original'], 'frente.png', { type: 'image/png' })] } });
    await act(async () => { await flushFormDrafts(); });
    first.unmount();
    createWrapper(<WorkOrderCreatePage />, '/work-orders/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByLabelText('Kilometraje de entrada')).toHaveValue(12345);
    expect(screen.getByLabelText('Observaciones de inspección')).toHaveValue('Rayón lateral');
    expect(screen.getByRole('img', { name: 'Frontal' })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva las fotos exitosas, recupera la OT creada y reintenta sólo la foto fallida', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:pending') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/clients') return Promise.resolve({ data: clientsResponse });
      if (url === '/search/quick') return Promise.resolve({ data: quickSearchResponse });
      if (url === '/catalog') return Promise.resolve({ data: emptyCatalog });
      return Promise.resolve({ data: { mechanics: [] } });
    });
    let rejectRear = true;
    vi.mocked(api.post).mockImplementation(async (url) => {
      if (url === '/work-orders') return { data: { workOrder: { ...workOrder, id: 77 } } };
      const slot = String(url).split('/').pop();
      if (slot === 'trasera' && rejectRear) throw new Error('Sin conexión');
      return { data: { photo: { id: 1, slot } } };
    });
    const routes = <Routes><Route path="/work-orders/new" element={<WorkOrderCreatePage />} /><Route path="/work-orders/:id" element={<p>OT con fotos completas</p>} /></Routes>;
    const first = createWrapper(routes, '/work-orders/new');
    fireEvent.click(await screen.findByText('Cliente Demo'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    const search = screen.getByRole('combobox', { name: 'Búsqueda rápida de vehículos y clientes' });
    fireEvent.focus(search); fireEvent.change(search, { target: { value: 'AB' } });
    fireEvent.click(await screen.findByText('ABCD12'));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    for (const name of ['Frontal', 'Trasera', 'Lateral izquierdo']) {
      fireEvent.change(screen.getByLabelText('Subir foto ' + name), { target: { files: [new File([name], name + '.png', { type: 'image/png' })] } });
    }
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y crear orden' }));
    expect(await screen.findByText(/2 de 3 fotos guardadas/)).toBeInTheDocument();
    await act(async () => { await flushFormDrafts(); });
    const pending = await loadFormDraft(1, 'work-order:new', workOrderRecoverySchema);
    expect(pending?.payload.createdOrder?.id).toBe(77);
    expect(pending?.payload.uploadedSlots).toEqual(['frontal', 'lateral_izquierdo']);
    first.unmount();
    rejectRear = false;
    createWrapper(routes, '/work-orders/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByText(/2 de 3 fotos guardadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar fotos pendientes' }));
    expect(await screen.findByText('OT con fotos completas')).toBeInTheDocument();
    expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/work-orders')).toHaveLength(1);
    for (const slot of ['frontal', 'lateral_izquierdo']) expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/work-orders/77/inspection/photos/' + slot)).toHaveLength(1);
    expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/work-orders/77/inspection/photos/trasera')).toHaveLength(2);
    expect(await loadFormDraft(1, 'work-order:new', workOrderRecoverySchema)).toBeNull();
  });

  it('recupera fotos de una conversión ya realizada sin volver a convertir la COT', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:converted') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const file = new File(['original'], 'frontal.png', { type: 'image/png' });
    const draft = workOrderRecoverySchema.parse({
      activeStep: 4, client, contactClient: client, billingClient: client,
      vehicle: quickSearchResponse.vehicles[0], assignedMechanicId: null,
      kilometrajeIngreso: '45000', descripcion: 'Recepción convertida', fechaIngreso: '2026-10-29T09:30', fechaEntrega: '',
      items: [], inspection: workOrder.inspection,
      photos: [{ slot: 'frontal', file, name: file.name, lastModified: file.lastModified }],
      createdOrder: { id: 77, codigo: 'OT-26-77' }, uploadedSlots: [],
    });
    await saveFormDraft(1, 'work-order:convert:44', draft, 'converted');
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/quotations/44') return Promise.resolve({ data: { quotation: { id: 44, codigo: 'COT-26-44', clientId: 7, vehicleId: null, workOrderId: 77, items: [], total: 0 } } });
      if (url === '/clients/7') return Promise.resolve({ data: { client } });
      if (url === '/clients') return Promise.resolve({ data: clientsResponse });
      if (url === '/catalog') return Promise.resolve({ data: emptyCatalog });
      return Promise.resolve({ data: { mechanics: [] } });
    });
    vi.mocked(api.post).mockResolvedValue({ data: { photo: { id: 1, slot: 'frontal' } } });
    createWrapper(<Routes><Route path="/quotations/:quotationId/convert-to-ot" element={<WorkOrderCreatePage />} /><Route path="/work-orders/:id" element={<p>OT convertida recuperada</p>} /></Routes>, '/quotations/44/convert-to-ot');
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByText('La OT OT-26-77 ya está guardada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar fotos pendientes' }));
    expect(await screen.findByText('OT convertida recuperada')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/work-orders/77/inspection/photos/frontal', expect.any(FormData), expect.any(Object));
  });

});
