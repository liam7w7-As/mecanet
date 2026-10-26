import { FLEET_EXPIRY_CRITICAL_DAYS, FLEET_EXPIRY_WARNING_DAYS, } from '../constants/fleet.js';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * Interpreta una fecha `YYYY-MM-DD` como fecha local, sin hora.
 *
 * No se usa `new Date('YYYY-MM-DD')` porque el estándar la interpreta como UTC
 * y en Chile eso puede mostrar el día anterior.
 */
export const parseFleetDateOnly = (value) => {
    const match = DATE_ONLY_PATTERN.exec(value);
    if (!match) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
        return null;
    }
    return date;
};
export const toFleetDateOnly = (value) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const startOfLocalDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
/**
 * Calcula el estado de un documento a partir de su fecha de vencimiento.
 *
 * El cálculo usa días de calendario locales y `Math.round`, para que los
 * cambios de horario (23 o 25 horas) no desplacen el resultado.
 */
export const getFleetExpiryInfo = (fechaVencimiento, today = new Date()) => {
    if (!fechaVencimiento) {
        return { state: 'sin_vencimiento', daysRemaining: null };
    }
    const expiry = parseFleetDateOnly(fechaVencimiento);
    if (!expiry) {
        return { state: 'sin_vencimiento', daysRemaining: null };
    }
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const daysRemaining = Math.round((expiry.getTime() - startOfLocalDay(today).getTime()) / millisecondsPerDay);
    if (daysRemaining < 0) {
        return { state: 'vencido', daysRemaining };
    }
    if (daysRemaining === 0) {
        return { state: 'vence_hoy', daysRemaining };
    }
    if (daysRemaining <= FLEET_EXPIRY_CRITICAL_DAYS) {
        return { state: 'critico', daysRemaining };
    }
    if (daysRemaining <= FLEET_EXPIRY_WARNING_DAYS) {
        return { state: 'advertencia', daysRemaining };
    }
    return { state: 'vigente', daysRemaining };
};
export const isFleetExpiryAttention = (state) => state === 'vencido' ||
    state === 'vence_hoy' ||
    state === 'critico' ||
    state === 'advertencia';
