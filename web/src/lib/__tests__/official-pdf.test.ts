import { toPng } from 'html-to-image';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderOfficialPdf } from '../official-pdf';
import { preparePdfImages } from '../pdf-images';

const pdf = vi.hoisted(() => ({ addPage: vi.fn(), addImage: vi.fn(), output: vi.fn() }));
vi.mock('html-to-image', () => ({ toPng: vi.fn() }));
vi.mock('jspdf', () => ({ jsPDF: vi.fn(function () { return pdf; }) }));
vi.mock('../pdf-images', () => ({ preparePdfImages: vi.fn() }));

describe('approved document PDF export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preparePdfImages).mockResolvedValue();
    vi.mocked(toPng).mockResolvedValue('data:image/png;base64,approved');
    pdf.output.mockReturnValue(new Blob(['%PDF-approved'], { type: 'application/pdf' }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('exports every approved page without margins and respects image revisions', async () => {
    const root = document.createElement('div');
    root.style.display = 'none';
    root.innerHTML = '<div class="pdf-paper-sheet"></div><div class="pdf-paper-sheet"></div>';
    const blob = await renderOfficialPdf(root, { background: true });
    expect(blob.type).toBe('application/pdf');
    expect(toPng).toHaveBeenCalledTimes(2);
    expect(toPng).toHaveBeenCalledWith(root.firstElementChild, expect.objectContaining({
      width: 816, height: 1056, includeQueryParams: true,
      style: expect.objectContaining({ margin: '0', transform: 'none' }),
      fetchRequestInit: { credentials: 'include' },
    }));
    expect(pdf.addPage).toHaveBeenCalledTimes(1);
    expect(root.style.display).toBe('none');
  });

  it('does not export a partial document when a photo fails and restores the view', async () => {
    const root = document.createElement('div');
    root.style.display = 'none';
    vi.mocked(preparePdfImages).mockRejectedValue(new Error('Foto no disponible'));
    await expect(renderOfficialPdf(root)).rejects.toThrow('Foto no disponible');
    expect(toPng).not.toHaveBeenCalled();
    expect(pdf.output).not.toHaveBeenCalled();
    expect(root.style.cssText).toBe('display: none;');
  });
});
