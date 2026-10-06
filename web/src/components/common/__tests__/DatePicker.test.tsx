import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DatePicker from '../DatePicker';

describe('DatePicker', () => {
  it('abre el calendario en español, selecciona un día bisiesto y devuelve el foco', () => {
    const onChange = vi.fn();
    render(<DatePicker label="Fecha específica" value="2024-02-20" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Fecha específica' });
    expect(trigger).toHaveTextContent('20-02-2024');
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Calendario: fecha específica' })).toBeInTheDocument();
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
