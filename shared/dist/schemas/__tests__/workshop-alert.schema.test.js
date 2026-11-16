import { describe, expect, it } from 'vitest';
import { WORKSHOP_ALERT_KINDS, updateWorkshopAlertSettingsSchema, workshopAlertQuerySchema, } from '../workshop-alert.schema.js';
describe('Operational alert schemas', () => {
    it('accepts partial tolerance updates including defaults and maximums', () => {
        expect(updateWorkshopAlertSettingsSchema.parse({ timeTolerancePercent: 0 })).toEqual({
            timeTolerancePercent: 0,
        });
        expect(updateWorkshopAlertSettingsSchema.parse({ commercialTolerancePercent: 1000 })).toEqual({
            commercialTolerancePercent: 1000,
        });
    });
    it.each([
        {},
        { timeTolerancePercent: -1 },
        { commercialTolerancePercent: 1001 },
        { timeTolerancePercent: '10' },
        { enabled: true },
    ])('rejects invalid settings %j', (value) => expect(updateWorkshopAlertSettingsSchema.safeParse(value).success).toBe(false));
    it('validates optional local dates and exposes all eleven explicit kinds', () => {
        expect(workshopAlertQuerySchema.parse({})).toEqual({});
        expect(workshopAlertQuerySchema.safeParse({ fecha: '2026-02-30' }).success).toBe(false);
        expect(WORKSHOP_ALERT_KINDS).toHaveLength(11);
    });
});
