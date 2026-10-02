const currencyInputFormatter = new Intl.NumberFormat('es-CL', {
  maximumFractionDigits: 0,
});

export const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  return digits === '' ? '' : currencyInputFormatter.format(Number(digits));
};

export const formatClp = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

/** Solo hora "14:30". Para segundas líneas bajo una fecha ya mostrada. */
export const formatTime = (value: string | null | undefined): string => {
  if (!value) return '';

  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

/** "hace 5 min", "hace 2 h", "ayer". Para listas de actividad y notificaciones. */
export const formatRelativeTime = (value: string | null | undefined): string => {
  if (!value) return 'Sin fecha';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Sin fecha';

  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'Recién';
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;

  return formatDate(value);
};
