import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import WorkOrderObservationFiles from '../WorkOrderObservationFiles';

import type { WorkOrderWorksheetObservationFile } from '../../../types/entities';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));

const photo: WorkOrderWorksheetObservationFile = { id: 1, nombreOriginal: 'soporte.jpg', mimeType: 'image/jpeg', sizeBytes: 100, url: '/api/work-orders/12/observations/3/files/1' };
const pdf: WorkOrderWorksheetObservationFile = { id: 2, nombreOriginal: 'diagnostico.pdf', mimeType: 'application/pdf', sizeBytes: 100, url: '/api/work-orders/12/observations/3/files/2' };
const createUrl = vi.fn(() => 'blob:workshop-photo');
const revokeUrl = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
  vi.mocked(api.get).mockResolvedValue({ data: new Blob(['image'], { type: 'image/jpeg' }) });
});
afterEach(() => vi.unstubAllGlobals());

describe('Service attachment thumbnails', () => {
  it('loads a protected image only when requested and cleans its preview when closed', async () => {
    render(<WorkOrderObservationFiles files={[photo, pdf]} />);
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver imagen soporte.jpg' }));
    expect(await screen.findByRole('img', { name: 'soporte.jpg' })).toHaveAttribute('src', 'blob:workshop-photo');
    expect(api.get).toHaveBeenCalledWith('/work-orders/12/observations/3/files/1', { responseType: 'blob' });
    expect(screen.getByRole('link', { name: 'Descargar original' })).toHaveAttribute('download', 'soporte.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar imagen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(revokeUrl).toHaveBeenCalledWith('blob:workshop-photo');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps PDF documents directly accessible in a separate tab', () => {
    render(<WorkOrderObservationFiles files={[pdf]} />);
    const link = screen.getByRole('link', { name: 'Abrir documento diagnostico.pdf' });
    expect(link).toHaveAttribute('href', pdf.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('keeps a failed preview retryable and releases an image on unmount', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Sin conexión'));
    const view = render(<WorkOrderObservationFiles files={[photo]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver imagen soporte.jpg' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Puedes reintentar');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('img', { name: 'soporte.jpg' });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    view.unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:workshop-photo');
  });
});
