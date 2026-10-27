import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

import { preparePdfImages } from './pdf-images';

const WIDTH = 816;
const HEIGHT = 1056;

/** One exporter for the approved preview, WhatsApp and automatic customer email. */
export const renderOfficialPdf = async (
  root: HTMLElement,
  options: { grayscale?: boolean; background?: boolean } = {},
): Promise<Blob> => {
  const previousStyle = root.style.cssText;
  root.style.setProperty('display', 'block', 'important');
  root.style.setProperty('position', 'fixed', 'important');
  root.style.setProperty('top', '0', 'important');
  root.style.setProperty('left', options.background ? '-10000px' : '0', 'important');
  root.style.setProperty('width', WIDTH + 'px', 'important');
  root.style.setProperty('z-index', options.background ? '-1' : '40', 'important');
  root.style.setProperty('background-color', '#ffffff', 'important');
  root.style.setProperty('pointer-events', 'none', 'important');
  try {
    await preparePdfImages(root);
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* The approved document uses local Arial. */
      }
    }
    // ResizeObserver/photo onLoad can adjust the OT fit and the photo grid.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const sheets = Array.from(root.querySelectorAll<HTMLElement>('.pdf-paper-sheet'));
    if (!sheets.length) throw new Error('No se encontraron las páginas del documento oficial');
    const pdf = new jsPDF({
      unit: 'px',
      format: [WIDTH, HEIGHT],
      orientation: 'portrait',
      hotfixes: ['px_scaling'],
      compress: true,
    });
    for (const [index, sheet] of sheets.entries()) {
      const height = sheet.getBoundingClientRect().height || HEIGHT;
      const data = await toPng(sheet, {
        width: WIDTH,
        height,
        cacheBust: true,
        includeQueryParams: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: { margin: '0', transform: 'none', boxShadow: 'none', ...(options.grayscale ? { filter: 'grayscale(100%)' } : {}) },
        fetchRequestInit: { credentials: 'include' },
      });
      if (index > 0) pdf.addPage([WIDTH, HEIGHT], 'portrait');
      const scale = Math.min(1, HEIGHT / height);
      pdf.addImage(
        data,
        'PNG',
        (WIDTH - WIDTH * scale) / 2,
        0,
        WIDTH * scale,
        height * scale,
        undefined,
        'FAST',
      );
    }
    return pdf.output('blob');
  } finally {
    root.style.cssText = previousStyle;
  }
};
