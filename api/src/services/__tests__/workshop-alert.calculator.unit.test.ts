import { describe, expect, it } from 'vitest';

import { calculateWorkshopAlerts, getAlertQuotedService } from '../workshop-alert.calculator.js';

import type { AlertItem, WorkshopAlertSource } from '../workshop-alert.calculator.js';
import type { CostReportSession } from '../workshop-cost-report.calculator.js';

const now = new Date('2026-11-16T20:00:00Z');
const date = '2026-11-16';
const settings = { timeTolerancePercent: 0, commercialTolerancePercent: 0 };
const item = (extra: Partial<AlertItem> = {}): AlertItem => ({
  id: 11,
  workOrderId: 1,
  descripcion: 'Diagnóstico',
  tipoLinea: 'especifico',
  unidadMedida: 'servicio',
  catalogItemId: null,
  cantidad: 2,
  precioUnitario: 0,
  horasHombreEstimadas: 1,
  estadoOperativo: 'en_proceso',
  qualityStatus: 'pendiente',
  teamManaged: true,
  assignedUserId: 7,
  ...extra,
});
const session = (extra: Partial<CostReportSession> = {}): CostReportSession => ({
  id: 31,
  workOrderId: 1,
  workOrderItemId: 11,
  userId: 7,
  userName: 'Mecánico',
  assignmentId: 21,
  kind: 'cronometro',
  status: 'cerrada',
  startedAt: new Date('2026-11-16T10:00:00Z'),
  endedAt: new Date('2026-11-16T12:00:00Z'),
  durationMinutes: 120,
  scheduledEndAt: null,
  supersededAt: null,
  ...extra,
});
const source = (extra: Partial<WorkshopAlertSource> = {}): WorkshopAlertSource => ({
  orders: [
    {
      id: 1,
      codigo: 'OT1',
      estado: 'en_progreso',
      fechaEntrega: null,
      assignedMechanicId: 7,
      qualityApprovedAt: null,
    },
  ],
  items: [item()],
  assignments: [
    {
      id: 21,
      workOrderId: 1,
      workOrderItemId: 11,
      userId: 7,
      active: true,
      estimatedHours: 1,
      saleHourly: 10000,
    },
  ],
  sessions: [session()],
  quotations: [],
  timeRequests: [],
  priceRequests: [],
  workers: [],
  scheduleConfigured: false,
  ...extra,
});
const calculate = (value = source(), mechanic = false, tolerances = settings) =>
  calculateWorkshopAlerts(value, tolerances, { id: 7, mechanic }, now, date);

describe('Lunch-aware day alerts', () => {
  it('counts dated quantities as registered hours without assigning them to midnight intervals', () => {
    const declared = session({ kind: 'manual', reportedDate: date, startedAt: new Date(`${date}T03:00:00Z`), endedAt: new Date(`${date}T03:00:00Z`), durationMinutes: 60 });
    const value = source({ workers: [{ userId: 7, name: 'Mecánico', configured: true,
      start: new Date(`${date}T10:00:00Z`), end: new Date(`${date}T12:00:00Z`),
      dayStart: new Date(`${date}T03:00:00Z`), dayEnd: new Date('2026-11-17T03:00:00Z'),
      sessions: [declared],
    }] });
    const warning = calculate(value).alerts.find((alert) => alert.kind === 'unregistered_time');
    expect(warning?.description).toContain('1 h registradas');
    expect(warning?.description).toContain('sin intervalo horario');
    value.workers[0].sessions.push(session({ id: 32, startedAt: new Date(`${date}T10:00:00Z`), endedAt: new Date(`${date}T11:00:00Z`), durationMinutes: 60 }));
    expect(calculate(value).alerts.some((alert) => ['unregistered_time', 'no_daily_record'].includes(alert.kind))).toBe(false);
    value.workers[0].sessions = [{ ...declared, overtime: true }];
    expect(calculate(value).alerts.some((alert) => alert.kind === 'no_daily_record')).toBe(true);
    value.workers[0].sessions = [{ ...declared, supersededAt: now }];
    expect(calculate(value).alerts.some((alert) => alert.kind === 'no_daily_record')).toBe(true);
  });

  const split = () => source({ workers: [{ userId: 7, name: 'Mecánico', configured: true,
    start: new Date('2026-11-16T12:00:00Z'), end: new Date('2026-11-16T16:00:00Z'),
    intervals: [
      { start: new Date('2026-11-16T12:00:00Z'), end: new Date('2026-11-16T16:00:00Z') },
      { start: new Date('2026-11-16T17:00:00Z'), end: new Date('2026-11-16T21:00:00Z') },
    ], sessions: [] }] });
  it('waits for the actual end of the full work day, not the lunch boundary', () => {
    expect(calculate(split()).alerts.some((alert) => ['no_daily_record', 'unregistered_time'].includes(alert.kind))).toBe(false);
  });
  it('compares against eight effective hours after 18, excluding lunch', () => {
    const result = calculateWorkshopAlerts(split(), settings, { id: 7, mechanic: false }, new Date('2026-11-16T22:00:00Z'), date);
    expect(result.alerts.find((alert) => alert.kind === 'no_daily_record')?.description).toContain('8 h configuradas');
  });
});

