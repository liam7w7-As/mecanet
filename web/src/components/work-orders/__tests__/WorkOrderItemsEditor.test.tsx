import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import WorkOrderItemsEditor, {
  calculateItemsTotal,
  createEmptyWorkOrderItem,
  getWorkOrderItemSubtotal,
} from '../WorkOrderItemsEditor';

import type { CatalogItem, PaginatedResponse } from '../../../types/entities';
import type { EditableWorkOrderItem } from '../WorkOrderItemsEditor';
import type { AxiosResponse } from 'axios';
import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from 'react';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));

// Animation timing is independent of the catalogue and editing contracts.
type AnimatedDivProps = ComponentPropsWithoutRef<'div'> & {
  layout?: unknown;
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
};
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ layout: _layout, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: AnimatedDivProps) => <div {...props} />,
  },
}));

const service: CatalogItem = {
  id: 42, tipo: 'estandar', codigo: 'SRV-42', nombre: 'Cambio de aceite',
  descripcion: null, unidadMedida: 'servicio', precio: 15000, stock: 0,
  stockMinimo: 0, horasHombreEstandar: 0.5,
  createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z',
};
const specificService: CatalogItem = { ...service, id: 43, tipo: 'especifico', codigo: 'ESP-43', nombre: 'Diagnóstico eléctrico' };
const part: CatalogItem = { ...service, id: 44, tipo: 'parte', codigo: 'REP-44', nombre: 'Filtro de aceite', unidadMedida: 'unidad', precio: 10000, stock: 8, horasHombreEstandar: null };
const pageOf = (items: CatalogItem[], overrides: Partial<PaginatedResponse<CatalogItem>> = {}): PaginatedResponse<CatalogItem> => ({
  items, total: items.length, page: 1, pageSize: 12, totalPages: items.length ? 1 : 0, ...overrides,
});
const responseOf = (data: PaginatedResponse<CatalogItem>) => ({ data }) as AxiosResponse<PaginatedResponse<CatalogItem>>;
const editable = (patch: Partial<EditableWorkOrderItem> = {}): EditableWorkOrderItem => ({
  ...createEmptyWorkOrderItem(), descripcion: 'Servicio libre', precioUnitario: '15000', ...patch,
});
type EditorProps = Partial<Omit<ComponentProps<typeof WorkOrderItemsEditor>, 'items' | 'onChange'>>;
type CatalogParams = { page: number; pageSize: number; tipo?: string; search?: string };
const paramsOf = (config?: { params?: unknown }): CatalogParams => config?.params as CatalogParams;
const requests = (): CatalogParams[] => vi.mocked(api.get).mock.calls.map(([, config]) => paramsOf(config));
const selectedItems = (): EditableWorkOrderItem[] => JSON.parse(screen.getByTestId('selected-items').textContent ?? '[]') as EditableWorkOrderItem[];
const advance = async (milliseconds: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
};

