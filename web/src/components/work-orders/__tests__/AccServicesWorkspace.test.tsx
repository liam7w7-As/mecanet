import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import QuotationDiscountSummary from '../../quotations/QuotationDiscountSummary';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../WorkOrderItemsEditor';

import type { CatalogItem } from '../../../types/entities';
import type { DiscountDraft } from '../../quotations/QuotationDiscountSummary';
import type { EditableWorkOrderItem } from '../WorkOrderItemsEditor';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));

const oil: CatalogItem = {
  id: 71, tipo: 'parte', division: 'ACC', subtipo: 'en_stock', codigo: 'ACC-71',
  nombre: 'Aceite 10W40 1L', descripcion: null, unidadMedida: 'litro', precio: 10000,
  stock: 8, stockMinimo: 1, horasHombreEstandar: null, createdAt: '', updatedAt: '',
};
const snorkel: CatalogItem = { ...oil, id: 72, codigo: 'ACC-72', nombre: 'Snorkel Safari Hilux', precio: 135000, unidadMedida: 'unidad', stock: 0, subtipo: 'a_pedido' };
const items = () => JSON.parse(screen.getByTestId('acc-items').textContent ?? '[]') as EditableWorkOrderItem[];

function Harness({ initial = [], readOnly = false }: { initial?: EditableWorkOrderItem[]; readOnly?: boolean }) {
  const [selected, setSelected] = useState(initial);
  const [discount, setDiscount] = useState<DiscountDraft>({ descuentoTipo: null, descuentoValor: '0' });
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>
    <div className="reception-create-page">
      <WorkOrderItemsEditor serviceWorkspace presentation="reception" vehicle={null} items={selected} onChange={setSelected}
        showEmptySummary={Boolean(discount.descuentoTipo)}
        showDiscounts showTotal={false} showExecution={false} isPriceReadOnly={() => readOnly}
        catalogFooter={<QuotationDiscountSummary variant="controls" items={selected} value={discount} onChange={setDiscount} />}
        selectionFooter={<QuotationDiscountSummary variant="totals" items={selected} value={discount} onChange={setDiscount} testId="acc-total" />} />
      <output data-testid="acc-items">{JSON.stringify(selected)}</output>
    </div>
  </QueryClientProvider>;
}

async function mount(initial: EditableWorkOrderItem[] = [], readOnly = false) {
  render(<Harness initial={initial} readOnly={readOnly} />);
  fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de catálogo' })).getByRole('button', { name: 'ACC' }));
  await screen.findByRole('button', { name: `Configurar ${oil.nombre}` });
}
async function prepareOil() {
  fireEvent.click(await screen.findByRole('button', { name: `Configurar ${oil.nombre}` }));
  return screen.getByRole('region', { name: 'Preparar repuesto ACC' });
}
async function addOil() {
  await prepareOil();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  return screen.findByRole('article', { name: 'Repuesto ACC 1' });
}

