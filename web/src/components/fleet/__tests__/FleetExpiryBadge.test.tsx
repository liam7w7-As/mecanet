import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FleetExpiryBadge from '../FleetExpiryBadge';

import type { FleetExpiryInfo } from '../../../types/entities';

const renderBadge = (expiry: FleetExpiryInfo) =>
  render(<FleetExpiryBadge expiry={expiry} />);

describe('FleetExpiryBadge', () => {
  it('muestra los días restantes en verde cuando el documento está vigente', () => {
    renderBadge({ state: 'vigente', daysRemaining: 45 });

    const badge = screen.getByText('45 días restantes');
    expect(badge).toHaveClass('bg-brand-mintPale');
  });

  it('muestra advertencia ámbar entre 8 y 30 días', () => {
    renderBadge({ state: 'advertencia', daysRemaining: 15 });

    const badge = screen.getByText('Vence en 15 días');
    expect(badge).toHaveClass('bg-amber-50');
  });

  it('muestra alerta crítica en rojo para 7 días o menos', () => {
    renderBadge({ state: 'critico', daysRemaining: 7 });

    const badge = screen.getByText('Vence en 7 días');
    expect(badge).toHaveClass('bg-brand-coralPale');
  });

  it('destaca el vencimiento del día con el texto Vence hoy', () => {
    renderBadge({ state: 'vence_hoy', daysRemaining: 0 });

    expect(screen.getByText('Vence hoy')).toHaveClass('bg-brand-coralPale');
  });

  it('indica hace cuántos días venció un documento', () => {
    renderBadge({ state: 'vencido', daysRemaining: -3 });

    expect(screen.getByText('Vencido hace 3 días')).toHaveClass('bg-brand-coralPale');
  });

  it('distingue un documento sin fecha de vencimiento', () => {
    renderBadge({ state: 'sin_vencimiento', daysRemaining: null });

    const badge = screen.getByText('Sin vencimiento');
    expect(badge).toHaveClass('bg-brand-pale');
  });
});