describe('Live workshop alerts without database or mutation', () => {
  it('compares team totals without quantity multiplication and respects exact tolerance boundaries', () => {
    const value = source();
    expect(calculate(value).alerts.some((a) => a.kind === 'time_deviation')).toBe(true);
    expect(
      calculate(value, false, { ...settings, timeTolerancePercent: 100 }).alerts.some(
        (a) => a.kind === 'time_deviation',
      ),
    ).toBe(false);
    value.items = [item({ teamManaged: false })];
    value.assignments = [];
    expect(calculate(value).alerts.some((a) => a.kind === 'time_deviation')).toBe(false);
  });
  it('uses legacy stored hours only when there are no physical sessions, without guessing commercial rates', () => {
    const value = source({
      items: [item({ teamManaged: false, horasHombreReales: 3 })],
      assignments: [],
      sessions: [],
    });
    expect(calculate(value).alerts.filter((a) => a.kind === 'time_deviation')).toHaveLength(1);
    expect(calculate(value).alerts.some((a) => a.kind === 'commercial_difference')).toBe(false);
    value.sessions = [session({ supersededAt: now })];
    expect(calculate(value).alerts.some((a) => a.kind === 'time_deviation')).toBe(false);
  });
  it('retains own historical hours on a currently assigned item and omits other workers and private commercial alerts', () => {
    const value = source();
    value.assignments.push({ ...value.assignments[0], id: 20, active: false });
    value.sessions = [
      session({ id: 30, assignmentId: 20 }),
      session({ id: 32, userId: 8, assignmentId: 999 }),
    ];
    value.orders[0].estado = 'esperando_repuesto';
    value.orders[0].fechaEntrega = new Date('2026-11-15');
    value.timeRequests = [
      { id: 1, workOrderId: 1, workOrderItemId: 11, userId: 8 },
      { id: 2, workOrderId: 1, workOrderItemId: 11, userId: 7 },
    ];
    value.priceRequests = [{ id: 3, workOrderId: 1, workOrderItemId: 11 }];
    const alerts = calculate(value, true).alerts;
    expect(alerts.some((a) => a.kind === 'time_deviation')).toBe(true);
    expect(alerts.some((a) => a.kind === 'waiting_parts')).toBe(true);
    expect(alerts.some((a) => a.kind === 'delivery_overdue')).toBe(true);
    expect(alerts.every((a) => a.userId === 7)).toBe(true);
    expect(alerts.filter((a) => a.kind === 'time_review_pending')).toHaveLength(1);
    expect(JSON.stringify(alerts)).not.toMatch(/CLP|precio|cotizado|venta|costHourly|saleHourly/);
    value.assignments = value.assignments.map((a) => ({ ...a, active: false }));
    expect(calculate(value, true).alerts).toEqual([]);
  });
  it('makes initial zero valuation informative and completed zero valuation urgent, only for supervisors', () => {
    expect(calculate().alerts.find((a) => a.kind === 'valuation_pending')?.priority).toBe('normal');
    expect(
      calculate(source({ items: [item({ estadoOperativo: 'completado' })] })).alerts.find(
        (a) => a.kind === 'valuation_pending',
      )?.priority,
    ).toBe('high');
    expect(calculate(source(), true).alerts.some((a) => a.kind === 'valuation_pending')).toBe(
      false,
    );
  });
  it('requires parts resolved, includes omitted approved services and ignores quality on parts for final confirmation', () => {
    const value = source({
      items: [
        item({ estadoOperativo: 'omitido', qualityStatus: 'aprobado' }),
        item({ id: 12, tipoLinea: 'parte', estadoOperativo: 'pendiente' }),
      ],
    });
    expect(calculate(value).alerts.some((a) => a.id === 'quality_pending:final:1')).toBe(false);
    value.items[1].estadoOperativo = 'omitido';
    expect(calculate(value).alerts.some((a) => a.id === 'quality_pending:final:1')).toBe(true);
    value.items[0].qualityStatus = 'rechazado';
    expect(calculate(value).alerts.some((a) => a.kind === 'quality_rejected')).toBe(true);
  });
  it('uses the authoritative quoted net including allocated discounts, snapshot SALE only, and quoted-net denominator', () => {
    const value = source();
    value.quotations = [
      {
        id: 10,
        workOrderId: 1,
        total: 15000,
        items: [
          {
            id: 41,
            quotationId: 10,
            workOrderItemId: 11,
            catalogItemId: null,
            descripcion: 'Diagnóstico',
            tipoLinea: 'especifico',
            unidadMedida: 'servicio',
            precioUnitario: 20000,
            subtotal: 20000,
          },
        ],
      },
    ];
    expect(getAlertQuotedService(value.items[0], value.items, value.quotations).net).toBe(15000);
    const alert = calculate(value).alerts.find((a) => a.kind === 'commercial_difference');
    expect(alert?.description).toContain('$20.000');
    expect(alert?.description).toContain('$15.000');
    expect(
      calculate(value, false, { ...settings, commercialTolerancePercent: 34 }).alerts.some(
        (a) => a.kind === 'commercial_difference',
      ),
    ).toBe(false);
    value.assignments[0].saleHourly = null;
    expect(calculate(value).alerts.some((a) => a.kind === 'commercial_difference')).toBe(false);
  });
  it('does not guess a commercial comparison for ambiguous or unlinked snapshots', () => {
    const value = source();
    value.quotations = [
      { id: 1, workOrderId: 1, total: 10000, items: [] },
      { id: 2, workOrderId: 1, total: 10000, items: [] },
    ];
    expect(getAlertQuotedService(value.items[0], value.items, value.quotations)).toEqual({
      price: null,
      net: null,
    });
    expect(calculate(value).alerts.some((a) => a.kind === 'commercial_difference')).toBe(false);
  });
  it('only flags completed configured shifts, counts work across other orders, and clamps negative recorded totals', () => {
    const worker = {
      userId: 7,
      name: 'Mecánico',
      configured: true,
      start: new Date('2026-11-16T10:00:00Z'),
      end: new Date('2026-11-16T12:00:00Z'),
      sessions: [session({ workOrderId: 999, workOrderItemId: 999 })],
    };
    const value = source({ workers: [worker] });
    expect(
      calculate(value).alerts.some((a) =>
        ['no_daily_record', 'unregistered_time'].includes(a.kind),
      ),
    ).toBe(false);
    worker.sessions = [session({ kind: 'ajuste', durationMinutes: -30 })];
    const alert = calculate(value).alerts.find((a) => a.kind === 'no_daily_record');
    expect(alert?.description).toContain('0 h');
    expect(alert?.description).not.toContain('-');
    worker.configured = false;
    expect(calculate(value).alerts.some((a) => a.kind === 'no_daily_record')).toBe(false);
    worker.configured = true;
    worker.end = new Date('2026-11-16T21:00:00Z');
    expect(calculate(value).alerts.some((a) => a.kind === 'no_daily_record')).toBe(false);
  });
  it('excludes superseded sessions, preserves signed corrections, and bounds running hours by scheduled end', () => {
    const value = source({
      sessions: [
        session({ supersededAt: now }),
        session({ id: 32, kind: 'manual', endedAt: new Date('2026-11-16T11:00:00Z') }),
        session({ id: 33, kind: 'ajuste', durationMinutes: -15 }),
        session({
          id: 34,
          status: 'abierta',
          startedAt: new Date('2026-11-16T18:00:00Z'),
          endedAt: null,
          durationMinutes: null,
          scheduledEndAt: new Date('2026-11-16T18:15:00Z'),
        }),
      ],
    });
    expect(calculate(value).alerts.some((a) => a.kind === 'time_deviation')).toBe(false);
  });
  it('keeps overtime recorded separately without concealing gaps inside the scheduled shift', () => {
    const value = source({
      workers: [
        {
          userId: 7,
          name: 'Mecánico',
          configured: true,
          start: new Date('2026-11-16T10:00:00Z'),
          end: new Date('2026-11-16T12:00:00Z'),
          dayStart: new Date('2026-11-16T03:00:00Z'),
          dayEnd: new Date('2026-11-17T03:00:00Z'),
          sessions: [
            session({
              kind: 'manual',
              workOrderId: 99,
              startedAt: new Date('2026-11-16T16:00:00Z'),
              endedAt: new Date('2026-11-16T18:00:00Z'),
              scheduledEndAt: null,
            }),
          ],
        },
      ],
    });
    expect(
      calculate(value).alerts.some((a) =>
        ['unregistered_time', 'no_daily_record'].includes(a.kind),
      ),
    ).toBe(true);
    value.workers[0].sessions.push(
      session({
        id: 33,
        kind: 'ajuste',
        startedAt: new Date('2026-11-16T19:00:00Z'),
        durationMinutes: -15,
      }),
    );
    expect(calculate(value).alerts.some((a) => a.kind === 'no_daily_record')).toBe(true);
    value.workers[0].sessions.push(session({
      id: 34, kind: 'manual', startedAt: new Date('2026-11-16T10:00:00Z'),
      endedAt: new Date('2026-11-16T11:00:00Z'), scheduledEndAt: null,
    }));
    expect(calculate(value).alerts.find((a) => a.kind === 'unregistered_time')?.description).toContain('1 h registradas');
  });
});
