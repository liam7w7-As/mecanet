// Límites alineados con el backend (api/src/middlewares/inspection-photo-upload.ts
// + MAX_INSPECTION_PHOTO_SIZE_MB, por defecto 8 MB).
export const MAX_INSPECTION_PHOTO_MB = 8;
export const MAX_INSPECTION_PHOTO_BYTES = MAX_INSPECTION_PHOTO_MB * 1024 * 1024;

export const ACCEPTED_INSPECTION_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const INSPECTION_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export const validateInspectionFile = (file: File): string | null => {
  const mime = file.type.toLowerCase();
  if (!(ACCEPTED_INSPECTION_MIME_TYPES as readonly string[]).includes(mime)) {
    return 'Formato no permitido. Use JPG, PNG o WebP.';
  }
  if (file.size > MAX_INSPECTION_PHOTO_BYTES) {
    return `La foto supera el límite de ${MAX_INSPECTION_PHOTO_MB} MB.`;
  }
  if (file.size === 0) {
    return 'El archivo está vacío.';
  }
  return null;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
