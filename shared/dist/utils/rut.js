export const normalizeRut = (value) => 
// Además del guion común se aceptan los guiones tipográficos (‐ – — ― −)
// que llegan al pegar desde PDFs, WhatsApp o teclados móviles.
value.replace(/[.\s‐‑‒–—―−-]+/g, '').toUpperCase();
export const formatRut = (value) => {
    const normalized = normalizeRut(value);
    if (!/^\d{1,8}[\dK]$/.test(normalized))
        return normalized;
    const body = normalized.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${body}-${normalized.slice(-1)}`;
};
// Solo formato (cuerpo numérico no nulo + dígito o K). El dígito
// verificador módulo 11 no se exige: bloqueaba RUN/RUT reales en el
// registro de clientes. Misma regla que `rutSchema`.
export const isValidRut = (value) => {
    const normalized = normalizeRut(value);
    if (!/^\d{1,8}[\dK]$/.test(normalized))
        return false;
    return Number(normalized.slice(0, -1)) > 0;
};
