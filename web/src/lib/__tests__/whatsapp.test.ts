import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPdfShareText, normalizeWhatsAppPhone, sharePdfOnWhatsApp } from '../whatsapp';

const blob = new Blob(['%PDF-'], { type: 'application/pdf' });

const setNavigatorShare = (value: unknown): void => {
  Object.defineProperty(navigator, 'share', { configurable: true, value });
};

const setNavigatorCanShare = (value: unknown): void => {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value });
};

afterEach(() => {
  vi.restoreAllMocks();
  setNavigatorShare(undefined);
  setNavigatorCanShare(undefined);
});

describe('whatsapp helpers', () => {
  it('normaliza teléfonos chilenos para wa.me', () => {
    expect(normalizeWhatsAppPhone('+56 9 1111 2222')).toBe('56911112222');
    expect(normalizeWhatsAppPhone('9 1111 2222')).toBe('56911112222');
    expect(normalizeWhatsAppPhone('22334455')).toBe('5622334455');
    expect(normalizeWhatsAppPhone(null)).toBe('');
  });

  it('construye el mensaje con cliente y patente', () => {
    expect(
      buildPdfShareText({
        documentLabel: 'la orden de trabajo',
        code: 'OT-1',
        clientName: 'Ana',
        patente: 'ABCD12',
      }),
    ).toBe('Hola Ana, le compartimos la orden de trabajo OT-1 del vehículo ABCD12.');
  });

  it('comparte el archivo con Web Share cuando está disponible', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    setNavigatorShare(share);
    setNavigatorCanShare(canShare);

    const result = await sharePdfOnWhatsApp({
      blob,
      filename: 'OT-1.pdf',
      title: 'Orden de trabajo OT-1',
      text: 'Hola Ana',
      phone: '+56 9 1111 2222',
    });

    expect(result).toBe('shared');
    expect(canShare).toHaveBeenCalled();
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.any(File)],
        title: 'Orden de trabajo OT-1',
        text: 'Hola Ana',
      }),
    );
  });

  it('descarga el PDF y abre WhatsApp como respaldo', async () => {
    setNavigatorShare(undefined);
    setNavigatorCanShare(undefined);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:pdf'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    const result = await sharePdfOnWhatsApp({
      blob,
      filename: 'OT-1.pdf',
      title: 'Orden de trabajo OT-1',
      text: 'Hola Ana',
      phone: '+56 9 1111 2222',
    });

    expect(result).toBe('fallback');
    expect(click).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      'https://wa.me/56911112222?text=Hola%20Ana',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
