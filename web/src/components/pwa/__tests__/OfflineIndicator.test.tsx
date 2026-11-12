import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OfflineIndicator from '../OfflineIndicator';

describe('network status', () => {
  it('explains the limit on offline operations and reacts to reconnection', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      render(<OfflineIndicator />);
      expect(screen.getByRole('status')).toHaveTextContent('Consultar y guardar datos requiere internet');
      online.mockReturnValue(true);
      act(() => { window.dispatchEvent(new Event('online')); });
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
      online.mockReturnValue(false);
      act(() => { window.dispatchEvent(new Event('offline')); });
      expect(screen.getByRole('status')).toHaveTextContent('Sin conexión');
    } finally { online.mockRestore(); }
  });
});
