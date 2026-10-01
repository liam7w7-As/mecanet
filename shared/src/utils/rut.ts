export const normalizeRut = (value: string): string => value.replace(/[.\s-]/g, '').toUpperCase();

export const formatRut = (value: string): string => {
  const normalized = normalizeRut(value);
  if (!/^\d{1,8}[\dK]$/.test(normalized)) return normalized;
  const body = normalized.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${normalized.slice(-1)}`;
};

export const isValidRut = (value: string): boolean => {
  const normalized = normalizeRut(value);
  if (!/^\d{1,8}[\dK]$/.test(normalized)) return false;
  const body = normalized.slice(0, -1);
  if (Number(body) === 0) return false;

  let sum = 0;
  let weight = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const verifier = remainder === 0 ? '0' : remainder === 1 ? 'K' : String(11 - remainder);
  return normalized.slice(-1) === verifier;
};