describe('WorkOrderItemsEditor shared OT/COT catalogue', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    vi.mocked(api.get).mockResolvedValue(responseOf(pageOf([service])));
  });

  afterEach(() => {
    cleanup();
    client.clear();
    vi.useRealTimers();
  });

  const renderEditor = (initialItems: EditableWorkOrderItem[] = [], props: EditorProps = {}) => {
    const Harness = () => {
      const [items, setItems] = useState(initialItems);
      return (
        <div className="reception-create-page">
          <WorkOrderItemsEditor items={items} onChange={setItems} {...props} />
          <output data-testid="selected-items">{JSON.stringify(items)}</output>
        </div>
      );
    };
    return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  };

  it.each(['default', 'reception'] as const)('browses all three catalogue types without searching (%s)', async (presentation) => {
    vi.mocked(api.get).mockImplementation(async (_url, config) => responseOf(pageOf([
      paramsOf(config).tipo === 'parte' ? part : paramsOf(config).tipo === 'especifico' ? specificService : service,
    ])));
    renderEditor([], { presentation });

    expect(await screen.findByRole('button', { name: 'Agregar Cambio de aceite' })).toBeVisible();
    expect(screen.getByLabelText('Buscar en catálogo por nombre o código')).toHaveValue('');
    expect(requests()).toEqual([{ page: 1, pageSize: 12, search: undefined, tipo: 'estandar' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Específicos' }));
    expect(await screen.findByRole('button', { name: 'Agregar Diagnóstico eléctrico' })).toBeVisible();
    expect(screen.getByText('ESP-43')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Repuestos' }));
    expect(await screen.findByRole('button', { name: 'Agregar Filtro de aceite' })).toBeVisible();
    expect(screen.getByText('REP-44 · Stock: 8')).toBeInTheDocument();
    expect(requests().map(({ tipo, search, page }) => ({ tipo, search, page }))).toEqual([
      { tipo: 'estandar', search: undefined, page: 1 },
      { tipo: 'especifico', search: undefined, page: 1 },
      { tipo: 'parte', search: undefined, page: 1 },
    ]);
  });

  it('uses server pagination and retains selection when returning to a page', async () => {
    vi.mocked(api.get).mockImplementation(async (_url, config) => responseOf(pageOf(
      [paramsOf(config).page === 2 ? { ...service, id: 45, nombre: 'Alineación' } : service],
      { page: paramsOf(config).page, total: 13, totalPages: 2 },
    )));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Cambio de aceite' }));
    expect(screen.getByRole('button', { name: 'Página anterior del catálogo' })).toBeDisabled();
    expect(screen.getByText('13 ítems · Página 1 de 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente del catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Alineación' }));
    expect(screen.getByRole('button', { name: 'Página siguiente del catálogo' })).toBeDisabled();
    expect(screen.getByText('13 ítems · Página 2 de 2')).toBeVisible();
    expect(selectedItems().map(({ catalogItemId }) => catalogItemId)).toEqual([45, 42]);

    fireEvent.click(screen.getByRole('button', { name: 'Página anterior del catálogo' }));
    expect(await screen.findByRole('button', { name: 'Quitar Cambio de aceite' })).toHaveAttribute('aria-pressed', 'true');
    expect(selectedItems()).toHaveLength(2);
    expect(requests().map(({ page }) => page)).toEqual([1, 2]);
  });

  it('debounces trimmed name/code searches, resets the page and clears immediately', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockImplementation(async (_url, config) => responseOf(pageOf([service], {
      page: paramsOf(config).page, total: 13, totalPages: 2,
    })));
    renderEditor();
    await advance(1);
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente del catálogo' }));
    await advance(1);
    expect(requests().map(({ page }) => page)).toEqual([1, 2]);

    const searchInput = screen.getByLabelText('Buscar en catálogo por nombre o código');
    fireEvent.change(searchInput, { target: { value: 'Cambio' } });
    await advance(200);
    fireEvent.change(searchInput, { target: { value: '  SRV-42  ' } });
    expect(screen.getByLabelText('Resultados del catálogo')).toHaveAttribute('aria-busy', 'true');
    await advance(249);
    expect(requests()).toHaveLength(2);
    await advance(2);
    expect(requests().at(-1)).toEqual({ page: 1, pageSize: 12, tipo: 'estandar', search: 'SRV-42' });
    expect(requests()).toHaveLength(3);
    await advance(1);

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente del catálogo' }));
    await advance(1);
    expect(requests().at(-1)).toMatchObject({ page: 2, search: 'SRV-42' });
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda del catálogo' }));
    expect(searchInput).toHaveValue('');
    expect(screen.getByText('13 ítems · Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar Cambio de aceite' })).toBeVisible();
    expect(requests()).toHaveLength(4);
  });

  it('accepts one-character searches and clears a previous search when changing tabs', async () => {
    vi.useFakeTimers();
    renderEditor();
    await advance(1);
    fireEvent.change(screen.getByLabelText('Buscar en catálogo por nombre o código'), { target: { value: 'a' } });
    await advance(251);
    expect(requests().at(-1)).toMatchObject({ search: 'a', tipo: 'estandar', page: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Específicos' }));
    await advance(1);
    expect(screen.getByLabelText('Buscar en catálogo por nombre o código')).toHaveValue('');
    expect(requests().at(-1)).toEqual({ search: undefined, tipo: 'especifico', page: 1, pageSize: 12 });
    expect(requests()).toHaveLength(3);
    await advance(300);
    expect(requests()).toHaveLength(3);
  });

  it('shows an error with retry and recovers without losing edited lines', async () => {
    const draft = editable({ descripcion: 'Diagnóstico manual', cantidad: '3', precioUnitario: '4000' });
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Catálogo no disponible'));
    renderEditor([draft]);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el catálogo.');
    expect(screen.queryByText('No se encontraron ítems.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Agregar Cambio de aceite' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(selectedItems()).toEqual([draft]);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state after a search has completed', async () => {
    vi.mocked(api.get).mockImplementation(async (_url, config) => responseOf(pageOf(paramsOf(config).search ? [] : [service])));
    renderEditor();
    await screen.findByRole('button', { name: 'Agregar Cambio de aceite' });
    fireEvent.change(screen.getByLabelText('Buscar en catálogo por nombre o código'), { target: { value: 'Inexistente' } });
    expect(screen.queryByText('No se encontraron ítems.')).not.toBeInTheDocument();
    expect(await screen.findByText('No se encontraron ítems.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Página siguiente del catálogo' })).not.toBeInTheDocument();
  });

  it('applies percentage and fixed line discounts to net subtotals and the total including IVA', async () => {
    renderEditor([
      editable({ cantidad: '2' }),
      editable({ descripcion: 'Repuesto libre', tipoLinea: 'parte', precioUnitario: '10000' }),
    ], { showDiscounts: true, showExecution: false });
    await screen.findByRole('button', { name: 'Agregar Cambio de aceite' });
    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('Subtotal neto: $30.000');
    expect(screen.getByText('Total estimado (IVA incluido)')).toBeVisible();
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('47.600');

    fireEvent.change(screen.getByLabelText('Tipo de descuento 1'), { target: { value: 'porcentaje' } });
    fireEvent.change(screen.getByLabelText('Descuento 1'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Tipo de descuento 2'), { target: { value: 'fijo' } });
    fireEvent.change(screen.getByLabelText('Descuento 2'), { target: { value: '2500' } });
    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('27.000');
    expect(screen.getByTestId('item-subtotal-1')).toHaveTextContent('7.500');
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('41.055');
    expect(calculateItemsTotal(selectedItems())).toBe(34500);

    fireEvent.change(screen.getByLabelText('Descuento 2'), { target: { value: '11000' } });
    expect(screen.getByTestId('item-subtotal-1')).toHaveTextContent('Importe o descuento inválido');
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('Revisa los importes y descuentos');
  });

  it('toggles line discounts and clears them when disabled', async () => {
    renderEditor([editable({ cantidad: '2' })], { showDiscounts: true, discountToggle: true });
    await screen.findByRole('button', { name: 'Agregar Cambio de aceite' });
    expect(screen.queryByLabelText('Tipo de descuento 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Descuento por línea' }));
    fireEvent.change(screen.getByLabelText('Tipo de descuento 1'), { target: { value: 'porcentaje' } });
    fireEvent.change(screen.getByLabelText('Descuento 1'), { target: { value: '20' } });
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('28.560');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Descuento por línea' }));
    expect(screen.queryByLabelText('Tipo de descuento 1')).not.toBeInTheDocument();
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('35.700');
    expect(selectedItems()[0]).toMatchObject({ descuentoTipo: null, descuentoValor: '0' });
  });

  it('reveals existing line discounts and allows the parent to hide the editor total', async () => {
    renderEditor([editable({ descuentoTipo: 'porcentaje', descuentoValor: '10' })], {
      showDiscounts: true, discountToggle: true, showTotal: false, showExecution: false,
    });
    await screen.findByRole('button', { name: 'Agregar Cambio de aceite' });
    expect(screen.getByRole('checkbox', { name: 'Descuento por línea' })).toBeChecked();
    expect(screen.getByLabelText('Descuento 1')).toHaveValue(10);
    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('13.500');
    expect(screen.queryByTestId('work-order-total')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Avance 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nota operativa 1')).not.toBeInTheDocument();
  });

  it('restores a removed line with its identity and edits, and never duplicates a reselected catalogue item', async () => {
    const original = editable({
      id: 91, catalogItemId: service.id, catalogTipo: service.tipo, catalogStock: 0,
      descripcion: 'Servicio personalizado', cantidad: '3', precioUnitario: '18000',
      descuentoTipo: 'fijo', descuentoValor: '2000', unidadMedida: 'servicio',
      horasHombreEstimadas: '1.5', assignedUserId: 7, estadoOperativo: 'en_proceso', notasOperativas: 'Conservar nota',
    });
    const freeLine = editable({ descripcion: 'Ítem manual adicional' });
    vi.mocked(api.get).mockResolvedValue(responseOf(pageOf([service, specificService])));
    renderEditor([original, freeLine], { showDiscounts: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Cambio de aceite' }));
    expect(selectedItems()).toEqual([freeLine]);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Diagnóstico eléctrico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(selectedItems()[0]).toEqual(original);
    expect(selectedItems()[2]).toEqual(freeLine);
    expect(screen.getByRole('button', { name: 'Quitar Cambio de aceite' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar ítem 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Cambio de aceite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(selectedItems().filter(({ catalogItemId }) => catalogItemId === service.id)).toHaveLength(1);
    expect(selectedItems()).toHaveLength(3);
  });

  it('adds free parts and preserves a manually edited draft when selecting catalogue items', async () => {
    const draft = editable({ descripcion: '', cantidad: '3', precioUnitario: '100' });
    vi.mocked(api.get).mockResolvedValue(responseOf(pageOf([part])));
    renderEditor([draft], { showExecution: false, showDiscounts: true });
    fireEvent.click(screen.getByRole('button', { name: 'Repuestos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Filtro de aceite' }));
    expect(selectedItems()[1]).toEqual(draft);
    fireEvent.click(screen.getByRole('button', { name: 'Ítem libre' }));
    fireEvent.change(screen.getByLabelText('Descripción 1'), { target: { value: 'Repuesto fuera del catálogo' } });
    fireEvent.change(screen.getByLabelText('Precio unitario 1'), { target: { value: '5000' } });
    expect(selectedItems()[0]).toMatchObject({ catalogItemId: null, tipoLinea: 'parte', descripcion: 'Repuesto fuera del catálogo', precioUnitario: '5000' });
    expect(screen.queryByLabelText('Avance 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nota operativa 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Horas hombre por unidad del ítem 1')).not.toBeInTheDocument();
  });

  it('cleans up pending search and insertion timers on unmount', async () => {
    vi.useFakeTimers();
    const view = renderEditor();
    await advance(1);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Cambio de aceite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ítem libre' }));
    fireEvent.change(screen.getByLabelText('Buscar en catálogo por nombre o código'), { target: { value: 'Sin enviar' } });
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(3);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(1500);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight catalogue request on unmount', async () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
    const view = renderEditor();
    expect(screen.getByText('Cargando catálogo...')).toHaveAttribute('role', 'status');
    const signal = vi.mocked(api.get).mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('keeps the pricing helpers net and discount-aware', () => {
    const undiscounted = editable({ cantidad: '2' });
    const percentage = { ...undiscounted, descuentoTipo: 'porcentaje' as const, descuentoValor: '10' };
    const fixed = editable({ precioUnitario: '10000', descuentoTipo: 'fijo', descuentoValor: '2500' });
    expect(getWorkOrderItemSubtotal(undiscounted)).toBe(30000);
    expect(calculateItemsTotal([undiscounted])).toBe(30000);
    expect(getWorkOrderItemSubtotal(percentage)).toBe(27000);
    expect(calculateItemsTotal([percentage, fixed])).toBe(34500);
    expect(calculateItemsTotal([])).toBe(0);
  });
});
