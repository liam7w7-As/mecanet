import { roundMetric } from './workshop-commercial.calculator.js';
import { sessionMinutesInRange } from '../utils/workshop-session-time.js';

import type { WorkshopSessionTime } from '../utils/workshop-session-time.js';
import type { WorkshopPerformanceAnalysis } from '@unithor/shared';

export interface PerformanceSession extends WorkshopSessionTime {
  id: number; userId: number | null; workOrderItemId: number; assignmentId: number | null; overtime?: boolean;
}
export interface PerformanceDay { date: string; start: Date; end: Date; workers: Array<{ userId: number; intervals: Array<{ start: Date; end: Date }> | null }> }
export interface QualityEvent { id: number; workOrderItemId: number | null; decision: 'aprobado' | 'rechazado'; createdAt: Date }

const coverage = (intervals: Array<{ start: Date; end: Date }>): number => {
  const ordered = intervals.filter((span) => span.end > span.start).sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0;
  let start: number | undefined;
  let end = 0;
  for (const span of ordered) {
    if (start === undefined) { start = span.start.getTime(); end = span.end.getTime(); }
    else if (span.start.getTime() <= end) end = Math.max(end, span.end.getTime());
    else { total += end - start; start = span.start.getTime(); end = span.end.getTime(); }
  }
  if (start !== undefined) total += end - start;
  return total / 60_000;
};

export function calculateUtilization(days: PerformanceDay[], sessions: PerformanceSession[], now: Date, groupBy: 'day' | 'week' | 'month') {
  const periods = new Map<string, { minutes: number; extra: number; scheduled: number | null; missing: number | null }>();
  let total = 0; let extra = 0; let scheduled: number | null = 0; let missing: number | null = 0;
  const workers = new Set<number>();
  for (const day of days) {
    const nominal = new Date(`${day.date}T00:00:00Z`);
    if (groupBy === 'week') nominal.setUTCDate(nominal.getUTCDate() - (nominal.getUTCDay() + 6) % 7);
    const key = groupBy === 'month' ? day.date.slice(0, 7) : groupBy === 'week' ? nominal.toISOString().slice(0, 10) : day.date;
    const period = periods.get(key) ?? { minutes: 0, extra: 0, scheduled: 0, missing: 0 };
    const daySessions = sessions.filter((session) => !session.supersededAt && session.userId !== null &&
      session.startedAt < day.end && (session.kind === 'ajuste' || session.reportedDate ? session.startedAt >= day.start :
        (session.endedAt === null || session.endedAt > day.start)));
    const minutes = daySessions.reduce((sum, session) => sum + sessionMinutesInRange(session, day.start, day.end, now), 0);
    const extraMinutes = daySessions.filter((session) => session.overtime).reduce((sum, session) => sum + sessionMinutesInRange(session, day.start, day.end, now), 0);
    total += minutes; extra += extraMinutes; period.minutes += minutes; period.extra += extraMinutes;
    for (const worker of day.workers) {
      workers.add(worker.userId);
      if (worker.intervals === null) { scheduled = null; missing = null; period.scheduled = null; period.missing = null; continue; }
      const planned = worker.intervals.reduce((sum, span) => sum + (span.end.getTime() - span.start.getTime()) / 60_000, 0);
      const spans: Array<{ start: Date; end: Date }> = [];
      for (const session of daySessions) {
        if (session.userId !== worker.userId || session.kind === 'ajuste' || session.reportedDate) continue;
        const stop = Math.min(session.endedAt?.getTime() ?? now.getTime(), session.scheduledEndAt?.getTime() ?? Infinity, now.getTime());
        for (const span of worker.intervals) spans.push({
          start: new Date(Math.max(session.startedAt.getTime(), span.start.getTime())),
          end: new Date(Math.min(stop, span.end.getTime())),
        });
      }
      // Declared quantities reduce the day's missing total, without locating
      // work at midnight or claiming coverage of a particular shift interval.
      const declared = daySessions.filter((session) => session.userId === worker.userId && session.reportedDate && !session.overtime)
        .reduce((sum, session) => sum + sessionMinutesInRange(session, day.start, day.end, now), 0);
      const unregistered = Math.max(0, planned - coverage(spans) - declared);
      if (scheduled !== null) scheduled += planned;
      if (missing !== null) missing += unregistered;
      if (period.scheduled !== null) period.scheduled += planned;
      if (period.missing !== null) period.missing += unregistered;
    }
    periods.set(key, period);
  }
  return {
    utilization: {
      workers: workers.size, registeredHours: roundMetric(total / 60), regularHours: roundMetric((total - extra) / 60), extraHours: roundMetric(extra / 60),
      scheduledHours: scheduled === null ? null : roundMetric(scheduled / 60), unregisteredHours: missing === null ? null : roundMetric(missing / 60),
      registeredPercent: scheduled !== null && scheduled > 0 ? roundMetric(total / scheduled * 100) : null,
    },
    periods: [...periods].map(([key, value]) => ({
      key, label: groupBy === 'week' ? `Semana del ${key}` : key,
      registeredHours: roundMetric(value.minutes / 60), extraHours: roundMetric(value.extra / 60),
      scheduledHours: value.scheduled === null ? null : roundMetric(value.scheduled / 60),
      unregisteredHours: value.missing === null ? null : roundMetric(value.missing / 60),
      utilizationPercent: value.scheduled !== null && value.scheduled > 0 ? roundMetric(value.minutes / value.scheduled * 100) : null,
    })),
  };
}

