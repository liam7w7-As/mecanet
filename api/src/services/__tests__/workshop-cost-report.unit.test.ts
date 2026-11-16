import { describe, expect, it } from 'vitest';

import {
  calculateWorkshopCostReport,
  costReportSessionMinutes,
} from '../workshop-cost-report.calculator.js';

import type {
  CostReportAssignment,
  CostReportItem,
  CostReportSession,
} from '../workshop-cost-report.calculator.js';
import type { WorkshopCostReportFilters } from '@unithor/shared';

const start = new Date('2026-11-01T03:00:00Z');
const end = new Date('2026-11-03T03:00:00Z');
const now = new Date('2026-11-02T19:00:00Z');
const filters: WorkshopCostReportFilters = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-02' };
const item = (overrides: Partial<CostReportItem> = {}): CostReportItem => ({
  id: 11,
  workOrderId: 7,
  descripcion: 'Diagnóstico',
  tipoLinea: 'especifico',
  cantidad: 2,
  horasHombreEstimadas: 99,
  assignedUserId: 2,
  createdAt: start,
  workOrder: { id: 7, codigo: 'OT-7', estado: 'en_progreso', vehicle: { patente: 'ABCD12' } },
  ...overrides,
});
const assignment = (overrides: Partial<CostReportAssignment> = {}): CostReportAssignment => ({
  id: 21,
  workOrderItemId: 11,
  workOrderId: 7,
  userId: 2,
  userName: 'Trabajador',
  active: true,
  specialtyId: 3,
  specialtyName: 'Electricista',
  costHourly: '10000.00',
  saleHourly: '15000.00',
  estimatedHours: 3,
  originalEstimatedHours: 2,
  createdAt: start,
  ...overrides,
});
const session = (overrides: Partial<CostReportSession> = {}): CostReportSession => ({
  id: 31,
  workOrderItemId: 11,
  workOrderId: 7,
  userId: 2,
  userName: 'Trabajador',
  assignmentId: 21,
  kind: 'cronometro',
  status: 'cerrada',
  startedAt: new Date('2026-11-01T10:00:00Z'),
  endedAt: new Date('2026-11-01T11:00:00Z'),
  scheduledEndAt: null,
  durationMinutes: 60,
  supersededAt: null,
  ...overrides,
});
const report = (
  assignments = [assignment()],
  sessions = [session()],
  items = [item()],
  selected = filters,
) => calculateWorkshopCostReport(selected, { items, assignments, sessions }, start, end, now);

