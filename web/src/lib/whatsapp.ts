export type PdfShareResult = 'shared' | 'fallback' | 'cancelled';

interface SharePdfInput {
  blob: Blob;
  filename: string;
  title: string;
  text: string;
  phone?: string | null;
}

export const normalizeWhatsAppPhone = (phone?: string | null): string => {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('56')) return digits;
  if (digits.length === 9 && digits.startsWith('9')) return `56${digits}`;
  if (digits.length === 8) return `56${digits}`;
  return digits;
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

export const sharePdfOnWhatsApp = async ({
  blob,
  filename,
  title,
  text,
  phone,
}: SharePdfInput): Promise<PdfShareResult> => {
  const file = new File([blob], filename, { type: 'application/pdf' });
  let canShareFiles = false;
  try {
    canShareFiles = Boolean(
      typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }),
    );
  } catch {
    canShareFiles = false;
  }

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }

  downloadBlob(blob, filename);
  const target = normalizeWhatsAppPhone(phone);
  const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return 'fallback';
};

export const buildPdfShareText = ({
  documentLabel,
  code,
  clientName,
  patente,
}: {
  documentLabel: string;
  code: string;
  clientName?: string | null;
  patente?: string | null;
}): string => {
  const greeting = clientName?.trim() ? `Hola ${clientName.trim()}, ` : 'Hola, ';
  const vehicle = patente?.trim() ? ` del vehículo ${patente.trim()}` : '';
  return `${greeting}le compartimos ${documentLabel} ${code}${vehicle}.`;
};
