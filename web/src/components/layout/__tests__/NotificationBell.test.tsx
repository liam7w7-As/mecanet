import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { NotificationBell } from '../NotificationBell';

import type { Notification } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const buildNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 1,
  tipo: 'solicitud_creada',
  nivel: 'warning',
  titulo: 'Repuesto solicitado en OT-2026-0001',
  mensaje: 'Mecánico Notif pide aprobación: se rompió el soporte.',
  href: '/work-orders/1',
  leida: false,
  workOrderId: 1,
  quotationId: null,
  paymentId: null,
  actor: { id: 9, nombre: 'Mecánico Notif' },
  createdAt: new Date().toISOString(),
  ...overrides,
});

const listResponse = (items: Notification[]) => ({
  data: { items, noLeidas: items.filter((item) => !item.leida).length, total: items.length, page: 1, pageSize: 20, totalPages: 1 },
});

const renderBell = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
      })}
    >
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, nombre: 'Jefe', email: 'jefe@unithor.local', role: 'jefe' },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/notifications/unread-count') {
        return Promise.resolve({ data: { noLeidas: 1 } } as AxiosResponse<{ noLeidas: number }>);
      }
      return Promise.resolve(listResponse([buildNotification()]) as AxiosResponse<never>);
    });
    vi.mocked(api.patch).mockResolvedValue({
      data: { affected: 1, noLeidas: 0 },
    } as AxiosResponse<{ affected: number; noLeidas: number }>);
  });

  it('muestra la campanita con el contador de no leídas', async () => {
    renderBell();

    const button = await screen.findByRole('button', { name: /Notificaciones, 1 sin leer/ });
    expect(button).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('notification-badge')).toHaveTextContent('1');
    });
  });

  it('abre el panel y lista las notificaciones con su categoría', async () => {
    renderBell();

    fireEvent.click(await screen.findByRole('button', { name: /Notificaciones/ }));

    const panel = await screen.findByRole('dialog', { name: 'Notificaciones' });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText('Repuesto solicitado en OT-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Solicitud de taller')).toBeInTheDocument();
    expect(screen.getAllByText(/Mecánico Notif/).length).toBeGreaterThan(0);
  });

  it('permite marcar todas como leídas', async () => {
    renderBell();

    fireEvent.click(await screen.findByRole('button', { name: /Notificaciones/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Marcar leídas/ }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/notifications/read', {
        ids: [],
        todas: true,
      });
    });
  });

  it('marca como leída la notificación al abrirla', async () => {
    renderBell();

    fireEvent.click(await screen.findByRole('button', { name: /Notificaciones/ }));
    fireEvent.click(await screen.findByText('Repuesto solicitado en OT-2026-0001'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/notifications/read', {
        ids: [1],
        todas: false,
      });
    });
  });

  it('muestra estado vacío cuando no hay notificaciones', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/notifications/unread-count') {
        return Promise.resolve({ data: { noLeidas: 0 } } as AxiosResponse<{ noLeidas: number }>);
      }
      return Promise.resolve(listResponse([]) as AxiosResponse<never>);
    });
    renderBell();

    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones' }));

    expect(await screen.findByText('Sin notificaciones')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });
});
