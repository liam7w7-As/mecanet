/** Preserve sub-minute work in labels without displaying floating point tails. */
export const formatWorkshopMinutes = (value: number): string => {
  if (!Number.isFinite(value)) return 'Sin registro';
  const seconds = Math.round(Math.abs(value) * 60);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${value < 0 && seconds > 0 ? '-' : ''}${hours} h ${String(minutes).padStart(2, '0')} min${remainder ? ` ${String(remainder).padStart(2, '0')} s` : ''}`;
};
