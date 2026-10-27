export const preparePdfImages = async (root: HTMLElement): Promise<void> => {
  if (root.querySelector('[data-pdf-image-error]')) throw new Error('Una foto no está disponible');
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map((image) => {
      if (image.complete) {
        return image.naturalWidth > 0
          ? Promise.resolve()
          : Promise.reject(new Error('No se pudo cargar una imagen del documento'));
      }
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', failed);
        };
        const loaded = () => {
          cleanup();
          image.naturalWidth > 0 ? resolve() : reject(new Error('Imagen vacía'));
        };
        const failed = () => {
          cleanup();
          reject(new Error('No se pudo cargar una foto del documento'));
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Las fotos no terminaron de cargar'));
        }, 15000);
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', failed, { once: true });
      });
    }),
  );
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  if (root.querySelector('[data-pdf-image-error]')) throw new Error('Una foto no está disponible');
};
