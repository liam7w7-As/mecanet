import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ToastViewport from '../Toast';
import { notifyError, notifySuccess, useToastStore } from '../../../stores/toast.store';

describe('ToastViewport', () => {
  it('muestra notificaciones de éxito y error', () => {
    useToastStore.getState().clear();
    render(<ToastViewport />);
    act(() => {
      notifySuccess('Orden creada.');
      notifyError('No se pudo subir la foto.');
    });

    expect(screen.getByText('Orden creada.')).toBeInTheDocument();
    expect(screen.getByText('No se pudo subir la foto.')).toBeInTheDocument();
    act(() => useToastStore.getState().clear());
  });
});
