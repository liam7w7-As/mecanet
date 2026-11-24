import {
  DEFAULT_WORKSHOP_SPECIALTIES, DEFAULT_WORKSHOP_TIMEZONE, DEFAULT_WORKSHOP_WEEKLY,
  createSpecialtySchema, updateSpecialtySchema, createSpecialtyRateSchema,
  updateWorkerSpecialtiesSchema, updateWorkshopScheduleSchema, createWorkshopScheduleExceptionSchema, workshopDateSchema,
} from '@unithor/shared';
import { Op, UniqueConstraintError } from 'sequelize';

import { closeSession, recalculateItemHours } from './work-order-labor-sessions.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { Role } from '../models/Role.js';
import { Specialty } from '../models/Specialty.js';
import { SpecialtyRate } from '../models/SpecialtyRate.js';
import { User } from '../models/User.js';
import { WorkerSpecialty } from '../models/WorkerSpecialty.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkshopSchedule } from '../models/WorkshopSchedule.js';
import { WorkshopScheduleException } from '../models/WorkshopScheduleException.js';
import { ApiError } from '../utils/ApiError.js';

import type {
  CreateSpecialtyInput, UpdateSpecialtyInput, CreateSpecialtyRateInput,
  UpdateWorkerSpecialtiesInput, UpdateWorkshopScheduleInput, CreateWorkshopScheduleExceptionInput,
  WorkshopPersonnelConfig, WorkshopScheduleConfig, WorkshopSpecialty, WorkshopSpecialtyRate,
  WorkshopWorkerProfile, WorkshopShiftException, WorkerShift, WorkerRateSnapshot, WorkshopWeeklyDay,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

const specialtyPublic = (row: Specialty): WorkshopSpecialty => ({ id: row.id, name: row.name, active: row.active });
const ratePublic = (row: SpecialtyRate): WorkshopSpecialtyRate => ({
  id: row.id, specialtyId: row.specialtyId, validityFrom: row.validityFrom,
  costHourly: Number(row.costHourly), saleHourly: Number(row.saleHourly), currency: 'CLP',
  createdBy: row.createdBy, createdAt: row.createdAt.toISOString(),
});
const exceptionPublic = (row: WorkshopScheduleException): WorkshopShiftException => ({
  id: row.id, userId: row.userId, date: row.date, version: row.version, dayOff: row.dayOff,
  start: row.start, end: row.end, reason: row.reason, createdBy: row.createdBy, createdAt: row.createdAt.toISOString(),
});
const schedulePublic = (row: WorkshopSchedule | null): WorkshopScheduleConfig => ({
  timezone: row?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE, weekly: row?.weekly ?? DEFAULT_WORKSHOP_WEEKLY.map((day) => ({ ...day })),
  updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt?.toISOString() ?? null,
});

const requireWorker = async (userId: number, transaction: Transaction): Promise<User> => {
  const worker = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!worker) throw ApiError.notFound('Trabajador no encontrado');
  if (!worker.activo) throw ApiError.badRequest('El trabajador está inactivo');
  return worker;
};
const uniqueConflict = (error: unknown): never => {
  if (error instanceof UniqueConstraintError) throw ApiError.conflict('Ya existe un registro con ese nombre o vigencia');
  throw error;
};

/**
 * Cost and sale rates are costing data: only administration may receive them.
 * The chief still gets specialties, profiles, schedules and exceptions.
 */
