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
});
