import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderAccSection from '../WorkOrderAccSection';
import WorkOrderDpSection from '../WorkOrderDpSection';
import WorkOrderLaborBoard from '../WorkOrderLaborBoard';

import type { WorkOrder, WorkOrderWorksheet, WorkOrderWorksheetItem } from '../../../types/entities';
import type { Role } from '@unithor/shared';

const login = (role: Role = 'jefe', id = 10) => useAuthStore.setState({
  user: { id, nombre: 'Prueba', email: 'test@example.invalid', role },
  isLoading: false,
  isAuthenticated: true,
});
const itemFor = (overrides: Partial<WorkOrderWorksheetItem> = {}): WorkOrderWorksheetItem => ({
  id: 101, descripcion: 'Puerta', tipoLinea: 'estandar', unidadMedida: 'unidad', cantidad: 1,
  estadoOperativo: 'pendiente', notasOperativas: null, horasHombreEstimadas: 3, horasEstimadasTotales: 3,
  horasHombreReales: null, excedeEstimado: false, assignedUser: null, laborValidatedAt: null,
  laborValidationNote: null, activeSession: null, totalMinutes: 0, observationsCount: 0,
  division: 'DP', subtipo: 'servicio_dp', ccfStatus: 'pendiente',
  dpStages: ['Desarme', 'Preparación', 'Pintor', 'Montaje', 'Detailer'].map((stageLabel, index) => ({
    id: index + 1, stageIndex: index + 1, stageKey: String(index + 1), stageLabel,
    assignedUserId: index === 0 ? 10 : 11, status: 'pendiente', startedAt: null, completedAt: null,
  })),
  ...overrides,
});

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

