import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import QuotationDiscountSummary from '../QuotationDiscountSummary';

import type { DiscountDraft } from '../QuotationDiscountSummary';
import type { QuotationPriceLine } from '@unithor/shared';

function Harness({ initial = { descuentoTipo: null, descuentoValor: '0' }, lines = [{ cantidad: 1, precioUnitario: 100000 }] }: {
  initial?: DiscountDraft; lines?: QuotationPriceLine[];
}) {
  const [discount, setDiscount] = useState(initial);
  const [items, setItems] = useState(lines);
  return <>
    <QuotationDiscountSummary variant="controls" items={items} value={discount} onChange={setDiscount} />
    <div data-testid="summary"><QuotationDiscountSummary variant="totals" items={items} value={discount} onChange={setDiscount} /></div>
    <button onClick={() => setItems([{ cantidad: 1, precioUnitario: 200000 }])}>Cambiar servicios</button>
    <output data-testid="discount-state">{JSON.stringify(discount)}</output>
  </>;
}

const amount = () => screen.getByLabelText('Descuento general en pesos');
const percentage = () => screen.getByLabelText('Descuento general en porcentaje');

describe('Descuento general con monto y porcentaje vinculados', () => {
  it('muestra solo los dos campos a la izquierda y totales de solo lectura', () => {
    const { container } = render(<Harness />);
    expect(amount()).toHaveValue('0');
    expect(percentage()).toHaveValue(0);
    expect(screen.queryByLabelText('Tipo de descuento general')).not.toBeInTheDocument();
    expect(container.querySelector('.quotation-discount-controls h3 svg')).toBeNull();
    expect(screen.getByTestId('summary').querySelector('input,select,textarea')).toBeNull();
  });

  it('convierte el porcentaje a pesos y aplica el IVA una sola vez', () => {
    render(<Harness />);
    fireEvent.change(percentage(), { target: { value: '20' } });
    expect(amount()).toHaveValue('20.000');
    expect(screen.getByTestId('discount-state')).toHaveTextContent('"descuentoTipo":"porcentaje"');
    expect(screen.getByTestId('quotation-total')).toHaveTextContent('$95.200');
  });

  it('convierte el monto a porcentaje sin cambiar el tipo que determina el cálculo', () => {
    render(<Harness />);
    fireEvent.change(amount(), { target: { value: '15000' } });
    expect(percentage()).toHaveValue(15);
    expect(screen.getByTestId('discount-state')).toHaveTextContent('"descuentoTipo":"fijo"');
    expect(screen.getByTestId('quotation-total')).toHaveTextContent('$101.150');
    fireEvent.change(percentage(), { target: { value: '20' } });
    expect(amount()).toHaveValue('20.000');
    expect(screen.getByTestId('discount-state')).toHaveTextContent('"descuentoTipo":"porcentaje"');
  });

  it('conserva el porcentaje elegido al cambiar los servicios y recalcula el monto', () => {
    render(<Harness initial={{ descuentoTipo: 'porcentaje', descuentoValor: '20' }} />);
    fireEvent.click(screen.getByText('Cambiar servicios'));
    expect(percentage()).toHaveValue(20);
    expect(amount()).toHaveValue('40.000');
    expect(screen.getByTestId('quotation-total')).toHaveTextContent('$190.400');
  });

  it('conserva el monto elegido al cambiar los servicios y recalcula el porcentaje', () => {
    render(<Harness initial={{ descuentoTipo: 'fijo', descuentoValor: '20000' }} />);
    fireEvent.click(screen.getByText('Cambiar servicios'));
    expect(amount()).toHaveValue('20.000');
    expect(percentage()).toHaveValue(10);
  });

  it('respeta descuentos históricos de las líneas y usa el neto restante como base', () => {
    render(<Harness lines={[{ cantidad: 2, precioUnitario: 100000, descuentoTipo: 'porcentaje', descuentoValor: 10 }]} />);
    fireEvent.change(percentage(), { target: { value: '20' } });
    expect(amount()).toHaveValue('36.000');
    expect(screen.getByTestId('quotation-total')).toHaveTextContent('$171.360');
    expect(within(screen.getByTestId('summary')).getByText('Descuentos por ítem')).toBeInTheDocument();
  });

  it('redondea solo el porcentaje mostrado y conserva el monto exacto con centavos', () => {
    render(<Harness initial={{ descuentoTipo: 'fijo', descuentoValor: '1' }} lines={[{ cantidad: 1, precioUnitario: 3.33 }]} />);
    expect(percentage()).toHaveValue(30.03);
    expect(screen.getByTestId('discount-state')).toHaveTextContent('"descuentoValor":"1"');
    fireEvent.change(amount(), { target: { value: '1,25' } });
    expect(screen.getByTestId('discount-state')).toHaveTextContent('"descuentoValor":"1.25"');
  });

  it.each(['101', '-5'])('señala un porcentaje inválido sin sustituir lo escrito: %s', (value) => {
    render(<Harness />);
    fireEvent.change(percentage(), { target: { value } });
    expect(screen.getByRole('alert')).toHaveTextContent(/descuento/i);
    expect(percentage()).toHaveValue(Number(value));
    expect(percentage()).toHaveAttribute('aria-invalid', 'true');
  });

  it('rechaza un monto superior al saldo de servicios', () => {
    render(<Harness />);
    fireEvent.change(amount(), { target: { value: '100001' } });
    expect(screen.getByRole('alert')).toHaveTextContent('no puede superar');
    expect(amount()).toHaveAttribute('aria-invalid', 'true');
  });

  it('no divide por cero ni muestra NaN al no haber servicios', () => {
    render(<Harness initial={{ descuentoTipo: 'fijo', descuentoValor: '0' }} lines={[]} />);
    expect(percentage()).toHaveValue(0);
    expect(amount()).toHaveValue('0');
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });
});
