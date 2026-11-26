import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const standard: CatalogItem = { id: 81, tipo: 'estandar', division: 'MEC', subtipo: 'estandar',
  nombre: 'Cambio de aceite', codigo: 'MEC-81', descripcion: null, unidadMedida: 'servicio', precio: 15000,
  horasHombreEstandar: 0.5, stock: 0, stockMinimo: 0, createdAt: '', updatedAt: '' };
const specific: CatalogItem = { ...standard, id: 82, tipo: 'especifico', subtipo: 'especifico',
  nombre: 'Diagnóstico eléctrico', precio: 45000, codigo: 'MEC-82', horasHombreEstandar: null };
const selected = () => JSON.parse(screen.getByTestId('mec-items').textContent ?? '[]') as EditableWorkOrderItem[];
type Params = { division?: string; subtipo?: string; page?: number };

function Harness({ initial = [], readOnly = false }: { initial?: EditableWorkOrderItem[]; readOnly?: boolean }) {
  const [items, setItems] = useState(initial);
  const [discount, setDiscount] = useState<DiscountDraft>({ descuentoTipo: null, descuentoValor: '0' });
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}><div className="reception-create-page">
    <WorkOrderItemsEditor serviceWorkspace presentation="reception" vehicle={null} items={items} onChange={setItems}
      showDiscounts showTotal={false} showExecution={false} isPriceReadOnly={() => readOnly}
      catalogFooter={<QuotationDiscountSummary variant="controls" items={items} value={discount} onChange={setDiscount} />}
      selectionFooter={<QuotationDiscountSummary variant="totals" items={items} value={discount} onChange={setDiscount} testId="mec-total" />} />
    <output data-testid="mec-items">{JSON.stringify(items)}</output>
  </div></QueryClientProvider>;
}

async function mount(initial: EditableWorkOrderItem[] = [], readOnly = false) {
  render(<Harness initial={initial} readOnly={readOnly} />);
  fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de catálogo' })).getByRole('button', { name: 'MEC' }));
  await screen.findByRole('button', { name: new RegExp(`(?:Configurar|Editar) ${standard.nombre}`) });
}
async function chooseSpecific() {
  fireEvent.click(screen.getByRole('button', { name: 'Específicos' }));
  fireEvent.click(await screen.findByRole('button', { name: `Configurar ${specific.nombre}` }));
}