export function calculateQuality(
  items: Array<{ id: number; estadoOperativo: string; qualityStatus: string }>, reviews: QualityEvent[],
  sessions: PerformanceSession[], start: Date, end: Date, now: Date,
): WorkshopPerformanceAnalysis['quality'] {
  const selected = new Set(items.map((item) => item.id));
  const byItem = new Map<number, QualityEvent[]>();
  for (const review of [...reviews].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)) {
    if (review.workOrderItemId === null || !selected.has(review.workOrderItemId) || review.createdAt > now) continue;
    const list = byItem.get(review.workOrderItemId) ?? []; list.push(review); byItem.set(review.workOrderItemId, list);
  }
  let firstReviewed = 0; let firstApproved = 0; let rejections = 0; let reworkMinutes = 0;
  for (const [itemId, events] of byItem) {
    const first = events[0]!;
    if (first.createdAt >= start && first.createdAt < end) { firstReviewed += 1; if (first.decision === 'aprobado') firstApproved += 1; }
    const windows: Array<{ start: Date; end: Date }> = [];
    let rejectedAt: Date | null = null;
    for (const event of events) {
      if (event.decision === 'rechazado') {
        if (event.createdAt >= start && event.createdAt < end) rejections += 1;
        rejectedAt ??= event.createdAt;
      } else if (rejectedAt) { windows.push({ start: rejectedAt, end: event.createdAt }); rejectedAt = null; }
    }
    if (rejectedAt) windows.push({ start: rejectedAt, end: now });
    for (const window of windows) for (const session of sessions) {
      // A day and quantity cannot establish whether work followed a rejection.
      if (session.workOrderItemId !== itemId || session.reportedDate) continue;
      const from = new Date(Math.max(start.getTime(), window.start.getTime()));
      const to = new Date(Math.min(end.getTime(), window.end.getTime()));
      if (to > from) reworkMinutes += sessionMinutesInRange(session, from, to, now);
    }
  }
  return { reviewedServices: firstReviewed, firstPassApproved: firstApproved,
    firstPassPercent: firstReviewed > 0 ? roundMetric(firstApproved / firstReviewed * 100) : null,
    rejections, reworkHours: roundMetric(reworkMinutes / 60),
    pendingServices: items.filter((item) => ['completado', 'omitido'].includes(item.estadoOperativo) && item.qualityStatus !== 'aprobado').length };
}
