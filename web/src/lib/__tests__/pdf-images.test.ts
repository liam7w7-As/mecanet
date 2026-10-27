import { afterEach, describe, expect, it, vi } from 'vitest';

import { preparePdfImages } from '../pdf-images';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('preparePdfImages', () => {
  it('waits for pending images and two layout frames before exporting', async () => {
    const root = document.createElement('div');
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: false });
    Object.defineProperty(image, 'naturalWidth', { value: 200 });
    root.append(image);
    const ready = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const preparation = preparePdfImages(root).then(ready);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    image.dispatchEvent(new Event('load'));
    await preparation;
    expect(ready).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('stops the export when an image remains pending instead of hanging indefinitely', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: false });
    root.append(image);
    const assertion = expect(preparePdfImages(root)).rejects.toThrow(
      'Las fotos no terminaron de cargar',
    );
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });
  it('rejects a broken image instead of exporting a PDF without it', async () => {
    const root = document.createElement('div');
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: true });
    Object.defineProperty(image, 'naturalWidth', { value: 0 });
    root.append(image);
    await expect(preparePdfImages(root)).rejects.toThrow('No se pudo cargar una imagen');
  });

  it('rejects a gallery placeholder after a photo failed to load', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<span data-pdf-image-error>Imagen no disponible</span>';
    await expect(preparePdfImages(root)).rejects.toThrow('Una foto no está disponible');
  });

});