describe('MEC in step 5', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.get).mockImplementation(async (_url, config) => ({
      data: { items: [(config?.params as Params)?.subtipo === 'especifico' ? specific : standard],
        page: 1, pageSize: 12, total: 1, totalPages: 1 },
    }) as AxiosResponse);
  });

  it('filters standard MEC and adds quantity, price and estimated hours once without line-discount controls', async () => {
    await mount();
    expect(api.get).toHaveBeenCalledWith('/catalog', expect.objectContaining({ params: expect.objectContaining({ division: 'MEC', subtipo: 'estandar' }) }));
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${standard.nombre}` }));
    fireEvent.change(screen.getByLabelText('Cantidad MEC'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario MEC'), { target: { value: '20000' } });
    expect(screen.queryByLabelText('Tipo de descuento MEC')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Descuento MEC')).not.toBeInTheDocument();
    expect(screen.queryByText('Descuento por línea')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Descuento general en porcentaje')).toHaveLength(1);
    expect(screen.getByLabelText('Descuento general en pesos')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tiempo estimado (opcional)'));
    fireEvent.change(screen.getByLabelText('Horas hombre MEC'), { target: { value: '0.75' } });
    expect(selected()).toEqual([]);
    expect(screen.queryByRole('article', { name: 'Servicio MEC 1' })).not.toBeInTheDocument();
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$0');
    const add = screen.getByRole('button', { name: 'Agregar' });
    fireEvent.click(add); fireEvent.click(add);
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toMatchObject({ division: 'MEC', subtipo: 'estandar', tipoLinea: 'estandar',
      catalogItemId: 81, cantidad: '2', precioUnitario: '20000', horasHombreEstimadas: '0.75' });
    expect(selected()[0].descuentoTipo ?? null).toBeNull();
    expect(Number(selected()[0].descuentoValor ?? 0)).toBe(0);
    const card = within(screen.getByRole('article', { name: 'Servicio MEC 1' }));
    expect(card.getByText('MEC · Estándar')).toBeInTheDocument();
    expect(card.getByText('Sin descuento')).toBeInTheDocument();
    expect(card.getByTestId('item-subtotal-0')).toHaveTextContent('$40.000');
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$47.600');
    expect(standard.precio).toBe(15000);
  });

  it.each([0, 45000])('uses $1 for a new specific service even when its catalogue price is %s', async (cataloguePrice) => {
    vi.mocked(api.get).mockImplementation(async (_url, config) => ({ data: {
      items: [(config?.params as Params)?.subtipo === 'especifico' ? { ...specific, precio: cataloguePrice } : standard], totalPages: 1,
    } }) as AxiosResponse);
    await mount();
    await chooseSpecific();
    expect(api.get).toHaveBeenCalledWith('/catalog', expect.objectContaining({ params: expect.objectContaining({ division: 'MEC', subtipo: 'especifico' }) }));
    expect(screen.getByLabelText('Precio unitario MEC')).toBeDisabled();
    expect(screen.getByLabelText('Precio unitario MEC')).toHaveValue('1');
    expect(screen.getByLabelText('Descripción MEC')).toHaveValue(specific.nombre);
    expect(screen.queryByLabelText('Cantidad MEC')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tipo de descuento MEC')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Descripción MEC'), { target: { value: `${specific.nombre}: revisar arranque` } });
    expect(selected()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(selected()[0]).toMatchObject({ catalogItemId: 82, division: 'MEC', subtipo: 'especifico', tipoLinea: 'especifico',
      cantidad: '1', precioUnitario: '1', descuentoTipo: null, descuentoValor: '0' });
    const card = within(screen.getByRole('article', { name: 'Servicio MEC 1' }));
    expect(card.getByText(/Pendiente de diagnóstico y valoración/)).toBeInTheDocument();
    expect(card.getByTestId('item-subtotal-0')).toHaveTextContent('$1');
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$1');
    expect(specific.precio).toBe(45000);
  });

  it('cancels editing without changing the card, then saves without duplicating', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${standard.nombre}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const original = selected()[0];
    fireEvent.click(screen.getByRole('button', { name: 'Editar servicio MEC 1' }));
    fireEvent.change(screen.getByLabelText('Cantidad MEC'), { target: { value: '3' } });
    expect(selected()[0]).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));
    expect(selected()[0]).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: `Editar ${standard.nombre}` }));
    expect(screen.getByLabelText('Cantidad MEC')).toHaveValue(1);
    fireEvent.change(screen.getByLabelText('Cantidad MEC'), { target: { value: '2' } });
    expect(screen.queryByLabelText('Tipo de descuento MEC')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toMatchObject({ key: original.key, catalogItemId: 81, cantidad: '2' });
    expect(selected()[0].descuentoTipo ?? null).toBeNull();
    expect(Number(selected()[0].descuentoValor ?? 0)).toBe(0);
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$35.700');
  });

  it('does not reset an already valued specific service when editing its description', async () => {
    const original: EditableWorkOrderItem = { ...createEmptyWorkOrderItem(), id: 90, key: 'valued-specific-90',
      catalogItemId: 82, catalogTipo: 'especifico', division: 'MEC', subtipo: 'especifico', tipoLinea: 'especifico',
      descripcion: 'Diagnóstico ya valorado', precioUnitario: '45000', cantidad: '2', descuentoTipo: 'fijo', descuentoValor: '5000',
      estadoOperativo: 'en_proceso', notasOperativas: 'Conservar diagnóstico', assignedUserId: 9, horasHombreEstimadas: '1.5' };
    await mount([original]);
    const summary = screen.getByRole('region', { name: 'Resumen de importes' });
    expect(within(summary).getByText('Descuentos por ítem').closest('div')).toHaveTextContent('- $5.000');
    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('$85.000');
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$101.150');
    fireEvent.click(screen.getByRole('button', { name: 'Editar servicio MEC 1' }));
    expect(screen.getByRole('button', { name: 'Específicos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Precio unitario MEC')).toHaveValue('45.000');
    expect(screen.getByLabelText('Precio unitario MEC')).toBeDisabled();
    expect(screen.queryByLabelText('Tipo de descuento MEC')).not.toBeInTheDocument();
    expect(screen.queryByText(/Pendiente de diagnóstico y valoración/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Descripción MEC'), { target: { value: 'Descripción actualizada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(selected()).toEqual([{ ...original, descripcion: 'Descripción actualizada' }]);
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$101.150');
    expect(within(summary).getByText('Descuentos por ítem').closest('div')).toHaveTextContent('- $5.000');
  });

  it('keeps the specific price/reference on edit and supports removal/undo', async () => {
    await mount();
    await chooseSpecific();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const original = selected()[0];
    fireEvent.click(screen.getByRole('button', { name: 'Editar servicio MEC 1' }));
    fireEvent.change(screen.getByLabelText('Descripción MEC'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('alert')).toHaveTextContent('descripción');
    expect(selected()[0]).toEqual(original);
    fireEvent.change(screen.getByLabelText('Descripción MEC'), { target: { value: 'Diagnóstico del arranque' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const edited = selected()[0];
    expect(edited.precioUnitario).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar ítem 1' }));
    expect(selected()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(selected()).toEqual([edited]);
  });

  it('rejects invalid standard quantities and missing prices before committing', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${standard.nombre}` }));
    for (const quantity of ['0', '1.5']) {
      fireEvent.change(screen.getByLabelText('Cantidad MEC'), { target: { value: quantity } });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(selected()).toEqual([]);
    }
    fireEvent.change(screen.getByLabelText('Cantidad MEC'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Precio unitario MEC'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Indica el precio unitario');
    expect(selected()).toEqual([]);
  });

  it('validates only the general discount and recalculates both inputs without changing service prices', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${standard.nombre}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const original = selected()[0];
    fireEvent.change(screen.getByLabelText('Descuento general en porcentaje'), { target: { value: '101' } });
    expect(screen.getByRole('alert')).toHaveTextContent('100%');
    expect(screen.getByTestId('mec-total')).toHaveTextContent('-');
    expect(selected()).toEqual([original]);
    fireEvent.change(screen.getByLabelText('Descuento general en pesos'), { target: { value: '15001' } });
    expect(screen.getByRole('alert')).toHaveTextContent('no puede superar el importe');
    expect(selected()).toEqual([original]);
    fireEvent.change(screen.getByLabelText('Descuento general en pesos'), { target: { value: '3000' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Descuento general en porcentaje')).toHaveValue(20);
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$14.280');
    fireEvent.change(screen.getByLabelText('Descuento general en porcentaje'), { target: { value: '10' } });
    expect(screen.getByLabelText('Descuento general en pesos')).toHaveValue('1.500');
    expect(screen.getByTestId('mec-total')).toHaveTextContent('$16.065');
    expect(selected()).toEqual([original]);
    expect(screen.queryByLabelText('Tipo de descuento general')).not.toBeInTheDocument();
  });

  it('retains selections when changing mode/division and respects read-only standard prices', async () => {
    await mount([], true);
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${standard.nombre}` }));
    expect(screen.getByLabelText('Precio unitario MEC')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const original = selected()[0];
    await chooseSpecific();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(selected()).toHaveLength(2);
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de catálogo' })).getByRole('button', { name: 'ACC' }));
    expect(selected()[0]).toEqual(original);
    expect(screen.getAllByRole('article', { name: /Servicio MEC/ })).toHaveLength(2);
  });

  it('keeps paginated catalogue selections and never removes them by clicking a result', async () => {
    const second = { ...standard, id: 83, nombre: 'Alineación' };
    vi.mocked(api.get).mockImplementation(async (_url, config) => ({ data: {
      items: [(config?.params as Params)?.page === 2 ? second : standard], total: 13, totalPages: 2,
    } }) as AxiosResponse);
    await mount();
    fireEvent.click(screen.getByRole('button', { name: `Configurar ${standard.nombre}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente del catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar Alineación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior del catálogo' }));
    fireEvent.click(await screen.findByRole('button', { name: `Editar ${standard.nombre}` }));
    await waitFor(() => expect(selected()).toHaveLength(2));
    expect(selected()[0].catalogItemId).toBe(81);
    expect(screen.getByRole('region', { name: 'Editar servicio MEC' })).toBeInTheDocument();
  });
});