describe('WorkOrderDivisionSections (D&P and ACC)', () => {
  let queryClient: QueryClient;

  const mechanics = [
    { id: 10, nombre: 'Juan Mecánico' },
    { id: 11, nombre: 'Pedro Armador' },
    { id: 12, nombre: 'Diego Pintor' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    login();
    vi.mocked(api.get).mockResolvedValue({ data: { items: [] } });
    vi.mocked(api.patch).mockResolvedValue({ data: { workOrder: { id: 55 } } });
    vi.mocked(api.post).mockResolvedValue({ data: { workOrder: { id: 55 } } });
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const mountDp = (item = itemFor(), canManage = true) => render(
    <QueryClientProvider client={queryClient}>
      <WorkOrderDpSection workOrderId={55} items={[item]} mechanics={mechanics} canManage={canManage} closed={false} />
    </QueryClientProvider>,
  );
  const mountAcc = (item = itemFor({ division: 'ACC', tipoLinea: 'parte', dpStages: [] }), canManage = true) => render(
    <QueryClientProvider client={queryClient}>
      <WorkOrderAccSection workOrderId={55} items={[item]} mechanics={mechanics} canManage={canManage} closed={false} />
    </QueryClientProvider>,
  );

  it('does not grant stage assignment or quality controls from canManage alone', () => {
    login('vendedor');
    mountDp();
    expect(screen.getByLabelText('Mecánico de Desarme')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CCF: Pendiente/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Nota: +' })).not.toBeInTheDocument();
  });

  it('allows an assigned technician to operate only their stage, without assigning or approving', async () => {
    login('mecanico');
    mountDp(itemFor(), false);
    const buttons = screen.getAllByRole('button', { name: 'Iniciar' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/work-orders/55/dp-stages/1', { status: 'en_proceso' }));
    expect(screen.getByLabelText('Mecánico de Desarme')).toBeDisabled();
    expect(screen.getByRole('button', { name: /CCF: Pendiente/ })).toBeDisabled();
  });

  it('keeps a future assigned stage locked until the prior stages finish', () => {
    login('mecanico', 11);
    mountDp(itemFor(), false);
    screen.getAllByRole('button', { name: 'Iniciar' }).forEach((button) => expect(button).toBeDisabled());
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('saves a chief note without approving CCF', async () => {
    mountDp();
    fireEvent.click(screen.getByRole('button', { name: 'Nota: +' }));
    fireEvent.change(screen.getByLabelText('Nota de la etapa o revisión'), { target: { value: 'Revisar alineación' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/work-orders/55/items/101/dp-ccf', { note: 'Revisar alineación' }));
  });

  it('requires all five stages and a rejection reason for CCF', async () => {
    const item = itemFor();
    item.dpStages = item.dpStages?.map((stage) => ({ ...stage, status: 'completado' }));
    mountDp(item);
    expect(screen.getByRole('button', { name: /CCF: Pendiente/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar CCF' }));
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nota de la etapa o revisión'), { target: { value: 'Corregir terminación' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/work-orders/55/items/101/dp-ccf', { status: 'rechazado', note: 'Corregir terminación' }));
  });

  it('lets bodega sign only delivery and never clear a signed delivery', async () => {
    login('bodeguero');
    const view = mountAcc();
    expect(screen.getByRole('button', { name: 'Entregado' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recibido' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Entregado' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/work-orders/55/items/101/acc-custody', { entregado: true }));
    view.rerender(<QueryClientProvider client={queryClient}><WorkOrderAccSection workOrderId={55} items={[itemFor({ division: 'ACC', tipoLinea: 'parte', entregadoBodega: true, entregadoBodegaAt: '2026-11-23T10:00:00Z' })]} mechanics={mechanics} canManage={false} closed={false} /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: 'Entregado' })).toBeDisabled();
  });

  it('requires delivery before assigned technician reception and never changes price', async () => {
    login('mecanico');
    const item = itemFor({ division: 'ACC', tipoLinea: 'parte', assignedUser: { id: 10, nombre: 'Prueba' } });
    const view = mountAcc(item, false);
    expect(screen.getByRole('button', { name: 'Entregado' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recibido' })).toBeDisabled();
    view.rerender(<QueryClientProvider client={queryClient}><WorkOrderAccSection workOrderId={55} items={[{ ...item, entregadoBodega: true }]} mechanics={mechanics} canManage={false} closed={false} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Recibido' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/work-orders/55/items/101/acc-custody', { recibido: true }));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it.each(['bodeguero', 'read-only', 'unassigned-mechanic', 'closed'] as const)('does not expose ACC completion to %s despite signed custody', async (mode) => {
    login(mode === 'bodeguero' ? 'bodeguero' : mode === 'unassigned-mechanic' ? 'mecanico' : 'jefe');
    if (mode === 'read-only') useAuthStore.setState({ user: {
      id: 10, nombre: 'Prueba', email: 'test@example.invalid', role: 'jefe',
      permissions: [{ modulo: 'taller', accion: 'read' }],
    } });
    const order: WorkOrder = {
      id: 55, codigo: 'OT-26-55', clientId: 1, vehicleId: 1, estado: mode === 'closed' ? 'entregada' : 'en_progreso',
      descripcion: null, kilometrajeIngreso: null, fechaIngreso: null, fechaEntrega: null,
      createdBy: 1, createdAt: '2026-11-23T10:00:00Z', updatedAt: '2026-11-23T10:00:00Z',
    };
    const item = itemFor({
      division: 'ACC', tipoLinea: 'parte', dpStages: [],
      canWork: mode !== 'unassigned-mechanic',
      assignedUser: { id: 11, nombre: 'Otro técnico' },
      entregadoBodegaAt: '2026-11-23T10:00:00Z', recibidoTallerAt: '2026-11-23T10:05:00Z',
    });
    const worksheet: WorkOrderWorksheet = {
      workOrder: { ...order, vehiculo: { id: 1, patente: 'ABCD12', marca: null, modelo: null } },
      items: [item], servicios: [], repuestos: [item], observations: [], progressReports: [],
      activeItemId: null, pausedOtherItems: 0,
      totals: { items: 1, completados: 0, enProceso: 0, pendientes: 1, horasEstimadas: 0, horasReales: 0, minutosReales: 0 },
    };
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith('/worksheet') ? { worksheet } : { items: [], mechanics: [] } }));
    render(<QueryClientProvider client={queryClient}><WorkOrderLaborBoard workOrder={order} onDirtyChange={vi.fn()} onPendingChange={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/work-orders/55/worksheet'));
    await screen.findByText('ACC:');
    if (mode !== 'unassigned-mechanic') await screen.findByRole('article', { name: 'Trabajo: Puerta' });
    expect(screen.queryByRole('button', { name: 'Marcar usado' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('renders D&P surgical 5 stages, prevents skipping locked stages, and displays CCF', async () => {
    const dpItem: WorkOrderWorksheetItem = {
      id: 101,
      descripcion: 'Puerta delantera L',
      tipoLinea: 'estandar',
      unidadMedida: 'unidad',
      cantidad: 1,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
      horasHombreEstimadas: 6.5,
      horasEstimadasTotales: 6.5,
      horasHombreReales: null,
      excedeEstimado: false,
      assignedUser: null,
      laborValidatedAt: null,
      laborValidationNote: null,
      activeSession: null,
      totalMinutes: 0,
      observationsCount: 0,
      division: 'DP',
      subtipo: 'servicio_dp',
      precioUnitario: 90000,
      ccfStatus: 'pendiente',
      ccfNote: null,
      dpStages: [
        {
          id: 1,
          workOrderItemId: 101,
          stageKey: 'armador_desarme',
          stageName: 'Armador (Desarme)',
          stageLabel: 'Armador (Desarme)',
          stageIndex: 1,
          stageOrder: 1,
          assignedUserId: 11,
          assignedUserName: 'Pedro Armador',
          status: 'pendiente',
          startedAt: null,
          completedAt: null,
          note: null,
        },
        {
          id: 2,
          workOrderItemId: 101,
          stageKey: 'desab_prepar',
          stageName: 'Desab / Prepar',
          stageLabel: 'Desab / Prepar',
          stageIndex: 2,
          stageOrder: 2,
          assignedUserId: null,
          assignedUserName: null,
          status: 'pendiente',
          startedAt: null,
          completedAt: null,
          note: null,
        },
        {
          id: 3,
          workOrderItemId: 101,
          stageKey: 'pintor',
          stageName: 'Pintor',
          stageLabel: 'Pintor',
          stageIndex: 3,
          stageOrder: 3,
          assignedUserId: 12,
          assignedUserName: 'Diego Pintor',
          status: 'pendiente',
          startedAt: null,
          completedAt: null,
          note: null,
        },
        {
          id: 4,
          workOrderItemId: 101,
          stageKey: 'armador_montaje',
          stageName: 'Armador (Montaje)',
          stageLabel: 'Armador (Montaje)',
          stageIndex: 4,
          stageOrder: 4,
          assignedUserId: null,
          assignedUserName: null,
          status: 'pendiente',
          startedAt: null,
          completedAt: null,
          note: null,
        },
        {
          id: 5,
          workOrderItemId: 101,
          stageKey: 'detailer',
          stageName: 'Detailer',
          stageLabel: 'Detailer',
          stageIndex: 5,
          stageOrder: 5,
          assignedUserId: null,
          assignedUserName: null,
          status: 'pendiente',
          startedAt: null,
          completedAt: null,
          note: null,
        },
      ],
    };

    render(
      <QueryClientProvider client={queryClient}>
        <WorkOrderDpSection
          workOrderId={55}
          items={[dpItem]}
          mechanics={mechanics}
          canManage={true}
          closed={false}
        />
      </QueryClientProvider>,
    );

    // Verifies header badge and piece name
    expect(screen.getByText('D&P:')).toBeInTheDocument();
    expect(screen.getByText('Puerta delantera L')).toBeInTheDocument();

    // Verifies all 5 stage labels are rendered
    expect(screen.getByText('Armador (Desarme)')).toBeInTheDocument();
    expect(screen.getByText('Desab / Prepar')).toBeInTheDocument();
    expect(screen.getByText('Pintor')).toBeInTheDocument();
    expect(screen.getByText('Armador (Montaje)')).toBeInTheDocument();
    expect(screen.getByText('Detailer')).toBeInTheDocument();

    // Stage 1 is unlocked, stage 2 is locked (disabled) because stage 1 is not completed
    const startButtons = screen.getAllByRole('button', { name: 'Iniciar' });
    expect(startButtons[0]).toBeEnabled(); // Stage 1
    expect(startButtons[1]).toBeDisabled(); // Stage 2 is locked

    // CCF button is present
    expect(screen.getByRole('button', { name: /CCF: Pendiente/i })).toBeInTheDocument();
  });

  it('renders ACC custody chain with Bodeguero and Armador checks and predictive part search', async () => {
    const accItem: WorkOrderWorksheetItem = {
      id: 202,
      descripcion: 'Parachoques Offroad',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 1,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
      horasHombreEstimadas: null,
      horasEstimadasTotales: null,
      horasHombreReales: null,
      excedeEstimado: false,
      assignedUser: null,
      laborValidatedAt: null,
      laborValidationNote: null,
      activeSession: null,
      totalMinutes: 0,
      observationsCount: 0,
      division: 'ACC',
      subtipo: 'en_stock',
      precioUnitario: 85000,
      custodyBodegueroDeliveredAt: null,
      custodyArmadorReceivedAt: null,
      custodyArmadorNote: null,
    };

    vi.mocked(api.get).mockResolvedValue({
      data: {
        items: [
          { id: 901, nombre: 'Snorkel 4x4', codigo: 'SNK-01', stock: 5, precio: 120000 },
        ],
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WorkOrderAccSection
          workOrderId={55}
          items={[accItem]}
          mechanics={mechanics}
          canManage={true}
          closed={false}
        />
      </QueryClientProvider>,
    );

    // Verifies header badge and piece
    expect(screen.getByText('ACC:')).toBeInTheDocument();
    expect(screen.getByText('Parachoques Offroad')).toBeInTheDocument();

    // Verifies delivery and reception toggle buttons
    const deliveredBtn = screen.getByRole('button', { name: 'Entregado' });
    const receivedBtn = screen.getByRole('button', { name: 'Recibido' });
    expect(deliveredBtn).toBeInTheDocument();
    expect(receivedBtn).toBeInTheDocument();

    // Verifies "+ Nuevo Repuesto / Accesorio" button opens search
    const addBtn = screen.getByRole('button', { name: /\+ Nuevo Repuesto \/ Accesorio/i });
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText(/Buscar por código, nombre/i)).toBeInTheDocument();
  });
});
