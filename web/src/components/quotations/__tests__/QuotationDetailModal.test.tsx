import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { quotationKeys } from '../../../hooks/useQuotations';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationDetailModal from '../QuotationDetailModal';

import type { Quotation, QuotationPaymentSummary } from '../../../types/entities';
import type { Role } from '@unithor/shared';
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

const mockQuotation: Quotation = {
  id: 42,
  codigo: 'COT-2026-0042',
  workOrderId: 15,
  clientId: 3,
  vehicleId: 8,
  asesorId: 1,
  estadoPago: 'parcial',
  subtotal: 150000,
  total: 150000,
  pagado: 50000,
  notas: 'Cotización con servicios y repuestos',
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
  client: { id: 3, rut: '11223344-5', nombre: 'Transportes Rápidos', telefono: '+56987654321' },
  vehicle: { id: 8, patente: 'KJHG77', marca: 'Nissan', modelo: 'Navara' },
  asesor: { id: 1, nombre: 'Jefe Taller UNITHOR', email: 'jefe@unithor.local' },
  workOrder: { id: 15, codigo: 'OT-2026-0015', estado: 'en_progreso' },
  items: [
    {
      id: 1,
      catalogItemId: 10,
      descripcion: 'Mantenimiento preventivo 40.000km',
      tipoLinea: 'estandar',
      unidadMedida: 'servicio',
      cantidad: 1,
      precioUnitario: 80000,
      subtotal: 80000,
      descuentoTipo: 'porcentaje',
      descuentoValor: 10,
      estadoOperativo: 'pendiente',
      notasOperativas: 'Conservar diagnóstico y horas de la OT vinculada',
      catalogItem: { id: 10, tipo: 'estandar', codigo: 'SRV-01', nombre: 'Mantenimiento' },
    },
    {
      id: 2,
      catalogItemId: 20,
      descripcion: 'Pastillas de freno delanteras cerámicas',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 45000,
      subtotal: 45000,
      descuentoTipo: 'fijo',
      descuentoValor: 1000,
      estadoOperativo: 'completado',
      notasOperativas: null,
      catalogItem: { id: 20, tipo: 'parte', codigo: 'REP-05', nombre: 'Pastillas' },
    },
    {
      id: 3,
      catalogItemId: null,
      descripcion: 'Líquido de frenos DOT4 adicional',
      tipoLinea: 'parte',
      unidadMedida: 'unidad',
      cantidad: 1,
      precioUnitario: 25000,
      subtotal: 25000,
      descuentoTipo: 'fijo',
      descuentoValor: 500,
      estadoOperativo: 'pendiente',
      notasOperativas: '[Sugerido: Pendiente] Nivel crítico detectado en inspección técnica',
      catalogItem: { id: 30, tipo: 'parte', codigo: 'REP-09', nombre: 'Líquido DOT4' },
    },
  ],
};

const mockPaymentSummary: QuotationPaymentSummary = {
  quotationId: 42,
  total: 150000,
  pagado: 50000,
  saldoPendiente: 100000,
  estadoPago: 'parcial',
  payments: [],
};

let currentQuotation: Quotation;

const expectItemActions = (allowed: boolean) => {
  const actions = [
    screen.queryByRole('button', { name: 'Sugerir Repuesto / Servicio' }),
    screen.queryByRole('button', { name: /Aprobar/i }),
    screen.queryByRole('button', { name: /Rechazar/i }),
    screen.queryByTitle('Ajustar precio de servicio'),
    screen.queryAllByTitle('Marcar como aplicado / entregado al vehículo')[0] ?? null,
  ];
  actions.forEach((action) => allowed ? expect(action).toBeInTheDocument() : expect(action).toBeNull());
};

