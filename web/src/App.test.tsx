import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App Component', () => {
  it('renderiza la página de inicio con Hola UNITHOR', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );

    expect(screen.getByText('Hola UNITHOR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Operaciones/i })).toBeInTheDocument();
  });
});