export async function getWorkshopPersonnelConfig(
  { includeRates = false }: { includeRates?: boolean } = {},
): Promise<WorkshopPersonnelConfig> {
  return withWorkshopTransaction(async (transaction) => {
    const [specialties, rates, workers, assignments, schedule, exceptions] = await Promise.all([
      Specialty.findAll({ order: [['name', 'ASC']], transaction }),
      includeRates
        ? SpecialtyRate.findAll({ order: [['validityFrom', 'DESC'], ['id', 'DESC']], transaction })
        : Promise.resolve([] as SpecialtyRate[]),
      User.findAll({
        attributes: ['id', 'nombre', 'activo'],
        include: [{ model: Role, attributes: ['nombre'], required: false }],
        order: [['nombre', 'ASC']], transaction,
      }),
      WorkerSpecialty.findAll({ order: [['specialtyId', 'ASC']], transaction }),
      WorkshopSchedule.findByPk(1, { transaction }),
      WorkshopScheduleException.findAll({ order: [['date', 'DESC'], ['version', 'DESC'], ['id', 'DESC']], transaction }),
    ]);
    return {
      specialties: specialties.map(specialtyPublic), rates: rates.map(ratePublic),
      workers: workers.map((worker) => ({ id: worker.id, nombre: worker.nombre, activo: worker.activo, role: worker.role?.nombre ?? null })),
      profiles: workers.map((worker) => {
        const memberships = assignments.filter((row) => row.userId === worker.id);
        return { userId: worker.id, principalSpecialtyId: memberships.find((row) => row.isPrincipal)?.specialtyId ?? null,
          additionalSpecialtyIds: memberships.filter((row) => !row.isPrincipal).map((row) => row.specialtyId) };
      }),
      schedule: schedulePublic(schedule), exceptions: exceptions.map(exceptionPublic),
    };
  });
}

export async function createSpecialty(input: CreateSpecialtyInput): Promise<WorkshopSpecialty> {
  try { return specialtyPublic(await Specialty.create(createSpecialtySchema.parse(input))); }
  catch (error) { return uniqueConflict(error); }
}

export async function updateSpecialty(id: number, input: UpdateSpecialtyInput): Promise<WorkshopSpecialty> {
  const data = updateSpecialtySchema.parse(input);
  try {
    return await withWorkshopTransaction(async (transaction) => {
      const specialty = await Specialty.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!specialty) throw ApiError.notFound('Especialidad no encontrada');
      await specialty.update(data, { transaction });
      return specialtyPublic(specialty);
    });
  } catch (error) { return uniqueConflict(error); }
}

export async function seedWorkshopSpecialties(): Promise<WorkshopSpecialty[]> {
  return withWorkshopTransaction(async (transaction) => {
    const result: WorkshopSpecialty[] = [];
    for (const name of DEFAULT_WORKSHOP_SPECIALTIES) {
      const [specialty] = await Specialty.findOrCreate({ where: { name }, defaults: { name, active: true }, transaction });
      result.push(specialtyPublic(specialty));
    }
    return result;
  });
}

export async function appendSpecialtyRate(specialtyId: number, input: CreateSpecialtyRateInput, actorId: number): Promise<WorkshopSpecialtyRate> {
  const data = createSpecialtyRateSchema.parse(input);
  try {
    return await withWorkshopTransaction(async (transaction) => {
      const specialty = await Specialty.findByPk(specialtyId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!specialty) throw ApiError.notFound('Especialidad no encontrada');
      if (!specialty.active) throw ApiError.badRequest('La especialidad está inactiva');
      const latest = await SpecialtyRate.findOne({ where: { specialtyId }, order: [['validityFrom', 'DESC']], transaction });
      if (latest && data.validityFrom <= latest.validityFrom) {
        throw ApiError.conflict('La nueva vigencia debe ser posterior a la última tarifa; el historial no se modifica');
      }
      if (latest) {
        const schedule = await WorkshopSchedule.findByPk(1, { transaction });
        if (data.validityFrom < localDate(new Date(), schedule?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE)) {
          throw ApiError.conflict('No se puede cambiar una tarifa de una fecha pasada');
        }
      }
      return ratePublic(await SpecialtyRate.create({ ...data, specialtyId, createdBy: actorId }, { transaction }));
    });
  } catch (error) { return uniqueConflict(error); }
}

