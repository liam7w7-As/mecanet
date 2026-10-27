import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { renderOfficialPdf } from '../../../lib/official-pdf';
import { useAuthStore } from '../../../stores/auth.store';
import CustomerEmailPreparation from '../CustomerEmailPreparation';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../../lib/official-pdf', () => ({ renderOfficialPdf: vi.fn() }));
vi.mock('../PdfPreviewModal', () => ({
  OfficialDocumentSheets: ({ type }: { type: string }) => (
    <div className="pdf-paper-sheet" data-official-template={type}>
      Approved document {type}
    </div>
  ),
}));
const bundle = {
  id: 12,
  revision: 'abc123',
  branding: { razonSocial: 'UNITHOR', nombreComercial: 'UNITHOR', tieneLogo: false },
  documents: [
    {
      type: 'work-order',
      id: 8,
      filename: 'OT-26-8.pdf',
      workOrder: { id: 8, codigo: 'OT-26-8', inspection: { photos: [] } },
    },
    {
      type: 'quotation',
      id: 9,
      filename: 'COT-26-9.pdf',
      quotation: { id: 9, codigo: 'COT-26-9', workOrder: null },
    },
  ],
};
const clients: QueryClient[] = [];
const mount = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <CustomerEmailPreparation />
    </QueryClientProvider>,
  );
};
describe('automatic official email preparation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 1, nombre: 'Admin', email: 'admin@example.com', role: 'desarrollador' },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data:
        url === '/customer-emails/preparation'
          ? { enabled: true, jobs: [{ id: 12 }] }
          : structuredClone(bundle),
    }));
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(renderOfficialPdf).mockResolvedValue(
      new Blob(['%PDF-approved'], { type: 'application/pdf' }),
    );
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    vi.clearAllMocks();
  });

  it('prepares the approved OT and COT automatically without a send button', async () => {
    mount();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/customer-emails/preparation/12',
        expect.any(FormData),
      ),
    );
    const call = vi
      .mocked(api.post)
      .mock.calls.find(([url]) => url === '/customer-emails/preparation/12');
    const form = call?.[1] as FormData;
    expect(form.get('revision')).toBe(bundle.revision);
    expect((form.getAll('documents') as File[]).map((file) => file.name)).toEqual([
      'OT-26-8.pdf',
      'COT-26-9.pdf',
    ]);
    expect(renderOfficialPdf).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(renderOfficialPdf)
        .mock.calls[0][0].querySelector('[data-official-template="work-order"]'),
    ).not.toBeNull();
  });

  it('keeps the email pending when generating the approved PDF fails', async () => {
    vi.mocked(renderOfficialPdf).mockRejectedValue(new Error('Photo unavailable'));
    mount();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/customer-emails/preparation/12/error'),
    );
    expect(
      vi.mocked(api.post).mock.calls.some(([url]) => url === '/customer-emails/preparation/12'),
    ).toBe(false);
  });

  it('does not prepare emails for a mechanic', () => {
    useAuthStore.setState({
      user: { id: 2, nombre: 'Mechanic', email: 'mechanic@example.com', role: 'mecanico' },
    });
    mount();
    expect(api.get).not.toHaveBeenCalled();
  });
});
