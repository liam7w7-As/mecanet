import { describe, expect, it } from 'vitest';
import { getFleetExpiryInfo, isFleetExpiryAttention, parseFleetDateOnly, toFleetDateOnly, } from '../fleet-expiry.js';
const TODAY = new Date(2026, 9, 26); // 26/10/2026
describe('getFleetExpiryInfo', () => {
    it('marca como vencido un documento con fecha pasada', () => {
        expect(getFleetExpiryInfo('2026-10-25', TODAY)).toEqual({
            state: 'vencido',
            daysRemaining: -1,
        });
        expect(isFleetExpiryAttention('vencido')).toBe(true);
    });
    it('distingue el vencimiento del mismo día', () => {
        expect(getFleetExpiryInfo('2026-10-26', TODAY)).toEqual({
            state: 'vence_hoy',
            daysRemaining: 0,
        });
    });
    it('usa rojo hasta 7 días y ámbar hasta 30 días', () => {
        expect(getFleetExpiryInfo('2026-11-02', TODAY)).toMatchObject({
            state: 'critico',
            daysRemaining: 7,
        });
        expect(getFleetExpiryInfo('2026-11-03', TODAY)).toMatchObject({
            state: 'advertencia',
            daysRemaining: 8,
        });
        expect(getFleetExpiryInfo('2026-11-25', TODAY)).toMatchObject({
            state: 'advertencia',
            daysRemaining: 30,
        });
        expect(getFleetExpiryInfo('2026-11-26', TODAY)).toMatchObject({
            state: 'vigente',
            daysRemaining: 31,
        });
    });
    it('devuelve sin vencimiento cuando no hay fecha o es inválida', () => {
        expect(getFleetExpiryInfo(null, TODAY)).toEqual({
            state: 'sin_vencimiento',
            daysRemaining: null,
        });
        expect(getFleetExpiryInfo('2026-02-30', TODAY)).toEqual({
            state: 'sin_vencimiento',
            daysRemaining: null,
        });
    });
    it('no se desplaza por cambios de horario', () => {
        // Santiago cambia de hora el 6 de septiembre de 2026.
        expect(getFleetExpiryInfo('2026-09-06', new Date(2026, 8, 5))).toMatchObject({
            state: 'critico',
            daysRemaining: 1,
        });
    });
});
describe('fechas sin hora', () => {
    it('interpreta la fecha como calendario local', () => {
        const parsed = parseFleetDateOnly('2026-01-01');
        expect(parsed?.getFullYear()).toBe(2026);
        expect(parsed?.getMonth()).toBe(0);
        expect(parsed?.getDate()).toBe(1);
        expect(parsed ? toFleetDateOnly(parsed) : null).toBe('2026-01-01');
    });
    it('rechaza formatos y días inexistentes', () => {
        expect(parseFleetDateOnly('01-01-2026')).toBeNull();
        expect(parseFleetDateOnly('2026-13-01')).toBeNull();
        expect(parseFleetDateOnly('2026-04-31')).toBeNull();
    });
});
