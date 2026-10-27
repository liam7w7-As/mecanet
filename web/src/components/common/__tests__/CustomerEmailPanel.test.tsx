import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import CustomerEmailPanel from '../CustomerEmailPanel';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../stores/toast.store', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
const original = {
  enabled: true,
  recipient: 'cliente@example.com',
  recipientName: 'Cliente Demo',
  phone: '912345678',
  progressPreview: 'Trabajos completados: 1 de 2.\n• Cambio de aceite',
  history: [
    {
      id: 1,
      category: 'document',
      status: 'sent',
      recipient: 'cliente@example.com',
      attempts: 1,
      acceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastError: null,
    },
  ],
};
const clients: QueryClient[] = [];
const mount = (kind: 'quotation' | 'work_order' = 'quotation') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <CustomerEmailPanel kind={kind} id={123} />
    </QueryClientProvider>,
  );
};

describe('CustomerEmailPanel', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: structuredClone(original) });
    vi.mocked(api.post).mockResolvedValue({ data: { email: { status: 'pending' } } });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    vi.clearAllMocks();
  });

  it('shows recipient and allows resending the document through the authorized API', async () => {
    mount();
    expect(await screen.findByText('cliente@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar documento' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/customer-emails/quotations/123/send', {
        requestId: expect.any(String),
        category: 'document',
      }),
    );
  });

  it('explains missing SMTP configuration without offering an enabled email button', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...original, enabled: false, history: [] } });
    mount();
    expect(await screen.findByText('Correo automático pendiente de activar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar documento' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('blocks document resend while the initial photos are still uploading', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { ...original, history: [{ ...original.history[0], status: 'waiting_photos' }] },
    });
    mount('work_order');
    expect(await screen.findByText('Esperando fotos de recepción')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar documento' })).toBeDisabled();
  });

  it('offers a customer-safe progress preview, email action and a wa.me link', async () => {
    mount('work_order');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar avance' }));
    expect(screen.getByText(/Cambio de aceite/)).toBeInTheDocument();
    const whatsapp = screen.getByRole('link', { name: 'Compartir avance por WhatsApp' });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa.me\/56912345678\?text=/);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avance por correo' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/customer-emails/work-orders/123/send',
        expect.objectContaining({ category: 'progress' }),
      ),
    );
  });

  it('requires a recipient email even when SMTP is activated', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...original, recipient: null } });
    mount();
    expect(await screen.findByText('Falta correo del destinatario')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar documento' })).toBeDisabled();
  });
});