describe('ACC in the step 5 workspace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { items: [oil, snorkel], total: 2, page: 1, pageSize: 12, totalPages: 1 } } as AxiosResponse);
  });

  it('prepares a local draft on the left and only updates selection and totals after Agregar', async () => {
    await mount();
    const draft = within(await prepareOil());
    expect(draft.getByText('Litro')).toBeInTheDocument();
    fireEvent.change(draft.getByLabelText('Cantidad ACC'), { target: { value: '2' } });
    fireEvent.change(draft.getByLabelText('Precio unitario ACC'), { target: { value: '20000' } });
    expect(draft.queryByLabelText('Tipo de descuento ACC')).not.toBeInTheDocument();
    expect(draft.queryByLabelText('Descuento ACC')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Descuento general en pesos')).toBeInTheDocument();
    expect(screen.getByLabelText('Descuento general en porcentaje')).toHaveValue(0);
    expect(items()).toEqual([]);
    expect(screen.queryByRole('article', { name: /Repuesto ACC/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('acc-total')).not.toBeInTheDocument();
    expect(draft.getByText('$40.000')).toBeInTheDocument();
    fireEvent.click(draft.getByRole('button', { name: 'Agregar' }));
    const card = within(await screen.findByRole('article', { name: 'Repuesto ACC 1' }));
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ catalogItemId: 71, division: 'ACC', subtipo: 'en_stock',
      tipoLinea: 'parte', cantidad: '2', precioUnitario: '20000', unidadMedida: 'litro' });
    expect(items()[0].descuentoTipo ?? null).toBeNull();
    expect(Number(items()[0].descuentoValor ?? 0)).toBe(0);
    expect(card.getByText('Sin descuento')).toBeInTheDocument();
    expect(card.getByTestId('item-subtotal-0')).toHaveTextContent('$40.000');
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$47.600');
    expect(screen.queryByLabelText('Tipo de descuento general')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Editar ${oil.nombre}` })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'Preparar repuesto ACC' })).not.toBeInTheDocument();
  });

  it('keeps the committed card intact while editing; cancelling discards only the draft', async () => {
    await mount();
    await addOil();
    const original = items()[0];
    fireEvent.click(screen.getByRole('button', { name: 'Editar repuesto ACC 1' }));
    fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Precio unitario ACC'), { target: { value: '30000' } });
    expect(items()[0]).toEqual(original);
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$11.900');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));
    expect(items()[0]).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: 'Editar repuesto ACC 1' }));
    expect(screen.getByLabelText('Cantidad ACC')).toHaveValue(1);
    expect(screen.getByLabelText('Precio unitario ACC')).toHaveValue('10.000');
    expect(screen.queryByLabelText('Tipo de descuento ACC')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario ACC'), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ key: original.key, catalogItemId: original.catalogItemId, cantidad: '2', precioUnitario: '20000' });
    expect(items()[0].descuentoTipo ?? null).toBeNull();
    expect(Number(items()[0].descuentoValor ?? 0)).toBe(0);
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$47.600');
    // An added catalogue result reopens its editor; it never toggles removal.
    fireEvent.click(screen.getByRole('button', { name: `Editar ${oil.nombre}` }));
    expect(items()).toHaveLength(1);
    expect(screen.getByLabelText('Cantidad ACC')).toHaveValue(2);
  });

  it('rejects zero/fractional quantities and missing prices without committing anything', async () => {
    await mount();
    await prepareOil();
    for (const quantity of ['0', '1.5']) {
      fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: quantity } });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(items()).toHaveLength(0);
    }
    fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Precio unitario ACC'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Indica el precio unitario');
    expect(items()).toHaveLength(0);
  });

  it('only exposes the general discount, applies it once, and keeps identity on removal/undo', async () => {
    await mount();
    await prepareOil();
    fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: '2' } });
    expect(screen.queryByLabelText('Tipo de descuento ACC')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Descuento ACC')).not.toBeInTheDocument();
    expect(screen.queryByText('Descuento por línea')).not.toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Agregar' });
    fireEvent.click(add); fireEvent.click(add);
    expect(items()).toHaveLength(1);
    const original = items()[0];
    fireEvent.change(screen.getByLabelText('Descuento general en porcentaje'), { target: { value: '10' } });
    expect(screen.getByLabelText('Descuento general en pesos')).toHaveValue('2.000');
    expect(screen.getAllByLabelText('Descuento general en porcentaje')).toHaveLength(1);
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$21.420');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar ítem 1' }));
    expect(items()).toEqual([]);
    expect(screen.getByLabelText('Descuento general en porcentaje')).toHaveValue(10);
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(items()).toEqual([original]);
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$21.420');
  });

  it('validates excess general discounts while retaining the committed selection', async () => {
    await mount();
    await addOil();
    const original = items()[0];
    fireEvent.change(screen.getByLabelText('Descuento general en porcentaje'), { target: { value: '101' } });
    expect(screen.getByRole('alert')).toHaveTextContent('100%');
    expect(screen.getByTestId('acc-total')).toHaveTextContent('-');
    expect(items()).toEqual([original]);
    fireEvent.change(screen.getByLabelText('Descuento general en pesos'), { target: { value: '10001' } });
    expect(screen.getByRole('alert')).toHaveTextContent('no puede superar el importe');
    expect(items()).toEqual([original]);
    fireEvent.change(screen.getByLabelText('Descuento general en pesos'), { target: { value: '2000' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Descuento general en porcentaje')).toHaveValue(20);
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$9.520');
    expect(items()).toEqual([original]);
  });

  it('preserves selected MEC work and marks ordered ACC correctly', async () => {
    const service = { ...createEmptyWorkOrderItem(), descripcion: 'Trabajo MEC existente', precioUnitario: '1000' };
    await mount([service]);
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${snorkel.nombre}` }));
    expect(screen.getByRole('region', { name: 'Preparar repuesto ACC' })).toHaveTextContent('A pedido');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(items()[0]).toEqual(service);
    expect(items()[1]).toMatchObject({ catalogItemId: 72, esAPedido: true, subtipo: 'a_pedido' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de catálogo' })).getByRole('button', { name: 'MEC' }));
    expect(items()).toHaveLength(2);
    expect(screen.getByRole('article', { name: 'Repuesto ACC 2' })).toBeInTheDocument();
  });

  it('prepares free ACC on the left instead of adding an empty line', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ítem libre' }));
    expect(items()).toEqual([]);
    fireEvent.change(screen.getByLabelText('Descripción ACC'), { target: { value: 'Repuesto libre preparado' } });
    fireEvent.change(screen.getByLabelText('Unidad ACC'), { target: { value: 'juego' } });
    fireEvent.change(screen.getByLabelText('Precio unitario ACC'), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(items()[0]).toMatchObject({ division: 'ACC', tipoLinea: 'parte', catalogItemId: null, unidadMedida: 'juego', precioUnitario: '20000' });
  });

  it('retains historical discounts, IDs and operational metadata when editing read-only prices', async () => {
    const original: EditableWorkOrderItem = { ...createEmptyWorkOrderItem(), id: 88, key: 'existing-acc-88', catalogItemId: null,
      descripcion: 'Repuesto histórico', division: 'ACC', subtipo: 'a_pedido', tipoLinea: 'parte', esAPedido: true,
      cantidad: '2', precioUnitario: '12500', descuentoTipo: 'fijo', descuentoValor: '5000',
      estadoOperativo: 'en_proceso', notasOperativas: 'Nota a conservar' };
    await mount([original], true);
    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('$20.000');
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$23.800');
    const summary = screen.getByRole('region', { name: 'Resumen de importes' });
    expect(within(summary).getByText('Descuentos por ítem').closest('div')).toHaveTextContent('- $5.000');
    fireEvent.click(screen.getByRole('button', { name: 'Editar repuesto ACC 1' }));
    expect(screen.getByLabelText('Precio unitario ACC')).toBeDisabled();
    expect(screen.queryByLabelText('Tipo de descuento ACC')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(items()[0]).toEqual({ ...original, cantidad: '3' });
    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('$32.500');
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$38.675');
    expect(within(summary).getByText('Descuentos por ítem').closest('div')).toHaveTextContent('- $5.000');
  });

  it('searches without committing a draft and leaves existing selections intact', async () => {
    await mount();
    await addOil();
    const original = items()[0];
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${snorkel.nombre}` }));
    fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Buscar en catálogo por nombre o código'), { target: { value: 'aceite' } });
    expect(screen.queryByRole('region', { name: 'Preparar repuesto ACC' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: `Editar ${oil.nombre}` })).toHaveAttribute('aria-pressed', 'true');
    expect(items()).toEqual([original]);
    expect(screen.getByTestId('acc-total')).toHaveTextContent('$11.900');
  });
});