const renderModal = (props: { quotationId?: number; onClose?: () => void } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuotationDetailModal
          quotationId={props.quotationId ?? 42}
          onClose={props.onClose ?? vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
};

describe('QuotationDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentQuotation = structuredClone(mockQuotation);
    useAuthStore.setState({
      user: { id: 1, nombre: 'Jefe Taller UNITHOR', email: 'jefe@unithor.local', role: 'jefe' },
      isAuthenticated: true,
      isLoading: false,
    });

    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/quotations/42') {
        return Promise.resolve({ data: { quotation: currentQuotation } } as AxiosResponse);
      }
      if (url === '/quotations/42/payments') {
        return Promise.resolve({ data: mockPaymentSummary } as AxiosResponse);
      }
      if (url === '/catalog') {
        return Promise.resolve({ data: { items: [], total: 0 } } as AxiosResponse);
      }
      return Promise.reject(new Error(`Unhandled GET: ${url}`));
    });

    vi.mocked(api.patch).mockImplementation(() => Promise.resolve({
      data: { quotation: currentQuotation },
    } as AxiosResponse));
  });

  it.each<[Role, boolean]>([
    ['desarrollador', true], ['admin', true], ['jefe', true], ['vendedor', true],
    ['mecanico', false], ['bodeguero', false], ['finanzas', false],
  ])('alinea las acciones de %s con comercial:update (%s)', async (role, allowed) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role } });
    renderModal();
    await screen.findByText(currentQuotation.codigo);
    expectItemActions(allowed);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each<Role>(['jefe', 'vendedor'])('respeta comercial:update revocado al %s', async (role) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role,
      permissions: [{ modulo: 'comercial', accion: 'read' }] } });
    renderModal();
    await screen.findByText(currentQuotation.codigo);
    expectItemActions(false);
  });

  it.each<Role>(['mecanico', 'bodeguero', 'finanzas'])('respeta comercial:update concedido al %s', async (role) => {
    useAuthStore.setState({ user: { id: 1, nombre: role, email: 'user@test.local', role,
      permissions: [{ modulo: 'comercial', accion: 'update' }] } });
    renderModal();
    await screen.findByText(currentQuotation.codigo);
    expectItemActions(true);
  });

  it.each(['total', 'entregada', 'cancelada'])('no ofrece cambios de líneas para %s', async (state) => {
    if (state === 'total') currentQuotation.estadoPago = 'total';
    else currentQuotation.workOrder!.estado = state;
    renderModal();
    await screen.findByText(currentQuotation.codigo);
    expectItemActions(false);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each(['en_progreso', 'esperando_repuesto', 'finalizada'])('mantiene acciones permitidas en una OT %s', async (state) => {
    currentQuotation.workOrder!.estado = state;
    renderModal();
    await screen.findByText(currentQuotation.codigo);
    expectItemActions(true);
  });

  it.each(['revocado', 'pagada', 'entregada'])('retira formularios abiertos cuando cambia el acceso: %s', async (change) => {
    const { queryClient } = renderModal();
    fireEvent.click(await screen.findByTitle('Ajustar precio de servicio'));
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir Repuesto / Servicio' }));
    expect(screen.getByTitle('Guardar precio')).toBeInTheDocument();
    act(() => {
      if (change === 'revocado') {
        useAuthStore.setState({ user: { id: 1, nombre: 'Jefe', email: 'jefe@test.local', role: 'jefe', permissions: [] } });
      } else {
        queryClient.setQueryData(quotationKeys.detail(42), {
          ...currentQuotation,
          ...(change === 'pagada' ? { estadoPago: 'total' } : { workOrder: { ...currentQuotation.workOrder, estado: 'entregada' } }),
        });
      }
    });
    await waitFor(() => expect(screen.queryByText('Sugerir nuevo concepto técnico (Hallazgo en taller)')).not.toBeInTheDocument());
    expect(screen.queryByTitle('Guardar precio')).not.toBeInTheDocument();
    expectItemActions(false);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each(['checklist', 'precio', 'aprobar', 'rechazar', 'sugerir'] as const)('conserva IDs, descuentos y notas al operar: %s', async (action) => {
    useAuthStore.setState({ user: { id: 1, nombre: 'Vendedor', email: 'sales@test.local', role: 'vendedor' } });
    renderModal();
    await screen.findByText(currentQuotation.codigo);
    const expectedItems = currentQuotation.items!.map(({ subtotal: _subtotal, catalogItem: _catalogItem, ...item }) => item);
    if (action === 'checklist') {
      fireEvent.click(screen.getAllByTitle('Marcar como aplicado / entregado al vehículo')[0]);
      expectedItems[0].estadoOperativo = 'completado';
    } else if (action === 'precio') {
      fireEvent.click(screen.getByTitle('Ajustar precio de servicio'));
      fireEvent.change(screen.getByLabelText('Nuevo precio unitario 1'), { target: { value: '95000' } });
      fireEvent.click(screen.getByTitle('Guardar precio'));
      expectedItems[0].precioUnitario = 95000;
    } else if (action === 'aprobar' || action === 'rechazar') {
      fireEvent.click(screen.getByRole('button', { name: action === 'aprobar' ? /Aprobar/i : /Rechazar/i }));
      expectedItems[2].notasOperativas = `[Sugerido: ${action === 'aprobar' ? 'Aprobado' : 'Rechazado'}] Nivel crítico detectado en inspección técnica`;
      if (action === 'rechazar') Object.assign(expectedItems[2], { precioUnitario: 0, descuentoTipo: null, descuentoValor: 0, estadoOperativo: 'omitido' });
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Sugerir Repuesto / Servicio' }));
      fireEvent.change(screen.getByPlaceholderText('Ej. Pastillas de freno delanteras...'), { target: { value: 'Filtro adicional' } });
      fireEvent.change(screen.getByLabelText('Precio unitario'), { target: { value: '12000' } });
      fireEvent.submit(screen.getByPlaceholderText('Ej. Pastillas de freno delanteras...').closest('form')!);
    }
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith('/quotations/42', {
      items: action === 'sugerir' ? [...expectedItems, {
        catalogItemId: null, descripcion: 'Filtro adicional', tipoLinea: 'parte', unidadMedida: 'unidad',
        cantidad: 1, precioUnitario: 12000, estadoOperativo: 'pendiente', notasOperativas: '[Sugerido: Pendiente]',
      }] : expectedItems,
    });
  });

  it('categoriza un repuesto libre por tipoLinea aunque su descripción mencione instalación', async () => {
    Object.assign(currentQuotation.items![2], { descripcion: 'Instalacion soporte', catalogItem: null });
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /Repuestos y Accesorios/i }));
    expect(screen.getByText('Instalacion soporte')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Servicios Estándar/i }));
    expect(screen.queryByText('Instalacion soporte')).not.toBeInTheDocument();
  });

  it('abre la gestión del taller directamente para el jefe y protege el concepto pendiente', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    expect(await screen.findByRole('link', { name: 'Gestionar trabajo' })).toHaveAttribute('href', '/work-orders?manage=15');
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir Repuesto / Servicio' }));
    fireEvent.change(screen.getByPlaceholderText('Ej. Pastillas de freno delanteras...'), { target: { value: 'Diagnóstico aún sin guardar' } });
    fireEvent.click(screen.getByRole('link', { name: 'Gestionar trabajo' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Descartar edición de cotización' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByPlaceholderText('Ej. Pastillas de freno delanteras...')).toHaveValue('Diagnóstico aún sin guardar');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Descartar cambios' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('protege un precio sin guardar al cerrar el detalle', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(await screen.findByTitle('Ajustar precio de servicio'));
    fireEvent.change(screen.getByLabelText('Nuevo precio unitario 1'), { target: { value: '99000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Nuevo precio unitario 1')).toHaveValue('99.000');
  });

  it('mantiene la referencia de OT para finanzas sin enlaces a un taller no autorizado', async () => {
    useAuthStore.setState({ user: { id: 1, nombre: 'Finanzas', email: 'fin@test.local', role: 'finanzas' } });
    renderModal();
    expect(await screen.findByText('OT · OT-2026-0015')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /OT ·/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gestionar trabajo' })).not.toBeInTheDocument();
  });



  it('distingue confirmados, pendientes y rechazados en el historial del modal', async () => {
    const payments = (['confirmado', 'por_verificar', 'rechazado'] as const).map((estado, index) => ({
      id: index + 50, quotationId: 42, monto: 10000, metodo: 'transferencia', estado,
      fecha: '2026-11-03T12:00:00Z', createdBy: 1, createdAt: '2026-11-03T12:00:00Z', updatedAt: '2026-11-03T12:00:00Z',
    }));
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({ data: url === '/quotations/42'
      ? { quotation: mockQuotation } : url === '/quotations/42/payments' ? { ...mockPaymentSummary, payments } : { items: [], total: 0 } } as AxiosResponse));
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /Historial de Abonos y Pagos/ }));
    expect(await screen.findByText('Por verificar')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.queryByText('Registrado')).not.toBeInTheDocument();
  });

  it('protege el abono anidado al presionar Escape sin cerrar el detalle padre', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar Abono' }));
    const payment = await screen.findByRole('dialog', { name: 'Registrar abono' });
    fireEvent.change(within(payment).getByLabelText('Monto del abono'), { target: { value: '1000' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(within(payment).getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
    fireEvent.click(within(payment).getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog', { name: 'Registrar abono' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'COT-2026-0042' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('renderiza cabecera, datos de cliente/vehículo y categorías de conceptos', async () => {
    renderModal();

    expect(await screen.findByText('COT-2026-0042')).toBeInTheDocument();
    expect(screen.getByText('Transportes Rápidos')).toBeInTheDocument();
    expect(screen.getByText('KJHG77')).toBeInTheDocument();
    expect(screen.getByText('OT · OT-2026-0015')).toBeInTheDocument();

    // Categorías
    expect(screen.getByRole('button', { name: /Servicios Estándar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Repuestos y Accesorios/i })).toBeInTheDocument();
  });

  it('permite alternar el check de entrega / aplicado al vehículo', async () => {
    renderModal();
    await screen.findByText('COT-2026-0042');

    // Find the delivery check button for the first item (Mantenimiento preventivo)
    const checkButtons = screen.getAllByTitle(/Marcar como aplicado/i);
    expect(checkButtons.length).toBeGreaterThan(0);

    fireEvent.click(checkButtons[0]);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/quotations/42',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Mantenimiento preventivo 40.000km',
              estadoOperativo: 'completado',
            }),
          ]),
        }),
      );
    });
  });

  it('permite al Jefe de Taller ajustar el precio de un servicio', async () => {
    renderModal();
    await screen.findByText('COT-2026-0042');

    // Find the edit price button on the service
    const editPriceButtons = screen.getAllByTitle(/Ajustar precio de servicio/i);
    expect(editPriceButtons.length).toBeGreaterThan(0);

    fireEvent.click(editPriceButtons[0]);

    // Input appears
    const priceInput = screen.getByDisplayValue('80.000');
    fireEvent.change(priceInput, { target: { value: '95000' } });

    // Save
    const saveButton = screen.getByTitle('Guardar precio');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/quotations/42',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Mantenimiento preventivo 40.000km',
              precioUnitario: 95000,
            }),
          ]),
        }),
      );
    });
  });

  it('muestra concepto sugerido por taller y permite registrar aprobación del cliente', async () => {
    renderModal();
    await screen.findByText('COT-2026-0042');

    // Concepto sugerido
    expect(screen.getByText('Pendiente Aprobación Cliente')).toBeInTheDocument();

    // Click Aprobar
    const approveButton = screen.getByRole('button', { name: /Aprobar/i });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/quotations/42',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Líquido de frenos DOT4 adicional',
              notasOperativas: expect.stringContaining('[Sugerido: Aprobado]'),
            }),
          ]),
        }),
      );
    });
  });
});
