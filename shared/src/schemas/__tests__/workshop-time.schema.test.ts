import { describe, expect, it } from 'vitest';

import {
  createWorkshopTimeRequestSchema,
  reviewWorkshopTimeRequestSchema,
  workshopTimeQuerySchema,
} from '../workshop-time.schema.js';

const interval = {
  startedAt: '2025-10-04T09:00:00-03:00',
  endedAt: '2025-10-04T10:00:00-03:00',
  note: 'Trabajo de diagnóstico',
};
describe('Workshop time contract', () => {
  it('accepts explicit timezone intervals and trims the mandatory reason', () => {
    expect(
      createWorkshopTimeRequestSchema.parse({
        workOrderId: 1,
        itemId: 2,
        ...interval,
        note: '  Motivo  ',
      }).note,
    ).toBe('Motivo');
    expect(
      createWorkshopTimeRequestSchema.safeParse({ sourceSessionId: 3, ...interval }).success,
    ).toBe(true);
  });
  it.each([
    { endedAt: '2025-10-04T09:00:59-03:00' },
    { endedAt: interval.startedAt },
    { endedAt: '2025-10-04T08:00:00-03:00' },
    { startedAt: '2999-01-01T10:00:00Z', endedAt: '2999-01-01T11:00:00Z' },
    { startedAt: '2025-10-04T09:00' },
    { note: '  ' },
  ])('rejects invalid/future/short intervals and missing reasons: %j', (patch) => {
    expect(
      createWorkshopTimeRequestSchema.safeParse({
        workOrderId: 1,
        itemId: 2,
        ...interval,
        ...patch,
      }).success,
    ).toBe(false);
  });
  it('rejects worker spoofing and mixed correction/manual payloads', () => {
    expect(
      createWorkshopTimeRequestSchema.safeParse({ sourceSessionId: 3, userId: 4, ...interval })
        .success,
    ).toBe(false);
    expect(
      createWorkshopTimeRequestSchema.safeParse({
        sourceSessionId: 3,
        workOrderId: 1,
        itemId: 2,
        ...interval,
      }).success,
    ).toBe(false);
  });
  it('requires a real boolean and nonblank reason for both review decisions', () => {
    expect(reviewWorkshopTimeRequestSchema.safeParse({ approve: false, note: '' }).success).toBe(
      false,
    );
    expect(
      reviewWorkshopTimeRequestSchema.safeParse({ approve: 'false', note: 'Motivo' }).success,
    ).toBe(false);
    expect(
      reviewWorkshopTimeRequestSchema.parse({ approve: false, note: 'No coincide' }).approve,
    ).toBe(false);
  });
  it('accepts only valid calendar day queries', () => {
    expect(workshopTimeQuerySchema.safeParse({ fecha: '2026-02-30' }).success).toBe(false);
    expect(workshopTimeQuerySchema.parse({ fecha: '2026-11-16', userId: '4' }).userId).toBe(4);
  });
});
