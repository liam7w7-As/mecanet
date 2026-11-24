/** Model-independent time arithmetic. Fractional minutes retain seconds/milliseconds. */
export interface WorkshopSessionTime {
  kind?: string;
  status?: string;
  startedAt: Date;
  endedAt: Date | null;
  scheduledEndAt?: Date | null;
  durationMinutes: number | null;
  supersededAt?: Date | null;
  reportedDate?: string | null;
}

export const exactIntervalMinutes = (
  start: Date,
  end: Date,
  rangeStart: Date = start,
  rangeEnd: Date = end,
): number => Math.max(0,
  (Math.min(end.getTime(), rangeEnd.getTime()) - Math.max(start.getTime(), rangeStart.getTime())) / 60_000,
);

const boundedEnd = (session: WorkshopSessionTime, now: Date): Date => new Date(Math.min(
  session.endedAt?.getTime() ?? now.getTime(),
  session.scheduledEndAt?.getTime() ?? Infinity,
  now.getTime(),
));

/**
 * The INT duration column historically stored floor(elapsed). Recover its lost
 * seconds only for that exact clock pattern. Other saved totals are overrides;
 * manual entries and signed adjustments retain their explicit duration.
 */
export const canonicalSessionMinutes = (session: WorkshopSessionTime, now = new Date()): number => {
  if (session.supersededAt) return 0;
  const saved = session.durationMinutes;
  if (session.kind === 'ajuste') return Number(saved ?? 0);
  if (session.kind === 'manual' && saved !== null && saved !== undefined) return Number(saved);
  const elapsed = exactIntervalMinutes(session.startedAt, boundedEnd(session, now));
  if (!session.endedAt || session.status === 'abierta' || saved === null || saved === undefined) return elapsed;
  return Number(saved) === Math.floor(elapsed) ? elapsed : Number(saved);
};

/** Physical coverage uses clipped intervals; numeric adjustments are dated events. */
export const sessionMinutesInRange = (
  session: WorkshopSessionTime,
  start: Date,
  endExclusive: Date,
  now: Date,
): number => {
  if (session.supersededAt) return 0;
  if (session.kind === 'ajuste' || session.reportedDate) return session.startedAt >= start && session.startedAt < endExclusive && session.startedAt <= now
    ? canonicalSessionMinutes(session, now) : 0;
  return exactIntervalMinutes(session.startedAt, boundedEnd(session, now), start, endExclusive);
};
