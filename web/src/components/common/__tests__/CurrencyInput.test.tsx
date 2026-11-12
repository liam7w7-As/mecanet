import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import CurrencyInput from '../CurrencyInput';

function Amount({ initial = '', allowDecimals = false }: { initial?: string; allowDecimals?: boolean }) {
  const [value, setValue] = useState(initial);
  return <>
    <CurrencyInput aria-label="Monto" value={value} onChange={setValue} allowDecimals={allowDecimals} />
    <output data-testid="raw-amount">{value}</output>
  </>;
}

describe('CurrencyInput monetary precision', () => {
  it('preserves a decimal balance supplied by the payment summary', () => {
    render(<Amount initial="17.99" allowDecimals />);
    const input = screen.getByRole('textbox', { name: 'Monto' });
    expect(input).toHaveValue('17,99');
    fireEvent.focus(input);
    expect(input).toHaveValue('17.99');
    fireEvent.change(input, { target: { value: '17.9' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('17,9');
    expect(screen.getByTestId('raw-amount')).toHaveTextContent('17.9');
  });

  it('accepts a Chilean formatted amount without turning cents into pesos', () => {
    render(<Amount allowDecimals />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1.234,56' } });
    expect(screen.getByRole('textbox')).toHaveValue('1.234,56');
    expect(screen.getByTestId('raw-amount')).toHaveTextContent('1234.56');
  });

  it('does not accept more than two decimal places', () => {
    render(<Amount initial="17.99" allowDecimals />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '17.999' } });
    expect(screen.getByTestId('raw-amount')).toHaveTextContent('17.99');
  });

  it('keeps the original integer mode for catalog prices and other forms', () => {
    render(<Amount />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '25000' } });
    expect(screen.getByRole('textbox')).toHaveValue('25.000');
    expect(screen.getByTestId('raw-amount')).toHaveTextContent('25000');
  });
});
