import { describe, expect, it } from 'vitest';

import {
  createSpecialtySchema, createSpecialtyRateSchema, updateWorkerSpecialtiesSchema,
  updateWorkshopScheduleSchema, createWorkshopScheduleExceptionSchema, workshopDateSchema,
} from '../workshop-personnel.schema.js';

describe('workshop personnel contracts', () => {
  it('stores specialties independently of authorization roles', () => {
    expect(createSpecialtySchema.parse({ name: '  Soldador  ' })).toEqual({ name: 'Soldador' });
    expect(createSpecialtySchema.safeParse({ name: 'Soldador', roleId: 4 }).success).toBe(false);
  });
  it('keeps an empty weekly schedule genuinely unconfigured', () => {
    expect(updateWorkshopScheduleSchema.parse({ timezone: 'America/Santiago', weekly: [] }).weekly).toEqual([]);
  });
  it.each(['Mars/Olympus', '', '+03:00'])('rejects invalid IANA zone %s', (timezone) => {
    expect(updateWorkshopScheduleSchema.safeParse({ timezone, weekly: [] }).success).toBe(false);
  });
  it.each([
    [{ weekday: 7, start: '09:00', end: '10:00' }],
    [{ weekday: 1, start: '09:00', end: '09:00' }],
    [{ weekday: 1, start: '23:00', end: '01:00' }],
    [{ weekday: 1, start: '9:00', end: '10:00' }],
    [{ weekday: 1, start: '09:00', end: '24:00' }],
    [{ weekday: 1, start: '09:00', end: '10:00' }, { weekday: 1, start: '11:00', end: '12:00' }],
  ].map((weekly) => ({ weekly })))('rejects invalid or duplicate weekly shifts %j', ({ weekly }) => {
    expect(updateWorkshopScheduleSchema.safeParse({ timezone: 'America/Santiago', weekly }).success).toBe(false);
  });
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'not-a-date'])('rejects impossible date %s', (date) => {
    expect(workshopDateSchema.safeParse(date).success).toBe(false);
  });
  it('accepts a leap day and zero as an explicitly configured rate', () => {
    expect(createSpecialtyRateSchema.parse({ validityFrom: '2028-02-29', costHourly: 0, saleHourly: 0 })).toMatchObject({ costHourly: 0, saleHourly: 0 });
  });
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '', null, 1.001])('rejects invalid cost %s instead of silently turning it into zero', (costHourly) => {
    expect(createSpecialtyRateSchema.safeParse({ validityFrom: '2026-01-01', costHourly, saleHourly: 2000 }).success).toBe(false);
  });
  it.each([
    { principalSpecialtyId: null, additionalSpecialtyIds: [2] },
    { principalSpecialtyId: 1, additionalSpecialtyIds: [1] },
    { principalSpecialtyId: 1, additionalSpecialtyIds: [2, 2] },
  ])('rejects ambiguous worker specialty profiles %j', (input) => {
    expect(updateWorkerSpecialtiesSchema.safeParse(input).success).toBe(false);
  });
  it('allows legacy workers to have no specialty', () => {
    expect(updateWorkerSpecialtiesSchema.parse({ principalSpecialtyId: null, additionalSpecialtyIds: [] })).toEqual({ principalSpecialtyId: null, additionalSpecialtyIds: [] });
  });
  it.each([
    { dayOff: true, reason: '  ' },
    { dayOff: true, start: '09:00', end: '10:00', reason: 'Permiso' },
    { dayOff: false, reason: 'Cambio' },
    { dayOff: false, start: '09:00', end: '08:00', reason: 'Cambio' },
  ])('requires a reason and an unambiguous exception shift %j', (input) => {
    expect(createWorkshopScheduleExceptionSchema.safeParse({ date: '2026-01-01', ...input }).success).toBe(false);
  });
  it('accepts an explicit day off without hours and trims its reason', () => {
    expect(createWorkshopScheduleExceptionSchema.parse({ date: '2026-01-01', dayOff: true, reason: '  Permiso médico  ' })).toEqual({ date: '2026-01-01', dayOff: true, reason: 'Permiso médico' });
  });
});