describe('Workshop cost arithmetic without any database imports', () => {
  it('uses exact linked snapshot rates and assignment estimates without multiplying them by item quantity', () => {
    const result = report();
    expect(result.rows[0]).toMatchObject({
      estimatedHours: 3,
      originalEstimatedHours: 2,
      estimatedCost: 30000,
      actualMinutes: 60,
      actualCost: 10000,
      actualSale: 15000,
      actualMargin: 5000,
    });
    expect(result.totals).toMatchObject({ actualCost: 10000, estimatedHours: 3 });
  });
  it('does not double count reassignment estimates or duplicate primary keys', () => {
    const old = assignment({ id: 20, active: false, estimatedHours: 20, costHourly: 2000 });
    const result = report(
      [old, assignment(), assignment()],
      [session({ id: 30, assignmentId: 20 }), session(), session()],
      [item(), item()],
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((row) => row.assignmentId === 20)).toMatchObject({
      assignmentActive: false,
      estimatedHours: null,
      actualCost: 2000,
    });
    expect(result.totals).toMatchObject({
      estimatedHours: 3,
      estimatedCost: 30000,
      actualHours: 2,
      actualCost: 12000,
      sessions: 2,
    });
  });
  it('excludes superseded sessions and includes only their approved manual replacement', () => {
    const result = report(
      [assignment()],
      [
        session({ supersededAt: now }),
        session({
          id: 32,
          kind: 'manual',
          endedAt: new Date('2026-11-01T10:30:00Z'),
          durationMinutes: 30,
        }),
      ],
    );
    expect(result.totals).toMatchObject({ sessions: 1, actualHours: 0.5, actualCost: 5000 });
  });
  it('keeps missing rates and totals null while exposing known subtotals and counts', () => {
    const missing = assignment({ id: 22, userId: 3, costHourly: null, saleHourly: null });
    const result = report(
      [assignment(), missing],
      [session(), session({ id: 32, assignmentId: 22, userId: 3 })],
    );
    expect(result.rows.find((row) => row.assignmentId === 22)).toMatchObject({
      actualCost: null,
      estimatedCost: null,
      costHourly: null,
    });
    expect(result.totals).toMatchObject({
      actualCost: null,
      actualSale: null,
      actualMargin: null,
      knownActualCost: 10000,
      missingCostRateCount: 1,
      missingSaleRateCount: 1,
    });
    expect(report([assignment({ costHourly: 0 })]).rows[0].actualCost).toBe(0);
  });
  it.each([null, 999])(
    'never guesses a rate for missing or dangling assignment %s',
    (assignmentId) => {
      const result = report([assignment()], [session({ assignmentId })]);
      expect(result.rows.find((row) => row.assignmentId === null)).toMatchObject({
        actualMinutes: 60,
        actualCost: null,
      });
      expect(result.totals).toMatchObject({ actualCost: null, unlinkedSessionCount: 1 });
    },
  );
  it('rejects snapshot attribution to another user or service', () => {
    const result = report([assignment()], [session({ userId: 99 })]);
    expect(result.totals.knownActualCost).toBe(0);
    expect(result.totals.unlinkedSessionCount).toBe(1);
  });
  it('caps open timers at now and scheduled end and stops reporting expired timers as running', () => {
    const open = session({
      status: 'abierta',
      startedAt: new Date('2026-11-02T17:00:00Z'),
      endedAt: null,
      durationMinutes: null,
    });
    expect(costReportSessionMinutes(open, start, end, now)).toBe(120);
    const expired = { ...open, scheduledEndAt: new Date('2026-11-02T18:00:00Z') };
    expect(costReportSessionMinutes(expired, start, end, now)).toBe(60);
    expect(report([assignment()], [expired]).totals.runningSessions).toBe(0);
    expect(report([assignment()], [open]).totals.runningSessions).toBe(1);
  });
  it('includes approved manual overtime in full when scheduledEndAt is null', () => {
    const manual = session({
      kind: 'manual',
      startedAt: new Date('2026-11-01T23:00:00Z'),
      endedAt: new Date('2026-11-02T01:30:00Z'),
      durationMinutes: 150,
      scheduledEndAt: null,
    });
    expect(costReportSessionMinutes(manual, start, end, now)).toBe(150);
    expect(report([assignment()], [manual]).totals.actualCost).toBe(25000);
  });
  it('clips intervals at the period boundary and never counts future intervals', () => {
    expect(
      costReportSessionMinutes(
        session({
          startedAt: new Date('2026-11-01T02:30:00Z'),
          endedAt: new Date('2026-11-01T03:30:00Z'),
        }),
        start,
        end,
        now,
      ),
    ).toBe(30);
    expect(
      costReportSessionMinutes(
        session({
          startedAt: new Date('2026-11-02T18:30:00Z'),
          endedAt: new Date('2026-11-03T03:30:00Z'),
        }),
        start,
        end,
        now,
      ),
    ).toBe(30);
    expect(
      report(
        [assignment()],
        [session({ startedAt: end, endedAt: new Date(end.getTime() + 3600000) })],
      ).totals.sessions,
    ).toBe(0);
  });
  it('preserves signed manual corrections and counts them on their event date', () => {
    const correction = session({
      id: 32,
      kind: 'ajuste',
      endedAt: new Date('2026-11-01T10:00:00Z'),
      durationMinutes: -15,
    });
    expect(report([assignment()], [session(), correction]).totals).toMatchObject({
      actualMinutes: 45,
      actualCost: 7500,
    });
    expect(costReportSessionMinutes({ ...correction, startedAt: end }, start, end, now)).toBe(0);
  });
  it('uses minutes rather than rounded hours to calculate money', () => {
    const result = report(
      [assignment({ costHourly: 100 })],
      [session({ endedAt: new Date('2026-11-01T10:01:00Z'), durationMinutes: 1 })],
    );
    expect(result.rows[0]).toMatchObject({ actualHours: 0.02, actualCost: 1.67 });
  });
  it('counts a legacy estimate only once across workers and keeps unlinked costs unknown', () => {
    const result = report(
      [],
      [session({ assignmentId: null }), session({ id: 32, userId: 3, assignmentId: null })],
      [item({ horasHombreEstimadas: 2 })],
    );
    expect(result.totals).toMatchObject({
      estimatedHours: 4,
      actualHours: 2,
      estimatedCost: null,
      actualCost: null,
      unlinkedSessionCount: 2,
    });
    expect(result.rows.filter((row) => row.includesEstimate)).toHaveLength(1);
  });
  it('filters by worker, specialty, order, status and text while keeping historic filter options', () => {
    const result = report(
      [assignment(), assignment({ id: 22, userId: 4, userName: 'Histórico', active: false })],
      [session(), session({ id: 32, assignmentId: 22, userId: 4 })],
      [item()],
      {
        ...filters,
        userId: 2,
        specialtyId: 3,
        workOrderId: 7,
        estado: 'en_progreso',
        search: 'diagnóstico',
      },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.totals.actualCost).toBe(10000);
    expect(result.options.workers).toContainEqual({ id: 4, name: 'Histórico' });
    expect(
      report([assignment()], [session()], [item()], { ...filters, estado: 'cancelada' }).rows,
    ).toEqual([]);
  });
  it('excludes parts, absent orders, old records without period activity and future adjustments', () => {
    expect(report([assignment()], [session()], [item({ tipoLinea: 'parte' })]).rows).toEqual([]);
    expect(report([assignment()], [session()], [item({ workOrder: undefined })]).rows).toEqual([]);
    expect(
      report(
        [assignment({ createdAt: new Date('2025-01-01') })],
        [],
        [item({ createdAt: new Date('2025-01-01') })],
      ).rows,
    ).toEqual([]);
    expect(
      report(
        [assignment()],
        [session({ kind: 'ajuste', startedAt: new Date('2026-11-02T20:00:00Z') })],
      ).totals.sessions,
    ).toBe(0);
  });
});
