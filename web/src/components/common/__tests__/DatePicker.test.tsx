import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DatePicker from '../DatePicker';

describe('DatePicker', () => {
  it('conserva la hora al cambiar el día de una recepción y permite editarla', () => {
    const onChange = vi.fn();
    const DateTimeForm = () => {
      const [value, setValue] = useState('2026-11-04T14:35');
      return (
        <DatePicker
          label="Fecha de ingreso"
          value={value}
          includeTime
          allowClear={false}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    };
    render(<DateTimeForm />);
    const trigger = screen.getByRole('button', { name: 'Fecha de ingreso' });
    expect(trigger).toHaveTextContent('14:35');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: /jueves, 5 de noviembre de 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-05T14:35');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hora: fecha de ingreso'), {
      target: { value: '16:45' },
    });
    expect(onChange).toHaveBeenLastCalledWith('2026-11-05T16:45');
    expect(screen.queryByRole('button', { name: 'Quitar fecha' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Limpiar fecha de ingreso' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('permite quitar una entrega prometida sin cambiar la fecha de ingreso', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        label="Entrega prometida"
        value="2026-11-10T10:00"
        includeTime
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Entrega prometida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar fecha' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enfoca un día cuando el calendario automático ya está colocado y visible', async () => {
    render(<DatePicker label="Fecha específica" value="2024-02-20" onChange={vi.fn()} autoOpen />);
    const grid = screen.getByRole('grid', { name: 'febrero 2024' });
    await waitFor(() => expect(grid).toContainElement(document.activeElement as HTMLElement));
  });

  it('abre el calendario en español, selecciona un día bisiesto y devuelve el foco', () => {
    const onChange = vi.fn();
    render(<DatePicker label="Fecha específica" value="2024-02-20" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Fecha específica' });
    expect(trigger).toHaveTextContent('20-02-2024');
    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Calendario: fecha específica' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'febrero 2024' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /29 de febrero de 2024/ }));
    expect(onChange).toHaveBeenCalledWith('2024-02-29');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('permite navegar de mes sin modificar la fecha hasta seleccionar otro día', () => {
    const onChange = vi.fn();
    render(<DatePicker label="Fecha específica" value="2024-02-20" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fecha específica' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir al mes siguiente' }));
    expect(screen.getByRole('grid', { name: 'marzo 2024' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'viernes, 1 de marzo de 2024' }));
    expect(onChange).toHaveBeenCalledWith('2024-03-01');
  });

  it('limpia una fecha seleccionada desde el control', () => {
    const onChange = vi.fn();
    render(<DatePicker label="Fecha específica" value="2024-02-20" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar fecha específica' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('cierra con Escape o clic fuera sin cambiar el filtro', () => {
    const onChange = vi.fn();
    render(<DatePicker label="Fecha específica" value="2024-02-20" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Fecha específica' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('permite seleccionar hoy o quitar el filtro desde el calendario', () => {
    const onChange = vi.fn();
    render(<DatePicker label="Fecha específica" value="" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Fecha específica' });
    expect(trigger).toHaveTextContent('Elegir fecha');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(onChange).toHaveBeenCalledWith(expected);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Sin filtro' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
