import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkOrderQuickDetailModal from '../../../components/work-orders/WorkOrderQuickDetailModal';
import { api } from '../../../lib/api';
import { formatClp } from '../../../lib/formatters';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderDetailPage from '../WorkOrderDetailPage';

import type { WorkOrder } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
vi.mock('../../../components/common/CustomerEmailPanel', () => ({ default: () => null }));

const makeOrder = (): WorkOrder => ({
  ...workshopRoleOrders[0],
  descuentoTipo: 'porcentaje', descuentoValor: 10,
  items: workshopRoleOrders[0].items!.map((item, index) => ({
    ...item, tipoLinea: 'estandar', cantidad: 1,
    descripcion: index === 0 ? 'Servicio con descuento' : 'Filtro',
    precioUnitario: index === 0 ? 65000 : 15000,
    // Operational subtotals remain before discounts.
    subtotal: index === 0 ? 65000 : 15000,
    descuentoTipo: index === 0 ? 'fijo' : null,
    descuentoValor: index === 0 ? 10000 : 0,
  })),
});

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ user: { id: 7, nombre: 'Ana Jefa', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true, isLoading: false });
});

describe.each(['quick', 'detail'] as const)('Work order pricing in %s read view', (view) => {
  const open = async (order: WorkOrder) => {
    vi.mocked(api.get).mockResolvedValue({ data: { workOrder: order } });
    const result = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>
        <MemoryRouter initialEntries={[`/work-orders/${order.id}`]}>
          <Routes><Route path="/work-orders/:id" element={view === 'quick'
            ? <WorkOrderQuickDetailModal workOrderId={order.id} onClose={vi.fn()} onPreviewPdf={vi.fn()} />
            : <WorkOrderDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText(order.codigo);
    const root = view === 'quick' ? screen.getByRole('dialog') : result.container;
    return {
      root,
      summary: root.querySelector(view === 'quick' ? '.workshop-summary-work' : '.workshop-record-work-summary') as HTMLElement,
      total: root.querySelector(view === 'quick' ? '.workshop-summary-total' : '.workshop-record-estimate') as HTMLElement,
    };
  };

  it.each([false, true])('shows discounted net lines and gross totals, loaded mirror: %s', async (loaded) => {
    const order = makeOrder();
    if (loaded) order.quotation = { id: 202, codigo: 'COT-2026-0202', estadoPago: 'por_pagar', total: 74970, pagado: 0, saldoPendiente: 74970 };
    const before = JSON.stringify(order);
    const { root, summary, total } = await open(order);
    const item = within(summary).getByText('Servicio con descuento').closest('li');
    expect(item).toHaveTextContent('$55.000 neto');
    expect(item).toHaveTextContent('Dto. −$10.000');
    for (const [label, amount] of [
      ['Subtotal bruto', '$80.000'], ['Descuentos por ítem', '−$10.000'], ['Dto. general (10%)', '−$7.000'], ['Neto', '$63.000'], ['IVA (19%)', '$11.970'],
    ]) expect(within(summary).getByText(label!).parentElement).toHaveTextContent(amount!);
    expect(total).toHaveTextContent('Total estimado (IVA incluido)');
    expect(total).toHaveTextContent('$74.970');
    if (view === 'quick') {
      expect(within(summary).getByText('Estándar').parentElement).toHaveTextContent('$70.000 neto');
    } else {
      const table = root.querySelector('.workshop-record-items-table') as HTMLElement;
      expect(within(table).getByRole('columnheader', { name: 'Subtotal neto' })).toBeInTheDocument();
      expect(within(table).getByText('Servicio con descuento').closest('tr')).toHaveTextContent('$55.000');
      expect(root.querySelector('#work-order-items-title')?.closest('section')).toHaveTextContent('$74.970');
    }
    expect(JSON.stringify(order)).toBe(before);
  });

  it('keeps a loaded zero gross total authoritative without adding IVA', async () => {
    const order = makeOrder();
    order.quotation = { id: 202, codigo: 'COT-2026-0202', estadoPago: 'total', total: 0, pagado: 0, saldoPendiente: 0 };
    expect((await open(order)).total).toHaveTextContent(formatClp(0));
  });

  it('adds IVA once when optional discounts and a commercial mirror are absent', async () => {
    const order = makeOrder();
    delete order.descuentoTipo;
    delete order.descuentoValor;
    order.items!.forEach((item) => { delete item.descuentoTipo; delete item.descuentoValor; });
    const { summary, total } = await open(order);
    expect(within(summary).getByText('Servicio con descuento').closest('li')).toHaveTextContent('$65.000 neto');
    expect(total).toHaveTextContent('$95.200');
    expect(within(summary).queryByText('Descuentos por ítem')).not.toBeInTheDocument();
  });
});
