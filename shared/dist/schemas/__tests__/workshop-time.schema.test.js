import { describe, expect, it } from 'vitest';
import { createWorkshopDailyEntrySchema, createWorkshopTimeRequestSchema, reviewWorkshopTimeRequestSchema, workshopTimeQuerySchema, workshopTimeEligibleQuerySchema, pauseWorkshopTimerSchema, } from '../workshop-time.schema.js';
const interval = {
    startedAt: '2025-10-04T09:00:00-03:00',
    endedAt: '2025-10-04T10:00:00-03:00',
    note: 'Trabajo de diagnóstico',
};
describe('Workshop time contract', () => {
    it('accepts optional worker activity only on manual requests, preserving old clients', () => {
        const data = { workOrderId: 1, itemId: 2, ...interval };
        expect(createWorkshopTimeRequestSchema.parse(data)).not.toHaveProperty('activityStatus');
        for (const activityStatus of ['en_proceso', 'completado']) {
            expect(createWorkshopTimeRequestSchema.safeParse({ ...data, activityStatus }).success).toBe(true);
            expect(createWorkshopTimeRequestSchema.safeParse({ sourceSessionId: 3, ...interval, activityStatus }).success).toBe(false);
        }
        expect(createWorkshopTimeRequestSchema.safeParse({ ...data, activityStatus: 'aprobado' }).success).toBe(false);
        expect(createWorkshopTimeRequestSchema.safeParse({ ...data, activityStatus: 'pendiente' }).success).toBe(false);
    });
    it('validates optional eligible calendar dates and pause reasons', () => {
        expect(workshopTimeEligibleQuerySchema.parse({ fecha: '2026-11-15', userId: '9' })).toEqual({ fecha: '2026-11-15', userId: 9 });
        expect(workshopTimeEligibleQuerySchema.safeParse({ fecha: '2026-02-30' }).success).toBe(false);
        expect(workshopTimeEligibleQuerySchema.safeParse({ fecha: '2026-11-15', price: 9 }).success).toBe(false);
        expect(pauseWorkshopTimerSchema.parse({ note: '  Falta herramienta  ' })).toEqual({ note: 'Falta herramienta' });
        expect(pauseWorkshopTimerSchema.safeParse({ note: ' ' }).success).toBe(false);
        expect(pauseWorkshopTimerSchema.safeParse({ note: 'x'.repeat(2001) }).success).toBe(false);
    });
    it('defaults manual overtime to false and only accepts an explicit boolean', () => {
        const data = { workOrderId: 1, itemId: 2, ...interval };
        expect(createWorkshopTimeRequestSchema.parse(data)).toMatchObject({ overtime: false });
        expect(createWorkshopTimeRequestSchema.parse({ ...data, overtime: true })).toMatchObject({ overtime: true });
        expect(createWorkshopTimeRequestSchema.safeParse({ ...data, overtime: 'true' }).success).toBe(false);
        expect(createWorkshopTimeRequestSchema.safeParse({ sourceSessionId: 3, ...interval, overtime: true }).success).toBe(false);
        expect(createWorkshopTimeRequestSchema.safeParse({ sourceSessionId: 3, ...interval, overtime: false }).success).toBe(false);
    });
    it('accepts explicit timezone intervals and trims the mandatory reason', () => {
        expect(createWorkshopTimeRequestSchema.parse({
            workOrderId: 1,
            itemId: 2,
            ...interval,
            note: '  Motivo  ',
        }).note).toBe('Motivo');
        expect(createWorkshopTimeRequestSchema.safeParse({ sourceSessionId: 3, ...interval }).success).toBe(true);
    });
    it.each([
        { endedAt: '2025-10-04T09:00:59-03:00' },
        { endedAt: interval.startedAt },
        { endedAt: '2025-10-04T08:00:00-03:00' },
        { startedAt: '2999-01-01T10:00:00Z', endedAt: '2999-01-01T11:00:00Z' },
        { startedAt: '2025-10-04T09:00' },
        { note: '  ' },
    ])('rejects invalid/future/short intervals and missing reasons: %j', (patch) => {
        expect(createWorkshopTimeRequestSchema.safeParse({
            workOrderId: 1,
            itemId: 2,
            ...interval,
            ...patch,
        }).success).toBe(false);
    });
    it('rejects worker spoofing and mixed correction/manual payloads', () => {
        expect(createWorkshopTimeRequestSchema.safeParse({ sourceSessionId: 3, userId: 4, ...interval })
            .success).toBe(false);
        expect(createWorkshopTimeRequestSchema.safeParse({
            sourceSessionId: 3,
            workOrderId: 1,
            itemId: 2,
            ...interval,
        }).success).toBe(false);
    });
    it('requires a real boolean and nonblank reason for both review decisions', () => {
        expect(reviewWorkshopTimeRequestSchema.safeParse({ approve: false, note: '' }).success).toBe(false);
        expect(reviewWorkshopTimeRequestSchema.safeParse({ approve: 'false', note: 'Motivo' }).success).toBe(false);
        expect(reviewWorkshopTimeRequestSchema.parse({ approve: false, note: 'No coincide' }).approve).toBe(false);
    });
    it('accepts only valid calendar day queries', () => {
        expect(workshopTimeQuerySchema.safeParse({ fecha: '2026-02-30' }).success).toBe(false);
        expect(workshopTimeQuerySchema.parse({ fecha: '2026-11-16', userId: '4' }).userId).toBe(4);
    });
});
describe('Daily workshop entry contract', () => {
    const daily = { workOrderId: 1, itemId: 2, clientRequestId: '5c3e8fb0-c568-4aa1-86a1-d3bb81787cc1', fecha: '2025-10-04', ...interval, activityStatus: 'completado' };
    it('accepts a declared duration without requesting or guessing a work interval', () => {
        const { startedAt: _start, endedAt: _end, ...declared } = daily;
        expect(createWorkshopDailyEntrySchema.parse({ ...declared, horasUtilizadas: 1.5 })).toMatchObject({ horasUtilizadas: 1.5 });
        for (const horasUtilizadas of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.001]) {
            expect(createWorkshopDailyEntrySchema.safeParse({ ...declared, horasUtilizadas }).success).toBe(false);
        }
        for (const horasUtilizadas of [3, 5, 25, 100]) {
            expect(createWorkshopDailyEntrySchema.safeParse({ ...declared, horasUtilizadas }).success).toBe(true);
        }
        expect(createWorkshopDailyEntrySchema.safeParse({ ...daily, horasUtilizadas: 1.5 }).success).toBe(false);
        expect(createWorkshopDailyEntrySchema.safeParse({ ...declared, horasUtilizadas: 1.5, qualityStatus: 'aprobado' }).success).toBe(false);
    });
    it('requires real interval hours, an explicit activity and UUID, and normalizes retries', () => {
        expect(createWorkshopDailyEntrySchema.parse({ ...daily, clientRequestId: daily.clientRequestId.toUpperCase(), note: '  Diagnóstico  ' })).toMatchObject({ clientRequestId: daily.clientRequestId, note: 'Diagnóstico' });
        expect(createWorkshopDailyEntrySchema.safeParse({ ...daily, activityStatus: 'en_proceso', userId: 9 }).success).toBe(true);
        expect(createWorkshopDailyEntrySchema.safeParse({ ...daily, clientRequestId: undefined }).success).toBe(false);
        expect(createWorkshopDailyEntrySchema.safeParse({ ...daily, activityStatus: undefined }).success).toBe(false);
    });
    it.each([
        { clientRequestId: 'not-a-uuid' }, { fecha: '2026-02-30' }, { fecha: '2025-10-4' },
        { userId: 0 }, { activityStatus: 'aprobado' }, { activityStatus: 'pendiente' },
        { endedAt: interval.startedAt }, { endedAt: '2025-10-04T09:00:59-03:00' },
        { startedAt: '2999-01-01T10:00:00Z', endedAt: '2999-01-01T11:00:00Z' },
        { note: ' ' }, { startedAt: '2025-10-04T09:00' },
        { overtime: true }, { overtime: false }, { sourceSessionId: 3 }, { qualityStatus: 'aprobado' },
        { durationMinutes: 60 }, { dailyEntry: true }, { clientRequestHash: 'forged' },
    ])('rejects invalid, estimated, overtime or quality-injection payloads: %j', (change) => {
        expect(createWorkshopDailyEntrySchema.safeParse({ ...daily, ...change }).success).toBe(false);
    });
    it('keeps the legacy request contract separate from daily idempotency and dates', () => {
        expect(createWorkshopTimeRequestSchema.safeParse({ workOrderId: 1, itemId: 2, ...interval }).success).toBe(true);
        expect(createWorkshopTimeRequestSchema.safeParse({ workOrderId: 1, itemId: 2, ...interval, clientRequestId: daily.clientRequestId }).success).toBe(false);
    });
});
