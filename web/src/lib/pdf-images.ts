export const preparePdfImages = async (root: HTMLElement): Promise<void> => {
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map((image) => {
      if (image.complete) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        const finish = () => {
          clearTimeout(timeout);
          image.removeEventListener('load', finish);
          image.removeEventListener('error', finish);
          resolve();
        };
        const timeout = setTimeout(() => {
          image.removeEventListener('load', finish);
          image.removeEventListener('error', finish);
          reject(new Error('Las fotos no terminaron de cargar'));
        }, 15000);
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
      });
    }),
  );

  // Allow the gallery to commit the natural dimensions reported by onLoad.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
};