export async function updateWorkerSpecialties(userId: number, input: UpdateWorkerSpecialtiesInput, actorId: number): Promise<WorkshopWorkerProfile> {
  const data = updateWorkerSpecialtiesSchema.parse(input);
  return withWorkshopTransaction(async (transaction) => {
    await requireWorker(userId, transaction);
    const ids = [...(data.principalSpecialtyId === null ? [] : [data.principalSpecialtyId]), ...data.additionalSpecialtyIds];
    if (ids.length) {
      const specialties = await Specialty.findAll({ where: { id: { [Op.in]: [...ids].sort((a, b) => a - b) } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
      if (specialties.length !== ids.length || specialties.some((row) => !row.active)) throw ApiError.badRequest('Selecciona especialidades existentes y activas');
    }
    await WorkerSpecialty.destroy({ where: { userId }, transaction });
    if (ids.length) await WorkerSpecialty.bulkCreate(ids.map((specialtyId) => ({ userId, specialtyId, isPrincipal: specialtyId === data.principalSpecialtyId, updatedBy: actorId })), { transaction });
    return { userId, ...data };
  });
}

export async function updateWorkshopSchedule(input: UpdateWorkshopScheduleInput, actorId: number): Promise<WorkshopScheduleConfig> {
  const data = updateWorkshopScheduleSchema.parse(input);
  return withWorkshopTransaction(async (transaction) => {
    // Match timer-start lock order. A start committed before these locks is included
    // in the subsequent snapshot; a later start reads the newly committed schedule.
    await User.findAll({ attributes: ['id'], order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    const [schedule] = await WorkshopSchedule.findOrCreate({ where: { id: 1 }, defaults: { id: 1, timezone: DEFAULT_WORKSHOP_TIMEZONE, weekly: [], updatedBy: null }, transaction });
    await schedule.update({ ...data, weekly: [...data.weekly].sort((a, b) => a.weekday - b.weekday), updatedBy: actorId }, { transaction });
    await refreshOpenShiftCutoffs(transaction);
    return schedulePublic(schedule);
  });
}

export async function appendWorkshopScheduleException(userId: number, input: CreateWorkshopScheduleExceptionInput, actorId: number): Promise<WorkshopShiftException> {
  const data = createWorkshopScheduleExceptionSchema.parse(input);
  return withWorkshopTransaction(async (transaction) => {
    await requireWorker(userId, transaction);
    const schedule = await WorkshopSchedule.findByPk(1, { transaction });
    if (!data.dayOff) shiftDates(data.date, data.start!, data.end!, schedule?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE);
    const previous = await WorkshopScheduleException.findOne({ where: { userId, date: data.date }, order: [['version', 'DESC']], transaction });
    const exception = await WorkshopScheduleException.create({
      userId, date: data.date, dayOff: data.dayOff, start: data.dayOff ? null : data.start!,
      end: data.dayOff ? null : data.end!, reason: data.reason, version: (previous?.version ?? 0) + 1, createdBy: actorId,
    }, { transaction });
    await refreshOpenShiftCutoffs(transaction, userId);
    return exceptionPublic(exception);
  });
}

/** Existing persisted price snapshots are never touched when configuration changes. */
const refreshOpenShiftCutoffs = async (transaction: Transaction, userId?: number): Promise<void> => {
  const candidates = await WorkOrderItemSession.findAll({
    where: { status: 'abierta', kind: 'cronometro', supersededAt: null,
      ...(userId === undefined ? {} : { userId }) },
    attributes: ['id', 'userId', 'workOrderId', 'workOrderItemId'],
    order: [['userId', 'ASC'], ['workOrderId', 'ASC'], ['workOrderItemId', 'ASC'], ['id', 'ASC']], transaction,
  });
  for (const candidate of candidates) {
    if (candidate.userId === null) continue;
    // Same user -> work order -> item -> session order as timer operations/settlement.
    await User.findByPk(candidate.userId, { transaction, lock: transaction.LOCK.UPDATE });
    await WorkOrder.findByPk(candidate.workOrderId, { transaction, lock: transaction.LOCK.UPDATE });
    const item = await WorkOrderItem.findByPk(candidate.workOrderItemId, { transaction, lock: transaction.LOCK.UPDATE });
    const session = await WorkOrderItemSession.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
    const now = new Date();
    if (!session || session.status !== 'abierta' || session.supersededAt || (session.scheduledEndAt && session.scheduledEndAt <= now)) continue;
    const shift = await getWorkerShift(candidate.userId, session.startedAt, transaction);
    if (!shift.configured) continue; // Unconfiguring cannot remove a known cutoff on an existing timer.
    if (shift.end === null || shift.end <= session.startedAt) {
      await session.update({ scheduledEndAt: now }, { transaction });
      await closeSession(session, 'sistema', transaction, 'Pausa por cambio de jornada o día libre.');
    } else if (shift.intervals && shift.end <= now) {
      // Adding/changing lunch is prospective. Keep the elapsed legacy interval;
      // an audited time correction, never a schedule edit, can replace those hours.
      await session.update({ scheduledEndAt: now }, { transaction });
      await closeSession(session, 'sistema', transaction, 'Pausa al actualizar el almuerzo; se conserva el tiempo registrado antes del cambio.');
    } else {
      const scheduledEndAt = new Date(Math.max(session.startedAt.getTime(), shift.end.getTime()));
      await session.update({ scheduledEndAt }, { transaction });
      if (scheduledEndAt <= now) await closeSession(session, 'sistema', transaction, 'Pausa por cambio de hora de salida de la jornada.');
    }
    if (item) await recalculateItemHours(item, transaction);
  }
};

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const partsAt = (at: Date, timezone: string): Record<string, string> => {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    if (dateFormatters.size >= 16) dateFormatters.clear();
    dateFormatters.set(timezone, formatter);
  }
  return Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value]));
};
const localDate = (at: Date, timezone: string): string => {
  const parts = partsAt(at, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** Host-TZ independent. Reject DST gaps and choose the first occurrence of a repeated wall time. */
const wallTime = (date: string, time: string, timezone: string): Date => {
  const target = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const probe = target + hours * 3_600_000;
    const parts = partsAt(new Date(probe), timezone);
    offsets.add(Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`) - probe);
  }
  const candidates = [...offsets].map((offset) => new Date(target - offset)).filter((candidate) => {
    const parts = partsAt(candidate, timezone);
    return `${parts.year}-${parts.month}-${parts.day}` === date && `${parts.hour}:${parts.minute}` === time;
  }).sort((a, b) => a.getTime() - b.getTime());
  if (!candidates.length) throw ApiError.unprocessable('La hora indicada no existe en esa fecha y zona horaria por el cambio de hora');
  return candidates[0]!;
};
const shiftDates = (date: string, start: string, end: string, timezone: string): WorkerShift => {
  const startAt = wallTime(date, start, timezone);
  const endAt = wallTime(date, end, timezone);
  if (endAt <= startAt) throw ApiError.unprocessable('La salida debe ser posterior a la entrada');
  return { configured: true, start: startAt, end: endAt };
};
const weeklyShift = (date: string, day: WorkshopWeeklyDay, timezone: string, at: Date): WorkerShift => {
  const shift = shiftDates(date, day.start, day.end, timezone);
  if (!day.breakStart || !day.breakEnd) return shift;
  const intervals = [
    { start: shift.start!, end: wallTime(date, day.breakStart, timezone) },
    { start: wallTime(date, day.breakEnd, timezone), end: shift.end! },
  ];
  const segment = intervals.find((entry) => at < entry.end) ?? intervals[intervals.length - 1]!;
  return { configured: true, ...segment, intervals };
};
const assertDate = (at: Date): void => {
  if (!Number.isFinite(at.getTime())) throw ApiError.badRequest('Fecha inválida');
};

/** Inclusive local-day start, exclusive next-day start. Midnight DST gaps produce the first real instant of that day. */
export async function getWorkshopDayRange(date: string, transaction?: Transaction): Promise<{ start: Date; end: Date; timezone?: string }> {
  if (!workshopDateSchema.safeParse(date).success) throw ApiError.badRequest('Fecha inválida');
  const schedule = await WorkshopSchedule.findByPk(1, { transaction });
  const timezone = schedule?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE;
  return { ...getCivilDayRange(date, timezone), timezone };
}

/** Shared by reports: resolve a whole configured period without one SQL query per worker/day. */
export function getCivilDayRange(date: string, timezone: string): { start: Date; end: Date } {
  if (!workshopDateSchema.safeParse(date).success) throw ApiError.badRequest('Fecha inválida');
  const boundary = (civilDate: string): Date => {
    const nominal = Date.parse(`${civilDate}T00:00:00.000Z`);
    let low = nominal - 48 * 3_600_000;
    let high = nominal + 48 * 3_600_000;
    while (high - low > 1) {
      const midpoint = Math.floor((low + high) / 2);
      if (localDate(new Date(midpoint), timezone) < civilDate) low = midpoint;
      else high = midpoint;
    }
    return new Date(high);
  };
  const start = boundary(date);
  if (localDate(start, timezone) !== date) throw ApiError.unprocessable('La fecha no existe en la zona horaria del taller');
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end: boundary(next.toISOString().slice(0, 10)) };
}

/** Latest worker/day exception wins, even when the weekly schedule is unconfigured. */
export async function getWorkerShift(userId: number, at: Date, transaction?: Transaction): Promise<WorkerShift> {
  assertDate(at);
  const schedule = await WorkshopSchedule.findByPk(1, { transaction });
  const timezone = schedule?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE;
  const date = localDate(at, timezone);
  const exception = await WorkshopScheduleException.findOne({ where: { userId, date }, order: [['version', 'DESC'], ['id', 'DESC']], transaction });
  return resolveWorkerShift(schedule?.weekly ?? DEFAULT_WORKSHOP_WEEKLY, timezone, at, exception);
}

export function resolveWorkerShift(
  weekly: WorkshopWeeklyDay[], timezone: string, at: Date,
  exception?: { dayOff: boolean; start: string | null; end: string | null } | null,
): WorkerShift {
  assertDate(at);
  const date = localDate(at, timezone);
  if (exception) return exception.dayOff ? { configured: true, start: null, end: null } : shiftDates(date, exception.start!, exception.end!, timezone);
  // A stored empty array remains an intentional administrative override.
  if (!weekly.length) return { configured: false, start: null, end: null };
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const day = weekly.find((entry) => entry.weekday === weekday);
  return day ? weeklyShift(date, day, timezone, at) : { configured: true, start: null, end: null };
}

/** Legacy assignments/rates stay null. An explicit specialty must belong to the worker. */
export async function getWorkerRateSnapshot(userId: number, specialtyId: number | null, at: Date, transaction?: Transaction): Promise<{
  specialtyId: number | null; specialtyName: string | null; rateId: number | null; costHourly: number | null; saleHourly: number | null;
}> {
  assertDate(at);
  const membership = await WorkerSpecialty.findOne({ where: { userId, ...(specialtyId === null ? { isPrincipal: true } : { specialtyId }) }, transaction });
  const empty: WorkerRateSnapshot = { specialtyId: null, specialtyName: null, rateId: null, costHourly: null, saleHourly: null };
  if (!membership) {
    if (specialtyId !== null) throw ApiError.badRequest('La especialidad no pertenece al trabajador');
    return empty;
  }
  const specialty = await Specialty.findByPk(membership.specialtyId, { transaction });
  if (!specialty) throw ApiError.conflict('El perfil del trabajador contiene una especialidad inexistente');
  if (!specialty.active) throw ApiError.badRequest('La especialidad está inactiva; actualiza el perfil antes de asignar trabajo');
  const schedule = await WorkshopSchedule.findByPk(1, { transaction });
  const date = localDate(at, schedule?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE);
  const rate = await SpecialtyRate.findOne({ where: { specialtyId: specialty.id, validityFrom: { [Op.lte]: date } }, order: [['validityFrom', 'DESC'], ['id', 'DESC']], transaction });
  return { specialtyId: specialty.id, specialtyName: specialty.name, rateId: rate?.id ?? null,
    costHourly: rate ? Number(rate.costHourly) : null, saleHourly: rate ? Number(rate.saleHourly) : null };
}
